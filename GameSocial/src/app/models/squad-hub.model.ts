import { SquadModel } from './squad.model';

/** Domain.Enums.SquadInviteStatus. */
export type SquadInviteStatusName = 'Pending' | 'Accepted' | 'Declined';

/** Domain.Enums.SquadMemberStatus. */
export type SquadMembershipStatusName = 'Active' | 'Pending';

/** Domain.Responses.SquadInviteResponse — "Vermillion Six · tunaFPS invited you". */
export interface SquadInviteModel {
  id: string;
  squadId: string;
  squadName: string;
  squadIconUrl?: string;
  squadMemberCount: number;
  inviterUserId: string;
  inviterUsername: string;
  inviteeUserId: string;
  inviteeUsername: string;
  status: SquadInviteStatusName;
  createdAt: string;
}

/** Domain.Responses.SquadJoinResponse — Pending = waiting for a founder/admin. */
export interface SquadJoinResultModel {
  squadId: string;
  status: SquadMembershipStatusName;
}

/** Domain.Responses.SquadJoinRequestResponse. */
export interface SquadJoinRequestModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  xp: number;
  requestedAt: string;
}

export interface SquadSessionAttendeeModel {
  userId: string;
  username: string;
  avatarUrl?: string;
}

/** Domain.Responses.SquadSessionResponse — "Open sessions right now". */
export interface SquadSessionModel {
  id: string;
  squadId: string;
  squadName: string;
  squadIconUrl?: string;
  hostUserId: string;
  hostUsername: string;
  title: string;
  note?: string;
  gameId?: number;
  gameName?: string;
  startsAt: string;
  endedAt?: string;
  isLive: boolean;
  capacity: number;
  rsvpCount: number;
  isGoing: boolean;
  attendees: SquadSessionAttendeeModel[];
}

export interface SquadSessionRsvpModel {
  sessionId: string;
  going: boolean;
  rsvpCount: number;
}

export interface CreateSquadSessionRequest {
  title: string;
  note?: string;
  gameId?: number;
  startsAt?: string;
  isLive: boolean;
  capacity: number;
}

/** Domain.Responses.SquadWeeklyStatsResponse — "3 clips this week", "2 trophies", "You rank #4". */
export interface SquadWeeklyStatsModel {
  squadId: string;
  clipsThisWeek: number;
  trophiesThisWeek: number;
  myWeeklyRank?: number | null;
  myWeeklyXp: number;
}

/** Domain.Responses.SquadDiscoverResponse — "Squads looking for you · Based on Ashfall · 62 h". */
export interface SquadDiscoverModel {
  basedOnGameId?: number;
  basedOnGameName?: string;
  basedOnHours?: number;
  totalCount: number;
  items: SquadModel[];
  requestedSquadIds: string[];
}

/** Domain.Responses.SquadFriendOnlineResponse. */
export interface SquadFriendOnlineModel {
  userId: string;
  username: string;
  avatarUrl?: string;
  presence: 'online' | 'away' | 'dnd' | 'offline';
  lastSeenAt?: string;
  currentActivity?: string;
  inVoiceSquadId?: string;
  inVoiceSquadName?: string;
}

/** Domain.Responses.SquadGameOptionResponse — "Kütüphanende · 62 sa" / "Popüler · 84k oyuncu" / "Yeni çıkan". */
export interface SquadGameOptionModel {
  id: number;
  name: string;
  coverImageUrl: string;
  kind: 'library' | 'popular' | 'new';
  hoursPlayed?: number | null;
  followerCount: number;
}

export interface SquadGameOptionsModel {
  libraryCount: number;
  totalCount: number;
  items: SquadGameOptionModel[];
}
