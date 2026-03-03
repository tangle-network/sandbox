/**
 * Batch Execution Example
 *
 * Demonstrates running tasks in parallel across multiple sandboxes.
 *
 * Run with: npx tsx examples/batch.ts
 */

import { type BatchTask, Sandbox } from "@tangle/sandbox";

async function main() {
  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  // Define tasks to run in parallel
  const tasks: BatchTask[] = [
    {
      id: "code-review",
      message:
        "Review this code for potential bugs: function add(a, b) { return a + b }",
      timeoutMs: 30000,
    },
    {
      id: "security-scan",
      message:
        "List common security vulnerabilities to check for in a Node.js application",
      timeoutMs: 30000,
    },
    {
      id: "docs-gen",
      message:
        "Generate JSDoc comments for: async function fetchUser(id) { return await db.users.findById(id); }",
      timeoutMs: 30000,
    },
    {
      id: "test-gen",
      message:
        "Write a Jest test for this function: function multiply(a, b) { return a * b; }",
      timeoutMs: 30000,
    },
  ];

  console.log(`Running ${tasks.length} tasks in parallel...\n`);

  // --- Option 1: Run batch and wait for all results ---
  console.log("--- Batch execution (wait for all) ---\n");

  const result = await client.runBatch(tasks, {
    timeoutMs: 120000,
    scalingMode: "balanced", // "fastest", "balanced", or "cheapest"
  });

  console.log(`Total tasks: ${result.totalTasks}`);
  console.log(`Succeeded: ${result.succeeded}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Success rate: ${result.successRate.toFixed(1)}%`);
  console.log(`Total retries: ${result.totalRetries}`);

  console.log("\n--- Task Results ---\n");

  for (const taskResult of result.results) {
    console.log(`[${taskResult.taskId}]`);
    console.log(`  Success: ${taskResult.success}`);
    console.log(`  Duration: ${taskResult.durationMs}ms`);
    if (taskResult.response) {
      console.log(`  Response: ${taskResult.response.slice(0, 100)}...`);
    }
    if (taskResult.error) {
      console.log(`  Error: ${taskResult.error}`);
    }
    console.log();
  }

  // --- Option 2: Stream batch events for real-time progress ---
  console.log("\n--- Batch execution (streaming) ---\n");

  const streamTasks: BatchTask[] = [
    { id: "stream-1", message: "What is 2+2?" },
    { id: "stream-2", message: "What is the capital of France?" },
  ];

  let completed = 0;
  const total = streamTasks.length;

  for await (const event of client.streamBatch(streamTasks)) {
    switch (event.type) {
      case "batch.started":
        console.log("[Batch started]");
        break;

      case "task.started": {
        const startData = event.data as { taskId: string };
        console.log(`[Task ${startData.taskId} started]`);
        break;
      }

      case "task.completed": {
        completed++;
        const completeData = event.data as {
          taskId: string;
          durationMs: number;
        };
        console.log(
          `[Task ${completeData.taskId} completed in ${completeData.durationMs}ms] (${completed}/${total})`,
        );
        break;
      }

      case "task.failed": {
        completed++;
        const failData = event.data as { taskId: string; error: string };
        console.log(
          `[Task ${failData.taskId} failed: ${failData.error}] (${completed}/${total})`,
        );
        break;
      }

      case "batch.completed":
        console.log("[Batch completed]");
        break;
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
