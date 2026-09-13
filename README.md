# FinAlly — AI Trading Workstation

An AI-powered trading workstation with a Bloomberg-terminal feel: live-streaming market data, a simulated $10,000 portfolio, and an LLM chat assistant that can analyze your positions and execute trades on your behalf.

Capstone project for an agentic AI coding course — built by orchestrated coding agents working from the shared spec in `planning/`.

## Status

📋 **Planning phase.** The full spec is written; implementation has not started yet (`backend/` and `frontend/` are empty scaffolds).

## Stack

- **Frontend**: Next.js (TypeScript), static export
- **Backend**: FastAPI (Python, managed with `uv`)
- **Database**: SQLite (single file, volume-mounted)
- **Real-time data**: Server-Sent Events (SSE)
- **AI**: LiteLLM → OpenRouter, Cerebras inference (`openai/gpt-oss-120b`)
- **Market data**: built-in GBM simulator by default, or the Massive (Polygon.io) API if a key is provided
- **Deployment**: single Docker container, single port (`8000`)

## Project Layout

```
backend/     FastAPI app (uv project) — API, SSE, database, LLM integration
frontend/    Next.js app (static export)
planning/    Project spec and agent-facing docs (start with planning/PLAN.md)
test/        Playwright E2E tests
db/          Runtime volume mount for the SQLite file (gitignored)
```

## Documentation

The full product and technical spec lives in [`planning/PLAN.md`](planning/PLAN.md) — vision, architecture, database schema, API contract, market data design, LLM integration, and testing strategy. Read it before making changes; it's the contract all agents build against.

## Environment Variables

Set these in `.env` in the project root:

```bash
OPENROUTER_API_KEY=   # required — LLM chat functionality
MASSIVE_API_KEY=      # optional — real market data (simulator used if unset)
LLM_MOCK=false        # optional — deterministic mock LLM responses for testing
```

## Running (once built)

```bash
./scripts/start_mac.sh          # macOS/Linux
./scripts/start_windows.ps1     # Windows
```

Opens the app at `http://localhost:8000`. No login required.

## License

See [LICENSE](LICENSE).
