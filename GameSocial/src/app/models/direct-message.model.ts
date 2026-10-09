/** Domain.Responses.DirectMessageResponse. */
export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/** Why a conversation is read-only: a block either way, or the other side's "who can message you" setting. */
/** `Deleted`: the other person deleted their account — the history stays readable. */
export type ConversationReadOnlyReason = 'Blocked' | 'Privacy' | 'Deleted';

/** Domain.Responses.ConversationResponse — a row of the inbox and the thread header. */
export interface Conversation {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  /** Presence with the other user's privacy applied ('online' | 'away' | 'dnd' | 'offline'). */
  otherPresence: string;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  /** Read receipt: the other side has read everything up to here. */
  otherLastReadAt: string | null;
  canSend: boolean;
  readOnlyReason: ConversationReadOnlyReason | null;
}

/** Domain.Responses.DirectMessagePageResponse — `items` oldest first; page older with `before`. */
export interface DirectMessagePage {
  items: DirectMessage[];
  hasMore: boolean;
}

/** Same cap as Domain.Entities.DirectMessage.BodyMaxLength. */
export const DIRECT_MESSAGE_MAX = 2000;
