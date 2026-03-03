/**
 * Vitest E2E Configuration
 *
 * Configuration for sandbox SDK end-to-end tests.
 * These tests require a running orchestrator and optionally real LLM access.
 */

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["tests/unit/**", "tests/integration/**"],
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 60000, // 1 minute for setup/teardown
    globalTimeout: 600000, // 10 minutes for entire suite
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Prevents resource contention
      },
    },
    // Sequential execution for E2E to prevent resource conflicts
    sequence: {
      shuffle: false,
    },
    // Retry flaky E2E tests once
    retry: process.env.CI === "true" ? 1 : 0,
    // Output configuration for better debugging
    reporters: ["default"],
    outputFile: {
      junit: "./coverage/e2e-junit.xml",
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
