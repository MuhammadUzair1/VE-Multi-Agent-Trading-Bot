# Market Data Interface Design

Defines the single Python abstraction that the rest of the FastAPI backend (SSE streaming, `/api/prices/*`, portfolio valuation, LLM context) is written against. Neither the simulator nor the Massive client is ever imported directly outside this module — everything else depends on the interface in this document.

This implements `PLAN.md` §6 ("Two Implementations, One Interface", "Shared Price Cache"). Vendor-specific research lives in [`MASSIVE_API.md`](./MASSIVE_API.md); the simulator's internal math and code structure live in [`MARKET_SIMULATOR.md`](./MARKET_SIMULATOR.md).

## 1. Goals

- One provider-agnostic interface (`MarketDataProvider`) with exactly two implementations: `SimulatorProvider` and `MassiveProvider`.
- A single **shared, in-memory price cache** that both implementations write into, and that every reader (SSE stream, REST endpoints, portfolio valuation, LLM context builder) reads from — readers never touch the provider directly.
- Provider selection is a **startup-time** decision driven by `MASSIVE_API_KEY` (`PLAN.md` §5), not a runtime toggle.
- All 10 tickers in the fixed universe (`PLAN.md` §6) are always kept live in the cache, regardless of watchlist membership.
- No historical data is persisted to SQLite — the cache and its rolling buffers are a first-paint/streaming convenience only (`PLAN.md` §6).

## 2. Module Layout

```
backend/
└── app/
    └── market/
        ├── __init__.py        # exports get_market_data_provider()
        ├── types.py           # PriceTick, PricePoint, Direction
        ├── cache.py           # PriceCache, Broadcaster
        ├── interface.py       # MarketDataProvider ABC
        ├── simulator.py       # SimulatorProvider  (see MARKET_SIMULATOR.md)
        └── massive.py         # MassiveProvider     (see MASSIVE_API.md)
```

## 3. Core Types (`types.py`)

```python
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

TICKER_UNIVERSE: tuple[str, ...] = (
    "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA",
    "NVDA", "META", "JPM", "V", "NFLX",
)

class Direction(str, Enum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"

@dataclass(frozen=True, slots=True)
class PriceTick:
    """One live price update for a single ticker."""
    ticker: str
    price: float
    prev_price: float
    change: float             # price - prev_price
    change_percent: float     # change / prev_price * 100
    direction: Direction
    timestamp: datetime       # UTC

@dataclass(frozen=True, slots=True)
class PricePoint:
    """One point in a rolling/backfill history buffer (no bid/ask, just price)."""
    ticker: str
    price: float
    timestamp: datetime       # UTC
```

`PriceTick` is exactly the payload shape the SSE endpoint serializes per `PLAN.md` §6 ("ticker, price, previous price, timestamp, and change direction"). `PricePoint` is what `GET /api/prices/{ticker}/history` returns.

## 4. Shared Price Cache (`cache.py`)

The cache is provider-agnostic and owns two responsibilities: holding the latest state per ticker, and fanning out updates to SSE subscribers. Both implementations call `cache.update(tick)`; nothing else writes to it.

```python
import asyncio
from collections import deque
from .types import PriceTick, PricePoint, TICKER_UNIVERSE

HISTORY_MAXLEN = 100

class PriceCache:
    def __init__(self) -> None:
        self._latest: dict[str, PriceTick] = {}
        self._history: dict[str, deque[PricePoint]] = {
            t: deque(maxlen=HISTORY_MAXLEN) for t in TICKER_UNIVERSE
        }
        self._subscribers: set[asyncio.Queue[PriceTick]] = set()

    def update(self, tick: PriceTick) -> None:
        self._latest[tick.ticker] = tick
        self._history[tick.ticker].append(
            PricePoint(tick.ticker, tick.price, tick.timestamp)
        )
        for q in self._subscribers:
            q.put_nowait(tick)   # bounded queues (§5) — never awaits, never blocks the producer

    def seed_history(self, ticker: str, points: list[PricePoint]) -> None:
        """Used once by a provider to pre-fill a ticker's buffer (backfill)."""
        self._history[ticker] = deque(points, maxlen=HISTORY_MAXLEN)

    def latest(self, ticker: str) -> PriceTick | None:
        return self._latest.get(ticker)

    def all_latest(self) -> dict[str, PriceTick]:
        return dict(self._latest)

    def history(self, ticker: str) -> list[PricePoint]:
        return list(self._history.get(ticker, ()))

    def subscribe(self) -> asyncio.Queue[PriceTick]:
        q: asyncio.Queue[PriceTick] = asyncio.Queue(maxsize=256)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[PriceTick]) -> None:
        self._subscribers.discard(q)
```

Notes:

- `maxsize=256` bounds per-client memory (`REVIEW.md` flagged unbounded SSE queues as a risk). A `put_nowait` on a full queue raises `QueueFull`; the SSE handler catches this, drops the slowest client's queue, and closes that connection rather than blocking the whole broadcast (a stalled client must never slow down others).
- Single-process, single-event-loop FastAPI — no cross-thread locking is needed as long as all mutation happens on the event loop (true for both the simulator's asyncio task and the Massive poller's asyncio task).
- The cache is constructed once as an app-level singleton (`app.state.price_cache`) at startup, before the provider starts.

## 5. The Interface (`interface.py`)

```python
from abc import ABC, abstractmethod
from .types import PricePoint
from .cache import PriceCache

class MarketDataProvider(ABC):
    """Contract both SimulatorProvider and MassiveProvider must satisfy."""

    def __init__(self, cache: PriceCache) -> None:
        self.cache = cache

    @abstractmethod
    async def start(self) -> None:
        """Begin the background update loop. Must return once the loop task
        is scheduled — must not block waiting for the loop to run forever."""

    @abstractmethod
    async def stop(self) -> None:
        """Cancel the background task and release any resources (HTTP client, etc.)."""

    @abstractmethod
    async def get_history(self, ticker: str, limit: int = 100) -> list[PricePoint]:
        """Return up to `limit` recent points for `ticker`, oldest first.
        Used to seed the cache on backfill and to serve
        GET /api/prices/{ticker}/history directly. Must return [] for an
        unsupported ticker rather than raising, to keep the API's 404
        decision (unsupported ticker) at the route layer, not here.
        """

    @property
    @abstractmethod
    def is_healthy(self) -> bool:
        """False after N consecutive update failures; read by /api/health."""
```

Everything else the app needs (latest prices, live streaming) goes through `cache`, not through the provider — the provider's only job is to keep the cache current and to answer one-off history requests.

## 6. Provider Selection (`__init__.py`)

```python
import os
import httpx
from .cache import PriceCache
from .interface import MarketDataProvider
from .simulator import SimulatorProvider
from .massive import MassiveProvider

def get_market_data_provider(cache: PriceCache) -> MarketDataProvider:
    api_key = os.getenv("MASSIVE_API_KEY", "").strip()
    if api_key:
        client = httpx.AsyncClient(
            base_url="https://api.massive.com",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10.0,
        )
        return MassiveProvider(cache, client)
    return SimulatorProvider(cache)
```

Called once in the FastAPI lifespan handler:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    cache = PriceCache()
    provider = get_market_data_provider(cache)
    await provider.start()
    app.state.price_cache = cache
    app.state.market_provider = provider
    yield
    await provider.stop()
```

This resolves `REVIEW.md`'s startup-lifecycle note: schema init, cache construction, and provider start all happen in `lifespan` before the app accepts traffic; `provider.stop()` runs on shutdown.

## 7. `MassiveProvider` (`massive.py`)

Implements polling per `PLAN.md` §6 and `MASSIVE_API.md` §4.1/§6: **one batched snapshot call for all 10 tickers**, on an interval chosen by plan tier (default: free tier, 15s — configurable via `MASSIVE_POLL_INTERVAL_SECONDS` for operators on a paid plan).

```python
import asyncio
import logging
from datetime import datetime, timezone
import httpx
from .interface import MarketDataProvider
from .cache import PriceCache
from .types import PriceTick, PricePoint, Direction, TICKER_UNIVERSE

logger = logging.getLogger(__name__)
DEFAULT_POLL_INTERVAL = 15.0   # seconds; matches free-tier 5 req/min budget
MAX_CONSECUTIVE_FAILURES = 5

class MassiveProvider(MarketDataProvider):
    def __init__(self, cache: PriceCache, client: httpx.AsyncClient,
                 poll_interval: float = DEFAULT_POLL_INTERVAL) -> None:
        super().__init__(cache)
        self._client = client
        self._poll_interval = poll_interval
        self._task: asyncio.Task | None = None
        self._consecutive_failures = 0
        self._history_fetched: set[str] = set()   # lazy per-ticker backfill (§4.4 of MASSIVE_API.md)

    async def start(self) -> None:
        self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        await self._client.aclose()

    @property
    def is_healthy(self) -> bool:
        return self._consecutive_failures < MAX_CONSECUTIVE_FAILURES

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self._poll_once()
                self._consecutive_failures = 0
            except httpx.HTTPStatusError as exc:
                self._consecutive_failures += 1
                logger.warning("Massive poll failed: %s", exc)
            except httpx.HTTPError as exc:
                self._consecutive_failures += 1
                logger.warning("Massive poll network error: %s", exc)
            await asyncio.sleep(self._poll_interval)

    async def _poll_once(self) -> None:
        resp = await self._client.get(
            "/v2/snapshot/locale/us/markets/stocks/tickers",
            params={"tickers": ",".join(TICKER_UNIVERSE)},
        )
        resp.raise_for_status()
        body = resp.json()
        for entry in body.get("tickers", []):
            tick = self._parse_entry(entry)
            if tick is not None:
                self.cache.update(tick)

    def _parse_entry(self, entry: dict) -> PriceTick | None:
        ticker = entry.get("ticker")
        if ticker not in TICKER_UNIVERSE or "error" in entry:
            return None
        price = (entry.get("lastTrade") or {}).get("p") or entry["day"]["c"]
        prev_close = entry["prevDay"]["c"]
        prev_tick = self.cache.latest(ticker)
        prev_price = prev_tick.price if prev_tick else prev_close
        change = price - prev_price
        direction = Direction.FLAT if change == 0 else (Direction.UP if change > 0 else Direction.DOWN)
        return PriceTick(
            ticker=ticker,
            price=price,
            prev_price=prev_price,
            change=price - prev_close,
            change_percent=(price - prev_close) / prev_close * 100 if prev_close else 0.0,
            direction=direction,
            timestamp=datetime.fromtimestamp(entry["updated"] / 1e9, tz=timezone.utc),
        )

    async def get_history(self, ticker: str, limit: int = 100) -> list[PricePoint]:
        if ticker not in TICKER_UNIVERSE:
            return []
        # Real intraday bars, fetched lazily (once per ticker, on first request)
        # rather than for all 10 tickers at startup, to respect the free-tier
        # rate limit (MASSIVE_API.md §3, §6).
        try:
            resp = await self._client.get(
                f"/v2/aggs/ticker/{ticker}/range/1/minute/{_today()}/{_today()}",
                params={"adjusted": "true", "sort": "desc", "limit": limit},
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
        except httpx.HTTPError:
            logger.warning("History fetch failed for %s; falling back to previous close", ticker)
            results = []

        if not results:
            # Market closed / no intraday bars yet (e.g. pre-market): flat-line
            # the buffer from previous close so charts still render something
            # sensible instead of being empty.
            prev = await self._fetch_previous_close(ticker)
            return [PricePoint(ticker, prev, datetime.now(timezone.utc))] if prev else []

        points = [
            PricePoint(ticker, bar["c"], datetime.fromtimestamp(bar["t"] / 1000, tz=timezone.utc))
            for bar in reversed(results)   # API returned desc; buffer wants oldest-first
        ]
        self.cache.seed_history(ticker, points)
        return points
```

Key resilience properties, matching `MASSIVE_API.md` §6:

- A failed poll never raises out of `_poll_loop`; it logs and waits for the next tick. The cache simply keeps the last good value.
- `is_healthy` flips false after 5 consecutive failed polls (~75s at the default interval) — surfaced by `/api/health`, not by crashing the stream.
- History backfill is **lazy and per-ticker**, called from the `GET /api/prices/{ticker}/history` route the first time each ticker's chart is opened, and cached in `self._history_fetched` to avoid refetching on every request. This keeps startup to zero extra Massive calls and keeps steady-state usage at 1 call/poll-interval for prices plus at most 10 one-time calls for history, comfortably inside the free tier's 5/min budget when spread across normal usage.

## 8. `SimulatorProvider` (`simulator.py`)

Implements the same `MarketDataProvider` interface using in-process GBM instead of an HTTP poll. Full design (math, correlation model, event jumps, backfill algorithm, code structure) is in [`MARKET_SIMULATOR.md`](./MARKET_SIMULATOR.md); it plugs into this document's `cache.update(...)` / `cache.seed_history(...)` calls exactly like `MassiveProvider` does.

## 9. Conformance Testing

Both providers must behave identically from every caller's point of view. A single parametrized test module runs against both:

```python
import pytest
from app.market.cache import PriceCache
from app.market.simulator import SimulatorProvider
from app.market.massive import MassiveProvider  # constructed with a mocked httpx client

@pytest.mark.parametrize("make_provider", [
    lambda cache: SimulatorProvider(cache),
    lambda cache: MassiveProvider(cache, mocked_client()),
])
async def test_start_populates_all_ten_tickers(make_provider):
    cache = PriceCache()
    provider = make_provider(cache)
    await provider.start()
    await asyncio.sleep(0)  # let the first tick/poll run
    assert set(cache.all_latest()) <= set(TICKER_UNIVERSE)
    await provider.stop()

async def test_history_never_raises_for_supported_ticker(make_provider): ...
async def test_history_returns_empty_for_unsupported_ticker(make_provider): ...
async def test_is_healthy_flips_after_failures(make_provider): ...
```

The Massive side of this suite mocks the HTTP layer (`respx`) per `MASSIVE_API.md` §7 — no real network calls in tests, and no dependency on `LLM_MOCK` (that flag only governs the chat/LLM layer, per `PLAN.md` §5).

## 10. What Callers Never Do

- Never instantiate `SimulatorProvider`/`MassiveProvider` directly outside `get_market_data_provider()`.
- Never read prices anywhere except `app.state.price_cache` (SSE handler, `/api/portfolio`, `/api/watchlist`, the LLM context builder in `PLAN.md` §9 all read the cache, not the provider).
- Never persist cache contents to SQLite — it is rebuilt from scratch (simulator: fresh GBM state; Massive: fresh poll + lazy history) on every process start, consistent with `PLAN.md` §6's "no historical data is persisted" rule.
