import { Injectable } from '@angular/core';
import { Board } from '../../../boards/models/board.model';
import { ApiService } from '../api/api.service';
import { ConfigurationService } from '../api/configuration.service';
import { NotifyService } from '../notify/notify.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BoardService extends ApiService {

  constructor(http: HttpClient, configService: ConfigurationService, router: Router, notify: NotifyService) {
    super(http, configService, router, notify);
  }

  // Boards
  createBoard(newBoard: Board) {

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.post(`${this.apiUrl}/api/board`, JSON.stringify(newBoard), { headers, withCredentials: true });

    //return this.create('Board', newBoard);
  }

  getBoardByUid(id: string): Observable<any> {
    return this.get<Board>(`Board/${id}`);
  }

  getAllBoards(): Observable<any> {
    return this.http.get<Board[]>(`${this.apiUrl}/api/board`, { withCredentials: true });
  }

  searchBoards(filterQuery: string = '', sortBy: string = 'name', sortDirection: string = 'desc', pageIndex: number = 0, pageSize: number = 10): Observable<any> {

    let params = new HttpParams()
      .set('filterQuery', filterQuery)
      .set('sortBy', sortBy)
      .set('sortDirection', sortDirection)
      .set('pageIndex', pageIndex.toString())
      .set('pageSize', pageSize.toString());

    return this.http.get<Board[]>(`${this.apiUrl}/api/board/search`, { params, withCredentials: true });
  }

  getBoardsByTeamId(
  id: number,
  name: string = "",
  favorites: boolean = false,
  sortBy: string = "name",
  sortDirection: string = "desc",
  pageIndex: number = 0,
  pageSize: number = 10
): Observable<Board[]> {
  let params = new HttpParams()
    .set('teamId', id.toString())
    .set('name', name)
    .set('favorites', favorites)
    .set('sortBy', sortBy)
    .set('sortDirection', sortDirection)
    .set('pageIndex', pageIndex.toString())
    .set('pageSize', pageSize.toString());

  return this.http.get<Board[]>(`${this.apiUrl}/api/board/search`, { params, withCredentials: true });
}

  getBoardsByProjectId(id: number): Observable<Board[]> {
    return this.get<Board[]>(`board?projectid=${id}`);
  }

  updateBoard(updatedBoard: Board) {
    return this.http.put('Board', updatedBoard, { withCredentials: true });
  }

  favoritedBoard(favoritedBoard: Board) {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    return this.http.put(`${this.apiUrl}/api/board/favorite`, favoritedBoard, { headers, withCredentials: true });
  }

  deleteBoard(id: number) {
    return this.delete('Board', id);
  }

}
