## 2024-09-06 - [Layout Sequential DB Queries]
**Learning:** `src/app/(app)/layout.tsx` was doing multiple sequential Prisma database calls (`notification.count`, `mailboxMessage.count`) on every single authenticated page load since it's the root app layout. This causes unnecessary round-trips to the DB.
**Action:** When a Next.js Layout needs multiple independent pieces of data, wrap the Prisma queries in `Promise.all` to fetch them concurrently. Since layouts wrap all child routes, optimizing layout data fetching provides a global performance benefit.

## 2025-02-23 - Unbounded Prisma Data Fetching

**Learning:** When generating aggregate views (like billing summaries), loading complete historical transaction logs (e.g. `LedgerEntry`) into memory just to extract the latest balance creates severe O(N) memory and bandwidth bottlenecks.

**Action:** Leverage database-level filtering. In Prisma, use `distinct: ["clienteId"]` combined with descending sort `orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }]` to push the "latest row extraction" down to PostgreSQL, returning only the 1 required row per entity.
