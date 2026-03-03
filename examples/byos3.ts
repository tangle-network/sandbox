/**
 * BYOS3 (Bring Your Own S3) Example
 *
 * Demonstrates using customer-provided S3-compatible storage for snapshots.
 * Supports AWS S3, Google Cloud Storage (GCS), and Cloudflare R2.
 *
 * Run with: npx tsx examples/byos3.ts
 *
 * Required environment variables:
 *   SANDBOX_API_KEY - Your Tangle Sandbox API key
 *   AWS_ACCESS_KEY_ID - S3 access key
 *   AWS_SECRET_ACCESS_KEY - S3 secret key
 *   S3_BUCKET - Your S3 bucket name
 *   S3_REGION - AWS region (default: us-east-1)
 */

import { Sandbox, type StorageConfig } from "@tangle/sandbox";

async function main() {
  // Configure your S3-compatible storage
  const storage: StorageConfig = {
    type: "s3", // or "gcs" or "r2"
    bucket: process.env.S3_BUCKET || "my-sandbox-snapshots",
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
    prefix: "sandbox-snapshots/", // optional path prefix
  };

  // For Cloudflare R2:
  // const storage: StorageConfig = {
  //   type: "r2",
  //   bucket: "my-snapshots",
  //   endpoint: "https://<account-id>.r2.cloudflarestorage.com",
  //   credentials: {
  //     accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  //     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  //   },
  // };

  // For Google Cloud Storage (using HMAC keys):
  // const storage: StorageConfig = {
  //   type: "gcs",
  //   bucket: "my-snapshots",
  //   credentials: {
  //     accessKeyId: process.env.GCS_HMAC_ACCESS_KEY || "",
  //     secretAccessKey: process.env.GCS_HMAC_SECRET || "",
  //   },
  // };

  const client = new Sandbox({
    apiKey: process.env.SANDBOX_API_KEY || "sk_sandbox_...",
  });

  // --- Create sandbox with BYOS3 storage configured ---
  console.log("Creating sandbox with BYOS3 storage...");

  const box = await client.create({
    name: "byos3-example",
    image: "node:20",
    storage, // Configure storage at creation time
  });

  await box.waitForRunning();
  console.log("Sandbox ready!");
  console.log(`Sidecar URL: ${box.connection?.sidecarUrl}`);
  console.log(`Auth token available: ${!!box.connection?.authToken}\n`);

  // Create some project files
  console.log("--- Creating project files ---\n");

  await box.exec(`
    mkdir -p /workspace/byos3-project
    cd /workspace/byos3-project
    echo '{ "name": "byos3-demo", "version": "2.0.0" }' > package.json
    echo 'module.exports = { hello: "world" };' > index.js
  `);

  const files = await box.exec("ls -la /workspace/byos3-project");
  console.log("Created files:");
  console.log(files.stdout);

  // --- Snapshot to your S3 ---
  console.log("\n--- Creating snapshot to your S3 ---\n");

  const snapshot = await box.snapshot({
    tags: ["byos3-demo", "v2.0"],
    storage, // Snapshot goes to YOUR bucket
  });

  console.log(`Snapshot created: ${snapshot.snapshotId}`);
  console.log(`Created at: ${snapshot.createdAt}`);
  console.log(`Tags: ${snapshot.tags.join(", ")}`);
  console.log(
    `\nSnapshot stored in: s3://${storage.bucket}/${storage.prefix || ""}...`,
  );

  // --- List snapshots from your S3 ---
  console.log("\n--- Listing snapshots from your S3 ---\n");

  const snapshots = await box.listSnapshots(storage);
  console.log(`Found ${snapshots.length} snapshot(s) in your bucket:`);
  for (const snap of snapshots) {
    console.log(`  - ${snap.snapshotId}`);
    console.log(`    Tags: ${snap.tags.join(", ")}`);
    console.log(`    Created: ${snap.createdAt}`);
    if (snap.sizeBytes) {
      console.log(`    Size: ${(snap.sizeBytes / 1024).toFixed(1)} KB`);
    }
  }

  // Make changes
  console.log("\n--- Modifying files ---\n");

  await box.exec(`
    cd /workspace/byos3-project
    echo 'module.exports = { changed: true };' > index.js
  `);

  const modified = await box.exec("cat /workspace/byos3-project/index.js");
  console.log("Modified index.js:");
  console.log(modified.stdout);

  // --- Restore from your S3 ---
  console.log("\n--- Restoring from your S3 ---\n");

  const restored = await box.restoreFromStorage(storage);
  if (restored) {
    console.log(`Restored from: ${restored.snapshotId}`);
    console.log(`Snapshot date: ${restored.createdAt}`);

    // Verify restoration
    const afterRestore = await box.exec(
      "cat /workspace/byos3-project/index.js",
    );
    console.log("\nindex.js after restore (should be original):");
    console.log(afterRestore.stdout);
  } else {
    console.log("No snapshot found to restore");
  }

  // --- Direct sidecar access ---
  console.log("\n--- Direct sidecar access example ---\n");

  const { sidecarUrl, authToken } = box.connection || {};
  if (sidecarUrl && authToken) {
    console.log("You can also call the sidecar API directly:");
    console.log(`  URL: ${sidecarUrl}`);
    console.log(`  Auth: Bearer ${authToken.slice(0, 20)}...`);
    console.log("\nExample curl:");
    console.log(`  curl -X POST ${sidecarUrl}/snapshots/list \\`);
    console.log(
      `    -H "Authorization: Bearer ${authToken.slice(0, 20)}..." \\`,
    );
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(
      `    -d '{"projectId": "${box.id}", "storage": ${JSON.stringify(storage).slice(0, 50)}...}'`,
    );
  }

  // Clean up
  console.log("\n--- Cleanup ---\n");
  await box.delete();
  console.log("Done! Your snapshots remain in your S3 bucket.");
}

main().catch(console.error);
