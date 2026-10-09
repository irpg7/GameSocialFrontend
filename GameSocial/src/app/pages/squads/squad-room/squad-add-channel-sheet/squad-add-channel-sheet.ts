import { Component, inject, input, output, signal } from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { finalize } from 'rxjs';
import { SquadService } from '../../../../services/squad/squad.service';
import { SquadChannelModel } from '../../../../models/squad.model';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { extractApiErrorMessage } from '../../../../shared/api-error.util';

/** "Kanal ekle" sheet (managers): one name field; emits the created channel. */
@Component({
  selector: 'app-squad-add-channel-sheet',
  imports: [FormField, SheetModal],
  template: `
    <app-sheet-modal title="Kanal ekle" subtitle="Kanallar squad'ın kliplerini ve sohbetini ayrı tutar" (closed)="closed.emit()">
      <div class="form-group">
        <label for="new-channel-name">Kanal adı</label>
        <input
          id="new-channel-name"
          type="text"
          [formField]="nameField"
          placeholder="builds"
          (keydown.enter)="$event.preventDefault(); add()">
      </div>
      @if (error(); as message) {
        <p class="form-error" role="alert">{{ message }}</p>
      }
      <div class="composer-footer">
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Vazgeç</button>
        <button type="button" class="btn btn-primary" [disabled]="isAdding()" (click)="add()">
          {{ isAdding() ? 'Ekleniyor…' : 'Kanal ekle' }}
        </button>
      </div>
    </app-sheet-modal>
  `,
  styleUrl: './squad-add-channel-sheet.scss',
})
export class SquadAddChannelSheet {
  private squadService = inject(SquadService);

  squadId = input.required<string>();
  created = output<SquadChannelModel>();
  closed = output<void>();

  private readonly name = signal('');
  protected readonly nameField = form(this.name, (path) => maxLength(path, 50));
  protected readonly isAdding = signal(false);
  protected readonly error = signal<string | null>(null);

  protected add(): void {
    const name = this.name().trim();
    if (!name || this.isAdding()) {
      return;
    }
    this.error.set(null);
    this.isAdding.set(true);
    this.squadService
      .createChannel(this.squadId(), name)
      .pipe(finalize(() => this.isAdding.set(false)))
      .subscribe({
        next: (channel) => this.created.emit(channel),
        error: (err: unknown) => this.error.set(extractApiErrorMessage(err, 'Kanal oluşturulamadı.')),
      });
  }
}
