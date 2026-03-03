# @tangle/sandbox

TypeScript SDK for the Tangle Sandbox platform. Create isolated dev containers, run AI agents, and build automation workflows.

## Installation

```bash
npm install @tangle/sandbox
# or
pnpm add @tangle/sandbox
# or
yarn add @tangle/sandbox
```

## Quick Start

```typescript
import { Sandbox } from "@tangle/sandbox";

// Initialize the client
const client = new Sandbox({
  apiKey: "sk_sandbox_...",
});

// Create a sandbox
const box = await client.create({
  name: "my-project",
  image: "node:20",
});

// Execute commands
const result = await box.exec("npm install && npm test");
console.log(result.stdout);

// Run an AI agent task
const task = await box.task("Fix any failing tests and commit the changes");
console.log(task.response);

// Clean up
await box.delete();
```

## Features

- **Sandbox Management** - Create, list, stop, resume, and delete sandboxes
- **Command Execution** - Run shell commands in isolated containers
- **AI Agent Tasks** - Multi-turn agent execution with automatic tool use
- **Snapshots** - Save and restore sandbox state
- **BYOS3** - Bring your own S3 storage for snapshots
- **Batch Execution** - Run tasks across multiple sandboxes in parallel
- **Event Streaming** - Real-time SSE streams for agent events

## Core Concepts

### Sandboxes

A sandbox is an isolated dev container with:
- A sidecar API for programmatic control
- Optional SSH access
- Optional web terminal
- Persistent storage with snapshots

```typescript
const box = await client.create({
  name: "my-sandbox",
  image: "python:3.12",
  env: { DEBUG: "true" },
  sshEnabled: true,
  maxLifetimeSeconds: 7200,  // 2 hours
  idleTimeoutSeconds: 1800,  // 30 min idle timeout
  resources: {
    cpuCores: 2,
    memoryMB: 4096,
    diskGB: 20,
  },
});
```

### Status Lifecycle

```
pending -> provisioning -> running -> stopped -> deleted
                              |
                              v
                           failed
```

## API Reference

### Client

```typescript
import { Sandbox } from "@tangle/sandbox";

const client = new Sandbox({
  apiKey: "sk_sandbox_...",
  baseUrl: "https://agents.tangle.network", // optional
  timeoutMs: 30000, // optional
});
```

#### `client.create(options?)`

Create a new sandbox.

```typescript
const box = await client.create({
  name: "my-project",
  image: "node:20",              // or "typescript" for pre-built image
  agentIdentifier: "my-agent",   // agent to run
  env: { NODE_ENV: "development" },
  sshEnabled: true,
  sshPublicKey: "ssh-ed25519 AAAA...",
  webTerminalEnabled: true,
  maxLifetimeSeconds: 3600,
  idleTimeoutSeconds: 900,
  resources: {
    cpuCores: 2,
    memoryMB: 4096,
    diskGB: 20,
  },
  metadata: { team: "platform" },
  // BYOS3: Customer-provided storage
  storage: {
    type: "s3",
    bucket: "my-snapshots",
    region: "us-east-1",
    credentials: {
      accessKeyId: "AKIA...",
      secretAccessKey: "...",
    },
  },
  fromSnapshot: "snap_abc123",   // restore from snapshot
});
```

#### `client.list(options?)`

List all sandboxes.

```typescript
const sandboxes = await client.list({
  status: "running",        // filter by status
  limit: 10,
  offset: 0,
});
```

#### `client.get(id)`

Get a sandbox by ID.

```typescript
const box = await client.get("sandbox_abc123");
if (box) {
  console.log(box.status);
}
```

#### `client.usage()`

Get account usage information.

```typescript
const usage = await client.usage();
console.log(`Active: ${usage.activeSandboxes}`);
console.log(`Compute: ${usage.computeMinutes} minutes`);
```

#### `client.runBatch(tasks, options?)`

Run tasks across multiple sandboxes in parallel.

```typescript
const result = await client.runBatch([
  { id: "task-1", message: "Analyze code quality" },
  { id: "task-2", message: "Run security scan" },
  { id: "task-3", message: "Generate documentation" },
], {
  timeoutMs: 300000,
  scalingMode: "balanced", // "fastest" | "balanced" | "cheapest"
});

console.log(`Success rate: ${result.successRate}%`);
```

### Sandbox Instance

After creating or retrieving a sandbox, you get a `SandboxInstance` with these methods:

#### `box.exec(command, options?)`

Execute a shell command.

```typescript
const result = await box.exec("npm install", {
  cwd: "/workspace",
  env: { CI: "true" },
  timeoutMs: 60000,
});

console.log(result.exitCode);  // 0
console.log(result.stdout);
console.log(result.stderr);
```

#### `box.prompt(message, options?)`

Send a single prompt to the AI agent.

```typescript
const result = await box.prompt("What files are in this project?", {
  sessionId: "session_123",  // for conversation continuity
  model: "anthropic/claude-sonnet-4-20250514",
  timeoutMs: 120000,
});

console.log(result.response);
console.log(result.usage);  // { inputTokens, outputTokens }
```

#### `box.task(message, options?)`

Run a multi-turn agent task. The agent keeps working until completion.

```typescript
const result = await box.task("Set up a REST API with authentication", {
  maxTurns: 20,      // limit turns (0 = unlimited)
  sessionId: "...",  // continue previous session
});

console.log(result.turnsUsed);
console.log(result.response);
```

#### `box.streamPrompt(message, options?)`

Stream agent events in real-time.

```typescript
for await (const event of box.streamPrompt("Explain this codebase")) {
  switch (event.type) {
    case "message.updated":
      process.stdout.write(event.data.content);
      break;
    case "tool_call":
      console.log(`Tool: ${event.data.name}`);
      break;
    case "done":
      console.log("\nComplete!");
      break;
  }
}
```

#### `box.streamTask(message, options?)`

Stream a multi-turn task with real-time events.

```typescript
for await (const event of box.streamTask("Build a CLI tool")) {
  // Handle events...
}
```

#### `box.events(options?)`

Subscribe to sandbox lifecycle events.

```typescript
for await (const event of box.events({ signal: controller.signal })) {
  console.log(`Event: ${event.type}`, event.data);
}
```

### Snapshots

#### `box.snapshot(options?)`

Create a snapshot of the sandbox state.

```typescript
const snapshot = await box.snapshot({
  tags: ["v1.0", "stable"],
  paths: ["/workspace"],  // specific paths (default: all)
});

console.log(snapshot.snapshotId);
console.log(snapshot.sizeBytes);
```

#### `box.listSnapshots()`

List all snapshots for this sandbox.

```typescript
const snapshots = await box.listSnapshots();
for (const snap of snapshots) {
  console.log(`${snap.snapshotId}: ${snap.createdAt}`);
}
```

### BYOS3 (Bring Your Own S3)

Store snapshots in your own S3-compatible storage. Supports AWS S3, Google Cloud Storage, and Cloudflare R2.

#### Creating a sandbox with BYOS3

```typescript
const box = await client.create({
  name: "my-sandbox",
  storage: {
    type: "s3",  // "s3" | "gcs" | "r2"
    bucket: "my-snapshots",
    region: "us-east-1",
    endpoint: "https://s3.us-east-1.amazonaws.com",  // optional
    credentials: {
      accessKeyId: "AKIA...",
      secretAccessKey: "...",
    },
    prefix: "sandbox-snapshots/",  // optional path prefix
  },
  fromSnapshot: "snap_abc123",  // restore from your storage
});
```

#### Snapshots with BYOS3

When storage is configured, snapshots are written directly to your bucket:

```typescript
// Create snapshot to your S3
const snap = await box.snapshot({
  tags: ["production"],
  storage: {
    type: "s3",
    bucket: "my-snapshots",
    credentials: { accessKeyId: "...", secretAccessKey: "..." },
  },
});

// List snapshots from your S3
const snapshots = await box.listSnapshots({
  type: "s3",
  bucket: "my-snapshots",
  credentials: { ... },
});

// Restore from your S3
await box.restoreFromStorage({
  type: "s3",
  bucket: "my-snapshots",
  credentials: { ... },
});
```

### Direct Sidecar Access

For advanced use cases, you can communicate directly with the sidecar API using the provided auth token:

```typescript
const box = await client.create({ name: "my-sandbox" });

// Wait for running status
await box.waitForRunning();

// Get connection info
const { sidecarUrl, authToken } = box.connection;

// Make direct API calls
const response = await fetch(`${sidecarUrl}/snapshots`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${authToken}`,
  },
  body: JSON.stringify({
    projectId: box.id,
    storage: myS3Config,
    tags: ["manual"],
  }),
});
```

### Lifecycle Methods

```typescript
// Stop (preserves state)
await box.stop();

// Resume
await box.resume();

// Delete (destroys everything)
await box.delete();

// Refresh status from API
await box.refresh();

// Wait for specific status
await box.waitForRunning({ timeoutMs: 60000 });
```

### Properties

```typescript
box.id              // Unique identifier
box.name            // Human-readable name
box.status          // "pending" | "provisioning" | "running" | "stopped" | "failed"
box.connection      // { sidecarUrl, authToken, ssh, webTerminalUrl }
box.metadata        // Custom metadata
box.createdAt       // Date
box.startedAt       // Date | undefined
box.lastActivityAt  // Date | undefined
box.expiresAt       // Date | undefined
box.error           // Error message if failed
```

## Error Handling

```typescript
import {
  AuthError,
  NetworkError,
  NotFoundError,
  QuotaError,
  StateError,
  TimeoutError,
  ValidationError,
} from "@tangle/sandbox";

try {
  await box.exec("npm test");
} catch (err) {
  if (err instanceof TimeoutError) {
    console.log("Command timed out");
  } else if (err instanceof StateError) {
    console.log(`Invalid state: ${err.currentState}`);
  } else if (err instanceof NetworkError) {
    console.log("Connection failed");
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  SandboxClientConfig,
  CreateSandboxOptions,
  SandboxInfo,
  SandboxStatus,
  SandboxConnection,
  ExecResult,
  ExecOptions,
  PromptResult,
  PromptOptions,
  TaskResult,
  TaskOptions,
  SnapshotResult,
  SnapshotOptions,
  SnapshotInfo,
  StorageConfig,
  BatchTask,
  BatchResult,
  BatchOptions,
  UsageInfo,
} from "@tangle/sandbox";
```

## Examples

See the [examples](./examples) directory for complete runnable examples:

- `basic-usage.ts` - Creating sandboxes and running commands
- `agent-tasks.ts` - Multi-turn AI agent execution
- `streaming.ts` - Real-time event streaming
- `snapshots.ts` - Creating and restoring snapshots
- `byos3.ts` - Using customer-provided S3 storage
- `batch.ts` - Parallel task execution

## License

MIT

## OpenAPI Contract

This repository ships a generated OpenAPI artifact for SDK-facing HTTP endpoints:

- `openapi/sandbox-api.openapi.json`
- Package export: `@tangle/sandbox/openapi`

Commands:

```bash
pnpm openapi:validate   # Validate spec structure
pnpm openapi:types      # Generate TypeScript contract types
pnpm openapi:pull       # Pull latest spec from deployed API endpoint
```

## Docs Automation

```bash
pnpm docs:build
```

This generates:

- `docs/api/index.html` (OpenAPI reference)
- `docs/sdk/index.html` (TypeDoc API reference)

GitHub workflows included in this repo:

- `CI` for typecheck/build/spec validation
- `Publish` for npm release with provenance
- `Docs` for GitHub Pages deployment
