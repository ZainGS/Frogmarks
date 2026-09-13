import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlayerCartService {
  pendingCart: Blob | null = null;
}
