import { AfterViewInit, ChangeDetectorRef, Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { NavbarService } from '../../services/navbar/navbar.service';
import { Board } from '../../../boards/models/board.model';
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
import { MatDialog } from '@angular/material/dialog';
import { InviteModalComponent } from '../invite-modal/invite-modal.component';
import { UpgradeModalComponent } from '../upgrade-modal/upgrade-modal.component';
import { FormControl } from '@angular/forms';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';

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

  @ViewChild(MatAutocompleteTrigger) autocompleteTrigger!: MatAutocompleteTrigger;
  scrollListener!: () => void;

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
  filteredListItems: any = [];
  filteredSearchItems: any = [];
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
  showNotificationPanel: boolean = false;
  showProfilePanel: boolean = false;
  sortOrderDropdownText: any = ["Alphabetical", "Date created", "Last viewed"]
  fileTypeDropdownText: any = ["All files", "Design files", "Boards", "Slide decks"]
  viewType: string = "grid";
  teamInviteLink: string = 'https://www.frogmarks.com/team_invite/redeem/...';
  searchControl = new FormControl('');

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
    private router: Router,
    private dialog: MatDialog) {
      this._boardService = boardService;
      this._teamService = teamService;
      this._authService = authService;
      this._notifyService = notifyService;

  }

  onSearch() {
    if(this.searchControl.value!.length > 0)
    {
      this.filterItems(this.searchControl.value!);
    }else {
      this.filteredSearchItems = [];
    }
  }

  filterItems(query: string) {
    if (!query) {
      this.filteredSearchItems = this.listItems; // Reset to full list
    } else {
      this.filteredSearchItems = this.listItems.filter((item: any) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  onOptionSelected(item: any) {
    console.log('Selected Item:', item);
    // Perform action with selected item
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

  openInviteDialog() {
    const dialogRef = this.dialog.open(InviteModalComponent, {
      autoFocus: false,
      data: {
        inviteLink: this.teamInviteLink,
      },
      width: '650px', // Adjust to your desired size
      height: 'fit-content',
      disableClose: true, // Prevent closing by clicking outside
      panelClass: 'custom-dialog-container', // Optional custom class for styling
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Dialog result:', result);
      }
    });
  }

  closeNotificationPanel() {
    this.showNotificationPanel = false;
  }

  openUpgradeDialog() {
    const dialogRef = this.dialog.open(UpgradeModalComponent, {
      data: {
      },
      width: '80vw', // Adjust to your desired size
      height: 'fit-content',
      disableClose: true, // Prevent closing by clicking outside
      panelClass: 'custom-dialog-container', // Optional custom class for styling
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Dialog result:', result);
      }
    });
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.scrollListener, true);
  }

  private onScroll() {
    if (this.autocompleteTrigger.panelOpen) {
      this.autocompleteTrigger.closePanel();
    }
  }

  ngOnInit(): void {

    this.scrollListener = this.onScroll.bind(this);
    window.addEventListener('scroll', this.scrollListener, true); // 'true' for capturing phase

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
          this.changeFileType(0);
          this.isLoading = false;
        });

        // ...

      });

    });
    
    // Sum design item count
    this.totalCreations = this.boards.length + this.designs.length + this.slides.length;
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

        this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, sortByValue, orderByValue).subscribe((res: any) => {
          if (res && res.resultObject && Array.isArray(res.resultObject)) {
            (res.resultObject as Board[]).forEach(board => {
              // push board objects to lists
              this.boards.push(board);
              this.listItems.push(board);
              this.filteredListItems = this.listItems;
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
        this.clearData();
        var sortByValue = this.sortByEnumToString(this.sortBy);
        var orderByValue = this.orderByEnumToString(this.orderBy);
        
        this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, sortByValue, orderByValue).subscribe((res: any) => {
          if (res && res.resultObject && Array.isArray(res.resultObject)) {
            (res.resultObject as Board[]).forEach(board => {
              if(board.collaborators && board.collaborators.length > 0) {
                // push board objects to lists
                this.boards.push(board);
                this.listItems.push(board);
                this.filteredListItems = this.listItems;
                if (board.isFavorite && board.uuid != undefined) {
                  this.favorites.add(board.uuid);
                }
              }
            });
          }
          this.isLoadingItems = false;
        });
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
    this.filteredListItems = [];
    this.favorites.clear();
  }

  recentsClicked(): void {

  }

  designCenterClicked(): void {
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
            this.filteredListItems = this.listItems;
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
            this.filteredListItems = this.listItems;

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
    this.filteredListItems = this.listItems;
    this.fileType = option;
    switch(option) {
      case 0:
        this.filteredListItems = this.listItems.filter((b: any) => b.name.includes(''));
        break;
      case 1:
        this.filteredListItems = this.listItems.filter((b: any) => b.name.includes('Design'));
        break;
      case 2:
        this.filteredListItems = this.listItems.filter((b: any) => b.name.includes('Board'));
        break;
      case 3:
        this.filteredListItems = this.listItems.filter((b: any) => b.name.includes('Slide'));
        break;
      default:
        this.filteredListItems = this.listItems.filter((b: any) => b.name.includes(''));
        break;
    }
  }

  sort(option: number) {
    this.sortBy = option;

    this.clearData();
    var sortByValue = this.sortByEnumToString(this.sortBy);
    var orderByValue = this.orderByEnumToString(this.orderBy);

    this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, sortByValue, orderByValue).subscribe((res: any) => {
      if (res && res.resultObject && Array.isArray(res.resultObject)) {
        (res.resultObject as Board[]).forEach(board => {
          // Push board objects to lists
          this.boards.push(board);
          this.listItems.push(board);
          this.filteredListItems = this.listItems;
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

    this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, sortByValue, orderByValue).subscribe((res: any) => {
      if (res && res.resultObject && Array.isArray(res.resultObject)) {
        (res.resultObject as Board[]).forEach(board => {
          // Push board objects to lists
          this.boards.push(board);
          this.listItems.push(board);
          this.filteredListItems = this.listItems;
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
