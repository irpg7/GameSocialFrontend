import { HttpErrorResponse } from '@angular/common/http';

/**
 * Pulls the most useful message out of a failed API call, falling back otherwise. Understands:
 * - FastEndpoints validation failures: `{ statusCode, message, errors: { propertyName: ["msg", ...] } }`
 *   (e.g. "Cannot delete a game that has existing posts.");
 * - plain `{ message }` bodies (the exception middleware) and ProblemDetails (`{ title, detail }`);
 * - short plain-text bodies (e.g. the rate limiter's 429).
 * When the body has nothing to show, a few statuses get a generic but accurate message
 * (offline, rate limited, server error) instead of the caller's fallback.
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body: unknown = error.error;
  if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ProgressEvent)) {
    const shaped = body as { errors?: Record<string, string[]>; message?: string; detail?: string; title?: string };
    const firstValidationMessage = shaped.errors ? Object.values(shaped.errors).flat()[0] : undefined;
    const message = firstValidationMessage || shaped.message || shaped.detail;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  if (typeof body === 'string' && body.trim() && body.length <= 300 && !body.trimStart().startsWith('<')) {
    return body.trim();
  }

  switch (error.status) {
    case 0:
      return 'Could not reach the server. Check your connection and try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 502:
    case 503:
    case 504:
      return 'The server is not available right now. Please try again shortly.';
    default:
      return fallback;
  }
}
