import { AppNotification } from '../../models/notification-center.model';
import { ReportTargetType } from '../../models/moderation.model';

/** One notification as display parts: who (bold), what, and an optional quote line. */
export interface NotificationText {
  actor: string | null;
  text: string;
  quote: string | null;
}

const TARGET_LABELS: Record<ReportTargetType, string> = {
  Post: 'post',
  Comment: 'comment',
  User: 'profile',
  SquadMessage: 'squad message',
  Squad: 'squad',
  DirectMessage: 'message',
};

function others(n: AppNotification): string {
  const more = n.actorCount - 1;
  return more > 0 ? ` and ${more} ${more === 1 ? 'other' : 'others'}` : '';
}

function postName(n: AppNotification): string {
  return n.postTitle ? `“${n.postTitle}”` : n.postType === 'Clip' ? 'clip' : 'post';
}

/** Copy for a notification — built from its type so the server only sends ids and names. */
export function describeNotification(n: AppNotification): NotificationText {
  const actor = n.actorUsername ? `@${n.actorUsername}` : null;
  switch (n.type) {
    case 'Followed':
      return { actor, text: 'started following you', quote: null };
    case 'PostCommented':
      return { actor, text: `commented on your ${postName(n)}`, quote: n.commentSnippet };
    case 'CommentReplied':
      return { actor, text: 'replied to your comment', quote: n.commentSnippet };
    case 'PostLiked':
      return { actor, text: `${others(n)} liked your ${postName(n)}`.trimStart(), quote: null };
    case 'PostMarkedUseful':
      return { actor, text: `${others(n)} found your review ${n.postTitle ? `“${n.postTitle}” ` : ''}useful`.trimStart(), quote: null };
    case 'SquadInvited':
      return { actor, text: `invited you to ${n.squadName ?? 'a squad'}`, quote: null };
    case 'SquadJoinRequested':
      return { actor, text: `${others(n)} asked to join ${n.squadName ?? 'your squad'}`.trimStart(), quote: null };
    case 'SquadJoinApproved':
      return { actor, text: `approved your request — you're in ${n.squadName ?? 'the squad'}`, quote: null };
    case 'ContentRemoved':
      return {
        actor: null,
        text: `A moderator removed your ${n.targetType ? TARGET_LABELS[n.targetType] : 'content'}.`,
        quote: n.text ? `Reason: ${n.text}` : null,
      };
    case 'ReportResolved':
      return { actor: null, text: 'We reviewed your report and took action. Thanks for flagging it.', quote: null };
  }
}

/** Where clicking the notification goes; null = nowhere (it's just marked read). */
export function notificationLink(n: AppNotification): string[] | null {
  switch (n.type) {
    case 'Followed':
      return n.actorId ? ['/profile', n.actorId] : null;
    case 'SquadInvited':
      return ['/squads'];
    case 'SquadJoinRequested':
    case 'SquadJoinApproved':
      return n.squadId ? ['/squads', n.squadId] : null;
    case 'ContentRemoved':
    case 'ReportResolved':
      return null;
    default:
      // Clips open in the player; every other post on its permalink.
      if (n.postId && n.postType === 'Clip') return ['/clips', n.postId];
      if (n.postId) return ['/posts', n.postId];
      return n.postAuthorId ? ['/profile', n.postAuthorId] : null;
  }
}
