## 2024-09-06 - [Layout Sequential DB Queries]
**Learning:** `src/app/(app)/layout.tsx` was doing multiple sequential Prisma database calls (`notification.count`, `mailboxMessage.count`) on every single authenticated page load since it's the root app layout. This causes unnecessary round-trips to the DB.
**Action:** When a Next.js Layout needs multiple independent pieces of data, wrap the Prisma queries in `Promise.all` to fetch them concurrently. Since layouts wrap all child routes, optimizing layout data fetching provides a global performance benefit.

## 2025-02-23 - Unbounded Prisma Data Fetching

**Learning:** When generating aggregate views (like billing summaries), loading complete historical transaction logs (e.g. `LedgerEntry`) into memory just to extract the latest balance creates severe O(N) memory and bandwidth bottlenecks.

**Action:** Leverage database-level filtering. In Prisma, use `distinct: ["clienteId"]` combined with descending sort `orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }]` to push the "latest row extraction" down to PostgreSQL, returning only the 1 required row per entity.

## 2026-09-08 - Sequential DB Inserts within Transaction
**Learning:** In `src/app/api/causas/[id]/tramites/route.ts`, the code was performing an array `.map()` of individual `prisma.tramite.create()` operations inside a `prisma.$transaction()`. While this guarantees atomicity, it creates an N+1 query pattern where applying a template with N items results in N sequential round-trips to PostgreSQL, significantly slowing down the application.
**Action:** Since Prisma 5.22+ combined with PostgreSQL supports `createManyAndReturn`, the solution is to transform the data items into a single array and use `createManyAndReturn()`. This achieves atomicity and reduces the N database round-trips to just 1 bulk insert query, massively improving the performance of bulk creation routes while returning the auto-generated IDs needed for downstream logic (like audit logging).
