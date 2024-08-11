import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MsalService } from '@azure/msal-angular';
import { ConfigurationService } from './configuration.service';
import { NotifyService } from '../notify/notify.service';
import { ErrorResultModel } from '../../models/error-result.model';
import { Roles } from '../../models/roles';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  apiUrl: string;
  scope: string;
  public Url = '/assets/config.json';
  constructor(public http: HttpClient, public configService: ConfigurationService, private router: Router, public notify: NotifyService) {
    this.apiUrl = this.configService.systemConfiguration.apiUri;
    this.scope = this.configService.systemConfiguration.roleScope;
  }

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<any>(`${this.apiUrl}/${endpoint}`).pipe(catchError((error) => this.handleError<T>(error)));
  }

  getAllById<T>(endpoint: string, id: string | number): Observable<T[]> {
    return this.http.get<T[]>(`${this.apiUrl}/${endpoint}/${id}`).pipe(catchError((error) => this.handleError<T>(error)));
  }

  create<T>(endpoint: string, model: T): Observable<T> {
    console.log(`${this.apiUrl}/${endpoint}`);
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, model).pipe(catchError((error) => this.handleError<T>(error)));
  }

  getById<T>(endpoint: string, id: string | number, options = {}): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}/${id}`, options).pipe(catchError((error) => this.handleError<T>(error)));
  }

  update<T>(endpoint: string, model: T): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}/${endpoint}`, model).pipe(catchError((error) => this.handleError<T>(error)));
  }

  delete<T>(endpoint: string, id: number): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}/${endpoint}/${id}`).pipe(catchError((error) => this.handleError<T>(error)));
  }

  uploadDocuments(endpoint: string, formData: FormData): Observable<HttpEvent<any>> {
    return this.http.post(`${this.apiUrl}/${endpoint}`, formData, { reportProgress: true, observe: 'events' }).pipe(catchError((error) => this.handleError<FormData>(error)));
  }

  downloadDocument<T>(endpoint: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${endpoint}`, { responseType: 'blob' })
      .pipe(catchError(error => this.handleError<T>(error)));
  }

  search<T>(
    endpoint: string,
    filter: string,
    sort: string,
    order: string = 'asc',
    pageIndex: number,
    pageSize: number): Observable<T> {
    if (order === '') {
      order = 'desc';
    }
    const requestUrl = `${this.apiUrl}/${endpoint}?${filter}&sort=${sort}&order=${order}&pageIndex=${pageIndex + 1}&pageSize=${pageSize}`;
    return this.http.get<any>(requestUrl).pipe(catchError(error => this.handleError<T>(error)));
  }

  downloadFile<T>(endpoint: string, id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${endpoint}/${id}`, { responseType: 'blob' })
      .pipe(catchError(error => this.handleError<T>(error)));
  }

  handleError<T>(error: any): Observable<never> {
    if (error.status === 401) {
      //excluding redirection if were are displaying error messsage in the UI for anything
      if (error.url.includes('/api/whatever')) {
        return throwError(() => error);
      }
      else {
        this.router.navigate(['/unauthorized']);
      }
      return throwError(() => error);
    }

    if (error.status === 500) {
      this.notify.error();
      return throwError(() => error);
    }

    if (error.error?.errors != null) {
      this.notify.error();
      return throwError(() => error);
    }

    const resultModel = { ...error.error } as ErrorResultModel<T>;
    if (resultModel.resultType == 3) {
      return throwError(() => error);
    }
    this.notify.error(resultModel.extendedMessage);
    return throwError(() => error);
  }

  /*
  hasRole(role: string): boolean {
    let activeAccount = this.msalService.instance.getActiveAccount()
    if (!activeAccount && this.msalService.instance.getAllAccounts().length > 0) {
      activeAccount = this.msalService.instance.getAllAccounts()[0];
    }

    if (!activeAccount?.idTokenClaims?.roles) {
      //console.log('Token does not have roles claim. Please ensure that your account is assigned to an app role and then sign-out and sign-in again.');
      return false;
    }

    return activeAccount?.idTokenClaims?.roles?.includes(role);
  }
    

  getCurrentUserId(): string {
    return this.msalService.instance.getActiveAccount()?.idTokenClaims?.oid ?? ''
  }

  getIdToken(): string | undefined {
    let activeAccount = this.msalService.instance.getActiveAccount();

    if (!activeAccount && this.msalService.instance.getAllAccounts().length > 0) {
      activeAccount = this.msalService.instance.getAllAccounts()[0];
    }

    return activeAccount?.idToken;

  }

  getCurrentUserRoles(): string[] | undefined {
    let activeAccount = this.msalService.instance.getActiveAccount()
    if (!activeAccount && this.msalService.instance.getAllAccounts().length > 0) {
      activeAccount = this.msalService.instance.getAllAccounts()[0];
    }

    return activeAccount?.idTokenClaims?.roles;
  }
  

  onlyAdminUserAllowed(): boolean {

    var roles = this.getCurrentUserRoles();
    if (roles === null || roles?.length === 0) {
      return false;
    }

    if (roles?.includes(Roles.Admin) || roles?.includes(Roles.User)) {
      return true;
    }
    return false;
  }

  onlyWardenAllowed(): boolean {

    var roles = this.getCurrentUserRoles();
    if (roles === null || roles?.length === 0) {
      return false;
    }

    if (roles?.includes(Roles.Admin)) {
      return true;
    }
    return false;
  }

  getCurrentUserFullName(): string {
    let activeAccount = this.msalService.instance.getActiveAccount()
    if (!activeAccount && this.msalService.instance.getAllAccounts().length > 0) {
      activeAccount = this.msalService.instance.getAllAccounts()[0];
    }

    return activeAccount?.idTokenClaims?.name ?? '';
  }

  checkIfAuthenticated(): boolean {
    return this.msalService.instance.getAllAccounts().length > 0;
  }
  */
  normalizeApiUri(apiUri: string): string {
    // This will replace any double slashes (or more) with a single slash, except after the colon of the protocol part
    return apiUri.replace(/([^:]\/)\/+/g, "$1");
  }

}
