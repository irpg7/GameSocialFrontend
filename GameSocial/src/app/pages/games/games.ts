import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game/game.service';
import { GameModel } from '../../models/game.model';

@Component({
  selector: 'app-games',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './games.html',
  styleUrl: './games.scss'
})
export class Games implements OnInit {
  private gameService = inject(GameService);

  games: GameModel[] = [];
  filteredGames: GameModel[] = [];
  searchQuery: string = '';

  ngOnInit() {
    this.gameService.getGames().subscribe(data => {
      this.games = data;
      this.filteredGames = data;
    });
  }

  onSearch() {
    const query = this.searchQuery.toLowerCase().trim();
    this.filteredGames = !query
      ? this.games
      : this.games.filter(g => g.name.toLowerCase().includes(query));
  }
}
