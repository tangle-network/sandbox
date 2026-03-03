/**
 * Basic Usage Example
 *
 * Demonstrates creating a sandbox, executing commands, and cleanup.
 *
 * Run with: npx tsx examples/basic-usage.ts
 */

import { Sandbox } from "@tangle-network/sandbox";

async function main() {
  // Initialize the client with your API key
  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  console.log("Creating sandbox...");

  // Create a sandbox with Node.js
  const box = await client.create({
    name: "example-sandbox",
    image: "node:20",
    env: {
      NODE_ENV: "development",
    },
  });

  console.log(`Sandbox created: ${box.id}`);
  console.log(`Status: ${box.status}`);

  // Wait for the sandbox to be running
  await box.waitForRunning();
  console.log("Sandbox is running!");

  // Execute some commands
  console.log("\n--- Executing commands ---\n");

  const nodeVersion = await box.exec("node --version");
  console.log(`Node version: ${nodeVersion.stdout.trim()}`);

  const npmVersion = await box.exec("npm --version");
  console.log(`NPM version: ${npmVersion.stdout.trim()}`);

  // Run a more complex command
  const result = await box.exec(`
    mkdir -p /workspace/test-project
    cd /workspace/test-project
    echo '{ "name": "test", "version": "1.0.0" }' > package.json
    cat package.json
  `);
  console.log("\nCreated package.json:");
  console.log(result.stdout);

  // Check exit codes
  const lsResult = await box.exec("ls -la /workspace");
  console.log(`Exit code: ${lsResult.exitCode}`);
  console.log("Files:", lsResult.stdout);

  // Clean up
  console.log("\nDeleting sandbox...");
  await box.delete();
  console.log("Done!");
}

main().catch(console.error);
