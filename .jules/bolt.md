## 2024-09-06 - [Layout Sequential DB Queries]
**Learning:** `src/app/(app)/layout.tsx` was doing multiple sequential Prisma database calls (`notification.count`, `mailboxMessage.count`) on every single authenticated page load since it's the root app layout. This causes unnecessary round-trips to the DB.
**Action:** When a Next.js Layout needs multiple independent pieces of data, wrap the Prisma queries in `Promise.all` to fetch them concurrently. Since layouts wrap all child routes, optimizing layout data fetching provides a global performance benefit.

## 2025-02-23 - Unbounded Prisma Data Fetching

**Learning:** When generating aggregate views (like billing summaries), loading complete historical transaction logs (e.g. `LedgerEntry`) into memory just to extract the latest balance creates severe O(N) memory and bandwidth bottlenecks.

**Action:** Leverage database-level filtering. In Prisma, use `distinct: ["clienteId"]` combined with descending sort `orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }]` to push the "latest row extraction" down to PostgreSQL, returning only the 1 required row per entity.

## 2026-09-08 - Sequential DB Inserts within Transaction
**Learning:** In `src/app/api/causas/[id]/tramites/route.ts`, the code was performing an array `.map()` of individual `prisma.tramite.create()` operations inside a `prisma.$transaction()`. While this guarantees atomicity, it creates an N+1 query pattern where applying a template with N items results in N sequential round-trips to PostgreSQL, significantly slowing down the application.
**Action:** Since Prisma 5.22+ combined with PostgreSQL supports `createManyAndReturn`, the solution is to transform the data items into a single array and use `createManyAndReturn()`. This achieves atomicity and reduces the N database round-trips to just 1 bulk insert query, massively improving the performance of bulk creation routes while returning the auto-generated IDs needed for downstream logic (like audit logging).

## 2025-02-12 - Concurrent Prisma Fetching Optimization
**Learning:** Sequential Prisma calls in Next.js Server Components, where the second query is independent but placed after a `null` check of the first, are a common source of performance bottlenecks.
**Action:** Use `Promise.all` to fetch multiple independent datasets concurrently, moving `notFound()` checks to after the grouped response is resolved. This trades slightly more database work on 404 paths for a consistently faster "happy path" page load.

## 2024-05-18 - [Page Sequential DB Queries]
**Learning:** `src/app/(app)/sites/[id]/archivos/page.tsx` was doing multiple sequential Prisma database calls (`site.findUnique`, `folder.findMany`, `siteFile.findMany`) causing unnecessary round-trips to the DB.
**Action:** When a Next.js Server Component needs multiple independent pieces of data, wrap the Prisma queries in `Promise.all` to fetch them concurrently. To optimize the happy path, group queries even if a secondary query logically follows a `null` check on the first, moving `notFound()` checks to after the `Promise.all` resolution.

## 2024-05-18 - [Parallelize Independent DB Queries]
**Learning:** Sequential, independent database queries in Next.js Server Components create unnecessary bottlenecks. For instance, fetching layout parameters (like `site` info) and then fetching the specific page data sequentially doubles the round-trip latency.
**Action:** Always combine independent Prisma fetches (e.g., `findUnique` and `findMany`) inside `Promise.all` to execute them concurrently, optimizing the "happy path" page load times.

## 2024-10-24 - Database Level Aggregation
**Learning:** Fetching all rows of a database into Node.js application memory just to calculate a sum using `reduce` wastes memory bandwidth and leads to O(N) memory complexity based on the record count. This is a common performance anti-pattern.
**Action:** Use Prisma's `.aggregate({ _sum: { ... } })` feature to execute these reductions at the database level where they are highly optimized, and returning only the required calculation result to the application.
