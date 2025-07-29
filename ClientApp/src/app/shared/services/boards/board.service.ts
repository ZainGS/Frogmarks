import { Injectable } from '@angular/core';
import { Board } from '../../../boards/models/board.model';
import { ApiService } from '../api/api.service';
import { ConfigurationService } from '../api/configuration.service';
import { NotifyService } from '../notify/notify.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

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

  getBoardById(id: number): Observable<any> {
    return this.http.get<Board>(`${this.apiUrl}/api/board/${id}`, { withCredentials: true });
  }

  getBoardByUid(uid: string): Observable<any> {
    return this.http.get<Board>(`${this.apiUrl}/api/board/GetBoardByUid/${uid}`, { withCredentials: true });
  }

  getAllBoards(): Observable<any> {
    return this.http.get<Board[]>(`${this.apiUrl}/api/board`, { withCredentials: true });
  }

  searchBoards(filterQuery: string = '', sortBy: string = 'name', sortDirection: string = 'desc', pageIndex: number = 0, pageSize: number = 24): Observable<any> {

    let params = new HttpParams()
      .set('filterQuery', filterQuery)
      .set('sortBy', sortBy)
      .set('sortDirection', sortDirection)
      .set('pageIndex', pageIndex.toString())
      .set('pageSize', pageSize.toString());
      const cachedThumbnailBoardIds = new Set(localStorage.getItem("cachedThumbnailBoardIds")?.split(",") || []);
      return this.http.get<Board[]>(`${this.apiUrl}/api/board/search?cachedThumbnailBoardIds=${Array.from(cachedThumbnailBoardIds).join(",")}`, { params, withCredentials: true });
  }

  getBoardsByTeamId(
  id: number,
  name: string = "",
  favorites: boolean = false,
  sortBy: string = "name",
  sortDirection: string = "desc",
  pageIndex: number = 0,
  pageSize: number = 24
): Observable<Board[]> {
  let params = new HttpParams()
    .set('teamId', id.toString())
    .set('name', name)
    .set('favorites', favorites)
    .set('sortBy', sortBy)
    .set('sortDirection', sortDirection)
    .set('pageIndex', pageIndex.toString())
    .set('pageSize', pageSize.toString());

  // Load cached thumbnails (Board Id => { url, timestamp })
  const cachedThumbnails = JSON.parse(localStorage.getItem("cachedThumbnails") || "{}");

  // Filter out expired thumbnails
  const now = Date.now();
  const expirationTime = .083 * 1 * 60 * 60 * 1000; // .083 hours (5 min) in milliseconds
  const validThumbnails = Object.keys(cachedThumbnails).reduce((acc, boardId) => {
    const { url, timestamp } = cachedThumbnails[boardId] || {};
    if (url && timestamp && now - timestamp <= expirationTime) {
      acc[boardId] = { url, timestamp };
    }
    return acc;
  }, {} as Record<string, { url: string; timestamp: number }>);

  // Extract valid board IDs
  const cachedThumbnailBoardIds = Object.keys(validThumbnails);

  return this.http.get<Board[]>(`${this.apiUrl}/api/board/search?cachedThumbnailBoardIds=${Array.from(cachedThumbnailBoardIds).join(",")}`, {
     params, withCredentials: true }).pipe(
      tap((res: any) => {
        // Merge new thumbnails into cache if needed
        let updatedCache = { ...validThumbnails };
        res.resultObject.forEach((board: Board) => {
          if (board.thumbnailUrl && !updatedCache[board.id]) {
            updatedCache[board.id] = { url: board.thumbnailUrl, timestamp: Date.now() };
          }
          board.thumbnailUrl = updatedCache[board.id]?.url;
        });
        // Save updated cache
        localStorage.setItem("cachedThumbnails", JSON.stringify(updatedCache));
      })
    );
  }

  // TODO: Make a centralized caching service that uses Signals or RxJs or NgRx
  // Keys are BoardIds, Values are thumbnail SAS urls with cache datetime appended
  // Helper function to cache a thumbnail with an expiration timestamp
  cacheThumbnail(url: string, key: string) {
    const cacheData = {
      url: url,
      timestamp: Date.now() // Store the current time in milliseconds
    };
    const cachedThumbnails = JSON.parse(localStorage.getItem("cachedThumbnails") || "{}");
    cachedThumbnails[key] = cacheData;
    localStorage.setItem("cachedThumbnails", JSON.stringify(cachedThumbnails));
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

  deleteBoard(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/api/board/${id}`, { withCredentials: true });
  }

  saveBoard(id: number, sceneGraph: string): Observable<any> {
    const request = {
      boardId: id,
      sceneGraphData: sceneGraph // No need to `JSON.stringify()` again, it's already a string
    };

    return this.http.post(`${this.apiUrl}/api/board/save`, request, { withCredentials: true });
  }

  loadBoardSceneGraph(id: number): Observable<string> {
    return this.http.get<string>(`${this.apiUrl}/api/board/load/${id}`, { withCredentials: true });
  }

  uploadThumbnail(boardUid: string, blob: Blob): Observable<void> {
    const formData = new FormData();
    formData.append("thumbnail", blob, `${boardUid}.png`);
    return this.http.post<void>(`${this.apiUrl}/api/board/thumbnails/${boardUid}`, formData, { withCredentials: true });
  }

  getThumbnail(boardUid: string): Observable<Blob> {
      return this.http.get(`${this.apiUrl}/thumbnails/${boardUid}`, { responseType: "blob" });
  }

}
