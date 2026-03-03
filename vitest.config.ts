import { defineConfig } from "vitest/config";

// E2E tests (Docker/orchestrator/real providers) are intentionally not part of the
// default `pnpm test` run. Use `pnpm test:e2e` for the full integration suite.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "dist/**", "node_modules/**"],
    passWithNoTests: true,
  },
});

