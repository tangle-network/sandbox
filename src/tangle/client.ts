/**
 * TangleSandboxClient — on-chain sandbox lifecycle via EVM calls.
 *
 * Implements HttpClient so SandboxInstance works unchanged.
 * Lifecycle ops (create/stop/resume/delete) go on-chain via Tangle jobs.
 * Sidecar ops (exec/read/write/prompt) go direct HTTP to the sidecar.
 */

import type { HttpClient } from "../sandbox.js";
import { SandboxInstance } from "../sandbox.js";
import type { CreateSandboxOptions, SandboxInfo } from "../types.js";
import { TangleChainClient } from "./chain-client.js";
import {
  JOB_SANDBOX_CREATE,
  JOB_SANDBOX_DELETE,
  JOB_SANDBOX_RESUME,
  JOB_SANDBOX_STOP,
  type SandboxEntry,
  type TangleSandboxClientConfig,
} from "./types.js";

function randomHexToken(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (
    typeof globalThis.crypto !== "undefined" &&
    globalThis.crypto.getRandomValues
  ) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class TangleSandboxClient implements HttpClient {
  private readonly chain: TangleChainClient;
  private readonly config: TangleSandboxClientConfig;
  private readonly sandboxes = new Map<string, SandboxEntry>();

  constructor(config: TangleSandboxClientConfig) {
    if (!config.privateKey && !config.wallet) {
      throw new Error(
        "TangleSandboxClient requires either privateKey or wallet",
      );
    }
    this.config = config;
    this.chain = new TangleChainClient(config);
  }

  /**
   * Create a sandbox via on-chain job submission.
   */
  async create(options?: CreateSandboxOptions): Promise<SandboxInstance> {
    const sidecarToken = randomHexToken(32);

    const encoded = this.chain.encodeSandboxCreateInputs(
      options ?? {},
      sidecarToken,
    );

    const { result, callId, blockNumber } = await this.chain.submitJobAndWait(
      JOB_SANDBOX_CREATE,
      encoded,
    );

    // Decode the result to get sandboxId and connection info
    const resultBytes = await this.chain.getJobResult(callId, blockNumber);
    let sandboxId: string;
    let responseJson: Record<string, any> = {};

    if (resultBytes) {
      try {
        const viem = await import("viem");
        const decoded = viem.decodeAbiParameters(
          this.chain.getResponseParamTypes(JOB_SANDBOX_CREATE) as any,
          resultBytes as any,
        );
        sandboxId = decoded[0] as string;
        try {
          responseJson = JSON.parse(decoded[1] as string);
        } catch {
          // json field may be empty
        }
      } catch {
        throw new Error("Failed to decode create job result");
      }
    } else {
      throw new Error("No result returned from create job");
    }

    const sidecarUrl =
      responseJson.sidecarUrl ?? responseJson.sidecar_url ?? "";

    const entry: SandboxEntry = {
      id: sandboxId,
      sidecarUrl,
      sidecarToken,
      status: "running",
      createdAt: new Date(),
    };
    this.sandboxes.set(sandboxId, entry);

    const info: SandboxInfo = {
      id: sandboxId,
      name: options?.name,
      status: "running",
      connection: sidecarUrl
        ? { sidecarUrl, authToken: sidecarToken }
        : undefined,
      metadata: options?.metadata,
      createdAt: entry.createdAt,
    };

    return new SandboxInstance(this, info);
  }

  /**
   * Route interception for SandboxInstance lifecycle calls.
   *
   * SandboxInstance calls this.client.fetch() for:
   * - GET /v1/sandboxes/:id → return from local tracking
   * - POST /v1/sandboxes/:id/stop → on-chain JOB_SANDBOX_STOP
   * - POST /v1/sandboxes/:id/resume → on-chain JOB_SANDBOX_RESUME
   * - DELETE /v1/sandboxes/:id → on-chain JOB_SANDBOX_DELETE
   */
  async fetch(path: string, options?: RequestInit): Promise<Response> {
    const method = options?.method ?? "GET";

    // GET /v1/sandboxes/:id — return cached info
    const getMatch = path.match(/^\/v1\/sandboxes\/([^/]+)$/);
    if (getMatch && method === "GET") {
      const id = decodeURIComponent(getMatch[1]);
      const entry = this.sandboxes.get(id);
      if (!entry) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }
      return new Response(
        JSON.stringify({
          id: entry.id,
          status: entry.status,
          connection: entry.sidecarUrl
            ? { sidecarUrl: entry.sidecarUrl, authToken: entry.sidecarToken }
            : undefined,
          createdAt: entry.createdAt.toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // POST /v1/sandboxes/:id/stop
    const stopMatch = path.match(/^\/v1\/sandboxes\/([^/]+)\/stop$/);
    if (stopMatch && method === "POST") {
      const id = decodeURIComponent(stopMatch[1]);
      const encoded = this.chain.encodeSandboxIdInputs(id);
      await this.chain.submitJobAndWait(JOB_SANDBOX_STOP, encoded);

      const entry = this.sandboxes.get(id);
      if (entry) entry.status = "stopped";

      return new Response(JSON.stringify({ status: "stopped" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /v1/sandboxes/:id/resume
    const resumeMatch = path.match(/^\/v1\/sandboxes\/([^/]+)\/resume$/);
    if (resumeMatch && method === "POST") {
      const id = decodeURIComponent(resumeMatch[1]);
      const encoded = this.chain.encodeSandboxIdInputs(id);
      await this.chain.submitJobAndWait(JOB_SANDBOX_RESUME, encoded);

      const entry = this.sandboxes.get(id);
      if (entry) entry.status = "running";

      return new Response(JSON.stringify({ status: "running" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // DELETE /v1/sandboxes/:id
    const deleteMatch = path.match(/^\/v1\/sandboxes\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      const id = decodeURIComponent(deleteMatch[1]);
      const encoded = this.chain.encodeSandboxIdInputs(id);
      await this.chain.submitJobAndWait(JOB_SANDBOX_DELETE, encoded);

      const entry = this.sandboxes.get(id);
      if (entry) entry.status = "deleted";
      this.sandboxes.delete(id);

      return new Response(null, { status: 204 });
    }

    throw new Error(
      `Operation not supported via on-chain client: ${method} ${path}`,
    );
  }

  /**
   * Get available capacity from the blueprint contract.
   * Requires blueprintContractAddress in config.
   */
  async getAvailableCapacity(): Promise<number> {
    return this.chain.getAvailableCapacity();
  }

  /**
   * Get service stats from the blueprint contract.
   * Requires blueprintContractAddress in config.
   */
  async getServiceStats(): Promise<{
    totalSandboxes: number;
    totalCapacity: number;
  }> {
    return this.chain.getServiceStats();
  }
}
