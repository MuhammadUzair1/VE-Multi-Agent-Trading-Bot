# Review findings

## [P1] Poll the fixed ticker universe in the Massive implementation

`PLAN.md:172` still directs the Massive client to poll the union of watched tickers, while the newly added supported-universe and shared-cache requirements (`PLAN.md:152`, `PLAN.md:179`) require prices for all ten symbols regardless of the watchlist. Following the Massive-specific instruction means removing a held symbol from the watchlist stops price updates for that position, producing stale P&L and violating the stated behavior. Change the Massive rule to poll all ten supported tickers (or remove the all-ten requirement).

## [P1] Define and implement history initialization when Massive is selected

The new history endpoint is required to seed charts on load (`PLAN.md:25`, `PLAN.md:187`), but its only population mechanism fast-forwards the simulator (`PLAN.md:186`). When `MASSIVE_API_KEY` selects the real-data implementation, a new process has no history until roughly 100 polling intervals have passed (about 25 minutes at the documented free-tier cadence), so the promised initial sparklines/charts are empty. Specify a Massive historical-data fetch or an explicit synthetic/cache-seeding fallback before serving `/api/prices/{ticker}/history`.

## [P2] Do not describe absent directories as existing scaffolds

`README.md:9` says `backend/` and `frontend/` are "empty scaffolds," and the layout and run sections name `test/`, `db/`, and `scripts/`, but none of those paths are present in the repository at this commit. A newcomer following the README will try to run nonexistent scripts. Either create the advertised scaffolding/scripts in this change, or state that these are planned paths and omit the runnable commands until they exist.
