import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';
import { ConfigurationService } from '../api/configuration.service';
import { NotifyService } from '../notify/notify.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { Team } from '../../models/teams/team.model';

@Injectable({
  providedIn: 'root'
})
export class TeamService extends ApiService {

  constructor(http: HttpClient, configService: ConfigurationService, router: Router, notify: NotifyService) {
    super(http, configService, router, notify);
  }

  // Teams
  createTeam(newTeam: Team) {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/team`, JSON.stringify(newTeam), { headers, withCredentials: true });
  }

  getTeamById(id: number): Observable<Team> {
    return this.get<Team>(`Team/${id}`);
  }

  getAllTeams(): Observable<any> {
    return this.http.get<Team[]>(`${this.apiUrl}/api/team`, { withCredentials: true });
  }

  searchTeams(filterQuery: string = '', sortBy: string = 'name', sortDirection: string = 'desc', pageIndex: number = 0, pageSize: number = 10): Observable<any> {
    let params = new HttpParams()
      .set('filterQuery', filterQuery)
      .set('sortBy', sortBy)
      .set('sortDirection', sortDirection)
      .set('pageIndex', pageIndex.toString())
      .set('pageSize', pageSize.toString());

    return this.http.get<Team[]>(`${this.apiUrl}/api/team/search`, { params, withCredentials: true });
  }

  getTeamsByUserId(userId: string): Observable<Team[]> {
    return this.get<Team[]>(`api/team/user/${userId}`);
  }

  updateTeam(updatedTeam: Team) {
    return this.update('Team', updatedTeam);
  }

  deleteTeam(id: number) {
    return this.delete('Team', id);
  }
}
