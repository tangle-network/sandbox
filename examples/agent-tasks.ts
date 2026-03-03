/**
 * Agent Tasks Example
 *
 * Demonstrates multi-turn AI agent execution.
 *
 * Run with: npx tsx examples/agent-tasks.ts
 */

import { Sandbox } from "@tangle/sandbox";

async function main() {
  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  console.log("Creating sandbox...");
  const box = await client.create({
    name: "agent-example",
    image: "node:20",
  });

  await box.waitForRunning();
  console.log("Sandbox ready!\n");

  // --- Single Prompt ---
  console.log("--- Single Prompt ---\n");

  const promptResult = await box.prompt("What files are in /workspace?");
  console.log("Response:", promptResult.response);
  console.log(
    `Tokens: ${promptResult.usage?.inputTokens} in, ${promptResult.usage?.outputTokens} out`,
  );

  // --- Multi-turn Task ---
  console.log("\n--- Multi-turn Task ---\n");

  const taskResult = await box.task(
    "Create a simple Express.js server with a health check endpoint. Write it to /workspace/server.js",
    {
      maxTurns: 10, // Limit turns
    },
  );

  console.log("Task completed!");
  console.log(`Turns used: ${taskResult.turnsUsed}`);
  console.log(`Session ID: ${taskResult.sessionId}`);
  console.log("\nResponse:", taskResult.response);

  // Verify the file was created
  const verifyResult = await box.exec("cat /workspace/server.js");
  if (verifyResult.exitCode === 0) {
    console.log("\n--- Created server.js ---");
    console.log(verifyResult.stdout);
  }

  // --- Continue Conversation ---
  console.log("\n--- Continue Conversation ---\n");

  const continueResult = await box.task(
    "Now add a /api/time endpoint that returns the current time in JSON format",
    {
      sessionId: taskResult.sessionId, // Continue the same session
      maxTurns: 5,
    },
  );

  console.log("Continuation completed!");
  console.log(`Additional turns: ${continueResult.turnsUsed}`);
  console.log("Response:", continueResult.response);

  // Clean up
  console.log("\nCleaning up...");
  await box.delete();
  console.log("Done!");
}

main().catch(console.error);
