import { PostTypeName } from './post.model';
import { ReportTargetType } from './moderation.model';

/** Domain.Enums.NotificationType. */
export type NotificationTypeName =
  | 'Followed'
  | 'PostCommented'
  | 'CommentReplied'
  | 'PostLiked'
  | 'PostMarkedUseful'
  | 'SquadInvited'
  | 'SquadJoinRequested'
  | 'SquadJoinApproved'
  | 'ContentRemoved'
  | 'ReportResolved'
  | 'AchievementUnlocked';

/**
 * Domain.Responses.NotificationResponse. Likes, "useful" votes and join requests coalesce into one unread row:
 * `actor*` is the latest person and `actorCount` how many there are. `createdAt` is the latest event.
 */
export interface AppNotification {
  id: string;
  type: NotificationTypeName;
  actorId: string | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  actorCount: number;
  postId: string | null;
  postType: PostTypeName | null;
  /** Non-clip posts open on their author's profile. */
  postAuthorId: string | null;
  postTitle: string | null;
  commentId: string | null;
  commentSnippet: string | null;
  squadId: string | null;
  squadName: string | null;
  targetType: ReportTargetType | null;
  /** ContentRemoved: the moderator's reason. */
  text: string | null;
  createdAt: string;
  isRead: boolean;
}

/** Domain.Responses.UnreadCountsResponse — topbar badges; the user hub pushes the same shape as `unreadCount`. */
export interface UnreadCounts {
  notifications: number;
  /** Conversations with unread messages. */
  messages: number;
}
