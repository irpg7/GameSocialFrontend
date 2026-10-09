import { Component, input, output } from '@angular/core';
import { PostModel } from '../../../../models/post.model';
import { SquadModel } from '../../../../models/squad.model';
import { SheetModal } from '../../../../shared/sheet-modal/sheet-modal';
import { PostComposer } from '../../../feed/post-composer/post-composer';

/** "Post to squad": the feed composer in a sheet, locked to this squad, opened on the clip or screenshots tab. */
@Component({
  selector: 'app-squad-composer-sheet',
  imports: [SheetModal, PostComposer],
  template: `
    <app-sheet-modal title="Post to squad" [subtitle]="'Goes to ' + squad().name" (closed)="closed.emit()">
      <app-post-composer
        [preselectedSquadId]="squad().id"
        [lockedSquadName]="squad().name"
        [initialTab]="initialTab()"
        (posted)="posted.emit($event)" />
    </app-sheet-modal>
  `,
})
export class SquadComposerSheet {
  squad = input.required<SquadModel>();
  initialTab = input.required<'clip' | 'screenshots'>();
  posted = output<PostModel>();
  closed = output<void>();
}
