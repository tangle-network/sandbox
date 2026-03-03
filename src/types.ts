/**
 * Tangle Sandbox SDK Types
 *
 * Public types for the Sandbox client SDK.
 *
 * @packageDocumentation
 * @module @tangle/sandbox
 */

// ============================================
// Git Configuration
// ============================================

/**
 * Git authentication configuration.
 *
 * @example HTTPS token
 * ```typescript
 * const auth: GitAuth = {
 *   token: process.env.GITHUB_TOKEN,
 * };
 * ```
 */
export interface GitAuth {
  /** HTTPS auth token (e.g., GitHub PAT) */
  token?: string;
}

/**
 * Git repository configuration for cloning at sandbox creation.
 *
 * When provided, the repository is cloned during sandbox provisioning,
 * before the sandbox becomes ready. This is more efficient than cloning
 * after the sandbox starts.
 *
 * @example Basic clone
 * ```typescript
 * const git: GitConfig = {
 *   url: "https://github.com/user/repo.git",
 * };
 * ```
 *
 * @example Clone specific branch with auth
 * ```typescript
 * const git: GitConfig = {
 *   url: "https://github.com/user/private-repo.git",
 *   ref: "develop",
 *   auth: { token: process.env.GITHUB_TOKEN },
 * };
 * ```
 *
 * @example Sparse checkout for monorepo
 * ```typescript
 * const git: GitConfig = {
 *   url: "https://github.com/org/monorepo.git",
 *   sparse: ["packages/my-package", "shared"],
 *   depth: 1,
 * };
 * ```
 */
export interface GitConfig {
  /** Repository URL (HTTPS or SSH) */
  url: string;
  /** Branch, tag, or commit SHA to checkout (default: default branch) */
  ref?: string;
  /** Shallow clone depth (default: 1 for faster clones) */
  depth?: number;
  /** Sparse checkout paths - only clone these directories */
  sparse?: string[];
  /** Authentication for private repositories */
  auth?: GitAuth;
}

// ============================================
// Tools Configuration (Mise)
// ============================================

/**
 * Tool version specifications for mise (polyglot version manager).
 *
 * Mise is pre-installed in all managed sandboxes and can install any
 * language runtime or tool on demand. Specify versions here to have
 * them pre-installed when the sandbox starts.
 *
 * @see https://mise.jdx.dev for supported tools
 *
 * @example Common tools
 * ```typescript
 * const tools: ToolsConfig = {
 *   node: "22",        // Node.js 22.x (latest minor/patch)
 *   python: "3.12",    // Python 3.12.x
 *   rust: "1.75",      // Rust 1.75.x
 *   go: "1.22",        // Go 1.22.x
 * };
 * ```
 *
 * @example Exact versions
 * ```typescript
 * const tools: ToolsConfig = {
 *   node: "20.11.0",   // Exact version
 *   pnpm: "8.15.1",
 *   deno: "1.40",
 * };
 * ```
 */
export interface ToolsConfig {
  /** Node.js version (e.g., "22", "20.11.0", "lts") */
  node?: string;
  /** Python version (e.g., "3.12", "3.11.7") */
  python?: string;
  /** Rust version (e.g., "1.75", "stable", "nightly") */
  rust?: string;
  /** Go version (e.g., "1.22", "1.21.6") */
  go?: string;
  /** Java version (e.g., "21", "17") */
  java?: string;
  /** Ruby version (e.g., "3.3", "3.2.2") */
  ruby?: string;
  /** Any other mise-supported tool and version */
  [tool: string]: string | undefined;
}

/**
 * Configuration for initializing the Sandbox client.
 *
 * @example
 * ```typescript
 * const client = new Sandbox({
 *   apiKey: "sk_sandbox_abc123",
 *   baseUrl: "https://agents.tangle.network",
 *   timeoutMs: 60000,
 * });
 * ```
 */
export interface SandboxClientConfig {
  /** API key for authentication. Must start with `sk_sandbox_` */
  apiKey: string;
  /** Base URL for the Sandbox API. Defaults to `https://agents.tangle.network` */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds) */
  timeoutMs?: number;
}

/**
 * Status of a sandbox instance.
 *
 * Lifecycle: `pending` -> `provisioning` -> `running` -> `stopped` -> (deleted)
 *
 * - `pending` - Sandbox created but not yet provisioning
 * - `provisioning` - Container and resources being allocated
 * - `running` - Sandbox is active and accepting commands
 * - `stopped` - Sandbox is paused (can be resumed)
 * - `failed` - Sandbox encountered an error
 * - `expired` - Sandbox exceeded its lifetime limit
 */
export type SandboxStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "stopped"
  | "failed"
  | "expired";

/**
 * Resource limits for a sandbox.
 */
export interface SandboxResources {
  /** Number of CPU cores */
  cpuCores?: number;
  /** Memory in megabytes */
  memoryMB?: number;
  /** Disk space in gigabytes */
  diskGB?: number;
}

/**
 * Configuration for creating a new sandbox.
 *
 * Sandboxes can run in two modes:
 * - **Managed** (default): Full-featured with agent, files, terminal, git, tools
 * - **Bare**: Minimal container with only exec() and lifecycle methods
 *
 * @example Minimal sandbox (managed mode with defaults)
 * ```typescript
 * const box = await client.create();
 * // Uses 'universal' image, managed mode, sane defaults
 * ```
 *
 * @example Sandbox with pre-built image and git
 * ```typescript
 * const box = await client.create({
 *   image: "ethereum",  // Resolves to ghcr.io/tangle-network/devcontainers/ethereum:latest
 *   git: {
 *     url: "https://github.com/user/dapp.git",
 *     ref: "main",
 *   },
 *   tools: { node: "22", python: "3.12" },
 * });
 * ```
 *
 * @example Sandbox with custom Docker image
 * ```typescript
 * const box = await client.create({
 *   image: "python:3.12-slim",  // Sidecar layered automatically
 *   git: { url: "https://github.com/user/ml-project.git" },
 *   tools: { python: "3.12" },
 * });
 * ```
 *
 * @example Bare sandbox (no sidecar, just exec)
 * ```typescript
 * const box = await client.create({
 *   image: "ubuntu:24.04",
 *   bare: true,
 * });
 * // Only box.exec(), box.stop(), box.resume(), box.delete() available
 * ```
 *
 * @example With BYOS3 storage for snapshots
 * ```typescript
 * const box = await client.create({
 *   image: "universal",
 *   storage: {
 *     type: "s3",
 *     bucket: "my-snapshots",
 *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
 *   },
 *   fromSnapshot: "snap_abc123",
 * });
 * ```
 */
export interface CreateSandboxOptions {
  // ============================================
  // Image
  // ============================================

  /**
   * Docker image to use for the sandbox.
   *
   * **Resolution rules:**
   * - Simple names (no `/` or `:`) → Pre-built image from `ghcr.io/tangle-network/devcontainers/{name}:latest`
   * - Full image paths → Custom image with sidecar layered on top
   *
   * **Pre-built images:**
   * - `universal` - Multi-language environment (default)
   * - `ethereum` - Ethereum/Solidity development
   * - `solana` - Solana/Anchor development
   * - `rust` - Rust development
   * - `go` - Go development
   * - `python` - Python development
   * - `node` - Node.js development
   *
   * @see https://docs.tangle.network/images for full list
   *
   * @example Pre-built image
   * ```typescript
   * image: "ethereum"  // → ghcr.io/tangle-network/devcontainers/ethereum:latest
   * ```
   *
   * @example Custom image (sidecar layered automatically)
   * ```typescript
   * image: "python:3.12-slim"
   * image: "node:22-alpine"
   * image: "ghcr.io/my-org/my-image:latest"
   * ```
   *
   * @default "universal"
   */
  image?: string;

  /**
   * Create a bare sandbox without the sidecar layer.
   *
   * Bare sandboxes only have:
   * - `exec()` - Execute commands
   * - `stop()` / `resume()` - Lifecycle control
   * - `delete()` - Cleanup
   *
   * Use bare mode when you need a clean container without
   * our tooling, or for images that don't meet sidecar requirements.
   *
   * @default false
   */
  bare?: boolean;

  // ============================================
  // Driver Configuration (v2)
  // ============================================

  /**
   * Infrastructure driver selection.
   * Controls how the sandbox is provisioned and isolated.
   *
   * @example Firecracker with CRIU
   * ```typescript
   * driver: { type: "firecracker", enableCriu: true }
   * ```
   */
  driver?: DriverConfig;

  // ============================================
  // Backend/Agent Configuration (v2)
  // ============================================

  /**
   * AI coding agent backend configuration.
   * Determines which agent runs inside the sandbox.
   *
   * @example OpenCode with profile
   * ```typescript
   * backend: { type: "opencode", profile: "with-web-search" }
   * ```
   */
  backend?: BackendConfig;

  // ============================================
  // Permissions Configuration (v2)
  // ============================================

  /**
   * Initial permissions and access control settings.
   *
   * @example Multi-user sandbox
   * ```typescript
   * permissions: {
   *   defaultRole: "developer",
   *   initialUsers: [{ userId: "user_xyz", role: "developer" }],
   * }
   * ```
   */
  permissions?: SandboxPermissionsConfig;

  // ============================================
  // Network Security
  // ============================================

  /**
   * Network security configuration.
   * Controls outbound network access from the sandbox.
   *
   * @example Block all outbound traffic
   * ```typescript
   * network: { blockOutbound: true }
   * ```
   *
   * @example Allow only specific destinations
   * ```typescript
   * network: {
   *   allowList: ["8.8.8.8/32", "10.0.0.0/8"],
   *   ports: [8000, 8080], // Pre-expose ports
   * }
   * ```
   */
  network?: NetworkConfig;

  // ============================================
  // Git & Tools
  // ============================================

  /**
   * Git repository to clone at sandbox creation.
   *
   * The repository is cloned during provisioning, before the sandbox
   * becomes ready. This is more efficient than cloning after start.
   *
   * @example { url: "https://github.com/user/repo.git", ref: "main" }
   */
  git?: GitConfig;

  /**
   * Tool versions to pre-install via mise.
   *
   * Mise (polyglot version manager) is pre-installed in managed sandboxes.
   * Specify versions here to have them ready when the sandbox starts.
   *
   * @example { node: "22", python: "3.12", rust: "1.75" }
   */
  tools?: ToolsConfig;

  // ============================================
  // Resources & Lifecycle
  // ============================================

  /** Human-readable name for the sandbox */
  name?: string;

  /** Resource limits (CPU cores, memory, disk) */
  resources?: SandboxResources;

  /** Environment variables injected into the sandbox */
  env?: Record<string, string>;

  /**
   * Maximum lifetime in seconds.
   * Sandbox is automatically deleted after this time.
   * @default 3600 (1 hour)
   */
  maxLifetimeSeconds?: number;

  /**
   * Idle timeout in seconds.
   * Sandbox is suspended after this period of inactivity.
   * @default 900 (15 minutes)
   */
  idleTimeoutSeconds?: number;

  // ============================================
  // SSH & Terminal
  // ============================================

  /**
   * Enable SSH access to the sandbox.
   * Use `sandbox.ssh()` to get connection credentials.
   * @default false
   */
  sshEnabled?: boolean;

  /** Custom SSH public key for access (optional) */
  sshPublicKey?: string;

  /**
   * Enable web terminal access.
   * Provides a browser-based terminal via websocket.
   * @default false
   */
  webTerminalEnabled?: boolean;

  // ============================================
  // Storage & Snapshots
  // ============================================

  /**
   * Customer-provided S3-compatible storage for snapshots (BYOS3).
   *
   * When configured, snapshots are stored in your own bucket
   * instead of Tangle's managed storage.
   */
  storage?: StorageConfig;

  /** Snapshot ID to restore from when creating the sandbox */
  fromSnapshot?: string;

  // ============================================
  // Secrets
  // ============================================

  /**
   * Names of secrets to inject as environment variables.
   *
   * Secrets must be created via `client.secrets.create()` before use.
   * They are injected as environment variables with the same name.
   *
   * @example
   * ```typescript
   * // First, create the secrets
   * await client.secrets.create("HF_TOKEN", "hf_xxx");
   * await client.secrets.create("AWS_ACCESS_KEY", "AKIA...");
   *
   * // Then use them in a sandbox
   * const box = await client.create({
   *   secrets: ["HF_TOKEN", "AWS_ACCESS_KEY"],
   * });
   *
   * // Secrets are available as env vars
   * const result = await box.exec("echo $HF_TOKEN");
   * ```
   */
  secrets?: string[];

  // ============================================
  // Advanced
  // ============================================

  /** Agent identifier to run in the sandbox (internal) */
  agentIdentifier?: string;

  /** Custom metadata to store with the sandbox */
  metadata?: Record<string, unknown>;
}

/**
 * SSH connection credentials.
 */
export interface SSHCredentials {
  /** SSH server hostname */
  host: string;
  /** SSH server port */
  port: number;
  /** Username for SSH authentication */
  username: string;
}

/**
 * Connection information for a sandbox.
 *
 * Use `sidecarUrl` and `authToken` for direct API access to the sandbox.
 *
 * @example Direct sidecar access
 * ```typescript
 * const { sidecarUrl, authToken } = box.connection;
 *
 * // Make authenticated requests directly to the sidecar
 * const response = await fetch(`${sidecarUrl}/terminal/exec`, {
 *   method: "POST",
 *   headers: {
 *     "Authorization": `Bearer ${authToken}`,
 *     "Content-Type": "application/json",
 *   },
 *   body: JSON.stringify({ command: "ls -la" }),
 * });
 * ```
 */
export interface SandboxConnection {
  /** Sidecar API URL for programmatic access (e.g., `https://abc123.pangolin.dev`) */
  sidecarUrl?: string;
  /** Access token for authenticating directly with the sidecar (Bearer token) */
  authToken?: string;
  /** Token expiration timestamp (ISO 8601). Refresh before this time. */
  authTokenExpiresAt?: string;
  /** SSH connection info if `sshEnabled` was true during creation */
  ssh?: SSHCredentials;
  /** Web terminal URL if `webTerminalEnabled` was true during creation */
  webTerminalUrl?: string;
}

/**
 * Full sandbox information returned from the API.
 */
export interface SandboxInfo {
  /** Unique sandbox identifier */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Current status */
  status: SandboxStatus;
  /** Connection information */
  connection?: SandboxConnection;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** When the sandbox was created */
  createdAt: Date;
  /** When the sandbox started running */
  startedAt?: Date;
  /** Last activity timestamp */
  lastActivityAt?: Date;
  /** When the sandbox will expire */
  expiresAt?: Date;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Options for listing sandboxes.
 */
export interface ListSandboxOptions {
  /** Filter by status */
  status?: SandboxStatus | SandboxStatus[];
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Result of executing a command.
 */
export interface ExecResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Options for executing a command.
 */
export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

// ============================================
// Search Types (ripgrep)
// ============================================

/**
 * Options for code search.
 *
 * @example Search TypeScript files
 * ```typescript
 * const matches = await box.search("TODO", {
 *   glob: "**\/*.ts",
 *   maxResults: 100,
 * });
 * ```
 */
export interface SearchOptions {
  /** Glob pattern to filter files (e.g., "**\/*.ts") */
  glob?: string;
  /** Directory to search in (default: workspace root) */
  cwd?: string;
  /** Maximum number of results */
  maxResults?: number;
  /** Case-insensitive search */
  ignoreCase?: boolean;
  /** Include line context (lines before/after match) */
  context?: number;
}

/**
 * A single search match from ripgrep.
 */
export interface SearchMatch {
  /** File path relative to search root */
  path: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The matching line text */
  text: string;
  /** Context lines before the match */
  before?: string[];
  /** Context lines after the match */
  after?: string[];
}

// ============================================
// Git Capability Types
// ============================================

/**
 * Git repository status.
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Commit SHA of HEAD */
  head: string;
  /** Whether there are uncommitted changes */
  isDirty: boolean;
  /** Number of commits ahead of upstream */
  ahead: number;
  /** Number of commits behind upstream */
  behind: number;
  /** Staged files */
  staged: string[];
  /** Modified but unstaged files */
  modified: string[];
  /** Untracked files */
  untracked: string[];
}

/**
 * Git commit information.
 */
export interface GitCommit {
  /** Commit SHA */
  sha: string;
  /** Short SHA (7 chars) */
  shortSha: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Commit date */
  date: Date;
}

/**
 * Git branch information.
 */
export interface GitBranch {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Upstream branch (if tracking) */
  upstream?: string;
  /** Latest commit SHA */
  commit: string;
}

/**
 * Git diff information.
 */
export interface GitDiff {
  /** Files changed */
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    additions: number;
    deletions: number;
  }>;
  /** Total additions */
  additions: number;
  /** Total deletions */
  deletions: number;
  /** Raw diff output */
  raw: string;
}

// ============================================
// Tools Capability Types
// ============================================

/**
 * Information about an installed tool.
 */
export interface InstalledTool {
  /** Tool name (e.g., "node", "python") */
  name: string;
  /** Installed version */
  version: string;
  /** Path to the tool binary */
  path: string;
  /** Whether this is the active/default version */
  active: boolean;
}

/**
 * Result of an agent prompt.
 */
export interface PromptResult {
  /** Whether the prompt completed successfully */
  success: boolean;
  /** Agent's response text */
  response?: string;
  /** Error message if failed */
  error?: string;
  /** Trace ID for debugging */
  traceId?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Options for sending a prompt.
 */
export interface PromptOptions {
  /** Session ID for conversation continuity */
  sessionId?: string;
  /** Model to use (format: provider/model, e.g., anthropic/claude-sonnet-4-20250514) */
  model?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * SSE event from sandbox streaming.
 */
export interface SandboxEvent {
  /** Event type */
  type: string;
  /** Event data */
  data: Record<string, unknown>;
  /** Event ID */
  id?: string;
}

/**
 * Options for event streaming.
 */
export interface EventStreamOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Filter to specific event types */
  eventTypes?: string[];
}

/**
 * Usage information for the account.
 */
export interface UsageInfo {
  /** Total compute minutes used */
  computeMinutes: number;
  /** Number of currently active sandboxes */
  activeSandboxes: number;
  /** Total sandboxes created */
  totalSandboxes: number;
  /** Billing period start date */
  periodStart: Date;
  /** Billing period end date */
  periodEnd: Date;
}

// ============================================
// Storage Types (BYOS3)
// ============================================

/**
 * S3-compatible storage provider configuration (BYOS3 - Bring Your Own S3).
 *
 * Allows customers to store snapshots in their own S3-compatible storage.
 * Supports AWS S3, Google Cloud Storage (GCS), and Cloudflare R2.
 *
 * @example AWS S3
 * ```typescript
 * const storage: StorageConfig = {
 *   type: "s3",
 *   bucket: "my-snapshots",
 *   region: "us-east-1",
 *   credentials: {
 *     accessKeyId: "AKIA...",
 *     secretAccessKey: "...",
 *   },
 * };
 * ```
 *
 * @example Cloudflare R2
 * ```typescript
 * const storage: StorageConfig = {
 *   type: "r2",
 *   bucket: "my-snapshots",
 *   endpoint: "https://<account>.r2.cloudflarestorage.com",
 *   credentials: {
 *     accessKeyId: "...",
 *     secretAccessKey: "...",
 *   },
 * };
 * ```
 *
 * @example Google Cloud Storage
 * ```typescript
 * const storage: StorageConfig = {
 *   type: "gcs",
 *   bucket: "my-snapshots",
 *   credentials: {
 *     accessKeyId: "...",  // HMAC key
 *     secretAccessKey: "...",
 *   },
 * };
 * ```
 */
export interface StorageConfig {
  /** Storage provider type */
  type: "s3" | "gcs" | "r2";
  /** Bucket name */
  bucket: string;
  /** Custom endpoint URL (required for R2, optional for S3/GCS) */
  endpoint?: string;
  /** Region (e.g., us-east-1) */
  region?: string;
  /** Access credentials */
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Path prefix within bucket (default: sandbox-snapshots/) */
  prefix?: string;
}

// ============================================
// Task Types (Multi-turn execution)
// ============================================

/**
 * Options for running a multi-turn task.
 */
export interface TaskOptions extends PromptOptions {
  /** Maximum number of agent turns (default: 10, 0 = unlimited) */
  maxTurns?: number;
}

/**
 * Result of a multi-turn task execution.
 */
export interface TaskResult extends PromptResult {
  /** Number of agent turns used */
  turnsUsed: number;
  /** Session ID for the task (can be used to continue) */
  sessionId: string;
}

// ============================================
// Snapshot Types
// ============================================

/**
 * Options for creating a snapshot.
 */
export interface SnapshotOptions {
  /** Tags to apply to the snapshot */
  tags?: string[];
  /** Specific paths to include (default: entire workspace) */
  paths?: string[];
  /** Customer-provided storage for BYOS3 (calls sidecar directly) */
  storage?: StorageConfig;
}

/**
 * Result of a snapshot operation.
 */
export interface SnapshotResult {
  /** Unique snapshot identifier */
  snapshotId: string;
  /** When the snapshot was created */
  createdAt: Date;
  /** Size in bytes */
  sizeBytes?: number;
  /** Tags applied to the snapshot */
  tags: string[];
}

/**
 * Metadata about an existing snapshot.
 */
export interface SnapshotInfo {
  /** Unique snapshot identifier */
  snapshotId: string;
  /** Project/sandbox reference */
  projectRef: string;
  /** When the snapshot was created */
  createdAt: Date;
  /** Tags applied to the snapshot */
  tags: string[];
  /** Paths included in the snapshot */
  paths: string[];
  /** Size in bytes */
  sizeBytes?: number;
}

// ============================================
// Batch Types
// ============================================

/**
 * A single task in a batch execution.
 */
export interface BatchTask {
  /** Unique task identifier */
  id: string;
  /** Task prompt/message */
  message: string;
  /** Additional context for this task */
  context?: Record<string, unknown>;
  /** Per-task timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Options for batch execution.
 */
export interface BatchOptions {
  /** Timeout for entire batch in milliseconds (default: 300000 = 5 min) */
  timeoutMs?: number;
  /** Scaling mode: fastest, balanced, or cheapest (default: balanced) */
  scalingMode?: "fastest" | "balanced" | "cheapest";
  /** Keep sandboxes alive after completion (default: false) */
  persistent?: boolean;
}

/**
 * Result of a single task in a batch.
 */
export interface BatchTaskResult {
  /** Task identifier */
  taskId: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Task response if successful */
  response?: string;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of retries */
  retries: number;
  /** Token usage if available */
  tokensUsed?: number;
}

/**
 * Summary of batch execution.
 */
export interface BatchResult {
  /** Total tasks executed */
  totalTasks: number;
  /** Number of successful tasks */
  succeeded: number;
  /** Number of failed tasks */
  failed: number;
  /** Total retries across all tasks */
  totalRetries: number;
  /** Success rate (0-100) */
  successRate: number;
  /** Individual task results */
  results: BatchTaskResult[];
}

/**
 * SSE event from batch streaming.
 */
export interface BatchEvent {
  /** Event type (batch.started, task.completed, etc.) */
  type: string;
  /** Event data */
  data: Record<string, unknown>;
}

// ============================================
// Checkpoint Types (CRIU)
// ============================================

/**
 * Options for creating a checkpoint.
 */
export interface CheckpointOptions {
  /** Tags to apply to the checkpoint */
  tags?: string[];
  /** Keep sandbox running after checkpoint (default: false - sandbox stops) */
  leaveRunning?: boolean;
  /** Also create a filesystem snapshot for data consistency */
  includeSnapshot?: boolean;
}

/**
 * Result of a checkpoint operation.
 */
export interface CheckpointResult {
  /** Unique checkpoint identifier */
  checkpointId: string;
  /** When the checkpoint was created */
  createdAt: Date;
  /** Size of checkpoint in bytes (memory state) */
  sizeBytes?: number;
  /** Tags applied to the checkpoint */
  tags: string[];
}

/**
 * Information about an existing checkpoint.
 */
export interface CheckpointInfo {
  /** Unique checkpoint identifier */
  checkpointId: string;
  /** Project/sandbox reference this checkpoint belongs to */
  projectRef: string;
  /** When the checkpoint was created */
  createdAt: Date;
  /** Tags applied to the checkpoint */
  tags: string[];
  /** Size of checkpoint in bytes */
  sizeBytes?: number;
  /** Whether checkpoint includes memory state (CRIU) */
  hasMemoryState: boolean;
  /** Whether checkpoint includes filesystem snapshot */
  hasFilesystemSnapshot: boolean;
}

/**
 * Options for forking a sandbox from a checkpoint.
 */
export interface ForkOptions {
  /** Name for the forked sandbox */
  name?: string;
  /** Override environment variables in the fork */
  env?: Record<string, string>;
  /** Override resource limits in the fork */
  resources?: SandboxResources;
  /** Custom metadata for the fork */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a fork operation.
 */
export interface ForkResult {
  /** The newly created sandbox instance */
  sandbox: SandboxInfo;
  /** The checkpoint that was forked from */
  sourceCheckpoint: CheckpointInfo;
  /** ID of the source sandbox */
  sourceId: string;
  /** Time taken to fork in milliseconds */
  forkTimeMs: number;
}

// ============================================
// Driver Configuration (v2)
// ============================================

/**
 * Infrastructure driver type.
 * - "docker" - Standard Docker containers (default)
 * - "firecracker" - Micro-VMs with sub-50ms cold start
 * - "host-agent" - Distributed across host cluster
 * - "tangle" - Decentralized via Tangle blueprint operators
 */
export type DriverType = "docker" | "firecracker" | "host-agent" | "tangle";

/**
 * GPU type for host-agent driver.
 */
export type GpuType = "nvidia-a100" | "nvidia-h100" | "nvidia-l4" | "amd-mi250";

/**
 * Infrastructure driver configuration.
 *
 * @example Docker (default)
 * ```typescript
 * driver: { type: "docker" }
 * ```
 *
 * @example Firecracker with CRIU
 * ```typescript
 * driver: {
 *   type: "firecracker",
 *   enableCriu: true,
 *   kernelVersion: "5.15",
 * }
 * ```
 *
 * @example Distributed host-agent with GPU
 * ```typescript
 * driver: {
 *   type: "host-agent",
 *   preferredRegion: "us-east-1",
 *   gpuRequired: true,
 *   gpuType: "nvidia-a100",
 * }
 * ```
 *
 * @example Decentralized Tangle
 * ```typescript
 * driver: { type: "tangle" }
 * ```
 */
export interface DriverConfig {
  /**
   * Driver type identifier.
   * @default "docker"
   */
  type: DriverType;

  // Firecracker-specific options

  /**
   * Enable CRIU checkpointing for true pause/resume and fork.
   * Only available with firecracker driver.
   */
  enableCriu?: boolean;

  /**
   * Kernel version for Firecracker VM.
   * @default "5.15"
   */
  kernelVersion?: string;

  /**
   * Enable vsock for fast VM-host communication.
   * @default true
   */
  enableVsock?: boolean;

  /**
   * Memory balloon for dynamic memory adjustment.
   * @default false
   */
  enableBalloon?: boolean;

  // Host-agent-specific options

  /**
   * Preferred region for container placement.
   * e.g., "us-east-1", "eu-west-1", "ap-southeast-1"
   */
  preferredRegion?: string;

  /** Require GPU on host. */
  gpuRequired?: boolean;

  /** GPU type preference. */
  gpuType?: GpuType;

  /**
   * Number of GPUs required.
   * @default 1 (when gpuRequired is true)
   */
  gpuCount?: number;

  /** Specific host IDs to target. */
  targetHostIds?: string[];

  /** Host IDs to avoid. */
  avoidHostIds?: string[];

  /** Minimum host specs required. */
  minHostSpecs?: {
    cpuCores?: number;
    memoryGB?: number;
    diskGB?: number;
  };
}

/**
 * Driver capabilities and status.
 */
export interface DriverInfo {
  /** Driver type */
  type: DriverType;
  /** Whether driver is available */
  available: boolean;
  /** Driver version string */
  version: string;
  /** Driver capabilities */
  capabilities: {
    /** CRIU checkpoint/restore support */
    criu: boolean;
    /** GPU support */
    gpu: boolean;
    /** vsock communication */
    vsock: boolean;
    /** Filesystem snapshots */
    snapshots: boolean;
    /** Multi-user management */
    userManagement: boolean;
    /** Network isolation */
    networkIsolation: boolean;
  };
  /** Number of available hosts (host-agent only) */
  hosts?: number;
  /** Current capacity */
  capacity?: {
    available: number;
    total: number;
  };
}

// ============================================
// Backend/Agent Configuration (v2)
// ============================================

/**
 * Backend type identifier.
 *
 * Available backends:
 * - "opencode" - OpenCode agent (default, recommended)
 * - "claude-code" - Anthropic Claude Code CLI
 * - "codex" - OpenAI Codex CLI
 * - "amp" - Sourcegraph AMP
 * - "factory-droids" - Factory Droids SDK
 * - "cli-base" - Minimal CLI-only (no AI agent)
 */
export type BackendType =
  | "opencode"
  | "claude-code"
  | "codex"
  | "amp"
  | "factory-droids"
  | "cli-base";

/**
 * MCP (Model Context Protocol) server configuration.
 */
export interface McpServerConfig {
  /** Command to run (e.g., "npx", "node") */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Remote URL (for remote MCP servers via SSE) */
  url?: string;
  /** Headers for remote connections */
  headers?: Record<string, string>;
}

/**
 * Inline agent profile for dynamic configuration.
 */
export interface InlineAgentProfile {
  /** Profile name for identification/logging */
  name?: string;
  /** Extend from one or more named profiles */
  extends?: string | string[];
  /** Model string (format: "provider/model") */
  model?: string;
  /** Agent behavior configuration */
  agent?: {
    /** Custom system prompt */
    systemPrompt?: string;
    /** Maximum conversation turns */
    maxTurns?: number;
    /** Enabled tools/functions */
    tools?: string[];
    /** Temperature for generation */
    temperature?: number;
  };
  /** Permission configuration */
  permission?: {
    /** Bash command execution permission */
    bash?: "allow" | "ask" | "deny";
    /** File edit permission */
    edit?: "allow" | "ask" | "deny";
    /** Network access permission */
    network?: "allow" | "ask" | "deny";
  };
  /** MCP server configuration */
  mcp?: Record<string, McpServerConfig>;
  /** Tool-specific configuration */
  tools?: Record<string, unknown>;
  /** Plugin list (npm packages or paths) */
  plugin?: string[];
  /** Provider-specific configuration */
  provider?: Record<string, unknown>;
  /** Experimental features */
  experimental?: Record<string, unknown>;
}

/**
 * AI coding agent backend configuration.
 *
 * @example OpenCode with default settings
 * ```typescript
 * backend: { type: "opencode" }
 * ```
 *
 * @example OpenCode with named profile
 * ```typescript
 * backend: {
 *   type: "opencode",
 *   profile: "with-web-search",
 * }
 * ```
 *
 * @example Claude Code with BYOK
 * ```typescript
 * backend: {
 *   type: "claude-code",
 *   model: {
 *     provider: "anthropic",
 *     model: "claude-sonnet-4-20250514",
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *   }
 * }
 * ```
 */
export interface BackendConfig {
  /**
   * Backend type identifier.
   * @default "opencode"
   */
  type: BackendType;

  /**
   * Named profile to use (opencode backend).
   * Profiles are pre-configured agent setups with MCP tools, permissions, etc.
   */
  profile?: string;

  /**
   * Inline profile configuration.
   * Takes precedence over named profile.
   */
  inlineProfile?: InlineAgentProfile;

  /**
   * Model configuration override.
   */
  model?: {
    /** Provider name (e.g., "anthropic", "openai", "google") */
    provider?: string;
    /** Model identifier (e.g., "claude-sonnet-4-20250514") */
    model?: string;
    /** BYOK (Bring Your Own Key) API key */
    apiKey?: string;
    /** Custom API base URL (for proxies or on-prem) */
    baseUrl?: string;
    /** Maximum thinking tokens for extended reasoning */
    maxThinkingTokens?: number;
    /** API mode: "api" for direct calls, "cli" for CLI wrapper */
    mode?: "api" | "cli";
  };

  /**
   * Backend server configuration.
   */
  server?: {
    /** Server port (auto-assigned if not specified) */
    port?: number;
    /** Server hostname */
    hostname?: string;
  };
}

/**
 * Backend capabilities.
 */
export interface BackendCapabilities {
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports tool/function use */
  toolUse: boolean;
  /** Supports extended thinking/reasoning */
  reasoning: boolean;
  /** Supports multimodal (images, etc) */
  multimodal: boolean;
  /** Context window size in tokens */
  contextWindow: number;
}

/**
 * Backend status information.
 */
export interface BackendStatus {
  /** Backend type */
  type: BackendType;
  /** Current status */
  status: "running" | "stopped" | "starting" | "stopping" | "unknown";
  /** Backend version */
  version?: string;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Backend information.
 */
export interface BackendInfo {
  /** Backend type */
  type: BackendType;
  /** Whether backend is available */
  available: boolean;
  /** Backend capabilities */
  capabilities: BackendCapabilities;
  /** Available profiles (for opencode) */
  profiles?: Array<{
    name: string;
    description?: string;
    tags?: string[];
  }>;
}

// ============================================
// Network Security Configuration
// ============================================

/**
 * Network configuration for sandbox network isolation.
 *
 * Supports two modes:
 * - `blockOutbound: true` - Block all egress traffic (ports still work for inbound)
 * - `allowList: ["cidr", ...]` - Allow only specific destinations
 *
 * These modes are mutually exclusive.
 *
 * @example Block all outbound traffic
 * ```typescript
 * const box = await client.create({
 *   network: { blockOutbound: true }
 * });
 * ```
 *
 * @example Allow only specific destinations
 * ```typescript
 * const box = await client.create({
 *   network: {
 *     allowList: [
 *       "8.8.8.8/32",      // Google DNS
 *       "10.0.0.0/8",      // Private network
 *     ]
 *   }
 * });
 * ```
 *
 * @example Pre-expose ports at creation
 * ```typescript
 * const box = await client.create({
 *   network: {
 *     blockOutbound: true,
 *     ports: [8000, 8080], // Pre-expose these ports
 *   }
 * });
 * ```
 */
export interface NetworkConfig {
  /**
   * Block all outbound network traffic.
   * Exposed ports still work for inbound connections.
   * Mutually exclusive with `allowList`.
   */
  blockOutbound?: boolean;

  /**
   * CIDR allowlist for outbound traffic.
   * Only traffic to these destinations is allowed.
   * Maximum 10 entries. Mutually exclusive with `blockOutbound`.
   *
   * Supports both IPv4 and IPv6 CIDR notation:
   * - "8.8.8.8/32" - Single IPv4 address
   * - "10.0.0.0/8" - IPv4 subnet
   * - "2001:db8::/32" - IPv6 subnet
   */
  allowList?: string[];

  /**
   * Ports to expose at creation time.
   * These ports will be accessible regardless of network restrictions.
   */
  ports?: number[];
}

/**
 * Network manager for runtime network configuration.
 * Access via `sandbox.network`.
 *
 * @example Update network restrictions
 * ```typescript
 * // Block all outbound traffic
 * await box.network.update({ blockOutbound: true });
 *
 * // Or switch to allowlist mode
 * await box.network.update({
 *   allowList: ["192.168.1.0/24", "8.8.8.8/32"]
 * });
 *
 * // Remove restrictions
 * await box.network.update({ blockOutbound: false });
 * ```
 *
 * @example Expose ports dynamically
 * ```typescript
 * const url = await box.network.exposePort(8000);
 * console.log(`Service available at: ${url}`);
 *
 * const allUrls = await box.network.listUrls();
 * // { 8000: "https://abc-8000.sandbox.tangle.tools", ... }
 * ```
 */
export interface NetworkManager {
  /**
   * Update network permissions at runtime.
   * Changes apply immediately without container restart.
   *
   * @param config - Partial network configuration to apply
   * @throws Error if blockOutbound and allowList are both specified
   * @throws Error if allowList exceeds 10 entries
   * @throws Error if CIDR format is invalid
   */
  update(config: Partial<NetworkConfig>): Promise<void>;

  /**
   * Expose a port dynamically.
   * Returns a publicly accessible URL for the port.
   * Works regardless of network restrictions.
   *
   * @param port - Port number to expose (1-65535)
   * @returns Public URL for accessing the exposed port
   */
  exposePort(port: number): Promise<string>;

  /**
   * List all exposed port URLs.
   *
   * @returns Map of port numbers to their public URLs
   */
  listUrls(): Promise<Record<number, string>>;

  /**
   * Get current network configuration.
   *
   * @returns Current network config including any runtime changes
   */
  getConfig(): Promise<NetworkConfig>;
}

// ============================================
// Permissions System (v2)
// ============================================

/**
 * Permission level for sandbox users.
 *
 * | Level       | Own Home | Workspace | Other Homes | Manage Users |
 * |-------------|----------|-----------|-------------|--------------|
 * | owner       | r/w      | r/w       | r/w         | ✓            |
 * | admin       | r/w      | r/w       | r           | ✓            |
 * | developer   | r/w      | r/w       | -           | -            |
 * | viewer      | r        | r         | -           | -            |
 */
export type PermissionLevel = "owner" | "admin" | "developer" | "viewer";

/**
 * Directory-level permission override.
 */
export interface DirectoryPermission {
  /** Directory path (e.g., "/home/agent", "/workspace/shared") */
  path: string;
  /** Read access */
  read: boolean;
  /** Write access */
  write: boolean;
  /** Execute/traverse access */
  execute: boolean;
}

/**
 * Glob-based access policy rule.
 *
 * @example Block all .env files
 * ```typescript
 * { pattern: "*.env", permission: "none" }
 * ```
 *
 * @example Read-only secrets directory
 * ```typescript
 * { pattern: "/secrets/**", permission: "read" }
 * ```
 */
export interface AccessPolicyRule {
  /** Glob pattern for matching (e.g., "*.env", "/secrets/**") */
  pattern: string;
  /** Access level for matching paths */
  permission: "read" | "write" | "none";
  /** Priority when patterns overlap (higher wins) */
  priority?: number;
}

/**
 * User in a sandbox.
 */
export interface SandboxUser {
  /** Unique user ID (from auth system) */
  userId: string;
  /** Username inside sandbox (Unix username) */
  username: string;
  /** Home directory path */
  homeDir: string;
  /** Permission level */
  role: PermissionLevel;
  /** SSH public keys */
  sshKeys: string[];
  /** Directory permission overrides */
  directoryPermissions?: DirectoryPermission[];
  /** Access policy rules */
  accessPolicies?: AccessPolicyRule[];
  /** When user was added */
  createdAt: Date;
}

/**
 * Options for adding a user to a sandbox.
 */
export interface AddUserOptions {
  /** Unique user ID (from your auth system) */
  userId: string;
  /** Preferred username (will be sanitized for Unix) */
  username?: string;
  /** Permission level (default: developer) */
  role?: PermissionLevel;
  /** SSH public keys for remote access */
  sshKeys?: string[];
  /** Custom directory permissions */
  directoryPermissions?: DirectoryPermission[];
}

/**
 * Options for updating a user.
 */
export interface UpdateUserOptions {
  /** New permission level */
  role?: PermissionLevel;
  /** SSH keys to add */
  addSshKeys?: string[];
  /** SSH keys to remove */
  removeSshKeys?: string[];
  /** Directory permissions to add/update */
  directoryPermissions?: DirectoryPermission[];
}

/**
 * Initial permissions configuration for sandbox creation.
 */
export interface SandboxPermissionsConfig {
  /**
   * Default role for invited users.
   * @default "developer"
   */
  defaultRole?: PermissionLevel;

  /**
   * Users to invite at creation time.
   * Owner is automatically added from the API key.
   */
  initialUsers?: Array<{
    userId: string;
    role?: PermissionLevel;
    sshKeys?: string[];
  }>;

  /**
   * Default access policies for all users.
   */
  defaultPolicies?: AccessPolicyRule[];

  /**
   * Enable multi-user mode.
   * @default true when initialUsers is provided
   */
  multiUser?: boolean;
}

/**
 * Permissions manager interface.
 * Access via `sandbox.permissions`.
 */
export interface PermissionsManager {
  /** List all users in the sandbox */
  list(): Promise<SandboxUser[]>;

  /** Get a specific user */
  get(userId: string): Promise<SandboxUser | null>;

  /** Add a user to the sandbox */
  add(options: AddUserOptions): Promise<SandboxUser>;

  /** Update a user's permissions */
  update(userId: string, options: UpdateUserOptions): Promise<SandboxUser>;

  /** Remove a user from the sandbox */
  remove(
    userId: string,
    options?: { preserveHomeDir?: boolean },
  ): Promise<void>;

  /** Set access policies for a user */
  setAccessPolicies(userId: string, rules: AccessPolicyRule[]): Promise<void>;

  /** Get access policies for a user */
  getAccessPolicies(userId: string): Promise<AccessPolicyRule[]>;

  /** Check if a user can perform an action on a path */
  checkAccess(
    userId: string,
    path: string,
    action: "read" | "write" | "execute",
  ): Promise<boolean>;
}

/**
 * Backend manager for runtime agent configuration.
 * Access via `sandbox.backend`.
 */
export interface BackendManager {
  /** Get current backend status */
  status(): Promise<BackendStatus>;

  /** Get backend capabilities */
  capabilities(): Promise<BackendCapabilities>;

  /** Add MCP server at runtime (opencode only) */
  addMcp(name: string, config: McpServerConfig): Promise<void>;

  /** Get MCP server status */
  getMcpStatus(): Promise<
    Record<
      string,
      {
        status: "running" | "stopped" | "error";
        error?: string;
      }
    >
  >;

  /** Update backend configuration */
  updateConfig(config: Partial<BackendConfig>): Promise<void>;

  /** Restart the backend agent */
  restart(): Promise<void>;
}

// ============================================
// Process Management (v2)
// ============================================

/**
 * Options for spawning a process.
 *
 * @example Basic spawn
 * ```typescript
 * const proc = await box.process.spawn("python train.py");
 * ```
 *
 * @example With options
 * ```typescript
 * const proc = await box.process.spawn("python train.py", {
 *   cwd: "/workspace/ml",
 *   env: { "CUDA_VISIBLE_DEVICES": "0" },
 *   timeoutMs: 3600000, // 1 hour
 * });
 * ```
 */
export interface ProcessSpawnOptions {
  /** Working directory for the process */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (0 = no timeout) */
  timeoutMs?: number;
}

/**
 * Options for running Python code.
 *
 * @example Simple code execution
 * ```typescript
 * const result = await box.process.runCode(`
 *   import numpy as np
 *   print(np.random.rand(10))
 * `);
 * ```
 */
export interface RunCodeOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Status of a spawned process.
 */
export interface ProcessStatus {
  /** Process ID */
  pid: number;
  /** Command that was executed */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Whether the process is still running */
  running: boolean;
  /** Exit code (-1 if still running) */
  exitCode: number;
  /** Signal that killed the process (if any) */
  exitSignal?: string;
  /** When the process started */
  startedAt: Date;
  /** When the process exited (if exited) */
  exitedAt?: Date;
}

/**
 * Full process information including environment.
 */
export interface ProcessInfo extends ProcessStatus {
  /** Environment variables used */
  env?: Record<string, string>;
}

/**
 * A log entry from process stdout/stderr.
 */
export interface ProcessLogEntry {
  /** Log source: stdout or stderr */
  type: "stdout" | "stderr";
  /** Log content */
  data: string;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/**
 * Result of running code or a blocking process.
 */
export interface CodeResult {
  /** Process ID */
  pid: number;
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Signal types for killing processes.
 */
export type ProcessSignal =
  | "SIGTERM"
  | "SIGKILL"
  | "SIGINT"
  | "SIGHUP"
  | "SIGQUIT"
  | "SIGUSR1"
  | "SIGUSR2";

/**
 * A handle to a spawned process with control methods.
 *
 * @example Non-blocking process with log streaming
 * ```typescript
 * const proc = await box.process.spawn("python train.py", {
 *   cwd: "/workspace",
 *   env: { "CUDA_VISIBLE_DEVICES": "0" }
 * });
 *
 * console.log(`Started PID: ${proc.pid}`);
 *
 * // Stream logs in real-time
 * for await (const line of proc.logs()) {
 *   console.log(line);
 * }
 *
 * // Or wait for completion
 * const exitCode = await proc.wait();
 * ```
 *
 * @example Check status and kill
 * ```typescript
 * const status = await proc.status();
 * if (status.running) {
 *   await proc.kill("SIGKILL");
 * }
 * ```
 */
export interface Process {
  /** Process ID */
  readonly pid: number;
  /** Command that was executed */
  readonly command: string;

  /**
   * Get current process status.
   */
  status(): Promise<ProcessStatus>;

  /**
   * Wait for the process to exit.
   * @returns Exit code
   */
  wait(): Promise<number>;

  /**
   * Kill the process.
   * @param signal - Signal to send (default: SIGTERM)
   */
  kill(signal?: ProcessSignal): Promise<void>;

  /**
   * Stream stdout/stderr logs in real-time.
   * Includes buffered logs from process start.
   */
  logs(): AsyncIterable<ProcessLogEntry>;

  /**
   * Stream only stdout.
   */
  stdout(): AsyncIterable<string>;

  /**
   * Stream only stderr.
   */
  stderr(): AsyncIterable<string>;
}

/**
 * Process manager for spawning and controlling processes.
 * Access via `sandbox.process`.
 *
 * Provides non-blocking process execution with real-time log streaming,
 * ideal for long-running tasks like ML training or dev servers.
 *
 * @example Non-blocking process
 * ```typescript
 * const proc = await box.process.spawn("python train.py", {
 *   cwd: "/workspace",
 *   env: { "CUDA_VISIBLE_DEVICES": "0" }
 * });
 *
 * // Stream logs
 * for await (const entry of proc.logs()) {
 *   console.log(`[${entry.type}] ${entry.data}`);
 * }
 *
 * // Check status
 * const status = await proc.status();
 * console.log(`Running: ${status.running}`);
 *
 * // Kill if needed
 * await proc.kill();
 * ```
 *
 * @example Run Python code directly
 * ```typescript
 * const result = await box.process.runCode(`
 *   import numpy as np
 *   print(np.random.rand(10).mean())
 * `);
 * console.log(result.stdout); // Prints the mean
 * ```
 *
 * @example List and manage processes
 * ```typescript
 * const procs = await box.process.list();
 * for (const p of procs) {
 *   console.log(`PID ${p.pid}: ${p.command} (${p.running ? 'running' : 'exited'})`);
 * }
 *
 * // Get specific process
 * const proc = await box.process.get(1234);
 * if (proc) {
 *   await proc.kill();
 * }
 * ```
 */
export interface ProcessManager {
  /**
   * Spawn a process without blocking.
   * Returns immediately with a Process handle.
   *
   * @param command - Shell command to execute
   * @param options - Spawn options (cwd, env, timeout)
   * @returns Process handle for control and monitoring
   */
  spawn(command: string, options?: ProcessSpawnOptions): Promise<Process>;

  /**
   * Run Python code directly.
   * Blocks until completion and returns result.
   *
   * @param code - Python code to execute
   * @param options - Execution options
   * @returns Execution result with stdout/stderr
   */
  runCode(code: string, options?: RunCodeOptions): Promise<CodeResult>;

  /**
   * List all tracked processes.
   *
   * @returns Array of process status objects
   */
  list(): Promise<ProcessStatus[]>;

  /**
   * Get a process by PID.
   *
   * @param pid - Process ID
   * @returns Process handle or null if not found
   */
  get(pid: number): Promise<Process | null>;
}

// ============================================
// Secrets Management
// ============================================

/**
 * Information about a stored secret (without the value).
 */
export interface SecretInfo {
  /** Secret name (e.g., HF_TOKEN, AWS_ACCESS_KEY) */
  name: string;
  /** When the secret was created */
  createdAt: Date;
  /** When the secret was last updated */
  updatedAt: Date;
}

/**
 * Secrets manager for storing and retrieving encrypted secrets.
 * Access via `client.secrets`.
 *
 * Secrets are encrypted at rest and can be injected into sandboxes
 * as environment variables.
 *
 * @example Create and manage secrets
 * ```typescript
 * // Create a secret
 * await client.secrets.create("HF_TOKEN", "hf_xxx");
 *
 * // List all secrets (names only, not values)
 * const secrets = await client.secrets.list();
 * console.log(secrets.map(s => s.name)); // ["HF_TOKEN"]
 *
 * // Get a secret value (audited operation)
 * const value = await client.secrets.get("HF_TOKEN");
 *
 * // Update a secret
 * await client.secrets.update("HF_TOKEN", "hf_new_value");
 *
 * // Delete a secret
 * await client.secrets.delete("HF_TOKEN");
 * ```
 *
 * @example Use secrets in a sandbox
 * ```typescript
 * // Create sandbox with secrets injected as env vars
 * const box = await client.create({
 *   secrets: ["HF_TOKEN", "AWS_ACCESS_KEY"],
 * });
 *
 * // Secrets are available as environment variables
 * const result = await box.exec("echo $HF_TOKEN");
 * ```
 */
export interface SecretsManager {
  /**
   * Create a new secret.
   *
   * @param name - Secret name (uppercase, alphanumeric + underscore, max 63 chars)
   * @param value - Secret value (max 64KB)
   * @returns Created secret info
   * @throws If secret already exists or name is invalid
   *
   * @example
   * ```typescript
   * await client.secrets.create("HF_TOKEN", "hf_xxx");
   * await client.secrets.create("AWS_ACCESS_KEY", "AKIA...");
   * ```
   */
  create(name: string, value: string): Promise<SecretInfo>;

  /**
   * List all secrets (names and metadata only, not values).
   *
   * @returns Array of secret info objects
   *
   * @example
   * ```typescript
   * const secrets = await client.secrets.list();
   * for (const s of secrets) {
   *   console.log(`${s.name} - created ${s.createdAt}`);
   * }
   * ```
   */
  list(): Promise<SecretInfo[]>;

  /**
   * Get a secret's decrypted value.
   *
   * This is an audited operation - access is logged.
   *
   * @param name - Secret name
   * @returns Secret value
   * @throws If secret not found
   *
   * @example
   * ```typescript
   * const token = await client.secrets.get("HF_TOKEN");
   * ```
   */
  get(name: string): Promise<string>;

  /**
   * Update an existing secret's value.
   *
   * @param name - Secret name
   * @param value - New secret value
   * @returns Updated secret info
   * @throws If secret not found
   *
   * @example
   * ```typescript
   * await client.secrets.update("HF_TOKEN", "hf_new_value");
   * ```
   */
  update(name: string, value: string): Promise<SecretInfo>;

  /**
   * Delete a secret.
   *
   * @param name - Secret name
   * @throws If secret not found
   *
   * @example
   * ```typescript
   * await client.secrets.delete("HF_TOKEN");
   * ```
   */
  delete(name: string): Promise<void>;
}

// ============================================
// Enhanced File System (v2)
// ============================================

/**
 * Detailed file/directory information.
 */
export interface FileInfo {
  /** File/directory name */
  name: string;
  /** Full path relative to workspace */
  path: string;
  /** Size in bytes */
  size: number;
  /** Whether this is a directory */
  isDir: boolean;
  /** Whether this is a regular file */
  isFile: boolean;
  /** Whether this is a symbolic link */
  isSymlink: boolean;
  /** Unix permissions (e.g., 0o755) */
  permissions: number;
  /** Owner user ID/name */
  owner: string;
  /** Group ID/name */
  group: string;
  /** Last modification time */
  modTime: Date;
  /** Last access time */
  accessTime: Date;
}

/**
 * Options for uploading files.
 */
export interface UploadOptions {
  /** Overwrite if file exists (default: true) */
  overwrite?: boolean;
  /** Set file permissions (Unix mode, e.g., 0o644) */
  permissions?: number;
  /** Progress callback for large files */
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload progress information.
 */
export interface UploadProgress {
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Percentage complete (0-100) */
  percentage: number;
}

/**
 * Options for downloading files.
 */
export interface DownloadOptions {
  /** Overwrite local file if exists (default: true) */
  overwrite?: boolean;
  /** Progress callback for large files */
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Download progress information.
 */
export interface DownloadProgress {
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Percentage complete (0-100) */
  percentage: number;
}

/**
 * Options for listing directories.
 */
export interface ListOptions {
  /** Include hidden files (starting with .) */
  all?: boolean;
  /** Include full metadata (like ls -l) */
  long?: boolean;
}

/**
 * Options for creating directories.
 */
export interface MkdirOptions {
  /** Create parent directories as needed (like mkdir -p) */
  recursive?: boolean;
  /** Set directory permissions (Unix mode, e.g., 0o755) */
  mode?: number;
}

/**
 * Options for deleting files/directories.
 */
export interface DeleteOptions {
  /** Recursively delete directories (like rm -rf) */
  recursive?: boolean;
}

/**
 * Enhanced file system operations for sandboxes.
 * Access via `sandbox.fs`.
 *
 * Provides comprehensive file operations beyond basic read/write,
 * including binary file upload/download, directory operations,
 * and progress reporting for large files.
 *
 * @example Upload and download files
 * ```typescript
 * // Upload a local file
 * await box.fs.upload("./model.bin", "/workspace/models/model.bin");
 *
 * // Download a file
 * await box.fs.download("/workspace/results.zip", "./local/results.zip");
 *
 * // With progress reporting
 * await box.fs.upload("./large-file.bin", "/workspace/data.bin", {
 *   onProgress: (p) => console.log(`${p.percentage}%`),
 * });
 * ```
 *
 * @example Directory operations
 * ```typescript
 * // Upload entire directory
 * await box.fs.uploadDir("./local/project", "/workspace/project");
 *
 * // Download entire directory
 * await box.fs.downloadDir("/workspace/output", "./local/output");
 *
 * // List directory contents
 * const files = await box.fs.list("/workspace");
 * for (const f of files) {
 *   console.log(`${f.name} - ${f.size} bytes`);
 * }
 * ```
 *
 * @example File management
 * ```typescript
 * // Check if file exists
 * if (await box.fs.exists("/workspace/config.json")) {
 *   const info = await box.fs.stat("/workspace/config.json");
 *   console.log(`Size: ${info.size}, Modified: ${info.modTime}`);
 * }
 *
 * // Create directory
 * await box.fs.mkdir("/workspace/output/images", { recursive: true });
 *
 * // Delete file or directory
 * await box.fs.delete("/workspace/temp", { recursive: true });
 * ```
 */
export interface FileSystem {
  /**
   * Read a file's contents as a string.
   * For binary files, use download() instead.
   *
   * @param path - Path to file (relative to workspace)
   * @returns File contents as UTF-8 string
   * @throws NotFoundError if file doesn't exist
   */
  read(path: string): Promise<string>;

  /**
   * Write string content to a file.
   * For binary files, use upload() instead.
   * Creates parent directories as needed.
   *
   * @param path - Path to file (relative to workspace)
   * @param content - Content to write
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Search for text patterns in files using ripgrep.
   * @see SearchOptions for available options
   */
  search(query: string, options?: SearchOptions): AsyncIterable<SearchMatch>;

  /**
   * Upload a local file to the sandbox.
   * Handles binary files correctly using multipart upload.
   * Creates parent directories as needed.
   *
   * @param localPath - Path to local file
   * @param remotePath - Destination path in sandbox
   * @param options - Upload options (overwrite, permissions, progress)
   * @throws Error if local file doesn't exist
   *
   * @example
   * ```typescript
   * await box.fs.upload("./model.bin", "/workspace/models/model.bin");
   *
   * // With progress
   * await box.fs.upload("./large-file.bin", "/data/file.bin", {
   *   onProgress: (p) => console.log(`${p.percentage.toFixed(1)}%`),
   * });
   * ```
   */
  upload(
    localPath: string,
    remotePath: string,
    options?: UploadOptions,
  ): Promise<void>;

  /**
   * Download a file from the sandbox.
   * Handles binary files correctly.
   * Creates local parent directories as needed.
   *
   * @param remotePath - Path to file in sandbox
   * @param localPath - Local destination path
   * @param options - Download options (overwrite, progress)
   * @throws NotFoundError if remote file doesn't exist
   *
   * @example
   * ```typescript
   * await box.fs.download("/workspace/output.zip", "./results.zip");
   * ```
   */
  download(
    remotePath: string,
    localPath: string,
    options?: DownloadOptions,
  ): Promise<void>;

  /**
   * Upload a local directory to the sandbox.
   * Uses tar for efficient transfer.
   * Preserves directory structure and file permissions.
   *
   * @param localDir - Path to local directory
   * @param remoteDir - Destination directory in sandbox
   * @throws Error if local directory doesn't exist
   *
   * @example
   * ```typescript
   * await box.fs.uploadDir("./project", "/workspace/project");
   * ```
   */
  uploadDir(localDir: string, remoteDir: string): Promise<void>;

  /**
   * Download a directory from the sandbox.
   * Uses tar for efficient transfer.
   * Preserves directory structure and file permissions.
   *
   * @param remoteDir - Directory path in sandbox
   * @param localDir - Local destination directory
   * @throws NotFoundError if remote directory doesn't exist
   *
   * @example
   * ```typescript
   * await box.fs.downloadDir("/workspace/output", "./local-output");
   * ```
   */
  downloadDir(remoteDir: string, localDir: string): Promise<void>;

  /**
   * List directory contents with metadata.
   *
   * @param path - Directory path (relative to workspace)
   * @param options - List options (all, long)
   * @returns Array of file/directory info
   * @throws NotFoundError if directory doesn't exist
   *
   * @example
   * ```typescript
   * const entries = await box.fs.list("/workspace", { all: true });
   * for (const e of entries) {
   *   const type = e.isDir ? "DIR" : "FILE";
   *   console.log(`[${type}] ${e.name} (${e.size} bytes)`);
   * }
   * ```
   */
  list(path: string, options?: ListOptions): Promise<FileInfo[]>;

  /**
   * Get detailed information about a file or directory.
   *
   * @param path - Path to file/directory
   * @returns File/directory metadata
   * @throws NotFoundError if path doesn't exist
   *
   * @example
   * ```typescript
   * const info = await box.fs.stat("/workspace/model.bin");
   * console.log(`Size: ${info.size}, Modified: ${info.modTime}`);
   * ```
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * Delete a file or directory.
   *
   * @param path - Path to delete
   * @param options - Delete options (recursive for directories)
   * @throws NotFoundError if path doesn't exist
   * @throws Error if deleting non-empty directory without recursive
   *
   * @example
   * ```typescript
   * // Delete file
   * await box.fs.delete("/workspace/temp.txt");
   *
   * // Delete directory recursively
   * await box.fs.delete("/workspace/cache", { recursive: true });
   * ```
   */
  delete(path: string, options?: DeleteOptions): Promise<void>;

  /**
   * Create a directory.
   *
   * @param path - Directory path to create
   * @param options - Options (recursive to create parents)
   *
   * @example
   * ```typescript
   * // Create with parents
   * await box.fs.mkdir("/workspace/output/images", { recursive: true });
   * ```
   */
  mkdir(path: string, options?: MkdirOptions): Promise<void>;

  /**
   * Check if a path exists.
   *
   * @param path - Path to check
   * @returns true if path exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await box.fs.exists("/workspace/config.json")) {
   *   // File exists
   * }
   * ```
   */
  exists(path: string): Promise<boolean>;
}
