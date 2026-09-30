/**
 * Time/number labels for the squad room, in the exact wording the design uses
 * per surface (the mock mixes Turkish and English copy on purpose):
 *  - sidebar activity: "az önce", "12 dk önce", "3 sa önce", "dün"
 *  - clip cards: "21:07" (today), "dün", "2 gün"
 *  - roster (offline): "2 gün önce çıktı", "5 saat önce çıktı"
 *  - screens activity / pinned guide: "3 h", "2 h ago"
 */

function minutesSince(iso: string): number | null {
  const then = new Date(iso).getTime();
  return Number.isFinite(then) ? Math.max(0, Math.floor((Date.now() - then) / 60000)) : null;
}

function dayDiff(iso: string): number {
  const date = new Date(iso);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

/** `21:04` */
export function clockTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** Sidebar activity line: "az önce" / "12 dk önce" / "3 sa önce" / "dün" / "4 gün önce". */
export function agoTr(iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes === null) {
    return '';
  }
  if (minutes < 5) {
    return 'az önce';
  }
  if (minutes < 60) {
    return `${minutes} dk önce`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} sa önce`;
  }
  const days = dayDiff(iso);
  return days <= 1 ? 'dün' : `${days} gün önce`;
}

/** Clip card meta: "21:07" today, "dün", then "2 gün". */
export function clipAge(iso: string): string {
  const days = dayDiff(iso);
  if (days <= 0) {
    return clockTime(iso);
  }
  return days === 1 ? 'dün' : `${days} gün`;
}

/** Roster offline status: "2 gün önce çıktı", "5 saat önce çıktı", "12 dk önce çıktı". */
export function leftAgoTr(iso: string | undefined | null): string {
  if (!iso) {
    return 'çevrimdışı';
  }
  const minutes = minutesSince(iso);
  if (minutes === null) {
    return 'çevrimdışı';
  }
  if (minutes < 60) {
    return `${Math.max(minutes, 1)} dk önce çıktı`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} saat önce çıktı`;
  }
  return `${Math.floor(hours / 24)} gün önce çıktı`;
}

/** Screens activity: "3 h", "12 min", "2 d". */
export function agoShortEn(iso: string): string {
  const minutes = minutesSince(iso);
  if (minutes === null) {
    return '';
  }
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d`;
}

/** Pinned guide byline: "updated 2 h ago". */
export function agoEn(iso: string): string {
  const short = agoShortEn(iso);
  return short === 'now' ? 'just now' : `${short} ago`;
}

/** Founded month for the banner meta: "Mart’ta kuruldu". */
export function foundedTr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  // Turkish locative suffix follows vowel harmony and the final consonant.
  const suffix: Record<string, string> = {
    Ocak: '’ta', Şubat: '’ta', Mart: '’ta', Nisan: '’da', Mayıs: '’ta', Haziran: '’da',
    Temmuz: '’da', Ağustos: '’ta', Eylül: '’de', Ekim: '’de', Kasım: '’da', Aralık: '’ta',
  };
  const month = months[date.getMonth()];
  const sameYear = date.getFullYear() === new Date().getFullYear();
  // A year's locative suffix depends on how the number is read aloud, so older squads use the
  // suffix-free "kuruluş: Mart 2025" form instead.
  return sameYear ? `${month}${suffix[month]} kuruldu` : `kuruluş: ${month} ${date.getFullYear()}`;
}

/** `1840` → `1,840` — the board's thousands separator. */
export function thousands(value: number): string {
  return value.toLocaleString('en-US');
}

/** `0:18` */
export function clock(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
