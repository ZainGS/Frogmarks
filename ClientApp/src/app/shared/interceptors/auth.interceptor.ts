import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService, private router: Router) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    console.log(req);

    // Skip token handling for certain endpoints
    if (req.url.includes("signin") || req.url.includes("email")) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !req.url.includes('auth/refresh-token')) {
          return this.handle401Error(req, next);
        } else if (error.status === 403) {
          this.router.navigateByUrl('/login');
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
          console.log(response);
          this.isRefreshing = false;
          this.refreshTokenSubject.next(response.body.accessToken);
          return next.handle(this.addTokenHeader(request, response.body.accessToken));
        }),
        catchError((err) => {
          console.log(err);
          this.isRefreshing = false;
          this.router.navigateByUrl('/login');
          return throwError(err);
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter(token => token != null),
        take(1),
        switchMap(jwt => next.handle(this.addTokenHeader(request, jwt)))
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
