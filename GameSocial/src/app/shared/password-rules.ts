import { SchemaPath, minLength, required, validate } from '@angular/forms/signals';

/** Server rules (Auth/Shared/AccountRules): at least 8 characters, at most 72 bytes (BCrypt's limit). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const encoder = new TextEncoder();

/** Signal Forms rules for a new password — register, reset and change password share them. */
export function passwordRules(path: SchemaPath<string>): void {
  required(path, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  minLength(path, PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  validate(path, ({ value }) =>
    encoder.encode(value()).length > PASSWORD_MAX_BYTES
      ? { kind: 'maxBytes', message: 'Password is too long.' }
      : undefined,
  );
}

/** Server rules: 3–24 characters, letters, digits, dots, underscores and hyphens. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;
