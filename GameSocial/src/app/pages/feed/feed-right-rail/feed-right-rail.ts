import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { SquadService } from '../../../services/squad/squad.service';
import { MeService } from '../../../services/me/me.service';
import { SquadModel } from '../../../models/squad.model';

const MAX_ACTIVITY_SQUADS = 3;
const MAX_ACTIVITY_ITEMS = 6;

interface ActivityItem {
  squadId: number;
  squadName: string;
  username: string;
  body?: string;
  sharedPostType?: string;
  createdAt: string;
}

/**
 * Feed-page-only right rail: XP progress card + a real "squad activity"
 * feed built from the most recent messages in each of your squads' first
 * channel (no dedicated activity-feed endpoint exists server-side, so this
 * is genuine chat activity rather than a synthesized achievement/leaderboard
 * timeline — see the Phase 1 report for the full rationale).
 */
@Component({
  selector: 'app-feed-right-rail',
  imports: [RouterLink, DatePipe],
  templateUrl: './feed-right-rail.html',
  styleUrl: './feed-right-rail.scss',
})
export class FeedRightRail implements OnInit {
  private squadService = inject(SquadService);
  protected readonly meService = inject(MeService);

  protected readonly activityItems = signal<ActivityItem[]>([]);
  protected readonly isLoadingActivity = signal(true);

  ngOnInit(): void {
    this.squadService
      .getMine()
      .pipe(
        map((squads) => squads.slice(0, MAX_ACTIVITY_SQUADS)),
        switchMap((squads) => this.loadActivityForSquads(squads)),
      )
      .subscribe({
        next: (items) => {
          this.activityItems.set(items);
          this.isLoadingActivity.set(false);
        },
        error: () => this.isLoadingActivity.set(false),
      });
  }

  private loadActivityForSquads(squads: SquadModel[]) {
    if (squads.length === 0) {
      return of<ActivityItem[]>([]);
    }

    const requests = squads.map((squad) => {
      const channel = [...squad.channels].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (!channel) {
        return of<ActivityItem[]>([]);
      }
      return this.squadService.listMessages(squad.id, channel.id, 1, 3).pipe(
        map((page) =>
          page.items.map(
            (message): ActivityItem => ({
              squadId: squad.id,
              squadName: squad.name,
              username: message.username,
              body: message.body,
              sharedPostType: message.sharedPost?.postType,
              createdAt: message.createdAt,
            }),
          ),
        ),
      );
    });

    return forkJoin(requests).pipe(
      map((groups) =>
        groups
          .flat()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, MAX_ACTIVITY_ITEMS),
      ),
    );
  }
}
