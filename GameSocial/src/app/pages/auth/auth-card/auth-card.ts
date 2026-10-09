import { Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

/**
 * The centred card every signed-out page uses (login, check inbox, verify email, forgot / reset
 * password): the swinging tavern sign, a heading with an optional accent word, a subtitle, then the
 * page's own content. A `[auth-footer]` element is projected below the body.
 */
@Component({
  selector: 'app-auth-card',
  imports: [NgOptimizedImage],
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.scss',
})
export class AuthCard {
  readonly heading = input.required<string>();
  /** Appended to the heading in the accent colour ("Welcome back to the **Tavern**"). */
  readonly accent = input<string>();
  readonly subtitle = input<string>();
}
