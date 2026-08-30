import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';
import { BACKOFFICE_SECTIONS } from '../../constants/permissions';

@Component({
  selector: 'app-backoffice-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './backoffice-layout.html',
  styleUrl: './backoffice-layout.scss',
})
export class BackofficeLayout {
  protected readonly authService = inject(AuthService);
  protected readonly sections = BACKOFFICE_SECTIONS;
}
