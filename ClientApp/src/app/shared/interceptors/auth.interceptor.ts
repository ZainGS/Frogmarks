import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, take, skip } from 'rxjs/operators';
import { AuthService } from '../services/auth/auth.service';
import { SyncStatusService } from '../services/auth/sync-status.service';
import { ConfigurationService } from '../services/api/configuration.service';


@Injectable({
  providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  constructor(
    private authService: AuthService,
    private syncStatusService: SyncStatusService,
    private configService: ConfigurationService,
  ) { }

  /** Requests to our own API (absolute apiUri or a relative /api path) — never third-party hosts such as blob storage,
   *  where a custom header would force a CORS preflight they may reject. */
  private _isApi(url: string): boolean {
    const api = (this.configService.systemConfiguration.apiUri ?? '').replace(/\/+$/, '');
    return (!!api && url.startsWith(api)) || url.startsWith('/api') || url.startsWith('api/');
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // CSRF guard: the server rejects cookie-authenticated, state-changing API calls without this header (a cross-site page
    // can't send it without a CORS preflight, which only our frontend origin passes).
    if (this._isApi(req.url)) req = req.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } });

    // Skip token handling for auth/email endpoints
    if (req.url.includes("signin") || req.url.includes("email")) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !req.url.includes('auth/refresh-token')) {
          return this.handle401Error(req, next);
        } else if (error.status === 403) {
          // 403 means authenticated but forbidden — always show reauth
          this.authService.triggerSessionExpired();
        }
        return throwError(error);
      })
    );
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.authService.refreshAuthToken().pipe(
        switchMap((response: any) => {
          // console.log(response);
          this.isRefreshing = false;
          this.refreshTokenSubject.next(response.body.accessToken);
          return next.handle(this.addTokenHeader(request, response.body.accessToken));
        }),
        catchError((err) => {
          this.isRefreshing = false;
          // Unblock all queued requests so they fail cleanly (not hang forever)
          this.refreshTokenSubject.next(null);
          // Silently drop to local mode — user can sign in via the header button
          this.syncStatusService.pause();
          return throwError(err);
        })
      );
    } else {
      // Skip the current null, then take the next emission (token or null=failed)
      return this.refreshTokenSubject.pipe(
        skip(1),
        take(1),
        switchMap(jwt => {
          if (!jwt) return throwError(() => new Error('Session expired'));
          return next.handle(this.addTokenHeader(request, jwt));
        })
      );
    }
  }

  private addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
    if (token && this.isSameOriginUrl(request)) {
      return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
    return request;
  }

  private isSameOriginUrl(req: HttpRequest<any>): boolean {
    if (req.url.startsWith(`${window.location.origin}/`)) {
      return true;
    }
    if (req.url.startsWith(`//${window.location.host}/`)) {
      return true;
    }
    if (/^\/[^\/].*/.test(req.url)) {
      return true;
    }
    return false;
  }
}
