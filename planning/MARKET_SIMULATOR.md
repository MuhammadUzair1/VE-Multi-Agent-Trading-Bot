# Market Simulator Design

The default market-data source when `MASSIVE_API_KEY` is not set (`PLAN.md` §5, §6). Implements the `MarketDataProvider` interface defined in [`MARKET_INTERFACE.md`](./MARKET_INTERFACE.md) using an in-process geometric Brownian motion (GBM) model — no external dependencies, no network calls, deterministic enough to test.

## 1. Goals

- Look convincing: smooth continuous price movement, correlated sector moves (tech stocks drift together), occasional dramatic single-ticker jumps.
- Update every ~500ms per `PLAN.md` §6.
- Start with a fully-populated ~100-point rolling history per ticker at process start (backfill), so charts and sparklines never render empty on first paint.
- Never persist anything — it's pure in-memory state, rebuilt from seed prices every time the process starts.
- Be testable: injectable RNG seed for deterministic unit tests, pure functions for the math separated from the asyncio scheduling loop.

## 2. The Math

### 2.1 Single-ticker GBM

Continuous-time geometric Brownian motion:

```
dS = μ S dt + σ S dW
```

Discretized per tick (Euler–Maruyama, exact solution form to avoid drift bias over many small steps):

```
S(t+Δt) = S(t) · exp( (μ − σ²/2)·Δt + σ·√Δt · Z )
```

where `Z ~ N(0, 1)` is a standard normal draw, `μ` is annualized drift, `σ` is annualized volatility, and `Δt` is the tick size expressed in **years** (so a 500ms tick against annualized parameters gives realistically small per-tick moves).

```python
import math

def gbm_step(price: float, mu: float, sigma: float, dt_years: float, z: float) -> float:
    """One discrete GBM step. `z` is a standard normal draw, injected so the
    caller controls randomness (shared factors, testing) — see §2.2."""
    drift = (mu - 0.5 * sigma ** 2) * dt_years
    diffusion = sigma * math.sqrt(dt_years) * z
    return price * math.exp(drift + diffusion)
```

### 2.2 Correlated moves: a two-factor model

Rather than a full N×N covariance matrix (overkill for 10 tickers and harder to reason about), each ticker's random shock is a weighted mix of two shared factors plus its own idiosyncratic noise:

```
Z_ticker = β_market · Z_market + β_sector · Z_sector + β_idio · Z_idio
```

with `β_market² + β_sector² + β_idio² = 1` per ticker so the resulting `Z_ticker` stays a standard normal (variance-preserving mix). Two sector factors are enough for our fixed universe:

| Sector      | Tickers                                   |
| ----------- | ------------------------------------------ |
| Tech        | AAPL, GOOGL, MSFT, AMZN, NVDA, META, NFLX  |
| Financial   | JPM, V                                     |
| Idiosyncratic-heavy | TSLA (high idio weight — volatile, less correlated to either factor) |

```python
import random
from dataclasses import dataclass

@dataclass(frozen=True)
class FactorLoadings:
    market: float
    sector: float
    idio: float

def draw_ticker_shock(rng: random.Random, z_market: float, z_sector: float,
                       loadings: FactorLoadings) -> float:
    z_idio = rng.gauss(0, 1)
    return (loadings.market * z_market
            + loadings.sector * z_sector
            + loadings.idio * z_idio)
```

Each tick, the simulator draws **one** `z_market`, **one** `z_tech_sector`, and **one** `z_financial_sector` shared across all tickers in that sector, then combines them per-ticker with idiosyncratic noise — this is what produces "tech stocks move together" without a full covariance matrix.

### 2.3 Event jumps

Each tick, each ticker independently has a small probability `p_event` (e.g. `0.002` per 500ms tick ≈ roughly one dramatic move per ticker every ~15 minutes) of a sudden 2–5% jump instead of (in addition to) its normal GBM step:

```python
EVENT_PROBABILITY = 0.002
EVENT_MAGNITUDE_RANGE = (0.02, 0.05)

def maybe_apply_event(rng: random.Random, price: float) -> float:
    if rng.random() >= EVENT_PROBABILITY:
        return price
    magnitude = rng.uniform(*EVENT_MAGNITUDE_RANGE)
    sign = rng.choice((1, -1))
    return price * (1 + sign * magnitude)
```

Applied after the regular GBM step, so an "event tick" is a GBM move plus a jump, not a replacement for it.

## 3. Per-Ticker Configuration

Seed prices are realistic ballpark values; drift/vol are annualized. `beta` loadings satisfy the variance-preserving constraint from §2.2.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class TickerConfig:
    seed_price: float
    mu: float              # annualized drift
    sigma: float           # annualized volatility
    loadings: FactorLoadings

TICKER_CONFIG: dict[str, TickerConfig] = {
    "AAPL":  TickerConfig(190.00, 0.08, 0.25, FactorLoadings(0.6, 0.7, 0.39)),
    "GOOGL": TickerConfig(175.00, 0.10, 0.28, FactorLoadings(0.6, 0.7, 0.39)),
    "MSFT":  TickerConfig(420.00, 0.09, 0.22, FactorLoadings(0.6, 0.7, 0.39)),
    "AMZN":  TickerConfig(185.00, 0.11, 0.30, FactorLoadings(0.55, 0.7, 0.46)),
    "NVDA":  TickerConfig(130.00, 0.20, 0.55, FactorLoadings(0.5, 0.75, 0.43)),
    "META":  TickerConfig(560.00, 0.12, 0.35, FactorLoadings(0.55, 0.7, 0.46)),
    "NFLX":  TickerConfig(700.00, 0.10, 0.32, FactorLoadings(0.5, 0.65, 0.57)),
    "TSLA":  TickerConfig(250.00, 0.15, 0.60, FactorLoadings(0.4, 0.3, 0.87)),
    "JPM":   TickerConfig(210.00, 0.07, 0.20, FactorLoadings(0.5, 0.0, 0.87)),
    "V":     TickerConfig(280.00, 0.08, 0.18, FactorLoadings(0.5, 0.0, 0.87)),
}
```

`JPM`/`V` load on the `market` factor and their own idiosyncratic noise but **not** the tech `sector` factor (loading `0.0`) — a separate financial-sector shared shock could be added the same way if a second sector factor is wanted later, but with only two financial tickers a shared idio-heavy loading already looks reasonable without adding a third factor.

## 4. Code Structure

```
backend/app/market/simulator.py
```

```python
import asyncio
import random
from collections import deque
from datetime import datetime, timedelta, timezone

from .interface import MarketDataProvider
from .cache import PriceCache, HISTORY_MAXLEN
from .types import PriceTick, PricePoint, Direction, TICKER_UNIVERSE
from .sim_config import TICKER_CONFIG, EVENT_PROBABILITY, EVENT_MAGNITUDE_RANGE

TICK_INTERVAL = 0.5   # seconds, per PLAN.md §6
DT_YEARS = TICK_INTERVAL / (365 * 24 * 60 * 60)   # tick size expressed in years for GBM

class SimulatorProvider(MarketDataProvider):
    def __init__(self, cache: PriceCache, seed: int | None = None) -> None:
        super().__init__(cache)
        self._rng = random.Random(seed)
        self._prices: dict[str, float] = {t: c.seed_price for t, c in TICKER_CONFIG.items()}
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._backfill()
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    @property
    def is_healthy(self) -> bool:
        return True   # in-process; nothing external to fail

    async def get_history(self, ticker: str, limit: int = 100) -> list[PricePoint]:
        if ticker not in TICKER_UNIVERSE:
            return []
        return self.cache.history(ticker)[-limit:]

    def _step_all_tickers(self) -> dict[str, float]:
        z_market = self._rng.gauss(0, 1)
        z_tech = self._rng.gauss(0, 1)
        new_prices: dict[str, float] = {}
        for ticker, cfg in TICKER_CONFIG.items():
            z = draw_ticker_shock(self._rng, z_market, z_tech, cfg.loadings)
            price = gbm_step(self._prices[ticker], cfg.mu, cfg.sigma, DT_YEARS, z)
            price = maybe_apply_event(self._rng, price)
            new_prices[ticker] = price
        return new_prices

    async def _run_loop(self) -> None:
        while True:
            await asyncio.sleep(TICK_INTERVAL)
            self._tick(now=datetime.now(timezone.utc))

    def _tick(self, now: datetime) -> None:
        new_prices = self._step_all_tickers()
        for ticker, price in new_prices.items():
            prev_price = self._prices[ticker]
            self._prices[ticker] = price
            change = price - prev_price
            direction = Direction.FLAT if change == 0 else (
                Direction.UP if change > 0 else Direction.DOWN
            )
            self.cache.update(PriceTick(
                ticker=ticker, price=price, prev_price=prev_price,
                change=change,
                change_percent=(change / prev_price * 100) if prev_price else 0.0,
                direction=direction, timestamp=now,
            ))

    def _backfill(self) -> None:
        """Fast-forward HISTORY_MAXLEN ticks before the loop starts, so every
        ticker's rolling buffer is full at first paint (PLAN.md §6). Runs
        synchronously with no sleeps; back-dates timestamps as if each step
        happened TICK_INTERVAL seconds before the next, ending at "now"."""
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(seconds=TICK_INTERVAL * HISTORY_MAXLEN)
        for i in range(HISTORY_MAXLEN):
            new_prices = self._step_all_tickers()
            ts = start_time + timedelta(seconds=TICK_INTERVAL * i)
            for ticker, price in new_prices.items():
                self._prices[ticker] = price
                self.cache.seed_history_point(ticker, PricePoint(ticker, price, ts))
        # After backfill, publish one PriceTick per ticker at "now" so
        # cache.all_latest() is populated immediately (not just history).
        for ticker, price in self._prices.items():
            self.cache.update(PriceTick(
                ticker=ticker, price=price, prev_price=price,
                change=0.0, change_percent=0.0, direction=Direction.FLAT,
                timestamp=now,
            ))
```

`cache.seed_history_point(ticker, point)` (a small addition to `PriceCache` alongside `seed_history`) appends one point without touching `_latest`, so the 100-point backfill loop doesn't fire 1000 SSE broadcasts (100 points × 10 tickers) to zero connected clients at startup — only the final "now" tick per ticker goes through `cache.update()` and is eligible for broadcast.

## 5. Why Not Persist Simulator State

`PLAN.md` §6 is explicit: no historical data is persisted, and the backfill is "an in-memory convenience for first paint only." Restarting the container resets every ticker to its `seed_price` and regenerates a fresh backfill. This is intentional — the simulator's job is to produce a plausible-looking live terminal, not a reproducible market history; `portfolio_snapshots` (persisted, in SQLite) is what actually tracks the user's real P&L over time, independent of any simulator restart.

## 6. Determinism for Tests

`SimulatorProvider(cache, seed=42)` makes an entire run byte-for-byte reproducible (`random.Random(42)` isolated from the global `random` module state, so tests don't interfere with each other or with unrelated code that calls `random.random()`). E2E tests (`PLAN.md` §12) run with `LLM_MOCK=true` for the chat layer; if a market-data-dependent E2E assertion ever needs a fixed price sequence, pass an explicit `seed` when constructing the simulator in that test's app instance rather than asserting on live GBM output. Unit tests for the math itself (`gbm_step`, `draw_ticker_shock`, `maybe_apply_event`) should be pure-function tests with a fixed seed and no asyncio involved at all.

## 7. Tuning Knobs (future, not MVP)

- Per-ticker `mu`/`sigma` could later be exposed via env vars for demo tuning (e.g. "make the market crash for this demo").
- `EVENT_PROBABILITY` and `EVENT_MAGNITUDE_RANGE` are global constants; could become per-ticker if TSLA-style volatility needs to be independently dialed from AAPL-style stability. Not needed for MVP — the `TickerConfig.sigma` values already differentiate volatility per ticker without touching event frequency.
