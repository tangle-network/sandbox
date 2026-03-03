/**
 * Snapshots Example
 *
 * Demonstrates creating, listing, and restoring snapshots.
 *
 * Run with: npx tsx examples/snapshots.ts
 */

import { Sandbox } from "@tangle/sandbox";

async function main() {
  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  console.log("Creating sandbox...");
  const box = await client.create({
    name: "snapshot-example",
    image: "node:20",
  });

  await box.waitForRunning();
  console.log("Sandbox ready!\n");

  // Create some files to snapshot
  console.log("--- Creating project files ---\n");

  await box.exec(`
    mkdir -p /workspace/my-project
    cd /workspace/my-project
    echo '{ "name": "my-project", "version": "1.0.0" }' > package.json
    echo 'console.log("Hello from snapshot!");' > index.js
    echo '# My Project' > README.md
  `);

  const files = await box.exec("ls -la /workspace/my-project");
  console.log("Created files:");
  console.log(files.stdout);

  // Create a snapshot
  console.log("\n--- Creating snapshot ---\n");

  const snapshot = await box.snapshot({
    tags: ["v1.0", "initial"],
    paths: ["/workspace/my-project"],
  });

  console.log(`Snapshot created: ${snapshot.snapshotId}`);
  console.log(`Created at: ${snapshot.createdAt}`);
  console.log(`Size: ${snapshot.sizeBytes} bytes`);
  console.log(`Tags: ${snapshot.tags.join(", ")}`);

  // Make changes after the snapshot
  console.log("\n--- Making changes ---\n");

  await box.exec(`
    cd /workspace/my-project
    echo 'console.log("This is new code");' >> index.js
    echo 'New line added after snapshot' >> README.md
  `);

  const changed = await box.exec("cat /workspace/my-project/index.js");
  console.log("Modified index.js:");
  console.log(changed.stdout);

  // List snapshots
  console.log("\n--- Listing snapshots ---\n");

  const snapshots = await box.listSnapshots();
  console.log(`Found ${snapshots.length} snapshot(s):`);
  for (const snap of snapshots) {
    console.log(`  - ${snap.snapshotId} (${snap.tags.join(", ")})`);
    console.log(`    Created: ${snap.createdAt}`);
  }

  // Clean up
  console.log("\n--- Cleanup ---\n");
  await box.delete();
  console.log("Done!");

  // --- Create new sandbox from snapshot ---
  console.log("\n--- Creating sandbox from snapshot ---\n");

  const box2 = await client.create({
    name: "restored-example",
    image: "node:20",
    fromSnapshot: snapshot.snapshotId,
  });

  await box2.waitForRunning();
  console.log("New sandbox ready!");

  // Verify the restored content
  const restored = await box2.exec(
    "cat /workspace/my-project/index.js 2>/dev/null || echo 'File not found'",
  );
  console.log("\nRestored index.js (should be original version):");
  console.log(restored.stdout);

  await box2.delete();
  console.log("\nAll done!");
}

main().catch(console.error);
