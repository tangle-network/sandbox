/**
 * Thin viem wrapper for Tangle chain interactions.
 *
 * All viem imports are dynamic to support optional peer dependency.
 */

import type { CreateSandboxOptions } from "../types.js";
import {
  AgentSandboxBlueprintAbi,
  ITangleJobsAbi,
  JsonResponseParamTypes,
  SandboxCreateParamTypes,
  SandboxCreateResponseParamTypes,
  SandboxIdParamTypes,
} from "./abi.js";
import {
  TANGLE_CHAIN_ID,
  TANGLE_JOBS_CONTRACT,
  TANGLE_MAINNET_RPC,
  type TangleSandboxClientConfig,
} from "./types.js";

export class TangleChainClient {
  private readonly config: TangleSandboxClientConfig;
  private publicClient: any = null;
  private walletClient: any = null;
  private account: any = null;

  constructor(config: TangleSandboxClientConfig) {
    this.config = config;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.publicClient && this.walletClient) return;

    let viem: any;
    try {
      viem = await import("viem");
    } catch {
      throw new Error(
        "viem is required for TangleSandboxClient. Install it: npm install viem",
      );
    }

    const rpcUrl = this.config.rpcUrl ?? TANGLE_MAINNET_RPC;
    const chain = {
      id: TANGLE_CHAIN_ID,
      name: "Tangle",
      nativeCurrency: { name: "TNT", symbol: "TNT", decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
      },
    };

    const transport = viem.http(rpcUrl);

    this.publicClient = viem.createPublicClient({ chain, transport });

    if (this.config.privateKey) {
      const { privateKeyToAccount } = await import("viem/accounts");
      this.account = privateKeyToAccount(this.config.privateKey);
      this.walletClient = viem.createWalletClient({
        account: this.account,
        chain,
        transport,
      });
    } else if (this.config.wallet) {
      this.walletClient = this.config.wallet;
      this.account = (this.config.wallet as any).account;
    } else {
      throw new Error(
        "TangleSandboxClient requires either privateKey or wallet",
      );
    }
  }

  encodeSandboxCreateInputs(
    options: CreateSandboxOptions,
    sidecarToken: string,
  ): {
    types: readonly any[];
    values: any[];
  } {
    return {
      types: SandboxCreateParamTypes,
      values: [
        options.name ?? "",
        options.image ?? "",
        "",
        "",
        options.env ? JSON.stringify(options.env) : "",
        options.metadata ? JSON.stringify(options.metadata) : "",
        options.sshEnabled ?? false,
        options.sshPublicKey ?? "",
        options.webTerminalEnabled ?? false,
        BigInt(options.maxLifetimeSeconds ?? 0),
        BigInt(options.idleTimeoutSeconds ?? 0),
        BigInt(options.resources?.cpuCores ?? 0),
        BigInt(options.resources?.memoryMB ?? 0),
        BigInt(options.resources?.diskGB ?? 0),
        sidecarToken,
      ],
    };
  }

  encodeSandboxIdInputs(sandboxId: string): {
    types: readonly any[];
    values: any[];
  } {
    return {
      types: SandboxIdParamTypes,
      values: [sandboxId],
    };
  }

  async submitJobAndWait(
    jobIndex: number,
    encoded: { types: readonly any[]; values: any[] },
  ): Promise<{ result: any; callId: bigint; blockNumber: bigint }> {
    await this.ensureInitialized();

    const viem = await import("viem");

    const contractAddress = this.config.contractAddress ?? TANGLE_JOBS_CONTRACT;
    const serviceId = this.config.serviceId;

    // ABI-encode the job inputs
    const inputs = viem.encodeAbiParameters(
      encoded.types as any,
      encoded.values,
    );

    // Submit the job transaction
    const hash = await this.walletClient.writeContract({
      address: contractAddress,
      abi: ITangleJobsAbi,
      functionName: "submitJob",
      args: [serviceId, jobIndex, inputs],
    });

    // Wait for transaction receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    // Extract callId from JobSubmitted event in receipt
    const jobSubmittedEvent = receipt.logs.find((log: any) => {
      try {
        const decoded = viem.decodeEventLog({
          abi: ITangleJobsAbi,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "JobSubmitted";
      } catch {
        return false;
      }
    });

    if (!jobSubmittedEvent) {
      throw new Error("JobSubmitted event not found in transaction receipt");
    }

    const decodedEvent = viem.decodeEventLog({
      abi: ITangleJobsAbi,
      data: jobSubmittedEvent.data,
      topics: jobSubmittedEvent.topics,
    });

    const callId = (decodedEvent.args as any).callId as bigint;

    // Poll for job completion
    const timeoutMs = this.config.jobTimeoutMs ?? 14_400_000;
    const pollIntervalMs = this.config.pollIntervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const jobCall = await this.publicClient.readContract({
        address: contractAddress,
        abi: ITangleJobsAbi,
        functionName: "getJobCall",
        args: [serviceId, callId],
      });

      if (jobCall.completed) {
        return { result: jobCall, callId, blockNumber: receipt.blockNumber };
      }
    }

    throw new Error(
      `Job ${jobIndex} (callId=${callId}) did not complete within ${timeoutMs}ms`,
    );
  }

  async getJobResult(
    callId: bigint,
    fromBlock?: bigint,
  ): Promise<Uint8Array | null> {
    await this.ensureInitialized();

    const viem = await import("viem");
    const contractAddress = this.config.contractAddress ?? TANGLE_JOBS_CONTRACT;

    // Read JobResultSubmitted events for this callId
    const logs = await this.publicClient.getLogs({
      address: contractAddress,
      event: viem.parseAbiItem(
        "event JobResultSubmitted(uint64 indexed serviceId, uint64 indexed callId, address indexed operator, bytes result)",
      ),
      args: {
        serviceId: this.config.serviceId,
        callId,
      },
      fromBlock: fromBlock ?? "earliest",
    });

    if (logs.length === 0) return null;

    return logs[0].args.result;
  }

  async getAvailableCapacity(): Promise<number> {
    await this.ensureInitialized();

    if (!this.config.blueprintContractAddress) {
      throw new Error(
        "blueprintContractAddress is required for getAvailableCapacity",
      );
    }

    const result = await this.publicClient.readContract({
      address: this.config.blueprintContractAddress,
      abi: AgentSandboxBlueprintAbi,
      functionName: "getAvailableCapacity",
    });

    return Number(result);
  }

  async getServiceStats(): Promise<{
    totalSandboxes: number;
    totalCapacity: number;
  }> {
    await this.ensureInitialized();

    if (!this.config.blueprintContractAddress) {
      throw new Error(
        "blueprintContractAddress is required for getServiceStats",
      );
    }

    const [totalSandboxes, totalCapacity] =
      await this.publicClient.readContract({
        address: this.config.blueprintContractAddress,
        abi: AgentSandboxBlueprintAbi,
        functionName: "getServiceStats",
      });

    return {
      totalSandboxes: Number(totalSandboxes),
      totalCapacity: Number(totalCapacity),
    };
  }

  getResponseParamTypes(
    jobIndex: number,
  ): readonly { name: string; type: string }[] {
    if (jobIndex === 0) return SandboxCreateResponseParamTypes;
    return JsonResponseParamTypes;
  }
}
