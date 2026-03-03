/**
 * Tangle Sandbox Client types and constants.
 */

/** Tangle mainnet chain ID. */
export const TANGLE_CHAIN_ID = 5845;

/** Tangle mainnet RPC endpoint. */
export const TANGLE_MAINNET_RPC = "https://rpc.tangle.tools";

/** ITangleJobs precompile contract address. */
export const TANGLE_JOBS_CONTRACT =
  "0x0000000000000000000000000000000000000808" as const;

/** Job indices matching the blueprint's job IDs. */
export const JOB_SANDBOX_CREATE = 0;
export const JOB_SANDBOX_STOP = 1;
export const JOB_SANDBOX_RESUME = 2;
export const JOB_SANDBOX_DELETE = 3;

export interface TangleSandboxClientConfig {
  /** Tangle service instance ID for the sandbox blueprint. */
  serviceId: bigint;
  /** viem WalletClient for browser environments. Mutually exclusive with privateKey. */
  wallet?: unknown;
  /** Hex-encoded private key for Node.js environments. Mutually exclusive with wallet. */
  privateKey?: `0x${string}`;
  /** RPC URL. Required when using privateKey. Defaults to Tangle mainnet. */
  rpcUrl?: string;
  /** Blueprint contract address for view calls (getAvailableCapacity, etc). */
  blueprintContractAddress?: `0x${string}`;
  /** ITangleJobs precompile address. Defaults to 0x...0808. */
  contractAddress?: `0x${string}`;
  /** Max time to wait for a job to complete. No hard limit — agent jobs can run hours. Default: 14400000 (4h). */
  jobTimeoutMs?: number;
  /** Interval between job completion polls. Default: 5000 (5s). */
  pollIntervalMs?: number;
}

export interface SandboxEntry {
  id: string;
  sidecarUrl: string;
  sidecarToken: string;
  status: "running" | "stopped" | "deleted";
  createdAt: Date;
}
