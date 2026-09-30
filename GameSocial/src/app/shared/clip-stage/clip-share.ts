import { PostModel } from '../../models/post.model';

/**
 * "↗ share" on every clip surface: the native share sheet where the browser
 * has one, otherwise the Clip Player link is copied to the clipboard.
 * Resolves to the message the caller should toast (null when the user
 * dismissed the native sheet).
 */
export async function shareClip(post: PostModel): Promise<string | null> {
  const url = `${location.origin}/clips/${post.id}`;
  const title = post.caption?.trim() || post.gameName || 'Clip';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'Bağlantı kopyalandı.';
  } catch {
    return url;
  }
}
