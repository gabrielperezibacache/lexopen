## 2024-09-06 - [Layout Sequential DB Queries]
**Learning:** `src/app/(app)/layout.tsx` was doing multiple sequential Prisma database calls (`notification.count`, `mailboxMessage.count`) on every single authenticated page load since it's the root app layout. This causes unnecessary round-trips to the DB.
**Action:** When a Next.js Layout needs multiple independent pieces of data, wrap the Prisma queries in `Promise.all` to fetch them concurrently. Since layouts wrap all child routes, optimizing layout data fetching provides a global performance benefit.

## 2025-02-23 - Unbounded Prisma Data Fetching

**Learning:** When generating aggregate views (like billing summaries), loading complete historical transaction logs (e.g. `LedgerEntry`) into memory just to extract the latest balance creates severe O(N) memory and bandwidth bottlenecks.

**Action:** Leverage database-level filtering. In Prisma, use `distinct: ["clienteId"]` combined with descending sort `orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }]` to push the "latest row extraction" down to PostgreSQL, returning only the 1 required row per entity.
## 2023-10-25 - [Layout Sequential DB Queries]
**Learning:** Similar to root layout, route-specific pages like `src/app/(app)/sites/[id]/archivos/page.tsx` were executing multiple independent database queries (e.g., `prisma.folder.findMany` and `prisma.siteFile.findMany`) sequentially. This creates an N+1 query pattern where each subsequent query waits for the previous one to finish, unnecessarily blocking page rendering and extending server response time.
**Action:** Always wrap independent data fetching operations within a Next.js Server Component using `Promise.all`. This pushes the concurrency down to the database level, allowing queries to execute in parallel and eliminating unnecessary round-trips. Be careful to ensure the queries are truly independent before parallelizing.
