import { Injectable } from '@angular/core';
import { ConfigurationService } from '../api/configuration.service';
import { MsalService } from '@azure/msal-angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { NotifyService } from '../notify/notify.service';
import { ApiService } from '../api/api.service';
import { Observable, of, switchMap, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends ApiService{

  constructor(http: HttpClient, configService: ConfigurationService, router: Router, notify: NotifyService) {
    super(http, configService, router, notify);
  }

  private userId: string | null = null;

  sendSignInEmail(email: string) {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    localStorage.clear();
    return this.http.post(`${this.apiUrl}/api/email/sendsignin`, JSON.stringify(email), { headers });
    //return this.create('api/email/sendsignin', email);
  }

  // These validate/refresh methods also grab the uid for the client, so I can fetch entities by userId in app.
  validateEmailToken(token: string) {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/email/validate`, JSON.stringify(token), { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: any) => {
          console.log(response);
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
          console.log(response);
          const userId = response.resultObject?.userId;
          if (userId) {
            this.setUserId(userId);
          }
        })
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
