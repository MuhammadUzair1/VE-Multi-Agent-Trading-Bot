# Plan Review — FinAlly

## Summary

The plan has a strong, appropriately scoped MVP: the single-origin deployment, simulated market-data default, fixed ticker universe, and mock LLM mode make the product demonstrable without external dependencies. The UX requirements are concrete and the major backend/frontend boundary is clear.

Before implementation, resolve the items below. They are mostly contract and operational details that otherwise leave different implementers likely to make incompatible choices.

## Must resolve

1. **Define the API contract, not only routes.** Add request/response JSON examples or schemas for every endpoint, including decimal representation, timestamps/timezone, sorting, empty states, and error payloads. Specify status codes for invalid ticker, duplicate watchlist item, absent watchlist item, invalid/non-positive quantity, insufficient cash/shares, missing history, and unavailable LLM. This is the primary contract between frontend, backend, and E2E tests.

2. **Make trade execution atomic.** Specify a SQLite transaction (with an appropriate write-lock strategy) that reads the current cash/position and price, validates, updates cash/position, appends the trade, and writes the immediate portfolio snapshot together. Define price precision/rounding and the exact `total_value` / unrealized-P&L formulas. Use an integer/decimal representation for money rather than SQLite `REAL`, or explicitly accept and consistently round floating-point behavior.

3. **Resolve two contradictory market-data statements.** Section 6 says the data layer and cache update all ten symbols continuously, but the Massive section says it polls the union of watched tickers. Choose one; polling all ten is consistent with the fixed universe and accurate P&L for removed watchlist symbols. Also state startup behavior before the first real-data poll and what the health/status endpoint reports when the provider fails.

4. **Resolve the database mount contradiction.** The example uses a named volume (`finally-data:/app/db`), while the text says the project-root `db/` directory maps to `/app/db`. Choose named-volume or bind-mount behavior and make Docker Compose and scripts match it. The production Dockerfile should create `/app/db` with a writable non-root user if one is used.

5. **Specify SSE delivery semantics.** Define the event name and JSON schema, initial connection behavior, heartbeat/keepalive interval, reconnect retry, and whether a client receives a snapshot before deltas. `EventSource` reconnection does not by itself guarantee missed events are recovered; either provide a snapshot after reconnect or document that the frontend re-fetches watchlist/history on `onopen`. Bound per-client queues and clean them up on disconnect so slow clients cannot accumulate memory.

6. **Clarify LLM failure and action semantics.** The LLM must never be trusted as an authority: backend validation should normalize symbols, reject unknown action fields, cap action count/quantity, and return a per-action outcome. Define behavior for malformed structured output, timeouts/rate limits, unavailable API key, and partially valid batches. Persist the actual executed/rejected outcomes—not only the model-proposed actions—and ensure only server-derived portfolio data enters the prompt.

## Important improvements

- Add an implementation order and acceptance criteria/milestones (foundation and schema → market cache/API → transactional portfolio → UI/SSE → chat → Docker/E2E). The current document describes the destination but not the handoff sequence for agents.
- Define the static-export routing fallback: API routes must take precedence and unknown non-API paths should serve `index.html` only if the SPA needs deep-link support.
- State retention rules for `portfolio_snapshots`, trades, and chat messages. Thirty-second snapshots grow indefinitely; cap, aggregate, or prune them, and define the history response window/resolution.
- Add indexes for common reads: `watchlist(user_id, ticker)`, `positions(user_id, ticker)`, `trades(user_id, executed_at)`, `portfolio_snapshots(user_id, recorded_at)`, and `chat_messages(user_id, created_at)`.
- Include a startup/shutdown lifecycle: initialize schema before serving, start/stop background tasks cleanly, and avoid concurrent SQLite connections sharing unsafe state. “Startup (or first request)” should be narrowed to one deterministic behavior.
- Make observability testable: structured server logs without secrets, `/api/health` response shape, and readiness criteria (database initialized plus price cache populated). Health should not expose credentials.
- Expand tests for atomic trade behavior, duplicate watchlist writes, invalid/malformed API inputs, persistence across restart, LLM provider failures, and SSE reconnect state resynchronization. The “correct heatmap colors” test also needs a stated P&L/color threshold contract.
- The plan contains mojibake (for example `â€”`, `â†’`, and damaged box drawing) and refers to `planning/PLAN.md` while the file is `planning/plan.md`. Normalize UTF-8 text and filename references before agents treat this as a source contract.

## Suggested decisions to record

- Use UTC ISO-8601 timestamps and a fixed decimal policy (for example, integer micro-dollars internally and decimal strings in the API).
- On page load and each SSE reconnect, fetch a complete REST snapshot, then apply deltas; history is limited to the server’s 100 in-memory points and returns `404` for unsupported symbols.
- Treat live prices as indicative: every manual/AI market order fills at the cache price captured inside the trade transaction and returns that exact fill price.
- If no OpenRouter key is configured and mock mode is off, keep the terminal usable and return a clear, non-500 chat-unavailable response.

