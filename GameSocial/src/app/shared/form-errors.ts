import { FieldState } from '@angular/forms/signals';
import { extractApiErrorMessage } from './api-error.util';

/**
 * Signal Forms helpers shared by every form in the app.
 *
 * `fieldError(form.email())` — the first validation message of a field, but only once the user
 * has interacted with it (touched) or tried to submit (`submit()` / `[formRoot]` touch every field).
 * Templates: `@if (fieldError(form.email()); as message) { <span class="field-error">{{ message }}</span> }`.
 */
export function fieldError(state: FieldState<unknown>): string | null {
  if (!state.touched()) {
    return null;
  }
  return state.errors()[0]?.message ?? null;
}

/**
 * The form-level error a submission action returned (e.g. "Invalid email or password."), shown
 * above the submit button. Submission errors clear themselves when the user edits the form.
 */
export function submitError(state: FieldState<unknown>): string | null {
  return state.errors().find((error) => error.kind === SERVER_ERROR)?.message ?? null;
}

/** `kind` of the error a submission action returns for a failed API call. */
export const SERVER_ERROR = 'server';

/**
 * Turns a failed API call inside a submission `action` into the form-level error `submitError` shows.
 * Uses the server's localized message when there is one, else `fallback`.
 */
export function serverError(err: unknown, fallback: string): { kind: string; message: string } {
  return { kind: SERVER_ERROR, message: extractApiErrorMessage(err, fallback) };
}
