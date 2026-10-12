1. **Identify Performance Opportunity:** In `src/app/(app)/sites/[id]/personas/page.tsx`, the data fetching for `site` (using `prisma.site.findUnique`) and `allUsers` (using `prisma.user.findMany` when the user is staff) is currently sequential. By wrapping these in a `Promise.all` and moving the `notFound()` check to evaluate after the concurrent fetch, we can avoid sequential database round-trips for staff users, which makes up a significant optimization for Next.js Server Components.

2. **Refactor Data Fetching:** Modify `src/app/(app)/sites/[id]/personas/page.tsx`:
   - Replace sequential `await prisma...` calls with `Promise.all`.
   - Use conditional fetching for `allUsers` (i.e. if `!isStaff(user.role)`, use `Promise.resolve([])` or fetch in the `Promise.all` array).

3. **Verify Functionality:** Ensure the file compiles without type errors, runs correctly in the frontend, and passes ESLint/tsc checks.

4. **Pre-commit Checks:** Run standard testing, format/linting to satisfy the requirement for the PR.
