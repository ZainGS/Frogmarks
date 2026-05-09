import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppSyncStatus = 'synced' | 'paused' | 'offline' | 'error';

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  readonly status$ = new BehaviorSubject<AppSyncStatus>('synced');

  pause()    { this.status$.next('paused'); }
  sync()     { this.status$.next('synced'); }
  goOffline(){ this.status$.next('offline'); }
  error()    { this.status$.next('error'); }
}
