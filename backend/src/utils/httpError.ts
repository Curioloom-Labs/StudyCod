export type HttpErrorOptions = {
  /**
   * Whether this error message is safe to expose to clients in production.
   * Defaults to true for HttpError because messages are usually code-like (e.g. ACCESS_DENIED).
   */
  expose?: boolean;
  /** Optional stable error code (defaults to message). */
  code?: string;
  /** Optional extra details to return when expose=true (keep this small & non-sensitive). */
  details?: unknown;
  /** Optional underlying error for logging purposes. */
  cause?: unknown;
};

/**
 * Structured HTTP error intended to be handled by the global Express error middleware.
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  constructor(statusCode: number, message: string, options?: HttpErrorOptions) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options?.code ?? message;
    this.expose = options?.expose ?? true;
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, { details });
}

export function unauthorized(message = "UNAUTHORIZED"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "ACCESS_DENIED"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "NOT_FOUND"): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}
