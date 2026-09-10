import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { GameService } from '../../services/game/game.service';
import { GameModel } from '../../models/game.model';

@Component({
  selector: 'app-games',
  imports: [],
  templateUrl: './games.html',
  styleUrl: './games.scss',
})
export class Games implements OnInit {
  private gameService = inject(GameService);

  protected readonly games = signal<GameModel[]>([]);
  protected readonly searchQuery = signal('');

  protected readonly filteredGames = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const games = this.games();
    return query ? games.filter((game) => game.name.toLowerCase().includes(query)) : games;
  });

  ngOnInit(): void {
    this.gameService.getGames().subscribe({
      next: (games) => this.games.set(games),
      error: () => void 0,
    });
  }
}
