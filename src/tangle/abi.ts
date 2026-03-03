/**
 * Tangle Contract ABI Definitions
 *
 * Viem-compatible ABI for the ITangleJobs precompile,
 * AgentSandboxBlueprint contract views/events,
 * and ABI parameter definitions for encoding/decoding blueprint job inputs/outputs.
 *
 * Maintained as part of this SDK so it can remain self-contained.
 */

export const ITangleJobsAbi = [
  {
    type: "function",
    name: "submitJob",
    inputs: [
      { name: "serviceId", type: "uint64" },
      { name: "jobIndex", type: "uint8" },
      { name: "inputs", type: "bytes" },
    ],
    outputs: [{ name: "callId", type: "uint64" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getJobCall",
    inputs: [
      { name: "serviceId", type: "uint64" },
      { name: "callId", type: "uint64" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "jobIndex", type: "uint8" },
          { name: "caller", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "resultCount", type: "uint32" },
          { name: "payment", type: "uint256" },
          { name: "completed", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "JobSubmitted",
    inputs: [
      { name: "serviceId", type: "uint64", indexed: true },
      { name: "callId", type: "uint64", indexed: true },
      { name: "jobIndex", type: "uint8", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "inputs", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobResultSubmitted",
    inputs: [
      { name: "serviceId", type: "uint64", indexed: true },
      { name: "callId", type: "uint64", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "result", type: "bytes", indexed: false },
    ],
  },
] as const;

export const SandboxCreateParamTypes = [
  { name: "name", type: "string" },
  { name: "image", type: "string" },
  { name: "stack", type: "string" },
  { name: "agent_identifier", type: "string" },
  { name: "env_json", type: "string" },
  { name: "metadata_json", type: "string" },
  { name: "ssh_enabled", type: "bool" },
  { name: "ssh_public_key", type: "string" },
  { name: "web_terminal_enabled", type: "bool" },
  { name: "max_lifetime_seconds", type: "uint64" },
  { name: "idle_timeout_seconds", type: "uint64" },
  { name: "cpu_cores", type: "uint64" },
  { name: "memory_mb", type: "uint64" },
  { name: "disk_gb", type: "uint64" },
  { name: "sidecar_token", type: "string" },
] as const;

export const SandboxIdParamTypes = [
  { name: "sandbox_id", type: "string" },
] as const;

export const SandboxCreateResponseParamTypes = [
  { name: "sandboxId", type: "string" },
  { name: "json", type: "string" },
] as const;

export const JsonResponseParamTypes = [
  { name: "json", type: "string" },
] as const;

export const AgentSandboxBlueprintAbi = [
  {
    type: "function",
    name: "getAvailableCapacity",
    inputs: [],
    outputs: [{ name: "available", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getServiceStats",
    inputs: [],
    outputs: [
      { name: "totalSandboxes", type: "uint32" },
      { name: "totalCapacity", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOperatorLoad",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [
      { name: "active", type: "uint32" },
      { name: "max", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSandboxOperator",
    inputs: [{ name: "sandboxId", type: "string" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isSandboxActive",
    inputs: [{ name: "sandboxId", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "OperatorAssigned",
    inputs: [
      { name: "serviceId", type: "uint64", indexed: true },
      { name: "callId", type: "uint64", indexed: true },
      { name: "operator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "OperatorRouted",
    inputs: [
      { name: "serviceId", type: "uint64", indexed: true },
      { name: "callId", type: "uint64", indexed: true },
      { name: "operator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SandboxCreated",
    inputs: [
      { name: "sandboxHash", type: "bytes32", indexed: true },
      { name: "operator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SandboxDeleted",
    inputs: [
      { name: "sandboxHash", type: "bytes32", indexed: true },
      { name: "operator", type: "address", indexed: true },
    ],
  },
] as const;
