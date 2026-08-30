import { Component, inject } from '@angular/core';
import { NotificationService } from '../../services/notification/notification.service';

@Component({
  selector: 'app-toast-list',
  templateUrl: './toast-list.html',
  styleUrl: './toast-list.scss',
})
export class ToastList {
  protected readonly notificationService = inject(NotificationService);
}
