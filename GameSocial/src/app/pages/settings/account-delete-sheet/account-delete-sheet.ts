import { Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import { AccountService } from '../../../services/account/account.service';
import { SheetModal } from '../../../shared/sheet-modal/sheet-modal';
import { fieldError, serverError, submitError } from '../../../shared/form-errors';

/**
 * "Delete account" confirmation: password re-check, then the account is scheduled for deletion in 14 days.
 * The server signs out every session, so on success the user lands on /login with a note on how to cancel.
 * A captain who still leads a squad with other members gets the server's message listing those squads.
 */
@Component({
  selector: 'app-account-delete-sheet',
  imports: [SheetModal, FormField, FormRoot],
  templateUrl: './account-delete-sheet.html',
  styleUrl: './account-delete-sheet.scss',
})
export class AccountDeleteSheet {
  private account = inject(AccountService);
  private router = inject(Router);

  readonly closed = output<void>();

  protected readonly fieldError = fieldError;
  protected readonly submitError = submitError;

  private readonly model = signal({ password: '' });

  protected readonly deleteForm = form(
    this.model,
    (path) => {
      required(path.password, { message: 'Enter your password to confirm.' });
    },
    {
      submission: {
        action: async () => {
          let scheduledFor: string;
          try {
            scheduledFor = await firstValueFrom(this.account.requestDeletion(this.model().password));
          } catch (err) {
            return serverError(err, 'Could not delete your account.');
          }
          await this.router.navigate(['/login'], { queryParams: { notice: 'deletion-scheduled', until: scheduledFor } });
          return undefined;
        },
      },
    },
  );
}
