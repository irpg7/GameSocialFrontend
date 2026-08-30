import { HttpErrorResponse } from '@angular/common/http';

/**
 * FastEndpoints' default validation-failure body looks like:
 *   { statusCode, message, errors: { propertyName: ["msg", ...] } }
 * (e.g. "Cannot delete a game that has existing posts.", "Cannot modify
 * your own permissions."). This pulls the first useful message out of that
 * shape, or a plain `message` field for other errors, falling back otherwise.
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object') {
    const body = error.error as { errors?: Record<string, string[]>; message?: string };
    const firstValidationMessage = body.errors ? Object.values(body.errors).flat()[0] : undefined;
    if (firstValidationMessage) {
      return firstValidationMessage;
    }
    if (body.message) {
      return body.message;
    }
  }
  return fallback;
}
