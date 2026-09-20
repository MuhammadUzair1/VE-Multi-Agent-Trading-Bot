# Massive API Reference (formerly Polygon.io)

Research notes and code examples for the market-data provider used when `MASSIVE_API_KEY` is set. This document is the factual reference; [`MARKET_INTERFACE.md`](./MARKET_INTERFACE.md) defines how FinAlly actually wraps this API behind the project's provider interface, and [`MARKET_SIMULATOR.md`](./MARKET_SIMULATOR.md) documents the no-key fallback.

## 1. Background

- Polygon.io rebranded to **Massive** on **2025-10-30**. `https://massive.com` is the new marketing/docs site; the API host has **not** moved — `https://api.polygon.io` still works, and `https://api.massive.com` is the same backend under the new name.
- Existing Polygon.io API keys, accounts, and integrations continue to work unchanged. The official Python client's PyPI package was renamed `massive` (previously `polygon-api-client`).
- FinAlly should call the API host as `https://api.massive.com` and treat `MASSIVE_API_KEY` as the credential name (matches `PLAN.md` §5), even though the underlying vendor is Polygon.io.
- Full docs: https://massive.com/docs — the machine-readable index used for this research is https://massive.com/docs/llms.txt.

## 2. Authentication

Two equivalent methods are supported on every REST endpoint:

**Authorization header (preferred for this project — keeps the key out of URLs/access logs):**

```
Authorization: Bearer YOUR_API_KEY
```

**Query parameter (shown in most public docs/curl examples):**

```
GET https://api.massive.com/v2/aggs/ticker/AAPL/prev?apiKey=YOUR_API_KEY
```

FinAlly should always use the `Authorization: Bearer` header form so the key never appears in logged URLs.

## 3. Rate Limits

- Limits are enforced **per asset class**, not per account. A stocks-only subscription doesn't affect options/forex/crypto limits and vice versa.
- **Free ("Basic") tier**: 5 requests/minute for the stocks asset class. This is the tier FinAlly should assume unless the operator has paid.
- **Paid tiers** (e.g. Stocks Starter, $29/mo+): no fixed per-minute cap on subscribed asset classes; general guidance is to stay under ~100 req/s.
- **Recency of data** is plan-gated independently of the request cap:
  - Free/Starter/Developer: **15-minute delayed** quotes/trades/snapshots.
  - Advanced/Business: real-time.
  - This means even a correctly-implemented poller will show slightly stale prices on a free key — acceptable for a demo app, but worth surfacing in the UI copy if it ever matters.
- **429 response** when the limit is exceeded:
  ```json
  {"status":"ERROR","error":"You've exceeded the maximum requests per minute, please wait or upgrade your subscription to continue. https://massive.com/pricing"}
  ```
- **403 response** when the plan doesn't include the requested data/timeframe:
  ```json
  {"status":"NOT_AUTHORIZED","message":"Your plan doesn't include this data timeframe..."}
  ```

**Design consequence for FinAlly:** with a free key and 10 fixed tickers, we must never issue one request per ticker on a timer — that alone would blow the 5/min budget. Always batch all 10 tickers into a single snapshot call (§4.1).

## 4. Endpoints FinAlly Uses

All paths below are relative to `https://api.massive.com`.

### 4.1 Full Market Snapshot — real-time polling (primary endpoint)

The workhorse endpoint: one call returns latest trade, latest quote, today's OHLCV bar, and previous day's bar for **any comma-separated list of tickers** in a single response. This is what makes free-tier polling of 10 fixed tickers feasible.

```
GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,META,JPM,V,NFLX
```

```bash
curl -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,META,JPM,V,NFLX"
```

Response shape (one entry per ticker in `tickers[]`):

```json
{
  "status": "OK",
  "count": 1,
  "tickers": [
    {
      "ticker": "AAPL",
      "day":     { "o": 189.30, "h": 191.10, "l": 188.90, "c": 190.44, "v": 41200000, "vw": 190.02 },
      "prevDay": { "o": 187.10, "h": 189.80, "l": 186.75, "c": 188.63, "v": 52300000, "vw": 187.9 },
      "lastTrade": { "p": 190.44, "s": 100, "t": 1732121894630916600, "x": 4 },
      "lastQuote": { "p": 190.42, "s": 2, "P": 190.46, "S": 3 },
      "min":     { "o": 190.40, "h": 190.48, "l": 190.35, "c": 190.44, "v": 18500 },
      "todaysChange": 1.81,
      "todaysChangePerc": 0.96,
      "updated": 1732121894630916600
    }
  ]
}
```

Field mapping to FinAlly's `PriceTick` (see `MARKET_INTERFACE.md`):

| Massive field                | FinAlly field       | Notes                                   |
| ----------------------------- | -------------------- | ---------------------------------------- |
| `ticker`                      | `ticker`              |                                           |
| `lastTrade.p`                 | `price`               | fall back to `day.c` if `lastTrade` absent (pre-market) |
| `prevDay.c`                   | `prev_close`          | used for daily % change                  |
| `todaysChange`                | `change`              |                                           |
| `todaysChangePerc`            | `change_percent`      |                                           |
| `updated` (ns epoch)          | `timestamp`           | divide by 1e9 → seconds, convert to ISO 8601 UTC |

An empty `tickers` query param or an unrecognized symbol yields either an omitted entry or an `error`/`message` field on that entry — treat a missing ticker in the response as "no update this poll," not a fatal error.

### 4.2 Single Ticker Snapshot — on-demand fallback

```
GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
```

```bash
curl -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/AAPL"
```

Same nested shape as one entry of §4.1's `tickers[]` array, keyed under `"ticker"` instead of a list. Not used in the regular poll loop (§4.1 already covers all 10 tickers in one call) — useful for a manual admin/debug check or a single-ticker retry after a partial batch failure.

### 4.3 Previous Close (EOD)

```
GET /v2/aggs/ticker/{ticker}/prev?adjusted=true
```

```bash
curl -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v2/aggs/ticker/AAPL/prev?adjusted=true"
```

```json
{
  "status": "OK",
  "ticker": "AAPL",
  "resultsCount": 1,
  "results": [
    { "T": "AAPL", "o": 187.10, "h": 189.80, "l": 186.75, "c": 188.63, "v": 52300000, "vw": 187.94, "t": 1732086000000, "n": 512340 }
  ]
}
```

`o/h/l/c` = open/high/low/close, `v` = volume, `vw` = volume-weighted average price, `t` = bar-start Unix ms timestamp, `n` = trade count. Useful as a cheap fallback last-known price when the market is closed and `lastTrade` is stale/absent, and as a sanity baseline for the simulator's seed prices.

### 4.4 Custom (Intraday) Aggregate Bars — history backfill

```
GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}?adjusted=true&sort=asc&limit=100
```

`timespan` ∈ `minute|hour|day|...`; `from`/`to` accept `YYYY-MM-DD` or Unix ms.

```bash
curl -H "Authorization: Bearer $MASSIVE_API_KEY" \
  "https://api.massive.com/v2/aggs/ticker/AAPL/range/1/minute/2026-09-19/2026-09-20?adjusted=true&sort=desc&limit=100"
```

```json
{
  "status": "OK",
  "ticker": "AAPL",
  "resultsCount": 100,
  "results": [
    { "o": 190.40, "h": 190.48, "l": 190.35, "c": 190.44, "v": 18500, "vw": 190.41, "t": 1732121880000, "n": 210 }
  ]
}
```

This is the endpoint FinAlly uses to seed a ticker's rolling history buffer (§8 of `PLAN.md`) with real data instead of the simulator's synthetic fast-forward — see `MARKET_INTERFACE.md` §6 for when/how it's called (lazily, per-ticker, on first history request — **not** at startup for all 10 tickers, to respect the 5 req/min free-tier budget).

### 4.5 Grouped Daily Bars (all US tickers) — not used in MVP

```
GET /v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true&include_otc=false
```

Returns EOD OHLCV for the **entire market** (10,000+ tickers) in one call for a given date. Not needed while FinAlly's universe is fixed at 10 tickers (§6 of `PLAN.md`), but documented here since it's the natural endpoint if the ticker universe is ever made dynamic — one call replaces up to 10,000 per-ticker previous-close calls.

## 5. Python Client Options

Two viable approaches; FinAlly uses (b).

**(a) Official client (`pip install massive`)** — synchronous, convenient for scripts, but blocks the event loop:

```python
from massive import RESTClient

client = RESTClient(api_key=MASSIVE_API_KEY)
snap = client.get_snapshot_all("stocks", tickers=["AAPL", "GOOGL"])
```

**(b) Raw REST via `httpx.AsyncClient`** — fits FastAPI's async background task model without a thread pool; this is what `MARKET_INTERFACE.md` builds on:

```python
import httpx

MASSIVE_BASE_URL = "https://api.massive.com"

async def fetch_snapshot(client: httpx.AsyncClient, tickers: list[str]) -> dict:
    resp = await client.get(
        f"{MASSIVE_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers",
        params={"tickers": ",".join(tickers)},
    )
    resp.raise_for_status()
    return resp.json()

async def fetch_intraday_minutes(
    client: httpx.AsyncClient, ticker: str, limit: int = 100
) -> dict:
    resp = await client.get(
        f"{MASSIVE_BASE_URL}/v2/aggs/ticker/{ticker}/range/1/minute/{_today()}/{_today()}",
        params={"adjusted": "true", "sort": "desc", "limit": limit},
    )
    resp.raise_for_status()
    return resp.json()

async def fetch_previous_close(client: httpx.AsyncClient, ticker: str) -> dict:
    resp = await client.get(
        f"{MASSIVE_BASE_URL}/v2/aggs/ticker/{ticker}/prev",
        params={"adjusted": "true"},
    )
    resp.raise_for_status()
    return resp.json()
```

A single shared `httpx.AsyncClient(base_url=MASSIVE_BASE_URL, headers={"Authorization": f"Bearer {api_key}"}, timeout=10.0)` should be created once at app startup and reused, per `httpx` best practice (connection pooling).

## 6. Error Handling & Resilience

The poller (see `MARKET_INTERFACE.md` §7) must treat the following as expected, recoverable conditions rather than crashes:

| Condition                          | Handling                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `429` rate limited                  | Back off to the next scheduled poll tick; do not retry immediately. Log at `WARNING`. |
| `403` plan doesn't cover data        | Log once at `ERROR` with guidance; keep serving last-known cache values.  |
| Network timeout / connection error   | Catch `httpx.HTTPError`, log at `WARNING`, skip this tick, retry next interval. |
| A ticker missing from response       | Leave that ticker's cache entry unchanged (stale-but-present) rather than nulling it. |
| Malformed/unexpected JSON            | Log at `ERROR` with the raw body (truncated), skip this tick.            |

The cache never blocks on a slow or failing poll — clients reading `/api/stream/prices` simply keep seeing the last good value until the next successful poll updates it. Consecutive-failure counts should be tracked so `/api/health` can report degraded market-data status without needing to expose the API key or raw error text.

## 7. Testing

- Unit tests for the Massive provider should **mock the HTTP layer** (e.g. `respx` for `httpx`) rather than hitting the real API — keeps tests free, fast, and deterministic, consistent with `PLAN.md` §12's approach of `LLM_MOCK=true` for the chat layer.
- Fixture JSON bodies should be captured from real responses (with any account-identifying fields scrubbed) for the snapshot, previous-close, and intraday-bars shapes shown above.
- A `test_conforms_to_interface` suite (see `MARKET_INTERFACE.md` §9) should run against both the simulator and a mocked Massive provider to guarantee behavioral parity.
