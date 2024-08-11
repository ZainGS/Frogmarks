import { AfterViewInit, ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { NavbarService } from '../../services/navbar/navbar.service';
import { Board } from 'src/app/boards/models/board.model';
import { CdkDragDrop, CdkDragRelease, CdkDragStart, CdkDragMove, CdkDragEnd, moveItemInArray } from '@angular/cdk/drag-drop';
import { BoardService } from '../../services/boards/board.service';
import { ResultType } from '../../models/error-result.model';
import { NotifyService } from '../../services/notify/notify.service';
import { Team } from '../../models/teams/team.model';
import { TeamService } from '../../services/teams/team.service';
import { AuthService } from '../../services/auth/auth.service';
import { animate, group, state, style, transition, trigger } from '@angular/animations';
import { NamingHelperService } from '../../utilities/naming-helper.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  animations: [
    trigger('slideInOut', [
      state('flash-in', style({
        backgroundColor: '#6C63FF',
      })),
      state('in', style({
        backgroundColor: '#6C63FF',
      })),
      state('out', style({
        backgroundColor: 'transparent',
      })),
      transition('out => flash-in', [
        group([
          animate('0ms', style({
            backgroundColor: '#fff',
          })),
          animate('50ms', style({
            backgroundColor: '#fff',
          })),
          animate('150ms', style({
            backgroundColor: '#6C63FF',
          }))
        ])
      ]),
      transition('flash-in => in', [
        animate('300ms ease-in-out')
      ]),
      transition('in => out', [
        animate('300ms ease-in-out')
      ])
    ])
  ]
})

export class DashboardComponent implements OnInit, AfterViewInit {

  // Click Host Listener for dropdown menus
  @HostListener('document:click', ['$event'])
  handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Check if the click was outside any .list-item
    if (!target.closest('.list-item')) {
      this.selectedItems.clear();
    }

    if (!target.closest('.menu-container')
      && !target.closest('.sortorder-dropdown-arrow')
      && !target.closest('.sortorder-dropdown-chip')) {
      this.showSortOrderDropdown = false;
    }

    if (!target.closest('.menu-container')
      && !target.closest('.filetype-dropdown-arrow')
      && !target.closest('.filetype-dropdown-chip')) {
      this.showFileTypeDropdown = false;
    }
  }

  // Application State
  isLoading: boolean = true;
  isLoadingItems: boolean = false;
  isDragging: boolean = false;
  draggedTemplateId: string | null = null;
  mouseDownTemplateId: string | null = null;
  hoveringNewBoardButton: boolean = false;

  // Dashboard Data
  uid: string = "";
  teams: Team[] = [];
  currentTeam: Team = {name: ""};
  boards: Board[] = [];
  designs: DesignDocument[] = [];
  slides: SlideDeck[] = [];
  totalCreations = 0;
  listItems: any = [];
  selectedItems: Set<string> = new Set<string>();
  favorites: Set<string> = new Set();

  // Filtering
  isDesignCenterActive: boolean = true;
  isFavoritesFilterActive: boolean = false;
  currentRecentCreationsTab = 1;
  sortBy: number = SortByOptions.LastViewed;
  orderBy: number = OrderByOptions.Descending;
  fileType: number = FileTypeOptions.All;
  showSortOrderDropdown: boolean = false;
  showFileTypeDropdown: boolean = false;
  sortOrderDropdownText: any = ["Alphabetical", "Date created", "Last viewed"]
  fileTypeDropdownText: any = ["All files", "Design files", "Boards", "Slide decks"]
  viewType: string = "grid";

  // misc.
  currentTime = new Date();
  icons!: HTMLCollectionOf<Element>;

  // Templating Containers, Default Material Icon values
  originalTemplates = [
    { id: 1, icon: 'category_search' },
    { id: 2, icon: 'circle' },
    { id: 3, icon: 'square' },
    { id: 4, icon: 'star' },
    { id: 5, icon: 'mood' },
    { id: 6, icon: 'public' }
  ];

  // Templating Containers, icon states
  templates = [
    { id: 1, icon: 'category_search' },
    { id: 2, icon: 'circle' },
    { id: 3, icon: 'square' },
    { id: 4, icon: 'star' },
    { id: 5, icon: 'mood' },
    { id: 6, icon: 'public' }
  ];

  // Templating Containers, onDrag icon states
  numberedIcons = [
    { id: 1, icon: 'looks_one' },
    { id: 2, icon: 'looks_two' },
    { id: 3, icon: 'looks_3' },
    { id: 4, icon: 'looks_4' },
    { id: 5, icon: 'looks_5' },
    { id: 6, icon: 'looks_6' }
  ];

  private _teamService: TeamService;
  private _boardService: BoardService;
  private _authService: AuthService;
  private _notifyService: NotifyService;

  constructor(private cdr: ChangeDetectorRef,
    private teamService: TeamService,
    private boardService: BoardService,
    private authService: AuthService,    
    private notifyService: NotifyService,
    private namingHelper: NamingHelperService,
    private router: Router) {
      this._boardService = boardService;
      this._teamService = teamService;
      this._authService = authService;
      this._notifyService = notifyService;

  }

  // Templating Containers, MouseEvent setup
  ngAfterViewInit(): void {
    const templates = this.templates;
    const self = this; // reference to the component instance

    document.querySelectorAll('.template-container').forEach(container => {
      const originalIcon = container.textContent;
      const id: any = container.closest('[data-id]')?.getAttribute('data-id');

      container.addEventListener("mouseenter", function() {
        if (container.firstChild && id && !self.isDragging) {
          const template = templates.find(t => t.id === +id);
          if (template) {
            template.icon = 'add_circle';
            container.firstElementChild?.classList.remove('material-symbols-outlined');
            container.firstElementChild?.classList.add('material-symbols-filled');
          }
        }
      });

      container.addEventListener("mouseleave", function() {
        if (container.firstChild && id && !self.isDragging) {
          const template = templates.find(t => t.id === +id);
          if (template) {
            template.icon = originalIcon || template.icon;
            container.firstElementChild?.classList.add('material-symbols-outlined');
            container.firstElementChild?.classList.remove('material-symbols-filled');
          }
        }
      });

      container.addEventListener("mousedown", function() {
        if (container.firstChild && id) {
          const template = templates.find(t => t.id === +id);
          if (template) {
            template.icon = 'add_circle';
          }
        }
      });

      container.addEventListener("mouseup", function() {
        self.mapOriginalIconsToTemplates();
        if (container.firstChild && id) {
          const template = templates.find(t => t.id === +id);
          if (template) {
            template.icon = "add_circle";
            //container.firstElementChild?.classList.add('material-symbols-outlined');
          }
          
        }
      });
    });
  }

  ngOnInit(): void {

    // Grab teams for user by uid
    this._authService.getUserId().subscribe(uid => {
      this.uid = uid ?? '';
      this._teamService.getTeamsByUserId(this.uid).subscribe((res: any) => {
        this.teams = res.resultObject;
        this.currentTeam = this.teams[0];

        // Fetch items for the user by current team
        this._boardService.getBoardsByTeamId(this.currentTeam.id!).subscribe((res: any) => {

          if (res && res.resultObject && Array.isArray(res.resultObject)) {
            (res.resultObject as Board[]).forEach(board => {

              // Push board objects to lists
              this.boards.push(board);
              this.listItems.push(board);
              if (board.isFavorite && board.uuid != undefined) {
                this.favorites.add(board.uuid);
              }
            });
          }
          this.isLoading = false;
        });

        // ...

      });

    });
    
    // Sum design item count
    this.totalCreations = 
      this.boards.length + this.designs.length + this.slides.length;
  }

  // Replace default Templating Containers' icons OnDrag with numbered icons
  mapNumberedIconsToTemplates() {
    var i = 1;
    this.templates.forEach(template => {
      const numberedIcon = this.numberedIcons.find(icon => icon.id === i);
      if (numberedIcon) {
        template.icon = numberedIcon.icon;
      }
      i++;
    });
  }

  // Replace numbered Templating Containers' icons OnDragEnd with default icons
  mapOriginalIconsToTemplates() {
    this.templates.forEach(template => {
      const originalTemplate = this.originalTemplates.find(ot => ot.id === template.id);
      if (originalTemplate) {
        template.icon = originalTemplate.icon;
      }
    });
  }

  onDragStart(event: CdkDragStart) {}

  onDragging(event: CdkDragMove) {
    this.isDragging = true;
    this.draggedTemplateId = event.source.data.id;
    this.mapNumberedIconsToTemplates();
  }

  onDragReleased(event: CdkDragRelease) {
    this.mapOriginalIconsToTemplates();
    var filledIcon = document.getElementsByClassName('material-symbols-filled')[0];
    filledIcon?.classList.remove('material-symbols-filled')
    filledIcon?.classList.add('material-symbols-outlined');

    this.isDragging = false;
    this.draggedTemplateId = null;
    this.mouseDownTemplateId = null;

    this.cdr.detectChanges();
  }

  onDrop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.templates, event.previousIndex, event.currentIndex);
  }

  onDragEnd(event: CdkDragEnd) {}


  setRecentCreationsTab(selection: number) {
    this.currentRecentCreationsTab = selection;
    switch (selection) {
      case 1:

        // Recently viewed
        this.clearData();
        var sortByValue = this.sortByEnumToString(this.sortBy);
        var orderByValue = this.orderByEnumToString(this.orderBy);

        this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false, sortByValue, orderByValue).subscribe((res: any) => {
          if (res && res.resultObject && Array.isArray(res.resultObject)) {
            (res.resultObject as Board[]).forEach(board => {
              // push board objects to lists
              this.boards.push(board);
              this.listItems.push(board);
              if (board.isFavorite && board.uuid != undefined) {
                this.favorites.add(board.uuid);
              }
            });
          }
          this.isLoadingItems = false;
        });

        return;
      case 2:
        // Shared files

        return;
      case 3:
        // Shares projects

        return;
      default:
        // Recently viewed

        return;
    }
  }

  sortByEnumToString(sortBy: number): string {
    switch (this.sortBy) {
      case SortByOptions.Alphabetical:
        return "alphabetical";
      case SortByOptions.DateCreated:
        return "datecreated"
      case SortByOptions.LastViewed:
        return "lastviewed"
      default:
        return "lastviewed"
    }
  }

  orderByEnumToString(orderBy: number): string {
    switch (this.orderBy) {
      case OrderByOptions.Ascending:
        return "asc";
      case OrderByOptions.Descending:
        return "desc"
      default:
        return "desc"
    }
  }

  clearData() {
    this.isLoadingItems = true;
    this.boards = [];
    this.listItems = [];
    this.favorites.clear();
  }

  recentsClicked(): void {
    if (!this.isDesignCenterActive) {

      this.clearData();
      this.isDesignCenterActive = true;
      this.isFavoritesFilterActive = false;

      this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false).subscribe((res: any) => {

        if (res && res.resultObject && Array.isArray(res.resultObject)) {
          (res.resultObject as Board[]).forEach(board => {

            // Push board objects to lists
            this.boards.push(board);
            this.listItems.push(board);
            if (board.isFavorite && board.uuid != undefined) {
              this.favorites.add(board.uuid);
            }

          });
        }
        this.isLoadingItems = false;
      }
      );
    }
  }

  favoriteClicked(): void {
    if (!this.isFavoritesFilterActive) {
      this.clearData();
      this.isFavoritesFilterActive = true;
      this.isDesignCenterActive = false;

      this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', true).subscribe((res: any) => {

        if (res && res.resultObject && Array.isArray(res.resultObject)) {
          (res.resultObject as Board[]).forEach(board => {

            // push board objects to lists
            this.boards.push(board);
            this.listItems.push(board);
            if (board.isFavorite && board.uuid != undefined) {
              this.favorites.add(board.uuid);
            }

          });
        }
        this.isLoadingItems = false;
      }
      );
    }
  }

  changeFileType(option: number) {
    this.fileType = option;
  }

  sort(option: number) {
    this.sortBy = option;

    this.clearData();
    var sortByValue = this.sortByEnumToString(this.sortBy);
    var orderByValue = this.orderByEnumToString(this.orderBy);

    this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false, sortByValue, orderByValue).subscribe((res: any) => {
      if (res && res.resultObject && Array.isArray(res.resultObject)) {
        (res.resultObject as Board[]).forEach(board => {
          // Push board objects to lists
          this.boards.push(board);
          this.listItems.push(board);
          if (board.isFavorite && board.uuid != undefined) {
            this.favorites.add(board.uuid);
          }
        });
      }
      this.isLoadingItems = false;
    });

  }

  order(option: number) {
    this.orderBy = option;

    this.clearData();
    var sortByValue = this.sortByEnumToString(this.sortBy);
    var orderByValue = this.orderByEnumToString(this.orderBy);

    this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false, sortByValue, orderByValue).subscribe((res: any) => {
      if (res && res.resultObject && Array.isArray(res.resultObject)) {
        (res.resultObject as Board[]).forEach(board => {
          // Push board objects to lists
          this.boards.push(board);
          this.listItems.push(board);
          if (board.isFavorite && board.uuid != undefined) {
            this.favorites.add(board.uuid);
          }
        });
      }
      this.isLoadingItems = false;
    });
  }

  toggleSortOrderDropdown() {
    this.showSortOrderDropdown = !this.showSortOrderDropdown;
  }

  toggleFileTypeDropdown() {
    this.showFileTypeDropdown = !this.showFileTypeDropdown;
  }

  draftsClicked(): void { }

  allProjectsClicked(): void { }

  newBoardButtonMouseEntered(): void {
    this.hoveringNewBoardButton = true;
  }

  newBoardButtonMouseExit(): void {
    // this.hoveringNewBoardButton = false;
  }

  newBoardButtonClicked(): void {
    if (!this.currentTeam || !this.currentTeam.id) {
      this._notifyService.error('No current team selected');
      return;
    }

    let newBoard: Board = {
      id: 0, // Assuming you need an initial id
      name: `${this.namingHelper.getRandomAdjective()} ${this.namingHelper.getRandomGemstone()} Board`, // Default name or handle name input
      description: '', // Default description or handle description input
      teamId: this.currentTeam.id
    };

    this._boardService.createBoard(newBoard).subscribe((res: any) => {
      if (res.resultType === ResultType.Success) {
        // Navigate to the new board, replace 'your-board-route' with actual route
        this.router.navigate(['/board', res.resultObject.uuid]);
      } else {
        this._notifyService.error('There was an error creating a new board :(');
      }
    }, (error) => {
      this._notifyService.error('There was an error creating a new board :(');
      console.error(error);
    });
  }

  listItemSelected(event: MouseEvent, uuid: string) {
    event.stopPropagation();
    if (event.ctrlKey && this.selectedItems.has(uuid)) {
      this.selectedItems.delete(uuid);
    }
    else if (event.ctrlKey && !this.selectedItems.has(uuid)) {
      this.selectedItems.add(uuid);
    }
    /*
    else if (this.selectedItems.has(uuid) && this.selectedItems.size == 1) {
      this.selectedItems.delete(uuid);
    }
    */
    else {
      this.selectedItems.clear();
      this.selectedItems.add(uuid);
    }
  }

  listItemDoubleClicked(event: MouseEvent, uuid: string) { }

  toggleFavorite(uuid: string, board: any) {
    board.teamId = this.currentTeam.id;
    if (this.favorites.has(uuid)) {
      board.isFavorite = false;
      this.boardService.favoritedBoard(board).subscribe((res: any) => {
        if (res.resultType == 0) {
          this.favorites.delete(uuid);
        }
      });

    }
    else {
      board.isFavorite = true;
      this.boardService.favoritedBoard(board).subscribe((res: any) => {
        if (res.resultType == 0) {
          this.favorites.add(uuid);
        }
      });
    }
  }

  isFavorite(uuid: string): boolean {
    return this.favorites.has(uuid);
  }

  gridViewClicked() {
    this.viewType = "grid";
  }

  listViewClicked() {
    this.viewType = "list";
  }

  assignListItemColor(index: number) {
    var assignmentNumber = index % 4;
    switch (assignmentNumber) {
      case 1:
        return '#ACCBE9';
      case 2:
        return '#e8c8db';
      case 3:
        return '#B7BFCA';
      default:
        return '#c6e0bc';
    }
  }

  assignListItemColorWhite(index: number) {
    var assignmentNumber = index % 4;
    switch (assignmentNumber) {
      case 1:
        return '#fff';
      case 2:
        return '#fff';
      case 3:
        return '#fff';
      default:
        return '#fff';
    }
  }

}

// TODO: Abstract these into their own classes
export class DesignDocument {
  id!: number;
  name?: string;
  thumbnailUrl?: string;
}

export class SlideDeck {
  id!: number;
  name?: string;
  thumbnailUrl?: string;
}

export enum SortByOptions {
  Alphabetical,
  DateCreated,
  LastViewed
}

export enum OrderByOptions {
  Ascending,
  Descending
}

export enum FileTypeOptions {
  All,
  Designs,
  Boards,
  Slides,
}
