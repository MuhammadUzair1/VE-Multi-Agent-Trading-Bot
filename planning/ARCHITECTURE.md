# FinAlly — Technical Architecture

This is the consolidated technical reference for FinAlly: how the pieces fit together, how data moves through the system, and which design questions are settled versus still open. [`PLAN.md`](./PLAN.md) is the product/technical spec and the source of truth for requirements; this document is the implementation-facing map on top of it, plus [`MARKET_INTERFACE.md`](./MARKET_INTERFACE.md), [`MARKET_SIMULATOR.md`](./MARKET_SIMULATOR.md), and [`MASSIVE_API.md`](./MASSIVE_API.md) for the market-data subsystem specifically.

No application code exists yet (see the repo root [`README.md`](../README.md)). This document describes the target architecture implementers build toward, not a running system.

---

## 1. System Overview

Single Docker container, single port, no external infrastructure beyond an optional market-data API and the LLM provider:

```
                              Browser
                    (EventSource + fetch, same-origin)
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│  Docker container — port 8000                                 │
│                                                                 │
│  FastAPI (uvicorn)                                             │
│   ├─ /api/*            REST: portfolio, watchlist, chat        │
│   ├─ /api/stream/*      SSE: live price ticks                  │
│   └─ /*                 static files (Next.js export)          │
│                                                                 │
│   ┌─────────────┐   ┌──────────────┐   ┌────────────────────┐ │
│   │ Market data  │   │  Portfolio /  │   │  Chat / LLM layer  │ │
│   │ layer        │──▶│  trade engine │◀──│  (structured       │ │
│   │ (§3.1)       │   │  (§3.2)       │   │  output → actions)  │ │
│   └──────┬───────┘   └──────┬───────┘   └──────────┬─────────┘ │
│          │                  │                       │           │
│          ▼                  ▼                       ▼           │
│   in-memory price     SQLite (db/finally.db,   LiteLLM → OpenRouter
│   cache (§3.1)        volume-mounted)          (Cerebras inference)
└───────────────────────────────────────────────────────────────┘
          │
          ▼ (only when MASSIVE_API_KEY is set)
    Massive (Polygon.io) REST API
```

Everything downstream of the market-data layer — SSE, REST endpoints, the LLM context builder, portfolio valuation — reads from the **shared in-memory price cache**, never from a provider directly. This is what lets the simulator and Massive be interchangeable at startup with zero downstream changes (`MARKET_INTERFACE.md` §1, §10).

---

## 2. Backend Module Layout

Target `backend/app/` structure (the module boundary that matters most is `market/`, already fully specified in `MARKET_INTERFACE.md`; the others below are proposed, not yet written):

```
backend/
└── app/
    ├── main.py            # FastAPI app, lifespan (DB init, cache + provider startup), static mount
    ├── db/
    │   ├── schema.sql      # table definitions (PLAN.md §7)
    │   ├── seed.py         # default user, default watchlist
    │   └── connection.py   # SQLite connection/transaction helper
    ├── market/             # fully specified in MARKET_INTERFACE.md — do not duplicate here
    │   ├── types.py, cache.py, interface.py, simulator.py, massive.py
    ├── portfolio/
    │   ├── trades.py       # execute_trade() — the single atomic entry point for buy/sell
    │   ├── valuation.py    # position P&L, total portfolio value
    │   └── snapshots.py    # 30s background snapshot task + post-trade snapshot
    ├── watchlist/
    │   └── service.py      # add/remove, validated against TICKER_UNIVERSE
    ├── chat/
    │   ├── context.py      # builds the portfolio/watchlist/history prompt context
    │   ├── llm.py           # LiteLLM/OpenRouter call via the cerebras-inference skill
    │   └── actions.py       # validates + executes trades/watchlist_changes from LLM output
    └── api/
        ├── prices.py, portfolio.py, watchlist.py, chat.py, health.py
```

`portfolio/trades.py::execute_trade()` is the single choke point both the manual trade bar and the LLM action executor call — this is what guarantees identical validation for human and AI-initiated trades (`PLAN.md` §9).

---

## 3. Data Flow

### 3.1 Price streaming

1. On startup, `lifespan` constructs the `PriceCache`, calls `get_market_data_provider(cache)`, and starts it (`MARKET_INTERFACE.md` §6). The simulator backfills ~100 points per ticker synchronously before serving traffic; Massive backfills lazily, per-ticker, on first history request (`MARKET_SIMULATOR.md` §4, `MARKET_INTERFACE.md` §7).
2. The provider's background task (asyncio, in-process) writes every tick to `cache.update()`.
3. `GET /api/stream/prices` subscribes a bounded `asyncio.Queue` per client and forwards cache updates as SSE events; a client that can't keep up gets dropped rather than slowing down others (`MARKET_INTERFACE.md` §4).
4. `GET /api/prices/{ticker}/history` reads `cache.history(ticker)` (or triggers Massive's lazy fetch) to seed sparklines/charts on first paint.
5. The frontend opens one `EventSource` to `/api/stream/prices`, seeds each chart/sparkline once from the history endpoint, then appends live ticks as they arrive.

### 3.2 Trade execution (manual or LLM-initiated)

1. Caller (trade bar POST, or an action in an LLM chat response) calls `execute_trade(ticker, side, quantity)` with no other path into the database for trades.
2. Inside one SQLite transaction: read current cash balance and position, read the current price from the price cache (the fill price — trades never wait on or re-fetch a price mid-transaction), validate (sufficient cash for a buy, sufficient held quantity for a sell, ticker in the fixed universe), update `positions` and `users_profile.cash_balance`, insert into `trades`, insert an immediate `portfolio_snapshots` row.
3. Return the executed trade (fill price, quantity, resulting cash/position) or a validation error — the same shape whether the caller was the trade bar or the chat action executor.

### 3.3 Chat / LLM action flow

1. `POST /api/chat` loads current portfolio context (cash, positions with live P&L from the price cache, watchlist with live prices, total value) and the last 10 rows from `chat_messages`.
2. Builds a system + context + history + user-message prompt and calls the LLM via LiteLLM → OpenRouter (Cerebras provider, `openrouter/openai/gpt-oss-120b`, structured output) — see the `cerebras-inference` skill and `PLAN.md` §9.
3. Parses the structured response (`message`, `trades[]`, `watchlist_changes[]`). Each action is validated and executed through the **same** `execute_trade()` / watchlist service functions the manual UI uses — the LLM is never trusted as an authority over money or holdings.
4. Persists the user message and the assistant message (with the actually-executed/rejected actions, not just what the model proposed) to `chat_messages`.
5. Returns the complete JSON response; the frontend renders the message and shows executed actions inline as confirmations. No token streaming — a loading indicator covers the round trip.

---

## 4. Component Responsibilities

| Component | Owns | Never does |
|---|---|---|
| Frontend (Next.js static export) | Rendering, `EventSource` lifecycle, optimistic-free UI (waits for REST confirmation on trades), chat UI | Talk to the LLM or market-data provider directly — everything goes through `/api/*` |
| `market/` (`MARKET_INTERFACE.md`) | Provider selection, shared price cache, SSE fan-out, history backfill | Persist anything to SQLite; know about portfolios or trades |
| `portfolio/` | Trade validation + atomic execution, P&L math, snapshot recording | Read prices from anywhere but the shared cache; skip validation for LLM-initiated trades |
| `watchlist/` | Add/remove, enforcing the fixed 10-ticker universe | Stop price updates for a removed ticker (that's a cache-layer concern, unaffected by watchlist membership) |
| `chat/` | Prompt construction, LLM call, structured-output parsing, action validation/execution, history persistence | Auto-trust model output; execute an action without going through `portfolio/`/`watchlist/` validation |
| Database (SQLite, `db/finally.db`) | Durable state: profile, watchlist, positions, trades, snapshots, chat history | Hold live/streaming price data (that's in-memory only, per `PLAN.md` §6) |
| Docker/deploy | Single container, single port, volume-mounted DB, `.env`-driven config | — |

---

## 5. Design Decisions & Status

Tracks every "must resolve" and "important improvement" item from [`REVIEW.md`](./REVIEW.md) against what the subsequent market-data design docs actually settled. Anything still marked **Open** needs a decision before or during the implementation of the affected area.

| # | Decision | Status | Where |
|---|---|---|---|
| 1 | Massive vs. simulator: poll fixed 10-ticker universe, not just the watchlist | **Resolved** — Massive polls all 10 in one batched call | `MARKET_INTERFACE.md` §7, `MASSIVE_API.md` §4.1 |
| 2 | History backfill when Massive is selected (simulator's fast-forward doesn't apply) | **Resolved** — lazy, per-ticker fetch on first `/api/prices/{ticker}/history` call, cached after first fetch | `MARKET_INTERFACE.md` §7 |
| 3 | Provider startup/shutdown lifecycle, one deterministic init path | **Resolved** — `lifespan` constructs cache, selects provider, starts/stops it | `MARKET_INTERFACE.md` §6 |
| 4 | Bound SSE per-client queues; a slow client can't grow memory unbounded | **Resolved** — `asyncio.Queue(maxsize=256)`, drop-and-disconnect on overflow | `MARKET_INTERFACE.md` §4 |
| 5 | Massive polling failure handling (429, 403, timeouts, malformed JSON) | **Resolved** — treated as recoverable; cache holds last-good value; `is_healthy` flips after 5 consecutive failures | `MASSIVE_API.md` §6, `MARKET_INTERFACE.md` §7 |
| 6 | Provider conformance testing (simulator and Massive behave identically to callers) | **Resolved** — parametrized test suite against both | `MARKET_INTERFACE.md` §9 |
| 7 | API contract: request/response schemas, status codes per error case (invalid ticker, insufficient cash/shares, missing history, etc.) | **Open** | — |
| 8 | Trade execution atomicity, money representation/rounding, exact P&L formulas | **Partially open** — atomicity and choke-point are described (§3.2 above), but the schema still uses SQLite `REAL` for money rather than an explicit decimal/integer-cents policy | `PLAN.md` §7 |
| 9 | Database mount contradiction (named Docker volume vs. `db/` bind mount) | **Open** — `PLAN.md` §11 still states both | `PLAN.md` §11 |
| 10 | SSE reconnect semantics: does the client get a snapshot before deltas? | **Partially open** — bounded queues are specified, but there's no explicit "fetch REST snapshot on `EventSource.onopen`" contract written down yet, even though `GET /api/watchlist` and `GET /api/portfolio` already return current state and are the natural snapshot source | — |
| 11 | LLM action validation: unknown fields, batch/quantity limits, partial-failure reporting | **Open** | — |
| 12 | `portfolio_snapshots` retention/pruning (30s cadence grows unbounded) | **Open** | — |
| 13 | Static export routing fallback (API precedence vs. SPA deep links) | **Open** | — |
| 14 | DB indexes for common reads (`watchlist`, `positions`, `trades`, `portfolio_snapshots`, `chat_messages` by `user_id`) | **Open** | — |
| 15 | `/api/health` response shape and readiness criteria | **Partially open** — `is_healthy` exists on the provider, but the endpoint's response shape isn't specified | `MARKET_INTERFACE.md` §5 |
| 16 | Implementation order / milestones | **Open** — see §7 below for a proposal | — |

---

## 6. Open Decisions Worth Pinning Down Early

The items below block or complicate multiple areas at once, so resolve them before writing the corresponding code rather than discovering the gap mid-implementation:

- **Money representation** (#8): pick integer cents/micro-dollars internally with decimal-string API responses, or explicitly accept `REAL` and define consistent rounding at every read/write site. This affects the DB schema, every portfolio calculation, and API response serialization simultaneously.
- **DB volume mount** (#9): pick bind-mount (`./db:/app/db`) or named volume, and make `docker-compose.yml`, `Dockerfile`, and `scripts/start_*` agree. Bind-mount is simpler for students inspecting the SQLite file directly; a named volume is more portable. Given `PLAN.md`'s "single command, no config" goal, bind-mount to the repo's `db/` directory is the more consistent choice.
- **API error contract** (#7): needs to exist before frontend and backend can be built in parallel without drifting. A shared OpenAPI schema (FastAPI generates one automatically) plus documented status codes per validation failure closes this.
- **LLM action validation limits** (#11): without a cap, a malformed or adversarial structured-output response could submit an unbounded number of trades in one turn. Reject unknown fields, cap `trades[]`/`watchlist_changes[]` length, and always report per-action outcomes back to the model context and the user.
- **Snapshot retention** (#12): a 30s cadence is ~2,880 rows/day/user. Fine for a single-user demo running for days; define a cap (e.g., keep full resolution for 24h, then downsample) only if long-running demo instances become a real scenario.

---

## 7. Suggested Implementation Order

Not specified in `PLAN.md`; proposed sequencing so agents build on stable foundations rather than in parallel against a moving contract:

1. **Foundation** — `db/schema.sql`, seed logic, lazy-init lifecycle, `/api/health`.
2. **Market data layer** — `market/` per `MARKET_INTERFACE.md` (simulator first, it has no external dependency; Massive second). SSE streaming and the history endpoint land here.
3. **Portfolio engine** — `execute_trade()`, valuation, snapshot task, watchlist service. This is the first point at which the API contract (§7 above) needs to be nailed down, since frontend work depends on it.
4. **Frontend core** — watchlist, chart, trade bar, positions table, heatmap, wired to the now-stable REST/SSE contract.
5. **Chat/LLM layer** — context builder, structured-output call, action executor reusing step 3's validated entry points.
6. **Docker + E2E** — multi-stage build, start/stop scripts, `test/` Playwright suite with `LLM_MOCK=true`.

Each stage should be independently testable before the next begins, per `PLAN.md` §12's unit-test breakdown.
