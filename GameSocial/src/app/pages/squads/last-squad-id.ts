/**
 * `/squads` has no list screen (see Squads) — it redirects into a squad room.
 * Remembering the last room visited is what makes that redirect land somewhere
 * meaningful instead of always on the alphabetically-first squad.
 *
 * Per-device by design: there is no server-side "last visited squad".
 * localStorage access is wrapped because it throws in some privacy modes.
 */
export const LAST_SQUAD_ID_KEY = 'arena.lastSquadId';

export function readLastSquadId(): string | null {
  try {
    return localStorage.getItem(LAST_SQUAD_ID_KEY);
  } catch {
    return null;
  }
}

export function writeLastSquadId(squadId: string): void {
  try {
    localStorage.setItem(LAST_SQUAD_ID_KEY, squadId);
  } catch {
    // Nothing to do — the redirect just falls back to the first squad.
  }
}
