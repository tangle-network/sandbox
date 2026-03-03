/**
 * Sandbox Instance
 *
 * Represents a single sandbox and provides methods to interact with it.
 */

import {
  NetworkError,
  NotFoundError,
  parseErrorResponse,
  StateError,
  TimeoutError,
} from "./errors.js";
import type {
  AccessPolicyRule,
  AddUserOptions,
  BackendCapabilities,
  BackendConfig,
  BackendManager,
  BackendStatus,
  CheckpointInfo,
  CheckpointOptions,
  CheckpointResult,
  CodeResult,
  DeleteOptions,
  DownloadOptions,
  DownloadProgress,
  DriverInfo,
  EventStreamOptions,
  ExecOptions,
  ExecResult,
  FileInfo,
  FileSystem,
  ForkOptions,
  GitBranch,
  GitCommit,
  GitDiff,
  GitStatus,
  InstalledTool,
  ListOptions,
  McpServerConfig,
  MkdirOptions,
  NetworkConfig,
  NetworkManager,
  PermissionsManager,
  Process,
  ProcessLogEntry,
  ProcessManager,
  ProcessSignal,
  ProcessSpawnOptions,
  ProcessStatus,
  PromptOptions,
  PromptResult,
  RunCodeOptions,
  SandboxConnection,
  SandboxEvent,
  SandboxInfo,
  SandboxStatus,
  SandboxUser,
  SearchMatch,
  SearchOptions,
  SnapshotInfo,
  SnapshotOptions,
  SnapshotResult,
  SSHCredentials,
  TaskOptions,
  TaskResult,
  UpdateUserOptions,
  UploadOptions,
  UploadProgress,
} from "./types.js";

/**
 * HTTP client interface for making requests.
 */
export interface HttpClient {
  fetch(path: string, options?: RequestInit): Promise<Response>;
}

/**
 * Git capability for repository operations.
 */
export interface GitCapability {
  /** Get repository status */
  status(): Promise<GitStatus>;
  /** Get commit log */
  log(limit?: number): Promise<GitCommit[]>;
  /** Get diff (optionally against a ref) */
  diff(ref?: string): Promise<GitDiff>;
  /** Stage files */
  add(paths: string[]): Promise<void>;
  /** Create a commit */
  commit(message: string, options?: { amend?: boolean }): Promise<GitCommit>;
  /** Push to remote */
  push(options?: { force?: boolean }): Promise<void>;
  /** Pull from remote */
  pull(options?: { rebase?: boolean }): Promise<void>;
  /** List branches */
  branches(): Promise<GitBranch[]>;
  /** Checkout a branch or ref */
  checkout(ref: string, options?: { create?: boolean }): Promise<void>;
}

/**
 * Tools capability for managing language runtimes via mise.
 */
export interface ToolsCapability {
  /** Install a tool version */
  install(tool: string, version: string): Promise<void>;
  /** Activate a tool version for the session */
  use(tool: string, version: string): Promise<void>;
  /** List installed tools */
  list(): Promise<InstalledTool[]>;
  /** Run a command with a specific tool */
  run(tool: string, args: string[]): Promise<ExecResult>;
}

/**
 * A sandbox instance with methods for interaction.
 */
export class SandboxInstance {
  private readonly client: HttpClient;
  private info: SandboxInfo;
  private cachedWorkspaceRoot: string | null = null;

  constructor(client: HttpClient, info: SandboxInfo) {
    this.client = client;
    this.info = info;
  }

  // ============================================
  // Properties
  // ============================================

  /** Unique sandbox identifier */
  get id(): string {
    return this.info.id;
  }

  /** Human-readable name */
  get name(): string | undefined {
    return this.info.name;
  }

  /** Current status */
  get status(): SandboxStatus {
    return this.info.status;
  }

  /** Connection information */
  get connection(): SandboxConnection | undefined {
    return this.info.connection;
  }

  /** Custom metadata */
  get metadata(): Record<string, unknown> | undefined {
    return this.info.metadata;
  }

  /** When the sandbox was created */
  get createdAt(): Date {
    return this.info.createdAt;
  }

  /** When the sandbox started running */
  get startedAt(): Date | undefined {
    return this.info.startedAt;
  }

  /** Last activity timestamp */
  get lastActivityAt(): Date | undefined {
    return this.info.lastActivityAt;
  }

  /** When the sandbox will expire */
  get expiresAt(): Date | undefined {
    return this.info.expiresAt;
  }

  /** Error message if status is 'failed' */
  get error(): string | undefined {
    return this.info.error;
  }

  /** Web terminal URL for browser-based access */
  get url(): string | undefined {
    return this.info.connection?.webTerminalUrl;
  }

  // ============================================
  // Methods
  // ============================================

  /**
   * Get the workspace root directory path inside the sandbox.
   * The result is cached after the first call.
   *
   * @returns The absolute path to the workspace root (e.g., "/home/agent")
   *
   * @example
   * ```typescript
   * const root = await box.getWorkspaceRoot();
   * console.log(root); // "/home/agent"
   * ```
   */
  async getWorkspaceRoot(): Promise<string> {
    if (this.cachedWorkspaceRoot) {
      return this.cachedWorkspaceRoot;
    }

    const result = await this.exec(
      'echo "$AGENT_WORKSPACE_ROOT"',
    );
    const root = result.stdout.trim();
    // Fall back to /home/agent if env var is empty
    this.cachedWorkspaceRoot = root || "/home/agent";
    return this.cachedWorkspaceRoot;
  }

  /**
   * Refresh sandbox information from the server.
   */
  async refresh(): Promise<void> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}`);
    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
    const data = await response.json();
    this.info = this.parseInfo(data);
  }

  /**
   * Get SSH credentials for connecting to the sandbox.
   * Throws if SSH is not enabled or sandbox is not running.
   */
  async ssh(): Promise<SSHCredentials> {
    await this.ensureRunning();

    if (!this.connection?.ssh) {
      throw new StateError(
        "SSH is not enabled for this sandbox",
        this.status,
        "running",
      );
    }

    return this.connection.ssh;
  }

  /**
   * Execute a command in the sandbox.
   */
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/terminals/commands",
      {
        method: "POST",
        body: JSON.stringify({
          command,
          cwd: options?.cwd,
          env: options?.env,
          timeout: options?.timeoutMs,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    // Response format: { success: true, result: { exitCode, stdout, stderr, duration } }
    const result = data.result ?? data;
    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  // ============================================
  // Flat File Methods (convenience)
  // ============================================

  /**
   * Read a file from the sandbox.
   *
   * @param path - Path to the file. Relative paths resolve from the workspace root.
   *   Absolute paths (e.g., `/tmp/output.json`) access the container filesystem directly.
   * @returns File content as string
   *
   * @example
   * ```typescript
   * const content = await box.read("src/index.ts");
   * const report = await box.read("/output/report.json");
   * ```
   */
  async read(path: string): Promise<string> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/files/read", {
      method: "POST",
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.data?.content ?? "";
  }

  /**
   * Write content to a file in the sandbox.
   *
   * @param path - Path to the file. Relative paths resolve from the workspace root.
   *   Absolute paths (e.g., `/tmp/cases.json`) write to the container filesystem directly.
   * @param content - Content to write
   *
   * @example
   * ```typescript
   * await box.write("src/fix.ts", "export const fix = () => {}");
   * await box.write("/tmp/config.json", JSON.stringify(config));
   * ```
   */
  async write(path: string, content: string): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/files/write", {
      method: "POST",
      body: JSON.stringify({ path, content }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  /**
   * Send a prompt to the agent running in the sandbox.
   * Returns the complete response after the agent finishes.
   */
  async prompt(
    message: string,
    options?: PromptOptions,
  ): Promise<PromptResult> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const startTime = Date.now();
    let responseText: string | undefined;
    let error: string | undefined;
    let traceId: string | undefined;
    let usage: PromptResult["usage"];

    try {
      for await (const event of this.streamPrompt(message, options)) {
        // Streaming content updates - accumulate text parts
        if (event.type === "message.part.updated") {
          const part = event.data.part as { type?: string; content?: string };
          if (part?.type === "text" && part.content) {
            responseText =
              (responseText ?? "") + ((event.data.delta as string) ?? "");
            // If no delta, use full content (might be initial content)
            if (!event.data.delta) {
              responseText = part.content;
            }
          }
        }
        // Final result with complete response and token usage
        if (event.type === "result") {
          responseText = (event.data.finalText as string) ?? responseText;
          const tokenUsage = event.data.tokenUsage as {
            inputTokens?: number;
            outputTokens?: number;
          };
          if (tokenUsage) {
            usage = {
              inputTokens: tokenUsage.inputTokens ?? 0,
              outputTokens: tokenUsage.outputTokens ?? 0,
            };
          }
        }
        if (event.type === "trace.id") {
          traceId = event.data.traceId as string;
        }
        if (event.type === "error") {
          error = event.data.message as string;
        }
      }

      return {
        success: !error,
        response: responseText,
        error,
        traceId,
        durationMs: Date.now() - startTime,
        usage,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Stream events from an agent prompt.
   * Use this for real-time updates during agent execution.
   */
  async *streamPrompt(
    message: string,
    options?: PromptOptions,
  ): AsyncGenerator<SandboxEvent> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/agents/run/stream",
      {
        method: "POST",
        body: JSON.stringify({
          identifier: "default",
          message,
          sessionId: options?.sessionId,
          metadata: options?.context,
          backend: options?.model
            ? { model: this.parseModel(options.model) }
            : undefined,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    yield* this.parseSSEStream(response);
  }

  /**
   * Stream sandbox lifecycle and activity events.
   */
  async *events(options?: EventStreamOptions): AsyncGenerator<SandboxEvent> {
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/events`,
      {
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    for await (const event of this.parseSSEStream(response, options?.signal)) {
      if (options?.eventTypes && !options.eventTypes.includes(event.type)) {
        continue;
      }
      yield event;
    }
  }

  // ============================================
  // Task Methods (Multi-turn execution)
  // ============================================

  /**
   * Run an agentic task until completion.
   *
   * Unlike prompt(), task() is designed for autonomous agent work:
   * - The agent works until it completes the task or hits an error
   * - Session state is maintained for context continuity
   * - Token usage is aggregated across the execution
   *
   * Note: The agent (OpenCode/Claude) handles multi-turn execution internally.
   * Most tasks complete in a single call. The maxTurns option is for edge cases
   * where the agent explicitly signals it needs additional input.
   *
   * @param prompt - Task description for the agent
   * @param options - Task options
   * @returns Task result with response and execution metadata
   */
  async task(prompt: string, options?: TaskOptions): Promise<TaskResult> {
    const startTime = Date.now();
    const sessionId = options?.sessionId ?? `task-${crypto.randomUUID()}`;
    let responseText: string | undefined;
    let error: string | undefined;
    let traceId: string | undefined;
    let usage: TaskResult["usage"];

    try {
      // Execute the task - the agent handles multi-turn internally
      for await (const event of this.streamPrompt(prompt, {
        ...options,
        sessionId,
      })) {
        // Streaming content updates - accumulate text parts
        if (event.type === "message.part.updated") {
          const part = event.data.part as { type?: string; content?: string };
          if (part?.type === "text" && part.content) {
            responseText =
              (responseText ?? "") + ((event.data.delta as string) ?? "");
            if (!event.data.delta) {
              responseText = part.content;
            }
          }
        }

        // Final result with complete response and token usage
        if (event.type === "result") {
          responseText = (event.data.finalText as string) ?? responseText;
          const tokenUsage = event.data.tokenUsage as {
            inputTokens?: number;
            outputTokens?: number;
          };
          if (tokenUsage) {
            usage = usage
              ? {
                  inputTokens:
                    usage.inputTokens + (tokenUsage.inputTokens ?? 0),
                  outputTokens:
                    usage.outputTokens + (tokenUsage.outputTokens ?? 0),
                }
              : {
                  inputTokens: tokenUsage.inputTokens ?? 0,
                  outputTokens: tokenUsage.outputTokens ?? 0,
                };
          }
        }

        // Capture trace ID for debugging
        if (event.type === "trace.id") {
          traceId = event.data.traceId as string;
        }

        // Capture errors
        if (event.type === "error") {
          error = event.data.message as string;
        }
      }

      return {
        success: !error,
        response: responseText,
        error,
        traceId,
        durationMs: Date.now() - startTime,
        usage,
        turnsUsed: 1,
        sessionId,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        turnsUsed: 1,
        sessionId,
      };
    }
  }

  /**
   * Stream events from a task execution.
   *
   * Use this for real-time updates as the agent works:
   * - Tool calls and results
   * - Thinking/reasoning steps
   * - File operations
   * - Final response
   *
   * @param prompt - Task description for the agent
   * @param options - Task options
   */
  async *streamTask(
    prompt: string,
    options?: TaskOptions,
  ): AsyncGenerator<SandboxEvent> {
    const sessionId = options?.sessionId ?? `task-${crypto.randomUUID()}`;

    // Emit task start
    yield {
      type: "task.start",
      data: { sessionId, prompt },
    };

    // Stream all events from the agent
    for await (const event of this.streamPrompt(prompt, {
      ...options,
      sessionId,
    })) {
      yield event;
    }

    // Emit task complete
    yield {
      type: "task.complete",
      data: { sessionId },
    };
  }

  // ============================================
  // Search Methods (ripgrep)
  // ============================================

  /**
   * Search for text patterns in files using ripgrep.
   *
   * This is a first-class code search capability, not a shell wrapper.
   * Ripgrep is pre-installed in all managed sandboxes.
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Search options
   * @returns Async iterator of search matches
   *
   * @example Search for TODO comments
   * ```typescript
   * for await (const match of box.search("TODO:", { glob: "**\/*.ts" })) {
   *   console.log(`${match.path}:${match.line}: ${match.text}`);
   * }
   * ```
   *
   * @example Collect all matches
   * ```typescript
   * const matches = [];
   * for await (const match of box.search("function.*async")) {
   *   matches.push(match);
   * }
   * ```
   */
  async *search(
    pattern: string,
    options?: SearchOptions,
  ): AsyncGenerator<SearchMatch> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/search", {
      method: "POST",
      body: JSON.stringify({
        pattern,
        glob: options?.glob,
        cwd: options?.cwd,
        maxResults: options?.maxResults,
        ignoreCase: options?.ignoreCase,
        context: options?.context,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const matches = data.matches ?? [];

    for (const match of matches) {
      yield {
        path: match.path,
        line: match.line,
        column: match.column ?? 1,
        text: match.text,
        before: match.before,
        after: match.after,
      };
    }
  }

  // ============================================
  // Git Methods
  // ============================================

  /**
   * Git capability object for repository operations.
   *
   * All git operations are executed in the sandbox workspace.
   *
   * @example Check status and commit
   * ```typescript
   * const status = await box.git.status();
   * if (status.isDirty) {
   *   await box.git.add(["."]);
   *   await box.git.commit("Update files");
   *   await box.git.push();
   * }
   * ```
   */
  get git(): GitCapability {
    return {
      status: () => this.gitStatus(),
      log: (limit?: number) => this.gitLog(limit),
      diff: (ref?: string) => this.gitDiff(ref),
      add: (paths: string[]) => this.gitAdd(paths),
      commit: (message: string, options?: { amend?: boolean }) =>
        this.gitCommit(message, options),
      push: (options?: { force?: boolean }) => this.gitPush(options),
      pull: (options?: { rebase?: boolean }) => this.gitPull(options),
      branches: () => this.gitBranches(),
      checkout: (ref: string, options?: { create?: boolean }) =>
        this.gitCheckout(ref, options),
    };
  }

  private async gitStatus(): Promise<GitStatus> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/status", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      branch: data.branch ?? "main",
      head: data.head ?? "",
      isDirty: data.isDirty ?? false,
      ahead: data.ahead ?? 0,
      behind: data.behind ?? 0,
      staged: data.staged ?? [],
      modified: data.modified ?? [],
      untracked: data.untracked ?? [],
    };
  }

  private async gitLog(limit = 10): Promise<GitCommit[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/git/log?limit=${limit}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const commits = data.commits ?? [];

    return commits.map(
      (c: Record<string, unknown>): GitCommit => ({
        sha: c.sha as string,
        shortSha: (c.sha as string).slice(0, 7),
        message: c.message as string,
        author: c.author as string,
        email: c.email as string,
        date: new Date(c.date as string),
      }),
    );
  }

  private async gitDiff(ref?: string): Promise<GitDiff> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const url = ref ? `/git/diff?ref=${encodeURIComponent(ref)}` : "/git/diff";
    const response = await this.doSidecarFetch(sidecarUrl, url, {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      files: data.files ?? [],
      additions: data.additions ?? 0,
      deletions: data.deletions ?? 0,
      raw: data.raw ?? "",
    };
  }

  private async gitAdd(paths: string[]): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/add", {
      method: "POST",
      body: JSON.stringify({ paths }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async gitCommit(
    message: string,
    options?: { amend?: boolean },
  ): Promise<GitCommit> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/commit", {
      method: "POST",
      body: JSON.stringify({ message, amend: options?.amend }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      sha: data.sha,
      shortSha: data.sha.slice(0, 7),
      message: data.message,
      author: data.author,
      email: data.email,
      date: new Date(data.date),
    };
  }

  private async gitPush(options?: { force?: boolean }): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/push", {
      method: "POST",
      body: JSON.stringify({ force: options?.force }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async gitPull(options?: { rebase?: boolean }): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/pull", {
      method: "POST",
      body: JSON.stringify({ rebase: options?.rebase }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async gitBranches(): Promise<GitBranch[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/branches", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.branches ?? [];
  }

  private async gitCheckout(
    ref: string,
    options?: { create?: boolean },
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/git/checkout", {
      method: "POST",
      body: JSON.stringify({ ref, create: options?.create }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  // ============================================
  // Tools Methods (mise)
  // ============================================

  /**
   * Tools capability object for managing language runtimes.
   *
   * Uses mise (polyglot version manager) to install and manage tools.
   *
   * @example Install and use Node.js
   * ```typescript
   * await box.tools.install("node", "22");
   * await box.tools.use("node", "22");
   * const list = await box.tools.list();
   * ```
   */
  get tools(): ToolsCapability {
    return {
      install: (tool: string, version: string) =>
        this.toolsInstall(tool, version),
      use: (tool: string, version: string) => this.toolsUse(tool, version),
      list: () => this.toolsList(),
      run: (tool: string, args: string[]) => this.toolsRun(tool, args),
    };
  }

  // ============================================
  // Enhanced File System (v2)
  // ============================================

  /**
   * Enhanced file system operations.
   *
   * Provides comprehensive file operations beyond basic read/write:
   * - Binary file upload/download
   * - Directory operations (uploadDir, downloadDir, list, mkdir)
   * - File metadata (stat, exists)
   * - Progress reporting for large files
   *
   * @example Upload and download
   * ```typescript
   * await box.fs.upload("./model.bin", "/workspace/models/model.bin");
   * await box.fs.download("/workspace/results.zip", "./results.zip");
   * ```
   *
   * @example Directory operations
   * ```typescript
   * await box.fs.uploadDir("./project", "/workspace/project");
   * const files = await box.fs.list("/workspace");
   * ```
   *
   * @example File management
   * ```typescript
   * if (await box.fs.exists("/workspace/config.json")) {
   *   const info = await box.fs.stat("/workspace/config.json");
   *   console.log(`Size: ${info.size}`);
   * }
   * await box.fs.mkdir("/workspace/output", { recursive: true });
   * await box.fs.delete("/workspace/temp", { recursive: true });
   * ```
   */
  get fs(): FileSystem {
    return {
      read: (path: string) => this.read(path),
      write: (path: string, content: string) => this.write(path, content),
      search: (query: string, options?: SearchOptions) =>
        this.search(query, options),
      upload: (
        localPath: string,
        remotePath: string,
        options?: UploadOptions,
      ) => this.fsUpload(localPath, remotePath, options),
      download: (
        remotePath: string,
        localPath: string,
        options?: DownloadOptions,
      ) => this.fsDownload(remotePath, localPath, options),
      uploadDir: (localDir: string, remoteDir: string) =>
        this.fsUploadDir(localDir, remoteDir),
      downloadDir: (remoteDir: string, localDir: string) =>
        this.fsDownloadDir(remoteDir, localDir),
      list: (path: string, options?: ListOptions) => this.fsList(path, options),
      stat: (path: string) => this.fsStat(path),
      delete: (path: string, options?: DeleteOptions) =>
        this.fsDelete(path, options),
      mkdir: (path: string, options?: MkdirOptions) =>
        this.fsMkdir(path, options),
      exists: (path: string) => this.fsExists(path),
    };
  }

  private async fsUpload(
    localPath: string,
    remotePath: string,
    options?: UploadOptions,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    // Read local file
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const fileBuffer = await fs.readFile(localPath);
    const fileName = path.basename(localPath);

    // Report initial progress if callback provided
    if (options?.onProgress) {
      options.onProgress({
        bytesUploaded: 0,
        totalBytes: fileBuffer.length,
        percentage: 0,
      });
    }

    // Create form data - use Uint8Array for Blob compatibility
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(fileBuffer)]), fileName);
    formData.append("path", remotePath);

    const response = await this.doSidecarFetch(sidecarUrl, "/fs/upload", {
      method: "POST",
      body: formData,
      headers: {}, // Let browser set Content-Type with boundary
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    // Report completion
    if (options?.onProgress) {
      options.onProgress({
        bytesUploaded: fileBuffer.length,
        totalBytes: fileBuffer.length,
        percentage: 100,
      });
    }
  }

  private async fsDownload(
    remotePath: string,
    localPath: string,
    options?: DownloadOptions,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    // Ensure local parent directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/fs/download${remotePath}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : 0;

    // Report initial progress
    if (options?.onProgress && totalBytes > 0) {
      options.onProgress({
        bytesDownloaded: 0,
        totalBytes,
        percentage: 0,
      });
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));

    // Report completion
    if (options?.onProgress) {
      options.onProgress({
        bytesDownloaded: buffer.byteLength,
        totalBytes: buffer.byteLength,
        percentage: 100,
      });
    }
  }

  private async fsUploadDir(
    localDir: string,
    remoteDir: string,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { execSync } = await import("node:child_process");

    // Create a tar archive of the local directory
    const tempTarPath = path.join(
      await fs.mkdtemp(
        path.join((await import("node:os")).tmpdir(), "upload-"),
      ),
      "archive.tar.gz",
    );

    try {
      // Create tar archive using tar command
      execSync(`tar -czf "${tempTarPath}" -C "${localDir}" .`, {
        stdio: "pipe",
      });

      const tarBuffer = await fs.readFile(tempTarPath);

      // Upload the tar archive
      const formData = new FormData();
      formData.append(
        "archive",
        new Blob([new Uint8Array(tarBuffer)]),
        "archive.tar.gz",
      );
      formData.append("path", remoteDir);

      const response = await this.doSidecarFetch(sidecarUrl, "/fs/upload-dir", {
        method: "POST",
        body: formData,
        headers: {},
      });

      if (!response.ok) {
        const body = await response.text();
        throw parseErrorResponse(response.status, body);
      }
    } finally {
      // Clean up temp file
      await fs.unlink(tempTarPath).catch(() => {});
    }
  }

  private async fsDownloadDir(
    remoteDir: string,
    localDir: string,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { execSync } = await import("node:child_process");

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/fs/download-dir${remoteDir}`,
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    // Save tar to temp file and extract
    const tempDir = await fs.mkdtemp(
      path.join((await import("node:os")).tmpdir(), "download-"),
    );
    const tempTarPath = path.join(tempDir, "archive.tar.gz");

    try {
      const buffer = await response.arrayBuffer();
      await fs.writeFile(tempTarPath, Buffer.from(buffer));

      // Ensure local directory exists
      await fs.mkdir(localDir, { recursive: true });

      // Extract tar archive
      execSync(`tar -xzf "${tempTarPath}" -C "${localDir}"`, {
        stdio: "pipe",
      });
    } finally {
      // Clean up temp files
      await fs.rm(tempDir, { recursive: true }).catch(() => {});
    }
  }

  private async fsList(
    path: string,
    options?: ListOptions,
  ): Promise<FileInfo[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const params = new URLSearchParams();
    if (options?.all) params.set("all", "true");
    if (options?.long) params.set("long", "true");
    const query = params.toString();
    const url = query ? `/fs/list${path}?${query}` : `/fs/list${path}`;

    const response = await this.doSidecarFetch(sidecarUrl, url, {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const entries = data.data?.entries ?? [];

    return entries.map(
      (e: Record<string, unknown>): FileInfo => ({
        name: e.name as string,
        path: e.path as string,
        size: e.size as number,
        isDir: e.isDir as boolean,
        isFile: e.isFile as boolean,
        isSymlink: e.isSymlink as boolean,
        permissions: e.permissions as number,
        owner: e.owner as string,
        group: e.group as string,
        modTime: new Date(e.modTime as string),
        accessTime: new Date(e.accessTime as string),
      }),
    );
  }

  private async fsStat(path: string): Promise<FileInfo> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, `/fs/stat${path}`, {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const e = data.data;

    return {
      name: e.name as string,
      path: e.path as string,
      size: e.size as number,
      isDir: e.isDir as boolean,
      isFile: e.isFile as boolean,
      isSymlink: e.isSymlink as boolean,
      permissions: e.permissions as number,
      owner: e.owner as string,
      group: e.group as string,
      modTime: new Date(e.modTime as string),
      accessTime: new Date(e.accessTime as string),
    };
  }

  private async fsDelete(path: string, options?: DeleteOptions): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const params = new URLSearchParams();
    if (options?.recursive) params.set("recursive", "true");
    const query = params.toString();
    const url = query ? `/fs${path}?${query}` : `/fs${path}`;

    const response = await this.doSidecarFetch(sidecarUrl, url, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async fsMkdir(path: string, options?: MkdirOptions): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const params = new URLSearchParams();
    if (options?.recursive) params.set("recursive", "true");
    const query = params.toString();
    const url = query ? `/fs/mkdir${path}?${query}` : `/fs/mkdir${path}`;

    const response = await this.doSidecarFetch(sidecarUrl, url, {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async fsExists(path: string): Promise<boolean> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/fs/exists${path}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.data?.exists === true;
  }

  // ============================================
  // Permissions Manager (v2)
  // ============================================

  /**
   * Permissions manager for multi-user access control.
   *
   * @example List users
   * ```typescript
   * const users = await box.permissions.list();
   * for (const user of users) {
   *   console.log(`${user.username}: ${user.role}`);
   * }
   * ```
   *
   * @example Add a developer
   * ```typescript
   * await box.permissions.add({
   *   userId: "user_abc",
   *   role: "developer",
   *   sshKeys: ["ssh-ed25519 AAAA..."],
   * });
   * ```
   */
  get permissions(): PermissionsManager {
    return {
      list: () => this.permissionsList(),
      get: (userId: string) => this.permissionsGet(userId),
      add: (options: AddUserOptions) => this.permissionsAdd(options),
      update: (userId: string, options: UpdateUserOptions) =>
        this.permissionsUpdate(userId, options),
      remove: (userId: string, options?: { preserveHomeDir?: boolean }) =>
        this.permissionsRemove(userId, options),
      setAccessPolicies: (userId: string, rules: AccessPolicyRule[]) =>
        this.permissionsSetAccessPolicies(userId, rules),
      getAccessPolicies: (userId: string) =>
        this.permissionsGetAccessPolicies(userId),
      checkAccess: (
        userId: string,
        path: string,
        action: "read" | "write" | "execute",
      ) => this.permissionsCheckAccess(userId, path, action),
    };
  }

  private async permissionsList(): Promise<SandboxUser[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/permissions/users",
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const users = data.users ?? [];

    return users.map(
      (u: Record<string, unknown>): SandboxUser => ({
        userId: u.userId as string,
        username: u.username as string,
        homeDir: u.homeDir as string,
        role: u.role as SandboxUser["role"],
        sshKeys: (u.sshKeys ?? []) as string[],
        directoryPermissions:
          u.directoryPermissions as SandboxUser["directoryPermissions"],
        accessPolicies: u.accessPolicies as SandboxUser["accessPolicies"],
        createdAt: new Date(u.createdAt as string),
      }),
    );
  }

  private async permissionsGet(userId: string): Promise<SandboxUser | null> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/permissions/users/${encodeURIComponent(userId)}`,
      { method: "GET" },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const u = await response.json();
    return {
      userId: u.userId as string,
      username: u.username as string,
      homeDir: u.homeDir as string,
      role: u.role as SandboxUser["role"],
      sshKeys: (u.sshKeys ?? []) as string[],
      directoryPermissions:
        u.directoryPermissions as SandboxUser["directoryPermissions"],
      accessPolicies: u.accessPolicies as SandboxUser["accessPolicies"],
      createdAt: new Date(u.createdAt as string),
    };
  }

  private async permissionsAdd(options: AddUserOptions): Promise<SandboxUser> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/permissions/users",
      {
        method: "POST",
        body: JSON.stringify(options),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const u = await response.json();
    return {
      userId: u.userId as string,
      username: u.username as string,
      homeDir: u.homeDir as string,
      role: u.role as SandboxUser["role"],
      sshKeys: (u.sshKeys ?? []) as string[],
      directoryPermissions:
        u.directoryPermissions as SandboxUser["directoryPermissions"],
      accessPolicies: u.accessPolicies as SandboxUser["accessPolicies"],
      createdAt: new Date(u.createdAt as string),
    };
  }

  private async permissionsUpdate(
    userId: string,
    options: UpdateUserOptions,
  ): Promise<SandboxUser> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/permissions/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(options),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const u = await response.json();
    return {
      userId: u.userId as string,
      username: u.username as string,
      homeDir: u.homeDir as string,
      role: u.role as SandboxUser["role"],
      sshKeys: (u.sshKeys ?? []) as string[],
      directoryPermissions:
        u.directoryPermissions as SandboxUser["directoryPermissions"],
      accessPolicies: u.accessPolicies as SandboxUser["accessPolicies"],
      createdAt: new Date(u.createdAt as string),
    };
  }

  private async permissionsRemove(
    userId: string,
    options?: { preserveHomeDir?: boolean },
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const params = new URLSearchParams();
    if (options?.preserveHomeDir) {
      params.set("preserveHomeDir", "true");
    }
    const query = params.toString();
    const path = query
      ? `/permissions/users/${encodeURIComponent(userId)}?${query}`
      : `/permissions/users/${encodeURIComponent(userId)}`;

    const response = await this.doSidecarFetch(sidecarUrl, path, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async permissionsSetAccessPolicies(
    userId: string,
    rules: AccessPolicyRule[],
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/permissions/users/${encodeURIComponent(userId)}/policies`,
      {
        method: "PUT",
        body: JSON.stringify({ rules }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async permissionsGetAccessPolicies(
    userId: string,
  ): Promise<AccessPolicyRule[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/permissions/users/${encodeURIComponent(userId)}/policies`,
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.rules ?? [];
  }

  private async permissionsCheckAccess(
    userId: string,
    path: string,
    action: "read" | "write" | "execute",
  ): Promise<boolean> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      `/permissions/users/${encodeURIComponent(userId)}/check`,
      {
        method: "POST",
        body: JSON.stringify({ path, action }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.allowed === true;
  }

  // ============================================
  // Backend Manager (v2)
  // ============================================

  /**
   * Backend manager for runtime agent configuration.
   *
   * @example Check backend status
   * ```typescript
   * const status = await box.backend.status();
   * console.log(`Backend: ${status.type}, Status: ${status.status}`);
   * ```
   *
   * @example Add MCP server at runtime
   * ```typescript
   * await box.backend.addMcp("web-search", {
   *   command: "npx",
   *   args: ["-y", "@anthropic/web-search"],
   * });
   * ```
   */
  get backend(): BackendManager {
    return {
      status: () => this.backendStatus(),
      capabilities: () => this.backendCapabilities(),
      addMcp: (name: string, config: McpServerConfig) =>
        this.backendAddMcp(name, config),
      getMcpStatus: () => this.backendGetMcpStatus(),
      updateConfig: (config: Partial<BackendConfig>) =>
        this.backendUpdateConfig(config),
      restart: () => this.backendRestart(),
    };
  }

  private async backendStatus(): Promise<BackendStatus> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/backend/status", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    return response.json();
  }

  private async backendCapabilities(): Promise<BackendCapabilities> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/backend/capabilities",
      { method: "GET" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    return response.json();
  }

  private async backendAddMcp(
    name: string,
    config: McpServerConfig,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/backend/mcp", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async backendGetMcpStatus(): Promise<
    Record<string, { status: "running" | "stopped" | "error"; error?: string }>
  > {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/backend/mcp", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.servers ?? {};
  }

  private async backendUpdateConfig(
    config: Partial<BackendConfig>,
  ): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/backend/config", {
      method: "PATCH",
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async backendRestart(): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/backend/restart", {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  // ============================================
  // Process Manager
  // ============================================

  /**
   * Process manager for spawning and controlling processes.
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
   * console.log(result.stdout);
   * ```
   */
  get process(): ProcessManager {
    return {
      spawn: (command: string, options?: ProcessSpawnOptions) =>
        this.processSpawn(command, options),
      runCode: (code: string, options?: RunCodeOptions) =>
        this.processRunCode(code, options),
      list: () => this.processList(),
      get: (pid: number) => this.processGet(pid),
    };
  }

  private async processSpawn(
    command: string,
    options?: ProcessSpawnOptions,
  ): Promise<Process> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/process/spawn", {
      method: "POST",
      body: JSON.stringify({
        command,
        cwd: options?.cwd,
        env: options?.env,
        timeoutMs: options?.timeoutMs,
        blocking: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return this.createProcessHandle(data.data.pid, command, sidecarUrl);
  }

  private async processRunCode(
    code: string,
    options?: RunCodeOptions,
  ): Promise<CodeResult> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/process/run-code",
      {
        method: "POST",
        body: JSON.stringify({
          code,
          cwd: options?.cwd,
          env: options?.env,
          timeoutMs: options?.timeoutMs,
          blocking: true,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.data;
  }

  private async processList(): Promise<ProcessStatus[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/process", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return (data.data ?? []).map(
      (p: Record<string, unknown>): ProcessStatus => ({
        pid: p.pid as number,
        command: p.command as string,
        cwd: p.cwd as string | undefined,
        running: p.running as boolean,
        exitCode: p.exitCode as number,
        exitSignal: p.exitSignal as string | undefined,
        startedAt: new Date(p.startedAt as string),
        exitedAt: p.exitedAt ? new Date(p.exitedAt as string) : undefined,
      }),
    );
  }

  private async processGet(pid: number): Promise<Process | null> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, `/process/${pid}`, {
      method: "GET",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return this.createProcessHandle(pid, data.data.command, sidecarUrl);
  }

  private createProcessHandle(
    pid: number,
    command: string,
    sidecarUrl: string,
  ): Process {
    const self = this;

    return {
      pid,
      command,

      async status(): Promise<ProcessStatus> {
        const response = await self.doSidecarFetch(
          sidecarUrl,
          `/process/${pid}`,
          { method: "GET" },
        );

        if (!response.ok) {
          const body = await response.text();
          throw parseErrorResponse(response.status, body);
        }

        const data = await response.json();
        const p = data.data;
        return {
          pid: p.pid as number,
          command: p.command as string,
          cwd: p.cwd as string | undefined,
          running: p.running as boolean,
          exitCode: p.exitCode as number,
          exitSignal: p.exitSignal as string | undefined,
          startedAt: new Date(p.startedAt as string),
          exitedAt: p.exitedAt ? new Date(p.exitedAt as string) : undefined,
        };
      },

      async wait(): Promise<number> {
        // Poll for completion
        while (true) {
          const s = await this.status();
          if (!s.running) {
            return s.exitCode;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      },

      async kill(signal: ProcessSignal = "SIGTERM"): Promise<void> {
        const response = await self.doSidecarFetch(
          sidecarUrl,
          `/process/${pid}`,
          {
            method: "DELETE",
            body: JSON.stringify({ signal }),
          },
        );

        if (!response.ok && response.status !== 404) {
          const body = await response.text();
          throw parseErrorResponse(response.status, body);
        }
      },

      async *logs(): AsyncIterable<ProcessLogEntry> {
        const response = await self.doSidecarFetch(
          sidecarUrl,
          `/process/${pid}/logs`,
          { method: "GET" },
        );

        if (!response.ok) {
          const body = await response.text();
          throw parseErrorResponse(response.status, body);
        }

        yield* self.parseProcessLogStream(response);
      },

      async *stdout(): AsyncIterable<string> {
        for await (const entry of this.logs()) {
          if (entry.type === "stdout") {
            yield entry.data;
          }
        }
      },

      async *stderr(): AsyncIterable<string> {
        for await (const entry of this.logs()) {
          if (entry.type === "stderr") {
            yield entry.data;
          }
        }
      },
    };
  }

  private async *parseProcessLogStream(
    response: Response,
  ): AsyncGenerator<ProcessLogEntry> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentEvent && currentData) {
            // Skip heartbeats and exit events for log iteration
            if (currentEvent === "stdout" || currentEvent === "stderr") {
              try {
                const parsed = JSON.parse(currentData);
                yield {
                  type: currentEvent as "stdout" | "stderr",
                  data: parsed.data,
                  timestamp: parsed.timestamp,
                };
              } catch {
                // Skip malformed JSON
              }
            } else if (currentEvent === "exit") {
              // Process exited, stop streaming
              return;
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ============================================
  // Network Manager
  // ============================================

  /**
   * Network manager for runtime network configuration.
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
   * ```
   *
   * @example Expose ports dynamically
   * ```typescript
   * const url = await box.network.exposePort(8000);
   * console.log(`Service available at: ${url}`);
   * ```
   */
  get network(): NetworkManager {
    return {
      update: (config: Partial<NetworkConfig>) => this.networkUpdate(config),
      exposePort: (port: number) => this.networkExposePort(port),
      listUrls: () => this.networkListUrls(),
      getConfig: () => this.networkGetConfig(),
    };
  }

  private async networkUpdate(config: Partial<NetworkConfig>): Promise<void> {
    // Validate mutual exclusivity
    if (config.blockOutbound !== undefined && config.allowList !== undefined) {
      if (config.blockOutbound && config.allowList.length > 0) {
        throw new Error("blockOutbound and allowList are mutually exclusive");
      }
    }

    // Validate allowList constraints
    if (config.allowList) {
      if (config.allowList.length > 10) {
        throw new Error("allowList cannot exceed 10 entries");
      }
      // Validate CIDR format
      for (const cidr of config.allowList) {
        if (!this.isValidCidr(cidr)) {
          throw new Error(`Invalid CIDR format: ${cidr}`);
        }
      }
    }

    const response = await this.client.fetch(
      `/v1/sidecars/${this.id}/network`,
      {
        method: "PATCH",
        body: JSON.stringify(config),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async networkExposePort(port: number): Promise<string> {
    if (port < 1 || port > 65535) {
      throw new Error("Port must be between 1 and 65535");
    }

    const response = await this.client.fetch(
      `/v1/sidecars/${this.id}/network/expose`,
      {
        method: "POST",
        body: JSON.stringify({ port }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.url;
  }

  private async networkListUrls(): Promise<Record<number, string>> {
    const response = await this.client.fetch(
      `/v1/sidecars/${this.id}/network/urls`,
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.urls ?? {};
  }

  private async networkGetConfig(): Promise<NetworkConfig> {
    const response = await this.client.fetch(`/v1/sidecars/${this.id}/network`);

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    return response.json();
  }

  /**
   * Validate CIDR notation (IPv4 and IPv6)
   */
  private isValidCidr(cidr: string): boolean {
    // IPv4 CIDR pattern: x.x.x.x/prefix (prefix 0-32)
    const ipv4Pattern =
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/(?:[0-9]|[12]\d|3[0-2])$/;

    // IPv6 CIDR pattern: simplified check for valid hex groups and prefix
    const ipv6Pattern = /^([a-fA-F0-9:]+)\/(\d{1,3})$/;

    if (ipv4Pattern.test(cidr)) {
      return true;
    }

    const ipv6Match = cidr.match(ipv6Pattern);
    if (ipv6Match) {
      const prefix = Number.parseInt(ipv6Match[2], 10);
      if (prefix >= 0 && prefix <= 128) {
        // Basic IPv6 validation - check for valid hex groups
        const ipPart = ipv6Match[1];
        const groups = ipPart.split(":");
        // IPv6 has up to 8 groups, but may use :: for compression
        if (groups.length <= 8 && ipPart.includes(":")) {
          return groups.every((g) => g === "" || /^[a-fA-F0-9]{1,4}$/.test(g));
        }
      }
    }

    return false;
  }

  // ============================================
  // Driver Info (v2)
  // ============================================

  /**
   * Get information about the infrastructure driver for this sandbox.
   *
   * @example
   * ```typescript
   * const info = await box.getDriverInfo();
   * console.log(`Driver: ${info.type}, CRIU: ${info.capabilities.criu}`);
   * ```
   */
  async getDriverInfo(): Promise<DriverInfo> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}/driver`);

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    return response.json();
  }

  private async toolsInstall(tool: string, version: string): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/tools/install", {
      method: "POST",
      body: JSON.stringify({ tool, version }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async toolsUse(tool: string, version: string): Promise<void> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/tools/use", {
      method: "POST",
      body: JSON.stringify({ tool, version }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  private async toolsList(): Promise<InstalledTool[]> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/tools", {
      method: "GET",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.tools ?? [];
  }

  private async toolsRun(tool: string, args: string[]): Promise<ExecResult> {
    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(sidecarUrl, "/tools/run", {
      method: "POST",
      body: JSON.stringify({ tool, args }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      exitCode: data.exitCode ?? 0,
      stdout: data.stdout ?? "",
      stderr: data.stderr ?? "",
    };
  }

  // ============================================
  // Snapshot Methods
  // ============================================

  /**
   * Create a snapshot of the sandbox state.
   * Snapshots can be used to save workspace state for later restoration.
   *
   * If `storage` is provided (BYOS3), the snapshot is created directly
   * on the sidecar and uploaded to customer-provided S3 storage.
   *
   * @param options - Snapshot options (tags, paths, storage)
   * @returns Snapshot result with ID and metadata
   *
   * @example Standard snapshot (our storage)
   * ```typescript
   * const snap = await box.snapshot({
   *   tags: ["v1.0", "stable"],
   * });
   * console.log(`Snapshot: ${snap.snapshotId}`);
   * ```
   *
   * @example BYOS3 snapshot (customer storage)
   * ```typescript
   * const snap = await box.snapshot({
   *   tags: ["production"],
   *   storage: {
   *     type: "s3",
   *     bucket: "my-snapshots",
   *     credentials: { accessKeyId: "...", secretAccessKey: "..." },
   *   },
   * });
   * ```
   */
  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    await this.ensureRunning();

    // BYOS3: Call sidecar directly with customer's storage config
    if (options?.storage) {
      const sidecarUrl = this.connection?.sidecarUrl;
      if (!sidecarUrl) {
        throw new StateError(
          "Sandbox has no sidecar URL",
          this.status,
          "running",
        );
      }

      const response = await this.doSidecarFetch(sidecarUrl, "/snapshots", {
        method: "POST",
        body: JSON.stringify({
          projectId: this.id,
          storage: options.storage,
          tags: options.tags,
          paths: options.paths,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw parseErrorResponse(response.status, body);
      }

      const data = await response.json();
      return {
        snapshotId: data.snapshot?.id ?? data.snapshotId,
        createdAt: new Date(data.snapshot?.createdAt ?? data.createdAt),
        sizeBytes: data.snapshot?.sizeBytes ?? data.sizeBytes,
        tags: data.snapshot?.tags ?? data.tags ?? [],
      };
    }

    // Standard path: Go through orchestrator API (uses our storage)
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/snapshot`,
      {
        method: "POST",
        body: JSON.stringify({
          tags: options?.tags,
          paths: options?.paths,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      snapshotId: data.snapshotId ?? data.id,
      createdAt: new Date(data.createdAt),
      sizeBytes: data.sizeBytes,
      tags: data.tags ?? [],
    };
  }

  /**
   * List all snapshots for this sandbox.
   *
   * If `storage` is provided (BYOS3), lists snapshots from customer-provided
   * S3 storage via the sidecar.
   *
   * @param storage - Optional customer storage config for BYOS3
   * @returns Array of snapshot metadata
   *
   * @example List from our storage
   * ```typescript
   * const snapshots = await box.listSnapshots();
   * for (const snap of snapshots) {
   *   console.log(`${snap.snapshotId}: ${snap.createdAt}`);
   * }
   * ```
   *
   * @example List from customer S3 (BYOS3)
   * ```typescript
   * const snapshots = await box.listSnapshots({
   *   type: "s3",
   *   bucket: "my-snapshots",
   *   credentials: { accessKeyId: "...", secretAccessKey: "..." },
   * });
   * ```
   */
  async listSnapshots(
    storage?: SnapshotOptions["storage"],
  ): Promise<SnapshotInfo[]> {
    // BYOS3: Call sidecar directly with customer's storage config
    if (storage) {
      await this.ensureRunning();

      const sidecarUrl = this.connection?.sidecarUrl;
      if (!sidecarUrl) {
        throw new StateError(
          "Sandbox has no sidecar URL",
          this.status,
          "running",
        );
      }

      const response = await this.doSidecarFetch(
        sidecarUrl,
        "/snapshots/list",
        {
          method: "POST",
          body: JSON.stringify({
            projectId: this.id,
            storage,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw parseErrorResponse(response.status, body);
      }

      const data = await response.json();
      const snapshots = data.snapshots ?? [];

      return snapshots.map(
        (s: Record<string, unknown>): SnapshotInfo => ({
          snapshotId: (s.id ?? s.snapshotId) as string,
          projectRef: this.id,
          createdAt: new Date(s.createdAt as string),
          tags: (s.tags ?? []) as string[],
          paths: [],
          sizeBytes: s.sizeBytes as number | undefined,
        }),
      );
    }

    // Standard path: Go through orchestrator API
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/snapshots`,
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const snapshots = data.snapshots ?? data ?? [];

    return snapshots.map(
      (s: Record<string, unknown>): SnapshotInfo => ({
        snapshotId: (s.snapshotId ?? s.id) as string,
        projectRef: (s.projectRef ?? this.id) as string,
        createdAt: new Date(s.createdAt as string),
        tags: (s.tags ?? []) as string[],
        paths: (s.paths ?? []) as string[],
        sizeBytes: s.sizeBytes as number | undefined,
      }),
    );
  }

  /**
   * Restore from the latest snapshot in customer-provided storage.
   * Only available when using BYOS3 (calls sidecar directly).
   *
   * @param storage - Customer storage config (required)
   * @param destinationPath - Optional path to restore to
   * @returns Snapshot info if restored, null if no snapshot found
   *
   * @example Restore from customer S3
   * ```typescript
   * const result = await box.restoreFromStorage({
   *   type: "s3",
   *   bucket: "my-snapshots",
   *   credentials: { accessKeyId: "...", secretAccessKey: "..." },
   * });
   *
   * if (result) {
   *   console.log(`Restored from ${result.snapshotId}`);
   * } else {
   *   console.log("No snapshot found");
   * }
   * ```
   */
  async restoreFromStorage(
    storage: SnapshotOptions["storage"],
    destinationPath?: string,
  ): Promise<SnapshotResult | null> {
    if (!storage) {
      throw new Error("Storage config is required for restoreFromStorage");
    }

    await this.ensureRunning();

    const sidecarUrl = this.connection?.sidecarUrl;
    if (!sidecarUrl) {
      throw new StateError(
        "Sandbox has no sidecar URL",
        this.status,
        "running",
      );
    }

    const response = await this.doSidecarFetch(
      sidecarUrl,
      "/snapshots/restore",
      {
        method: "POST",
        body: JSON.stringify({
          projectId: this.id,
          storage,
          destinationPath,
        }),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    if (!data.snapshot) {
      return null;
    }

    return {
      snapshotId: data.snapshot.id,
      createdAt: new Date(data.snapshot.createdAt),
      sizeBytes: data.snapshot.sizeBytes,
      tags: data.snapshot.tags ?? [],
    };
  }

  // ============================================
  // Checkpoint Methods (CRIU)
  // ============================================

  /**
   * Create a CRIU checkpoint of the sandbox's memory state.
   *
   * Checkpoints capture the complete memory state of the running sandbox,
   * enabling true pause/resume and fork operations. Unlike snapshots which
   * only preserve filesystem state, checkpoints preserve process memory,
   * open file descriptors, and execution state.
   *
   * **Requirements:** CRIU must be available on the host. Check availability
   * with `client.criuStatus()` before calling.
   *
   * **Note:** By default, checkpoint stops the sandbox. Use `leaveRunning: true`
   * to keep it running (creates a copy-on-write checkpoint).
   *
   * @param options - Checkpoint options
   * @returns Checkpoint result with ID and metadata
   *
   * @example Basic checkpoint (stops sandbox)
   * ```typescript
   * const checkpoint = await box.checkpoint();
   * console.log(`Checkpoint: ${checkpoint.checkpointId}`);
   * // Sandbox is now stopped, resume with box.resume()
   * ```
   *
   * @example Checkpoint without stopping
   * ```typescript
   * const checkpoint = await box.checkpoint({
   *   tags: ["before-deploy"],
   *   leaveRunning: true,
   * });
   * // Sandbox continues running
   * ```
   */
  async checkpoint(options?: CheckpointOptions): Promise<CheckpointResult> {
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/checkpoints`,
      {
        method: "POST",
        body: JSON.stringify({
          tags: options?.tags,
          leaveRunning: options?.leaveRunning,
          includeSnapshot: options?.includeSnapshot,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      checkpointId: data.checkpointId ?? data.id,
      createdAt: new Date(data.createdAt),
      sizeBytes: data.sizeBytes,
      tags: data.tags ?? [],
    };
  }

  /**
   * List all checkpoints for this sandbox.
   *
   * @returns Array of checkpoint metadata
   *
   * @example
   * ```typescript
   * const checkpoints = await box.listCheckpoints();
   * for (const cp of checkpoints) {
   *   console.log(`${cp.checkpointId}: ${cp.createdAt}`);
   * }
   * ```
   */
  async listCheckpoints(): Promise<CheckpointInfo[]> {
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/checkpoints`,
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const checkpoints = data.checkpoints ?? data ?? [];

    return checkpoints.map((cp: Record<string, unknown>) =>
      this.parseCheckpointInfo(cp),
    );
  }

  /**
   * Delete a checkpoint.
   *
   * @param checkpointId - ID of the checkpoint to delete
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/checkpoints/${encodeURIComponent(checkpointId)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  /**
   * Fork a new sandbox from a checkpoint.
   *
   * Creates a new sandbox with the same memory state as this sandbox
   * at the time of the checkpoint. The fork has a new identity but
   * preserves the execution state.
   *
   * **Use cases:**
   * - Branch workflows: Create parallel execution paths
   * - A/B testing: Run same state with different configurations
   * - Debugging: Fork at a specific point to investigate
   *
   * @param checkpointId - ID of the checkpoint to fork from
   * @param options - Fork configuration
   * @returns The new sandbox instance
   *
   * @example Basic fork
   * ```typescript
   * const checkpoint = await box.checkpoint({ leaveRunning: true });
   * const forked = await box.fork(checkpoint.checkpointId);
   * // forked has same memory state as box at checkpoint time
   * ```
   *
   * @example Fork with custom config
   * ```typescript
   * const forked = await box.fork(checkpointId, {
   *   name: "experiment-branch",
   *   env: { EXPERIMENT: "true" },
   * });
   * ```
   */
  async fork(
    checkpointId: string,
    options?: ForkOptions,
  ): Promise<SandboxInstance> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}/fork`, {
      method: "POST",
      body: JSON.stringify({
        checkpointId,
        name: options?.name,
        env: options?.env,
        resources: options?.resources,
        metadata: options?.metadata,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return new SandboxInstance(
      this.client,
      this.parseInfo(data.sandbox ?? data),
    );
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  /**
   * Stop the sandbox (keeps state for resume).
   */
  async stop(): Promise<void> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}/stop`, {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    await this.refresh();
  }

  /**
   * Resume a stopped sandbox.
   */
  async resume(): Promise<void> {
    const response = await this.client.fetch(
      `/v1/sandboxes/${this.id}/resume`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    await this.refresh();
  }

  /**
   * Delete the sandbox permanently.
   */
  async delete(): Promise<void> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  /**
   * Extend the sandbox idle timeout to keep it alive.
   * @param seconds - Duration in seconds (default: 3600 = 1 hour)
   */
  async keepAlive(seconds = 3600): Promise<void> {
    const response = await this.client.fetch(`/v1/sandboxes/${this.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idleTimeoutSeconds: seconds }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }

  /**
   * Upload a local directory to the sandbox via tar.
   * @param localPath - Local directory path to upload
   * @param remotePath - Destination path in the sandbox (default: /home/user)
   */
  async uploadDirectory(
    localPath: string,
    remotePath = "/home/user",
  ): Promise<void> {
    const { execSync } = await import("node:child_process");
    const { resolve } = await import("node:path");

    const absPath = resolve(localPath);

    // Create tar archive locally, base64 encode it, then decode + extract in sandbox
    const tarBase64 = execSync(
      `tar -cf - --exclude='node_modules' --exclude='.git' -C '${absPath}' . | base64`,
      { maxBuffer: 100 * 1024 * 1024 },
    )
      .toString()
      .replace(/\n/g, "");

    // Extract in sandbox — mkdir -p ensures target exists, then pipe base64-decoded tar
    await this.exec(`mkdir -p '${remotePath}'`);
    await this.exec(
      `echo '${tarBase64}' | base64 -d | tar -xf - -C '${remotePath}'`,
    );
  }

  /**
   * Wait for the sandbox to reach a specific status.
   */
  async waitFor(
    status: SandboxStatus | SandboxStatus[],
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<void> {
    const statuses = Array.isArray(status) ? status : [status];
    const timeoutMs = options?.timeoutMs ?? 120000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const startTime = Date.now();

    while (true) {
      await this.refresh();

      if (statuses.includes(this.status)) {
        return;
      }

      if (this.status === "failed") {
        throw new StateError(this.error ?? "Sandbox failed", this.status);
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new TimeoutError(
          timeoutMs,
          `Timed out waiting for sandbox to reach ${statuses.join(" or ")}`,
        );
      }

      await this.sleep(pollIntervalMs);
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private parseCheckpointInfo(cp: Record<string, unknown>): CheckpointInfo {
    return {
      checkpointId: (cp.checkpointId ?? cp.id) as string,
      projectRef: (cp.projectRef ?? this.id) as string,
      createdAt: new Date(cp.createdAt as string),
      tags: (cp.tags ?? []) as string[],
      sizeBytes: cp.sizeBytes as number | undefined,
      hasMemoryState: (cp.hasMemoryState ?? true) as boolean,
      hasFilesystemSnapshot: (cp.hasFilesystemSnapshot ?? false) as boolean,
    };
  }

  private async ensureRunning(): Promise<void> {
    await this.refresh();

    if (this.status !== "running") {
      throw new StateError(
        `Sandbox is not running (status: ${this.status})`,
        this.status,
        "running",
      );
    }
  }

  private async doSidecarFetch(
    sidecarUrl: string,
    path: string,
    options?: RequestInit,
  ): Promise<Response> {
    const url = `${sidecarUrl.replace(/\/$/, "")}${path}`;

    // Use auth token from connection info for direct sidecar access
    const authToken = this.connection?.authToken;

    try {
      return await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...options?.headers,
        },
      });
    } catch (err) {
      throw new NetworkError(
        `Failed to connect to sandbox: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  private parseModel(model: string): { provider?: string; model: string } {
    const parts = model.split("/");
    if (parts.length >= 2) {
      return {
        provider: parts[0],
        model: parts.slice(1).join("/"),
      };
    }
    return { model };
  }

  private async *parseSSEStream(
    response: Response,
    signal?: AbortSignal,
  ): AsyncGenerator<SandboxEvent> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    // SSE state must persist across chunks - event/data may arrive in separate chunks
    let currentEvent = "";
    let currentData = "";
    let currentId = "";

    try {
      while (true) {
        if (signal?.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line.startsWith("id:")) {
            currentId = line.slice(3).trim();
          } else if (line === "" && currentEvent && currentData) {
            try {
              yield {
                type: currentEvent,
                data: JSON.parse(currentData),
                id: currentId || undefined,
              };
            } catch {
              // Skip malformed JSON
            }
            currentEvent = "";
            currentData = "";
            currentId = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseInfo(data: Record<string, unknown>): SandboxInfo {
    return {
      id: data.id as string,
      name: data.name as string | undefined,
      status: data.status as SandboxStatus,
      connection: data.connection as SandboxConnection | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(data.createdAt as string),
      startedAt: data.startedAt
        ? new Date(data.startedAt as string)
        : undefined,
      lastActivityAt: data.lastActivityAt
        ? new Date(data.lastActivityAt as string)
        : undefined,
      expiresAt: data.expiresAt
        ? new Date(data.expiresAt as string)
        : undefined,
      error: data.error as string | undefined,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
