/** Domain.Enums.ReportTargetType — what a report / moderation action points at. */
export type ReportTargetType = 'Post' | 'Comment' | 'User' | 'SquadMessage' | 'Squad' | 'DirectMessage';

/** Domain.Enums.ReportReason. */
export type ReportReason =
  | 'Spam'
  | 'Harassment'
  | 'HateSpeech'
  | 'Nudity'
  | 'Violence'
  | 'Cheating'
  | 'Spoiler'
  | 'Impersonation'
  | 'Other';

/** Report sheet options, in display order. */
export const REPORT_REASONS: { key: ReportReason; label: string; hint: string }[] = [
  { key: 'Spam', label: 'Spam', hint: 'Ads, scams, repeated junk' },
  { key: 'Harassment', label: 'Harassment or bullying', hint: 'Targets or insults someone' },
  { key: 'HateSpeech', label: 'Hate speech', hint: 'Attacks a group of people' },
  { key: 'Nudity', label: 'Nudity or sexual content', hint: '' },
  { key: 'Violence', label: 'Violence or threats', hint: '' },
  { key: 'Cheating', label: 'Cheating or exploits', hint: 'Hacks, boosting, account selling' },
  { key: 'Spoiler', label: 'Unmarked spoiler', hint: '' },
  { key: 'Impersonation', label: 'Impersonation', hint: 'Pretends to be someone else' },
  { key: 'Other', label: 'Something else', hint: 'Tell us in the note' },
];

export const REPORT_NOTE_MAX = 500;

/** What the report sheet needs to know about the thing being reported. */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Shown in the sheet subtitle, e.g. "@kaan_rush's comment". */
  label: string;
}

/** Domain.Enums.ReportStatus. */
export type ReportStatus = 'Open' | 'Resolved' | 'Dismissed';

/** Domain.Enums.ModerationActionType. */
export type ModerationActionType = 'Dismiss' | 'RemoveContent' | 'RestoreContent' | 'BanUser' | 'UnbanUser' | 'AutoHide';

/** Domain.Enums.BanDuration. */
export type BanDuration = 'OneDay' | 'SevenDays' | 'ThirtyDays' | 'Permanent';

export const BAN_DURATIONS: { key: BanDuration; label: string }[] = [
  { key: 'OneDay', label: '1 day' },
  { key: 'SevenDays', label: '7 days' },
  { key: 'ThirtyDays', label: '30 days' },
  { key: 'Permanent', label: 'Permanent' },
];

/** Domain.Responses.ModerationTargetPreviewResponse. */
export interface ModerationTargetPreview {
  exists: boolean;
  title?: string | null;
  text?: string | null;
  thumbnailUrl?: string | null;
  authorId?: string | null;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  authorIsBanned: boolean;
  authorBanEndsAt?: string | null;
  postId?: string | null;
  postType?: string | null;
  squadId?: string | null;
  squadName?: string | null;
  channelId?: string | null;
  createdAt?: string | null;
  isRemoved: boolean;
  removedReason?: string | null;
}

/** Domain.Responses.ModerationActionResponse. */
export interface ModerationAction {
  id: string;
  action: ModerationActionType;
  moderatorId?: string | null;
  /** null = the system (auto-hide). */
  moderatorUsername?: string | null;
  reason?: string | null;
  details?: string | null;
  createdAt: string;
}

/** Domain.Responses.ModerationQueueItemResponse — every report about one target, grouped. */
export interface ModerationQueueItem {
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  reasons: { reason: ReportReason; count: number }[];
  latestNote?: string | null;
  latestReportedAt: string;
  status: ReportStatus;
  preview: ModerationTargetPreview;
  history: ModerationAction[];
}

export interface ModerationQueueQuery {
  status: 'Open' | 'Closed';
  targetType?: ReportTargetType | '';
  page?: number;
  pageSize?: number;
}

/** Domain.Responses.BlockedUserResponse. */
export interface BlockedUser {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  blockedAt: string;
}
