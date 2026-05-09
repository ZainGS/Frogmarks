import { Injectable } from '@angular/core';

const LOCAL_LIBRARY_KEY = 'frogmarks-local-library-id';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private _userId: string | null = null;

  /** UUID generated once per browser install. Never changes. Used for linking/dedup, not path scoping. */
  getLocalLibraryId(): string {
    let id = localStorage.getItem(LOCAL_LIBRARY_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LOCAL_LIBRARY_KEY, id);
    }
    return id;
  }

  setUserId(userId: string): void { this._userId = userId; }
  clearUserId(): void { this._userId = null; }
  getUserId(): string | null { return this._userId; }
  isLoggedIn(): boolean { return this._userId !== null; }
}
