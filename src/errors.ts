/**
 * Sandbox SDK Errors
 *
 * Error classes for the Sandbox client SDK.
 */

/**
 * Base error class for all Sandbox SDK errors.
 */
export class SandboxError extends Error {
  /** HTTP status code if applicable */
  public readonly status?: number;
  /** Error code for programmatic handling */
  public readonly code: string;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Authentication failed or API key is invalid.
 */
export class AuthError extends SandboxError {
  constructor(message = "Authentication failed") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

/**
 * The requested resource was not found.
 */
export class NotFoundError extends SandboxError {
  /** The resource type that was not found */
  public readonly resourceType: string;
  /** The resource ID that was not found */
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Account quota or rate limit exceeded.
 */
export class QuotaError extends SandboxError {
  /** The type of quota that was exceeded */
  public readonly quotaType: string;
  /** Current usage */
  public readonly current?: number;
  /** Maximum allowed */
  public readonly limit?: number;

  constructor(
    quotaType: string,
    message?: string,
    current?: number,
    limit?: number,
  ) {
    super(message ?? `Quota exceeded: ${quotaType}`, "QUOTA_EXCEEDED", 429);
    this.name = "QuotaError";
    this.quotaType = quotaType;
    this.current = current;
    this.limit = limit;
  }
}

/**
 * The request was invalid or malformed.
 */
export class ValidationError extends SandboxError {
  /** Field-level validation errors */
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/**
 * The sandbox is not in a valid state for the requested operation.
 */
export class StateError extends SandboxError {
  /** Current state of the sandbox */
  public readonly currentState: string;
  /** Required state for the operation */
  public readonly requiredState?: string;

  constructor(message: string, currentState: string, requiredState?: string) {
    super(message, "INVALID_STATE", 409);
    this.name = "StateError";
    this.currentState = currentState;
    this.requiredState = requiredState;
  }
}

/**
 * The request timed out.
 */
export class TimeoutError extends SandboxError {
  /** Timeout duration in milliseconds */
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Request timed out after ${timeoutMs}ms`, "TIMEOUT", 408);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * A network or connection error occurred.
 */
export class NetworkError extends SandboxError {
  /** The underlying error */
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/**
 * The server returned an unexpected error.
 */
export class ServerError extends SandboxError {
  constructor(message: string, status = 500) {
    super(message, "SERVER_ERROR", status);
    this.name = "ServerError";
  }
}

/**
 * Parse an error response from the API.
 * @param status - HTTP status code
 * @param body - Response body text
 * @param context - Optional request context for better error messages
 */
export function parseErrorResponse(
  status: number,
  body: string,
  context?: { method?: string; path?: string },
): SandboxError {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    data = { message: body };
  }

  // Handle nested error object structure: { success: false, error: { code, message } }
  const errorObj = data.error as Record<string, unknown> | string | undefined;
  const nestedMessage =
    typeof errorObj === "object" && errorObj !== null
      ? (errorObj.message as string | undefined)
      : undefined;
  const nestedCode =
    typeof errorObj === "object" && errorObj !== null
      ? (errorObj.code as string | undefined)
      : undefined;

  const baseMessage =
    (data.message as string) ||
    nestedMessage ||
    (typeof errorObj === "string" ? errorObj : undefined) ||
    body ||
    "Unknown error";
  const code = (data.code as string | undefined) || nestedCode;

  // Add request context to message for easier debugging
  const prefix = context
    ? `${context.method ?? "REQUEST"} ${context.path ?? ""}: `
    : "";
  const message = `${prefix}${baseMessage}`;

  switch (status) {
    case 400:
      return new ValidationError(
        message,
        data.fields as Record<string, string> | undefined,
      );
    case 401:
      return new AuthError(message);
    case 404:
      return new NotFoundError(
        (data.resourceType as string) || "Resource",
        (data.resourceId as string) || "unknown",
      );
    case 408:
      return new TimeoutError((data.timeoutMs as number) || 30000, message);
    case 409:
      return new StateError(
        message,
        (data.currentState as string) || "unknown",
        data.requiredState as string | undefined,
      );
    case 429:
      return new QuotaError(
        (data.quotaType as string) || "rate_limit",
        message,
        data.current as number | undefined,
        data.limit as number | undefined,
      );
    default:
      if (status >= 500) {
        return new ServerError(message, status);
      }
      return new SandboxError(message, code || "UNKNOWN_ERROR", status);
  }
}
