import { HttpParams } from '@angular/common/http';

type ParamValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];

/**
 * Builds query params from a plain object: `undefined`/`null`/`''`/`false` are left out, arrays become
 * repeated keys (`ids=1&ids=2`, which is how FastEndpoints binds array properties).
 */
export function toHttpParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as [string, ParamValue][]) {
    if (value === undefined || value === null || value === '' || value === false) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params = params.append(key, String(item));
      }
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
