import { Service, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';

/** Domain.Responses.XpAwardResponse — the server's real XP amounts. */
export interface XpAwardModel {
  key: 'clip' | 'review' | 'screenshots' | 'devlog' | 'interaction' | 'trophy';
  label: string;
  amount: number;
}

/**
 * `GET /api/config/xp-awards`, fetched once. Every "+120 XP" / "worth 200 XP"
 * hint reads from here so copy never drifts from what the server awards.
 */
@Service()
export class XpAwardsService {
  private http = inject(HttpClient);

  readonly awards = toSignal(this.http.get<XpAwardModel[]>('/api/config/xp-awards'), { initialValue: [] });

  /** Amount for one key, 0 until loaded. */
  amount(key: XpAwardModel['key']): number {
    return this.byKey()[key] ?? 0;
  }

  private byKey = computed(() => Object.fromEntries(this.awards().map((a) => [a.key, a.amount])) as Record<string, number>);
}
