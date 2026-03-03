/**
 * Streaming Example
 *
 * Demonstrates real-time event streaming from agent execution.
 *
 * Run with: npx tsx examples/streaming.ts
 */

import { Sandbox } from "@tangle-network/sandbox";

async function main() {
  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  console.log("Creating sandbox...");
  const box = await client.create({
    name: "streaming-example",
    image: "node:20",
  });

  await box.waitForRunning();
  console.log("Sandbox ready!\n");

  // --- Stream a Prompt ---
  console.log("--- Streaming Prompt ---\n");

  for await (const event of box.streamPrompt(
    "Explain how async/await works in JavaScript",
  )) {
    switch (event.type) {
      case "message.updated": {
        // Stream the response text as it comes in
        const content = (event.data as { content?: string }).content;
        if (content) {
          process.stdout.write(content);
        }
        break;
      }

      case "tool_call": {
        const toolData = event.data as { name?: string; arguments?: unknown };
        console.log(`\n[Tool Call: ${toolData.name}]`);
        break;
      }

      case "tool_result": {
        const resultData = event.data as { output?: string };
        console.log(`[Tool Result: ${resultData.output?.slice(0, 100)}...]`);
        break;
      }

      case "done":
        console.log("\n\n[Stream complete]");
        break;

      case "error":
        console.error("\n[Error]:", event.data);
        break;
    }
  }

  // --- Stream a Task ---
  console.log("\n--- Streaming Task ---\n");

  for await (const event of box.streamTask(
    "Create a file called hello.js that prints 'Hello, World!'",
  )) {
    switch (event.type) {
      case "task.start":
        console.log("[Task started]");
        break;

      case "message.updated": {
        const content = (event.data as { content?: string }).content;
        if (content) {
          process.stdout.write(content);
        }
        break;
      }

      case "tool_call": {
        const toolData = event.data as { name?: string };
        console.log(`\n[Using tool: ${toolData.name}]`);
        break;
      }

      case "task.complete":
        console.log("\n[Task complete]");
        break;
    }
  }

  // --- Stream Sandbox Events ---
  console.log("\n--- Streaming Sandbox Events (5 seconds) ---\n");

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);

  try {
    for await (const event of box.events({ signal: controller.signal })) {
      console.log(`[${event.type}]`, JSON.stringify(event.data).slice(0, 100));
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") throw err;
    console.log("[Event stream stopped]");
  }

  // Clean up
  console.log("\nCleaning up...");
  await box.delete();
  console.log("Done!");
}

main().catch(console.error);
