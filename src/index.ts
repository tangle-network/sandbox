/**
 * Tangle Sandbox SDK
 *
 * Client SDK for building AI-powered development environments.
 *
 * ## Quick Start
 *
 * @example Basic Usage
 * ```typescript
 * import { Sandbox } from "@tangle-network/sandbox";
 *
 * const client = new Sandbox({ apiKey: process.env.TANGLE_API_KEY });
 *
 * // Create a sandbox with pre-built image
 * const box = await client.create({
 *   image: "ethereum",  // Resolves to ghcr.io/tangle-network/devcontainers/ethereum:latest
 *   git: { url: "https://github.com/user/dapp.git" },
 *   tools: { node: "22", python: "3.12" },
 * });
 *
 * await box.waitFor("running");
 *
 * // Run the AI agent
 * const response = await box.prompt("Deploy the smart contract to testnet");
 * console.log(response.response);
 *
 * // Execute commands
 * const result = await box.exec("npm test");
 * console.log(result.stdout);
 *
 * // Clean up
 * await box.delete();
 * ```
 *
 * ## Images
 *
 * Use pre-built images or custom Docker images:
 *
 * @example Pre-built image (simple name resolves automatically)
 * ```typescript
 * const box = await client.create({ image: "ethereum" });
 * // Available: universal, ethereum, solana, rust, go, python, node
 * ```
 *
 * @example Custom Docker image (sidecar layered automatically)
 * ```typescript
 * const box = await client.create({ image: "python:3.12-slim" });
 * ```
 *
 * @example Bare sandbox (no sidecar)
 * ```typescript
 * const box = await client.create({
 *   image: "ubuntu:24.04",
 *   bare: true,
 * });
 * // Only exec() and lifecycle methods available
 * ```
 *
 * ## File Operations
 *
 * @example Read and write files
 * ```typescript
 * const content = await box.read("src/index.ts");
 * await box.write("src/fix.ts", "export const fix = () => {}");
 * ```
 *
 * @example Code search with ripgrep
 * ```typescript
 * for await (const match of box.search("TODO:", { glob: "**\/*.ts" })) {
 *   console.log(`${match.path}:${match.line}: ${match.text}`);
 * }
 * ```
 *
 * ## Git Operations
 *
 * @example Git workflow
 * ```typescript
 * const status = await box.git.status();
 * if (status.isDirty) {
 *   await box.git.add(["."]);
 *   await box.git.commit("Update files");
 *   await box.git.push();
 * }
 * ```
 *
 * ## Tool Management
 *
 * Install and manage language runtimes via mise:
 *
 * @example Install tools on demand
 * ```typescript
 * await box.tools.install("node", "22");
 * await box.tools.install("python", "3.12");
 * const tools = await box.tools.list();
 * ```
 *
 * ## SSH Access
 *
 * @example Connect via SSH
 * ```typescript
 * const box = await client.create({ sshEnabled: true });
 * const ssh = await box.ssh();
 * console.log(`ssh ${ssh.username}@${ssh.host} -p ${ssh.port}`);
 * ```
 *
 * ## Snapshots
 *
 * @example Create and restore snapshots
 * ```typescript
 * const snapshot = await box.snapshot({ name: "before-deploy" });
 *
 * // Later, restore from snapshot
 * const restored = await client.create({ fromSnapshot: snapshot.id });
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { Sandbox, SandboxClient } from "./client.js";
// Errors
export {
  AuthError,
  NetworkError,
  NotFoundError,
  QuotaError,
  SandboxError,
  ServerError,
  StateError,
  TimeoutError,
  ValidationError,
} from "./errors.js";
export type {
  BuildProgressEvent,
  ImageBuildOptions,
  ImageBuildResult,
  ImageSpec,
} from "./image.js";
// Image builder
export {
  generateDockerfile,
  Image,
  ImageBuilder,
} from "./image.js";
// Sandbox instance
export { SandboxInstance } from "./sandbox.js";
export type { TangleSandboxClientConfig } from "./tangle/index.js";
// Tangle on-chain client
export { TangleSandboxClient } from "./tangle/index.js";
// OpenAPI contract types generated from the published API spec artifact.
export type {
  components as OpenAPIComponents,
  operations as OpenAPIOperations,
  paths as OpenAPIPaths,
} from "./generated/openapi-types.js";
// Types
export type {
  // Permissions types (v2)
  AccessPolicyRule,
  AddUserOptions,
  // Backend types (v2)
  BackendCapabilities,
  BackendConfig,
  BackendInfo,
  BackendManager,
  BackendStatus,
  BackendType,
  // Batch types
  BatchEvent,
  BatchOptions,
  BatchResult,
  BatchTask,
  BatchTaskResult,
  // Checkpoint types
  CheckpointInfo,
  CheckpointOptions,
  CheckpointResult,
  // Process management types
  CodeResult,
  // Core types
  CreateSandboxOptions,
  // Enhanced FileSystem types
  DeleteOptions,
  DirectoryPermission,
  DownloadOptions,
  DownloadProgress,
  // Driver types (v2)
  DriverConfig,
  DriverInfo,
  DriverType,
  EventStreamOptions,
  ExecOptions,
  ExecResult,
  FileInfo,
  FileSystem,
  // Fork types
  ForkOptions,
  ForkResult,
  // Git types
  GitAuth,
  GitBranch,
  GitCommit,
  GitConfig,
  GitDiff,
  GitStatus,
  GpuType,
  InlineAgentProfile,
  // Tools types
  InstalledTool,
  ListOptions,
  ListSandboxOptions,
  McpServerConfig,
  MkdirOptions,
  // Network security types
  NetworkConfig,
  NetworkManager,
  PermissionLevel,
  PermissionsManager,
  Process,
  ProcessInfo,
  ProcessLogEntry,
  ProcessManager,
  ProcessSignal,
  ProcessSpawnOptions,
  ProcessStatus,
  PromptOptions,
  PromptResult,
  RunCodeOptions,
  SandboxClientConfig,
  SandboxConnection,
  SandboxEvent,
  SandboxInfo,
  SandboxPermissionsConfig,
  SandboxResources,
  SandboxStatus,
  SandboxUser,
  // Search types
  SearchMatch,
  SearchOptions,
  // Secrets types
  SecretInfo,
  SecretsManager,
  // Snapshot types
  SnapshotInfo,
  SnapshotOptions,
  SnapshotResult,
  SSHCredentials,
  // Storage types (BYOS3)
  StorageConfig,
  // Task types
  TaskOptions,
  TaskResult,
  ToolsConfig,
  UpdateUserOptions,
  UploadOptions,
  UploadProgress,
  UsageInfo,
} from "./types.js";
