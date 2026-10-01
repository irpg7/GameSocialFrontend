import { SquadModel } from '../../../models/squad.model';
import { SquadFriendOnlineModel } from '../../../models/squad-hub.model';
import { environment } from '../../../../environments/environment';

const numberFormat = new Intl.NumberFormat('en-US');

/** 4820 → "4,820" — the design sets every number in en-US grouping. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** "SQUAD LEVEL 6 · 4,820 / 6,000" → bar width. */
export function levelPercent(squad: SquadModel): number {
  if (!squad.xpForNextLevel) {
    return 100;
  }
  return Math.max(0, Math.min(100, (squad.xp / squad.xpForNextLevel) * 100));
}

/** "7 members · Ashfall, Depths of Ur". */
export function squadMeta(squad: SquadModel): string {
  const members = plural(squad.memberCount, 'member', 'members');
  const games = squad.games.map((g) => g.name).join(', ');
  return games ? `${members} · ${games}` : members;
}

/** Discovery card meta: "12 members · 3 open slots" (ask to join) / "31 members · open". */
export function discoverMeta(squad: SquadModel): string {
  const members = plural(squad.memberCount, 'member', 'members');
  if (squad.openSlots <= 0) {
    return `${members} · full`;
  }
  if (squad.joinPolicy === 'Open') {
    return `${members} · open`;
  }
  return `${members} · ${plural(squad.openSlots, 'open slot', 'open slots')}`;
}

/** Session RSVPs only count as "in voice" once voice ships (environment.features.squadVoice). */
export function isInVoice(friend: SquadFriendOnlineModel): boolean {
  return environment.features.squadVoice && !!friend.inVoiceSquadName;
}

/** "In voice · Gece Vardiyası" / "Playing Neon Drift" / "Idle · 20 min". */
export function friendStatus(friend: SquadFriendOnlineModel): string {
  if (isInVoice(friend)) {
    return `In voice · ${friend.inVoiceSquadName}`;
  }
  if (friend.presence === 'away') {
    const minutes = friend.lastSeenAt
      ? Math.max(1, Math.round((Date.now() - new Date(friend.lastSeenAt).getTime()) / 60000))
      : null;
    return minutes ? `Idle · ${minutes} min` : 'Idle';
  }
  if (friend.currentActivity) {
    return `Playing ${friend.currentActivity}`;
  }
  return friend.presence === 'dnd' ? 'Do not disturb' : 'Online';
}
