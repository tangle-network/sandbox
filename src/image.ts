/**
 * Image Builder for Sandbox SDK
 *
 * Provides a chainable API for building custom container images.
 *
 * @example Basic usage
 * ```typescript
 * import { Image, Sandbox } from "@tangle-network/sandbox";
 *
 * const client = new Sandbox({ apiKey: "sk_sandbox_..." });
 *
 * const image = await Image.create()
 *   .python("3.11")
 *   .addPackages(["numpy", "pandas"])
 *   .addCommands(["apt-get update && apt-get install -y ffmpeg"])
 *   .withSecrets(["HF_TOKEN"])
 *   .build({ client });
 *
 * const box = await client.create({ image: image.id });
 * ```
 */

import { createHash } from "node:crypto";

/**
 * Image specification for building a custom container image.
 */
export interface ImageSpec {
  /** Base Docker image (default: "ubuntu:22.04") */
  baseImage: string;
  /** Python version to install */
  pythonVersion?: string;
  /** Python packages to install via pip */
  packages?: string[];
  /** Shell commands to run during build */
  commands?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Secret names to inject during build */
  secrets?: string[];
  /** Custom Dockerfile content or path */
  dockerfile?: string;
  /** Build context directory */
  dockerContext?: string;
  /** Conda environment configuration */
  conda?: {
    packages: string[];
    channels?: string[];
  };
  /** System packages to install via apt-get */
  aptPackages?: string[];
  /** Working directory */
  workdir?: string;
  /** User to run as */
  user?: string;
  /** Build arguments */
  buildArgs?: Record<string, string>;
  /** Image labels */
  labels?: Record<string, string>;
}

/**
 * Build result for an image.
 */
export interface ImageBuildResult {
  /** Content-addressed image ID */
  id: string;
  /** Image tag */
  tag: string;
  /** Image size in bytes */
  size: number;
  /** Build time in milliseconds */
  buildTimeMs: number;
  /** Whether served from cache */
  cached: boolean;
  /** Creation timestamp */
  createdAt: Date;
  /** Original build spec */
  spec: ImageSpec;
  /** Image digest */
  digest: string;
}

/**
 * Progress event during image build.
 */
export interface BuildProgressEvent {
  /** Current build step */
  step: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Human-readable message */
  message: string;
  /** Whether step is complete */
  complete: boolean;
  /** Whether step used cache */
  cached?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for building an image.
 */
export interface ImageBuildOptions {
  /** Progress callback */
  onProgress?: (event: BuildProgressEvent) => void;
  /** Build timeout in milliseconds */
  timeout?: number;
  /** Force rebuild ignoring cache */
  noCache?: boolean;
  /** Target platform */
  platform?: string;
  /** Custom tag for the image */
  tag?: string;
  /** Sandbox client for API access */
  client?: {
    baseUrl: string;
    apiKey: string;
  };
}

/**
 * Represents a built or existing container image.
 */
export class Image {
  private constructor(
    /** Unique image identifier (content-addressed) */
    public readonly id: string,
    /** Full image tag */
    public readonly tag: string,
    /** Image digest */
    public readonly digest: string,
    /** Original build spec */
    public readonly spec?: ImageSpec,
  ) {}

  /**
   * Start building a new image.
   *
   * @param baseImage Base Docker image (default: "ubuntu:22.04")
   * @returns A new ImageBuilder instance
   *
   * @example
   * ```typescript
   * const builder = Image.create("python:3.11-slim");
   * ```
   */
  static create(baseImage = "ubuntu:22.04"): ImageBuilder {
    return new ImageBuilder({ baseImage });
  }

  /**
   * Reference an existing image by ID.
   *
   * @param imageId The image ID
   * @returns An Image instance
   *
   * @example
   * ```typescript
   * const image = Image.fromId("sha256:abc123...");
   * const box = await client.create({ image: image.id });
   * ```
   */
  static fromId(imageId: string): Image {
    const tag = imageId.startsWith("sha256:")
      ? `tangle-image:${imageId.slice(7, 19)}`
      : imageId;

    return new Image(imageId, tag, imageId);
  }

  /**
   * Create an image builder from a Dockerfile.
   *
   * @param dockerfile Dockerfile path or content
   * @param context Build context directory
   * @returns A new ImageBuilder instance
   *
   * @example
   * ```typescript
   * const builder = Image.fromDockerfile("./Dockerfile", "./");
   * ```
   */
  static fromDockerfile(dockerfile: string, context?: string): ImageBuilder {
    return new ImageBuilder({
      baseImage: "scratch",
      dockerfile,
      dockerContext: context || ".",
    });
  }

  /**
   * Create an Image from a build result.
   * @internal
   */
  static fromBuildResult(result: ImageBuildResult): Image {
    return new Image(result.id, result.tag, result.digest, result.spec);
  }

  /**
   * Convert to JSON.
   */
  toJSON(): { id: string; tag: string; digest: string; spec?: ImageSpec } {
    return {
      id: this.id,
      tag: this.tag,
      digest: this.digest,
      spec: this.spec,
    };
  }
}

/**
 * Chainable builder for constructing custom container images.
 *
 * @example
 * ```typescript
 * const image = await Image.create()
 *   .python("3.11")
 *   .addPackages(["torch", "transformers"])
 *   .addCommands(["apt-get install -y ffmpeg"])
 *   .withEnv({ HF_HOME: "/models" })
 *   .withSecrets(["HF_TOKEN"])
 *   .build({ client });
 * ```
 */
export class ImageBuilder {
  private spec: ImageSpec;
  private clientConfig?: { baseUrl: string; apiKey: string };

  /** @internal */
  constructor(initialSpec: Partial<ImageSpec>) {
    this.spec = {
      baseImage: initialSpec.baseImage || "ubuntu:22.04",
      ...initialSpec,
    };
  }

  /**
   * Configure Python version.
   *
   * @param version Python version (e.g., "3.11", "3.10")
   */
  python(version: string): this {
    this.spec.pythonVersion = version;
    return this;
  }

  /**
   * Add Python packages via pip.
   *
   * @param packages Package names with optional versions
   *
   * @example
   * ```typescript
   * .addPackages(["numpy>=1.21", "pandas", "scikit-learn"])
   * ```
   */
  addPackages(packages: string[]): this {
    this.spec.packages = [...(this.spec.packages || []), ...packages];
    return this;
  }

  /**
   * Add packages from requirements file.
   *
   * @param requirementsPath Path to requirements.txt
   */
  addPackagesFromFile(requirementsPath: string): this {
    this.spec.commands = [
      ...(this.spec.commands || []),
      `pip install -r ${requirementsPath}`,
    ];
    return this;
  }

  /**
   * Add shell commands to run during build.
   *
   * @param commands Commands to execute
   *
   * @example
   * ```typescript
   * .addCommands([
   *   "apt-get update",
   *   "apt-get install -y ffmpeg libsm6"
   * ])
   * ```
   */
  addCommands(commands: string[]): this {
    this.spec.commands = [...(this.spec.commands || []), ...commands];
    return this;
  }

  /**
   * Add system packages via apt-get.
   *
   * @param packages Package names
   */
  addAptPackages(packages: string[]): this {
    this.spec.aptPackages = [...(this.spec.aptPackages || []), ...packages];
    return this;
  }

  /**
   * Set environment variables.
   *
   * @param env Key-value pairs
   *
   * @example
   * ```typescript
   * .withEnv({ HF_HOME: "/models", PYTHONUNBUFFERED: "1" })
   * ```
   */
  withEnv(env: Record<string, string>): this {
    this.spec.env = { ...this.spec.env, ...env };
    return this;
  }

  /**
   * Inject secrets during build.
   * Secrets are retrieved from the secret store.
   *
   * @param secretNames Names of secrets to inject
   *
   * @example
   * ```typescript
   * .withSecrets(["HF_TOKEN", "AWS_ACCESS_KEY"])
   * ```
   */
  withSecrets(secretNames: string[]): this {
    this.spec.secrets = [...(this.spec.secrets || []), ...secretNames];
    return this;
  }

  /**
   * Configure conda environment.
   *
   * @param packages Conda packages
   * @param channels Conda channels (default: ["conda-forge"])
   *
   * @example
   * ```typescript
   * .conda(["pytorch", "torchvision"], ["pytorch", "conda-forge"])
   * ```
   */
  conda(packages: string[], channels?: string[]): this {
    this.spec.conda = {
      packages: [...(this.spec.conda?.packages || []), ...packages],
      channels: channels || this.spec.conda?.channels || ["conda-forge"],
    };
    return this;
  }

  /**
   * Set working directory.
   *
   * @param dir Working directory path
   */
  workdir(dir: string): this {
    this.spec.workdir = dir;
    return this;
  }

  /**
   * Set user to run as.
   *
   * @param user Username or UID
   */
  user(user: string): this {
    this.spec.user = user;
    return this;
  }

  /**
   * Add build arguments.
   *
   * @param args Build arguments
   */
  buildArgs(args: Record<string, string>): this {
    this.spec.buildArgs = { ...this.spec.buildArgs, ...args };
    return this;
  }

  /**
   * Add image labels.
   *
   * @param labels Image labels
   */
  labels(labels: Record<string, string>): this {
    this.spec.labels = { ...this.spec.labels, ...labels };
    return this;
  }

  /**
   * Get the image specification without building.
   *
   * @returns The current ImageSpec
   */
  toSpec(): ImageSpec {
    return { ...this.spec };
  }

  /**
   * Compute content-addressed ID for this spec.
   *
   * @returns SHA256 hash of the normalized spec
   */
  computeId(): string {
    const normalized = JSON.stringify(this.spec, Object.keys(this.spec).sort());
    return createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Configure client for API access.
   * @internal
   */
  withClient(config: { baseUrl: string; apiKey: string }): this {
    this.clientConfig = config;
    return this;
  }

  /**
   * Build the image.
   *
   * @param options Build options including client config
   * @returns The built Image instance
   *
   * @example
   * ```typescript
   * const image = await Image.create()
   *   .python("3.11")
   *   .addPackages(["numpy"])
   *   .build({
   *     client: { baseUrl, apiKey },
   *     onProgress: (e) => console.log(e.message),
   *   });
   *
   * const box = await client.create({ image: image.id });
   * ```
   */
  async build(options?: ImageBuildOptions): Promise<Image> {
    const client = options?.client || this.clientConfig;

    if (!client) {
      throw new Error(
        "Client configuration required. Pass { client: { baseUrl, apiKey } } to build() " +
          "or use ImageBuilder through the Sandbox client.",
      );
    }

    const response = await fetch(`${client.baseUrl}/v1/images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.apiKey}`,
      },
      body: JSON.stringify({
        spec: this.spec,
        options: {
          noCache: options?.noCache,
          platform: options?.platform,
          tag: options?.tag,
          stream: !!options?.onProgress,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to build image: ${error}`);
    }

    // Handle streaming progress
    if (
      options?.onProgress &&
      response.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let result: ImageBuildResult | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "progress") {
                options.onProgress(data.event as BuildProgressEvent);
              } else if (data.type === "complete") {
                result = {
                  ...data.result,
                  createdAt: new Date(data.result.createdAt),
                } as ImageBuildResult;
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }

        if (!result) {
          throw new Error("Build completed but no result received");
        }

        return Image.fromBuildResult(result);
      }
    }

    // Non-streaming response
    const data = await response.json();
    const result: ImageBuildResult = {
      ...data,
      createdAt: new Date(data.createdAt),
    };

    return Image.fromBuildResult(result);
  }

  /**
   * Generate Dockerfile from the current spec.
   * Useful for debugging or manual builds.
   *
   * @returns Dockerfile content
   */
  generateDockerfile(): string {
    return generateDockerfile(this.spec);
  }
}

/**
 * Generate a Dockerfile from an ImageSpec.
 *
 * @param spec The image specification
 * @returns Dockerfile content
 */
export function generateDockerfile(spec: ImageSpec): string {
  const lines: string[] = [];

  lines.push(`FROM ${spec.baseImage}`);
  lines.push("");

  if (spec.labels && Object.keys(spec.labels).length > 0) {
    for (const [key, value] of Object.entries(spec.labels)) {
      lines.push(`LABEL ${key}="${value}"`);
    }
    lines.push("");
  }

  if (spec.buildArgs && Object.keys(spec.buildArgs).length > 0) {
    for (const [key, value] of Object.entries(spec.buildArgs)) {
      lines.push(`ARG ${key}=${value}`);
    }
    lines.push("");
  }

  if (spec.env && Object.keys(spec.env).length > 0) {
    for (const [key, value] of Object.entries(spec.env)) {
      lines.push(`ENV ${key}="${value}"`);
    }
    lines.push("");
  }

  if (spec.workdir) {
    lines.push(`WORKDIR ${spec.workdir}`);
    lines.push("");
  }

  if (spec.aptPackages && spec.aptPackages.length > 0) {
    lines.push("# Install system packages");
    lines.push("RUN apt-get update && \\");
    lines.push(
      `    apt-get install -y --no-install-recommends ${spec.aptPackages.join(" ")} && \\`,
    );
    lines.push("    apt-get clean && rm -rf /var/lib/apt/lists/*");
    lines.push("");
  }

  if (spec.pythonVersion) {
    lines.push(`# Install Python ${spec.pythonVersion}`);
    const hasPython =
      spec.baseImage.includes("python") ||
      spec.baseImage.includes("anaconda") ||
      spec.baseImage.includes("miniconda");

    if (!hasPython && spec.baseImage.includes("ubuntu")) {
      lines.push("RUN apt-get update && \\");
      lines.push("    apt-get install -y software-properties-common && \\");
      lines.push("    add-apt-repository -y ppa:deadsnakes/ppa && \\");
      lines.push(
        `    apt-get install -y python${spec.pythonVersion} python${spec.pythonVersion}-venv python${spec.pythonVersion}-distutils && \\`,
      );
      lines.push("    apt-get clean && rm -rf /var/lib/apt/lists/*");
      lines.push("");
      lines.push(
        `RUN update-alternatives --install /usr/bin/python python /usr/bin/python${spec.pythonVersion} 1 && \\`,
      );
      lines.push(
        `    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python${spec.pythonVersion} 1`,
      );
      lines.push("");
      lines.push("RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python");
    }
    lines.push("");
  }

  if (spec.conda && spec.conda.packages.length > 0) {
    lines.push("# Install micromamba and conda packages");
    lines.push(
      "RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest | tar -xvj bin/micromamba && \\",
    );
    lines.push("    mv bin/micromamba /usr/local/bin/ && \\");
    lines.push("    micromamba shell init -s bash -p /opt/conda");
    lines.push("");

    const channels = spec.conda.channels || ["conda-forge"];
    const channelArgs = channels.map((c) => `-c ${c}`).join(" ");

    lines.push(
      `RUN micromamba install -y -n base ${channelArgs} ${spec.conda.packages.join(" ")} && \\`,
    );
    lines.push("    micromamba clean --all --yes");
    lines.push('ENV PATH="/opt/conda/bin:$PATH"');
    lines.push("");
  }

  if (spec.packages && spec.packages.length > 0) {
    lines.push("# Install Python packages");
    lines.push(`RUN pip install --no-cache-dir ${spec.packages.join(" ")}`);
    lines.push("");
  }

  if (spec.commands && spec.commands.length > 0) {
    lines.push("# Custom commands");
    for (const cmd of spec.commands) {
      lines.push(`RUN ${cmd}`);
    }
    lines.push("");
  }

  if (spec.user) {
    lines.push(`USER ${spec.user}`);
  }

  return lines.join("\n");
}
