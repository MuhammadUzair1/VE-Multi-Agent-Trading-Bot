# FinAlly — AI Trading Workstation

An AI-powered trading workstation with a Bloomberg-terminal feel: live-streaming market data, a simulated $10,000 portfolio, and an LLM chat assistant that can analyze your positions and execute trades on your behalf.

Capstone project for an agentic AI coding course — built by orchestrated coding agents working from the shared spec in `planning/`.

## Status

📋 **Planning phase.** The product spec, market-data subsystem design, and consolidated architecture are written and reviewed. No application code exists yet — `backend/`, `frontend/`, `test/`, and `scripts/` are placeholder directories in this repo, not scaffolds. Nothing is runnable yet.

## Stack (planned)

- **Frontend**: Next.js (TypeScript), static export
- **Backend**: FastAPI (Python, managed with `uv`)
- **Database**: SQLite (single file, volume-mounted)
- **Real-time data**: Server-Sent Events (SSE)
- **AI**: LiteLLM → OpenRouter, Cerebras inference (`openai/gpt-oss-120b`)
- **Market data**: built-in GBM simulator by default, or the Massive (formerly Polygon.io) API if a key is provided
- **Deployment**: single Docker container, single port (`8000`)

## Repository Layout

```
backend/     Reserved for the FastAPI app (uv project) — not yet implemented
frontend/    Reserved for the Next.js app (static export) — not yet implemented
planning/    Project spec and design docs for agents — start with planning/PLAN.md
test/        Reserved for Playwright E2E tests — not yet implemented
db/          Runtime volume mount for the SQLite file (gitignored, created at runtime)
```

There are no `scripts/start_*` / `stop_*` files yet — those ship once the Docker build exists.

## Documentation

Read these in order before making changes; together they're the contract all agents build against.

- [`planning/PLAN.md`](planning/PLAN.md) — product vision, UX, architecture overview, database schema, API contract, LLM integration, testing strategy.
- [`planning/ARCHITECTURE.md`](planning/ARCHITECTURE.md) — consolidated technical architecture: system diagram, module layout, data flow (price streaming, trade execution, chat), component responsibilities, and a status table of every open design decision.
- [`planning/MARKET_INTERFACE.md`](planning/MARKET_INTERFACE.md) — the `MarketDataProvider` abstraction, shared price cache, and provider selection.
- [`planning/MARKET_SIMULATOR.md`](planning/MARKET_SIMULATOR.md) — GBM simulator math and implementation.
- [`planning/MASSIVE_API.md`](planning/MASSIVE_API.md) — Massive/Polygon.io API reference for the real-data provider.
- [`planning/REVIEW.md`](planning/REVIEW.md) — original plan review findings; tracked to resolution in `ARCHITECTURE.md` §5.

## Environment Variables

Once the backend exists, these will be read from `.env` in the project root:

```bash
OPENROUTER_API_KEY=   # required — LLM chat functionality
MASSIVE_API_KEY=      # optional — real market data (simulator used if unset)
LLM_MOCK=false        # optional — deterministic mock LLM responses for testing
```

## Running

Not yet available. Once the Docker build and start scripts exist:

```bash
./scripts/start_mac.sh          # macOS/Linux
./scripts/start_windows.ps1     # Windows
```

will open the app at `http://localhost:8000` with no login required.

## Known Open Issues

The full, current list — with what's resolved and what's not — lives in [`planning/ARCHITECTURE.md`](planning/ARCHITECTURE.md#5-design-decisions--status). The items implementers still need to pin down before/while building the affected area:

- API error contract (status codes, payload shapes per endpoint) isn't fully specified.
- Money representation (`REAL` vs. integer cents) and rounding policy aren't pinned down.
- The database mount strategy is contradictory in `PLAN.md` (named volume vs. bind mount).
- SSE reconnect semantics (snapshot-before-deltas) aren't explicitly written down.
- LLM action validation (unknown fields, batch limits, partial-failure reporting) isn't specified.
- `portfolio_snapshots` retention/pruning policy is undefined.

## License

See [LICENSE](LICENSE).
