import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';
import { BoardService } from '../../../shared/services/boards/board.service';
import { Board } from '../../models/board.model';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent implements OnInit {
  boardUid: string | null = null;
  board: Board | null = null;

  constructor(private route: ActivatedRoute,
              private boardService: BoardService) { }

  ngOnInit(): void {
    this.boardUid = this.route.snapshot.paramMap.get('id');

    if (this.boardUid) {
      this.boardService.getBoardByUid(this.boardUid).subscribe(res => {
        if (res.resultType === ResultType.Success) {
          this.board = res.resultObject;
        }
      });
    }
  }
}
