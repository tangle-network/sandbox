/**
 * Sandbox Client
 *
 * Main client class for interacting with the Sandbox API.
 */

import {
  AuthError,
  NetworkError,
  NotFoundError,
  parseErrorResponse,
  TimeoutError,
  ValidationError,
} from "./errors.js";
import { type HttpClient, SandboxInstance } from "./sandbox.js";
import type {
  BatchEvent,
  BatchOptions,
  BatchResult,
  BatchTask,
  BatchTaskResult,
  CreateSandboxOptions,
  ListSandboxOptions,
  SandboxClientConfig,
  SandboxInfo,
  SandboxStatus,
  SecretInfo,
  SecretsManager,
  UsageInfo,
} from "./types.js";

const DEFAULT_BASE_URL = "https://agents.tangle.network";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Client for the Tangle Sandbox platform.
 *
 * @example
 * ```typescript
 * import { Sandbox } from "@tangle/sandbox";
 *
 * const client = new Sandbox({
 *   apiKey: "sk_sandbox_...",
 * });
 *
 * // Create a sandbox
 * const box = await client.create({
 *   name: "my-project",
 *   sshEnabled: true,
 * });
 *
 * // Execute commands
 * const result = await box.exec("npm install");
 *
 * // Clean up
 * await box.delete();
 * ```
 */
export class SandboxClient implements HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private _secrets: SecretsManager | null = null;

  constructor(config: SandboxClientConfig) {
    if (!config.apiKey) {
      throw new AuthError("API key is required");
    }

    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ============================================
  // Secrets Manager
  // ============================================

  /**
   * Access the secrets manager for storing and retrieving encrypted secrets.
   *
   * @example
   * ```typescript
   * // Create a secret
   * await client.secrets.create("HF_TOKEN", "hf_xxx");
   *
   * // List secrets (names only)
   * const secrets = await client.secrets.list();
   *
   * // Get secret value
   * const value = await client.secrets.get("HF_TOKEN");
   *
   * // Update secret
   * await client.secrets.update("HF_TOKEN", "hf_new_value");
   *
   * // Delete secret
   * await client.secrets.delete("HF_TOKEN");
   * ```
   */
  get secrets(): SecretsManager {
    if (!this._secrets) {
      this._secrets = new SecretsManagerImpl(this);
    }
    return this._secrets;
  }

  // ============================================
  // Sandbox Management
  // ============================================

  /**
   * Create a new sandbox.
   *
   * @param options - Configuration for the new sandbox
   * @returns A SandboxInstance representing the created sandbox
   *
   * @example
   * ```typescript
   * const box = await client.create({
   *   name: "my-project",
   *   image: "node:20",
   *   sshEnabled: true,
   *   env: { NODE_ENV: "development" },
   * });
   * ```
   */
  async create(options?: CreateSandboxOptions): Promise<SandboxInstance> {
    // Build git config if provided
    const git = options?.git
      ? {
          url: options.git.url,
          ref: options.git.ref,
          depth: options.git.depth,
          sparse: options.git.sparse,
          auth: options.git.auth,
        }
      : undefined;

    const response = await this.fetch("/v1/sandboxes", {
      method: "POST",
      body: JSON.stringify({
        name: options?.name,
        // Image - simple names resolve to pre-built images on server
        image: options?.image,
        // Git clone at provision
        git,
        // Tool versions (mise)
        tools: options?.tools,
        // Bare mode - no sidecar
        bare: options?.bare,
        // Driver configuration (v2)
        driver: options?.driver,
        // Backend/agent configuration (v2)
        backend: options?.backend,
        // Permissions configuration (v2)
        permissions: options?.permissions,
        // Environment variables
        env: options?.env,
        // Resource limits
        resources: options?.resources,
        // SSH/terminal config
        sshEnabled: options?.sshEnabled,
        sshPublicKey: options?.sshPublicKey,
        webTerminalEnabled: options?.webTerminalEnabled,
        // Lifecycle
        maxLifetimeSeconds: options?.maxLifetimeSeconds,
        idleTimeoutSeconds: options?.idleTimeoutSeconds,
        // Storage
        storage: options?.storage,
        fromSnapshot: options?.fromSnapshot,
        // Secrets to inject as env vars
        secrets: options?.secrets,
        // Metadata
        metadata: options?.metadata,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return new SandboxInstance(this, this.parseInfo(data));
  }

  /**
   * List all sandboxes.
   *
   * @param options - Filtering and pagination options
   * @returns Array of SandboxInstance objects
   *
   * @example
   * ```typescript
   * // List all running sandboxes
   * const running = await client.list({ status: "running" });
   *
   * // List with pagination
   * const page = await client.list({ limit: 10, offset: 0 });
   * ```
   */
  async list(options?: ListSandboxOptions): Promise<SandboxInstance[]> {
    const params = new URLSearchParams();

    if (options?.status) {
      const statuses = Array.isArray(options.status)
        ? options.status
        : [options.status];
      for (const s of statuses) {
        params.append("status", s);
      }
    }

    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }

    if (options?.offset !== undefined) {
      params.set("offset", String(options.offset));
    }

    const query = params.toString();
    const path = query ? `/v1/sandboxes?${query}` : "/v1/sandboxes";

    const response = await this.fetch(path);

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    const sandboxes = Array.isArray(data) ? data : (data.sandboxes ?? []);

    return sandboxes.map(
      (item: Record<string, unknown>) =>
        new SandboxInstance(this, this.parseInfo(item)),
    );
  }

  /**
   * Get a sandbox by ID.
   *
   * @param id - The sandbox ID
   * @returns A SandboxInstance or null if not found
   *
   * @example
   * ```typescript
   * const box = await client.get("sandbox_abc123");
   * if (box) {
   *   console.log(box.status);
   * }
   * ```
   */
  async get(id: string): Promise<SandboxInstance | null> {
    const response = await this.fetch(
      `/v1/sandboxes/${encodeURIComponent(id)}`,
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return new SandboxInstance(this, this.parseInfo(data));
  }

  // ============================================
  // Usage & Billing
  // ============================================

  /**
   * Get usage information for the account.
   *
   * @returns Usage statistics for the current billing period
   *
   * @example
   * ```typescript
   * const usage = await client.usage();
   * console.log(`Active sandboxes: ${usage.activeSandboxes}`);
   * console.log(`Compute minutes: ${usage.computeMinutes}`);
   * ```
   */
  async usage(): Promise<UsageInfo> {
    const response = await this.fetch("/usage");

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      computeMinutes: data.computeMinutes ?? 0,
      activeSandboxes: data.activeSandboxes ?? 0,
      totalSandboxes: data.totalSandboxes ?? 0,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
    };
  }

  // ============================================
  // Health Check
  // ============================================

  /**
   * Check if the Sandbox API is available.
   *
   * @returns true if the API is healthy, false otherwise
   */
  async health(): Promise<boolean> {
    try {
      const response = await this.fetch("/health");
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================
  // CRIU Checkpoint Operations
  // ============================================

  /**
   * Check if CRIU checkpointing is available on the platform.
   *
   * CRIU enables memory preservation for true pause/resume and fork operations.
   * It requires specific host configuration.
   *
   * @returns CRIU availability status
   *
   * @example
   * ```typescript
   * const status = await client.criuStatus();
   * if (status.available) {
   *   console.log(`CRIU ${status.criuVersion} available`);
   * } else {
   *   console.log(`CRIU not available: ${status.reason}`);
   * }
   * ```
   */
  async criuStatus(): Promise<{
    available: boolean;
    criuVersion?: string;
    reason?: string;
    requirements?: {
      kernel: boolean;
      criu: boolean;
      storageDriver: boolean;
      experimental: boolean;
    };
  }> {
    const response = await this.fetch("/v1/system/criu-status");

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    return response.json();
  }

  // ============================================
  // Batch Execution
  // ============================================

  /**
   * Run multiple tasks in parallel across sandboxes.
   * Returns the aggregated results after all tasks complete.
   *
   * @param tasks - Array of tasks to execute
   * @param options - Batch execution options
   * @returns Aggregated batch results
   *
   * @example
   * ```typescript
   * const result = await client.runBatch([
   *   { id: "task-1", message: "Analyze this file" },
   *   { id: "task-2", message: "Generate a summary" },
   * ]);
   * console.log(`Success rate: ${result.successRate}%`);
   * ```
   */
  async runBatch(
    tasks: BatchTask[],
    options?: BatchOptions,
  ): Promise<BatchResult> {
    const results: BatchTaskResult[] = [];
    let totalRetries = 0;

    for await (const event of this.streamBatch(tasks, options)) {
      if (event.type === "task.completed") {
        const data = event.data as {
          taskId: string;
          durationMs: number;
          retries: number;
          tokensUsed?: number;
        };
        results.push({
          taskId: data.taskId,
          success: true,
          durationMs: data.durationMs,
          retries: data.retries,
          tokensUsed: data.tokensUsed,
        });
        totalRetries += data.retries;
      }

      if (event.type === "task.failed") {
        const data = event.data as {
          taskId: string;
          error: string;
          durationMs: number;
          retries: number;
        };
        results.push({
          taskId: data.taskId,
          success: false,
          error: data.error,
          durationMs: data.durationMs,
          retries: data.retries,
        });
        totalRetries += data.retries;
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      totalTasks: tasks.length,
      succeeded,
      failed,
      totalRetries,
      successRate: tasks.length > 0 ? (succeeded / tasks.length) * 100 : 0,
      results,
    };
  }

  /**
   * Stream events from a batch execution.
   * Use this for real-time progress updates during batch processing.
   *
   * @param tasks - Array of tasks to execute
   * @param options - Batch execution options
   *
   * @example
   * ```typescript
   * for await (const event of client.streamBatch(tasks)) {
   *   if (event.type === "task.completed") {
   *     console.log(`Task ${event.data.taskId} completed`);
   *   }
   * }
   * ```
   */
  async *streamBatch(
    tasks: BatchTask[],
    options?: BatchOptions,
  ): AsyncGenerator<BatchEvent> {
    const response = await this.fetch("/batch/run", {
      method: "POST",
      body: JSON.stringify({
        tasks,
        backend: { type: "opencode" },
        timeoutMs: options?.timeoutMs ?? 300000,
        scalingMode: options?.scalingMode ?? "balanced",
        persistent: options?.persistent ?? false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    yield* this.parseBatchSSEStream(response);
  }

  /**
   * Parse SSE stream from batch execution.
   */
  private async *parseBatchSSEStream(
    response: Response,
  ): AsyncGenerator<BatchEvent> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "" && currentEvent && currentData) {
            try {
              yield {
                type: currentEvent,
                data: JSON.parse(currentData),
              };
            } catch {
              // Skip malformed JSON
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
  // HTTP Client Implementation
  // ============================================

  /**
   * Make an authenticated HTTP request to the API.
   * This is exposed for use by SandboxInstance.
   */
  async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
        signal: options?.signal ?? controller.signal,
      });

      return response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new TimeoutError(this.timeoutMs);
      }

      throw new NetworkError(
        `Failed to connect to Sandbox API: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private parseInfo(data: Record<string, unknown>): SandboxInfo {
    return {
      id: data.id as string,
      name: data.name as string | undefined,
      status: data.status as SandboxStatus,
      connection: data.connection as SandboxInfo["connection"],
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
}

/**
 * Internal implementation of SecretsManager.
 */
class SecretsManagerImpl implements SecretsManager {
  constructor(private readonly client: SandboxClient) {}

  async create(name: string, value: string): Promise<SecretInfo> {
    const response = await this.client.fetch("/v1/secrets", {
      method: "POST",
      body: JSON.stringify({ name, value }),
    });

    if (response.status === 409) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    if (response.status === 400) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      name: data.name,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async list(): Promise<SecretInfo[]> {
    const response = await this.client.fetch("/v1/secrets");

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return (data.secrets ?? []).map(
      (s: { name: string; createdAt: string; updatedAt: string }) => ({
        name: s.name,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      }),
    );
  }

  async get(name: string): Promise<string> {
    const response = await this.client.fetch(
      `/v1/secrets/${encodeURIComponent(name)}`,
    );

    if (response.status === 404) {
      throw new NotFoundError("Secret", name);
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return data.value;
  }

  async update(name: string, value: string): Promise<SecretInfo> {
    const response = await this.client.fetch(
      `/v1/secrets/${encodeURIComponent(name)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ value }),
      },
    );

    if (response.status === 404) {
      throw new NotFoundError("Secret", name);
    }

    if (response.status === 400) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }

    const data = await response.json();
    return {
      name: data.name,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
  }

  async delete(name: string): Promise<void> {
    const response = await this.client.fetch(
      `/v1/secrets/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      },
    );

    if (response.status === 404) {
      throw new NotFoundError("Secret", name);
    }

    if (!response.ok) {
      const body = await response.text();
      throw parseErrorResponse(response.status, body);
    }
  }
}

/**
 * Alias for SandboxClient for cleaner imports.
 */
export { SandboxClient as Sandbox };
