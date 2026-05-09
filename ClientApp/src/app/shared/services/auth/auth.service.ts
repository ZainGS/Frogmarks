import { Injectable } from '@angular/core';
import { ConfigurationService } from '../api/configuration.service';
import { MsalService } from '@azure/msal-angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { NotifyService } from '../notify/notify.service';
import { ApiService } from '../api/api.service';
import { Observable, of, Subject, switchMap, tap } from 'rxjs';
import { ProfileService } from './profile.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends ApiService{

  constructor(
    http: HttpClient,
    configService: ConfigurationService,
    router: Router,
    notify: NotifyService,
    private _profileService: ProfileService,
  ) {
    super(http, configService, router, notify);
  }

  public userId: string | null = null;

  /** Emits when the session has expired and the refresh-token attempt also failed. */
  readonly sessionExpired$ = new Subject<void>();

  triggerSessionExpired(): void {
    this.sessionExpired$.next();
  }

  sendSignInEmail(email: string) {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    localStorage.clear();
    return this.http.post(`${this.apiUrl}/api/email/sendsignin`, JSON.stringify(email), { headers });
  }

  sendReauthCode(email: string) {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post(`${this.apiUrl}/api/email/send-reauth-code`, JSON.stringify(email), { headers });
  }

  verifyReauthCode(email: string, code: string) {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<{ resultObject: string; resultType: number }>(
      `${this.apiUrl}/api/email/verify-reauth-code`,
      { email, code },
      { headers, withCredentials: true }
    ).pipe(
      tap(res => { if (res?.resultObject) this.setUserId(res.resultObject); })
    );
  }

  // These validate/refresh methods also grab the uid for the client, so I can fetch entities by userId in app.
  validateEmailToken(token: string) {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/email/validate`, JSON.stringify(token), { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: any) => {
          // console.log(response);
          const userId = response.resultObject?.userId;
          if (userId) {
            this.setUserId(userId);
          }
        })
      );
  }

  refreshAuthToken() {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/auth/refresh-token`, {}, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: any) => {
          // console.log(response);
          const userId = response.resultObject?.userId;
          if (userId) {
            this.setUserId(userId);
          }
        })
      );
  }

  /** Hits the protected user-id endpoint to confirm the session is live. Never uses cache. */
  verifySession(): Observable<string | null> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.get<{ userId: string }>(`${this.apiUrl}/api/auth/user-id`, { headers, withCredentials: true })
      .pipe(
        tap(response => { if (response.userId) this.setUserId(response.userId); }),
        switchMap(response => of(response.userId ?? null))
      );
  }

  getUserId(): Observable<string | null> {
    if (this.userId) {
      return of(this.userId);
    }

    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      this.userId = storedUserId;
      return of(this.userId);
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.get<{ userId: string }>(`${this.apiUrl}/api/auth/user-id`, { headers, withCredentials: true })
      .pipe(
        tap(response => {
          const userId = response.userId;
          if (userId) {
            this.setUserId(userId);
          }
        }),
        switchMap(response => of(response.userId))
      );
  }

  private setUserId(userId: string) {
    this.userId = userId;
    localStorage.setItem('userId', userId);
    this._profileService.setUserId(userId);
  }

  logout(): Observable<void> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<void>(`${this.apiUrl}/api/auth/logout`, {}, { headers, withCredentials: true }).pipe(
      tap(() => {
        this.userId = null;
        localStorage.removeItem('userId');
        this._profileService.clearUserId();
      })
    );
  }

  /*
  login(email: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/auth/login`, JSON.stringify({ email }), { headers, withCredentials: true });
  }
  */
}
