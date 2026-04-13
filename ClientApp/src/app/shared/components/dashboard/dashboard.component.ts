import { AfterViewInit, ChangeDetectorRef, Component, HostListener, OnInit, ViewChild, ViewChildren, ElementRef, QueryList } from '@angular/core';
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
import { ThemeService } from 'app/shared/services/theme/theme.service';
import { ConfigurationService } from 'app/shared/services/api/configuration.service';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

type DashboardItem = Board | Illustration;

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

  editingId: string | null = null;
  nameControl = new FormControl<string>('');
  @ViewChildren('renameInput') renameInputs!: QueryList<ElementRef<HTMLInputElement>>;
  startInlineRename(item: DashboardItem) {
    this.closeContextMenu();
    this.editingId = item.uuid;
    this.nameControl.setValue(item.name);
    // focus after view updates
    setTimeout(() => this.renameInputs?.find(_=>true)?.nativeElement?.focus(), 0);
  }

  commitInlineRename(item: DashboardItem) {
    const newName = (this.nameControl.value ?? '').trim();
    if (!newName || newName === item.name) { this.cancelInlineRename(); return; }
    
    item.name = newName;
    this.editingId = null;
    
    if (this.isBoard(item)) {
      this.boardService.renameBoard(item.id, newName).subscribe(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.renameIllustration(item.id, newName).subscribe(() => {});
    }
  }

  cancelInlineRename() {
    this.editingId = null;
  }

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
  isTeamSelected: boolean = false;

  frogmarksList = Array(40).fill('FROGMARKS //');

  contextMenu = {
    visible: false,
    x: 0,
    y: 0,
    item: null as DashboardItem | null
  };

  isBoard(item: DashboardItem): item is Board {
    return item.type == 'board';
  }

  isIllustration(item: DashboardItem): item is Illustration {
    return item.type == 'illustration';
  }

  openBoardMenu(event: MouseEvent, item: DashboardItem) {
    event.preventDefault();
    event.stopPropagation();

    const clickX = event.clientX;
    const clickY = event.clientY;

    // Optional: keep menu within viewport
    const menuWidth = 220;  // match CSS
    const menuHeight = 44;  // approx for one item
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x = Math.min(clickX, vw - menuWidth - 8);
    const y = Math.min(clickY, vh - menuHeight - 8);

    this.contextMenu = { visible: true, x, y, item };
  }

  onArchiveItem(item: DashboardItem | null) {
    if (!item) return;
    // Optimistic UI update
    const id = item.id;        // or use const uuid = item.uuid;
    this.listItems         = this.listItems.filter((b: any) => b.id !== id);
    this.filteredListItems = this.filteredListItems.filter((b: any) => b.id !== id);
    this.boards            = this.boards.filter((b: any) => b.id !== id);

    this.closeContextMenu();

    // Persist
    item.isArchived = true;
    if (this.isBoard(item)) {
      this.boardService.updateBoard(item).subscribe(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.updateIllustration(item).subscribe(() => {});
    }
  }

  onUnarchiveBoard(item: DashboardItem | null) {
    if (!item) return;
    // Optimistic UI update
    const id = item.id;        // or use const uuid = item.uuid;
    this.listItems         = this.listItems.filter((b: any) => b.id !== id);
    this.filteredListItems = this.filteredListItems.filter((b: any) => b.id !== id);
    this.boards            = this.boards.filter((b: any) => b.id !== id);

    this.closeContextMenu();

    // Persist
    item.isArchived = false;
    if (this.isBoard(item)) {
      this.boardService.updateBoard(item).subscribe(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.updateIllustration(item).subscribe(() => {});
    }
  }

  onDeleteBoard(item: DashboardItem | null) {
    if (!item) return;
    // Optimistic UI update
    const id = item.id;        // or use const uuid = item.uuid;
    this.listItems         = this.listItems.filter((b: any) => b.id !== id);
    this.filteredListItems = this.filteredListItems.filter((b: any) => b.id !== id);
    this.boards            = this.boards.filter((b: any) => b.id !== id);

    this.closeContextMenu();

    // Persist
    if (this.isBoard(item)) {
      this.boardService.deleteBoard(item.id).subscribe(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.deleteIllustration(item.id).subscribe(() => {});
    }
  }

  openItemInNewTab(item: DashboardItem | null) {
    if (!item || !item.uuid) return;
    this.closeContextMenu();

    let url: string;
    if (this.isBoard(item)) {
      url = this.router.serializeUrl(this.router.createUrlTree(['/board', item.uuid]));
    } else if (this.isIllustration(item)) {
      url = this.router.serializeUrl(this.router.createUrlTree(['/illustration', item.uuid]));
    }
    
    window.open(url, '_blank');
  } 

  closeContextMenu() {
    if (this.contextMenu.visible) {
      this.contextMenu.visible = false;
      this.contextMenu.item = null;
    }
  }

// Close on any document click, scroll, resize, or Escape
@HostListener('document:click')
onDocClick() { this.closeContextMenu(); }

@HostListener('window:scroll')
onWinScroll() { this.closeContextMenu(); }

@HostListener('window:resize')
onWinResize() { this.closeContextMenu(); }

@HostListener('document:keydown.escape')
onEsc() { this.closeContextMenu(); }

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
  isFrogmarksGalaxyActive: boolean = false;
  isTemplatesActive: boolean = false;
  isDesignCenterActive: boolean = true;
  isFavoritesFilterActive: boolean = false;
  isArchivedFilterActive: boolean = false;
  isUpdatesActive: boolean = false;
  currentRecentCreationsTab = 1;
  sortBy: number = SortByOptions.LastViewed;
  orderBy: number = OrderByOptions.Descending;
  fileType: number = FileTypeOptions.All;
  showSortOrderDropdown: boolean = false;
  showFileTypeDropdown: boolean = false;
  showNotificationPanel: boolean = false;
  showSettingsPanel: boolean = false;
  showProfilePanel: boolean = false;
  sortOrderDropdownText: any = ["Alphabetical", "Date created", "Last viewed"]
  fileTypeDropdownText: any = ["All files", "Design files", "Boards", "Slide decks"]
  viewType: string = "grid";
  teamInviteLink: string = 'https://www.frogmarks.com/team_invite/redeem/...';
  searchControl = new FormControl('');
  isDarkMode: boolean = false;

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
  private _illustrationService: IllustrationService;
  private _authService: AuthService;
  private _notifyService: NotifyService;

  constructor(private cdr: ChangeDetectorRef,
    private teamService: TeamService,
    private boardService: BoardService,
    private illustrationService: IllustrationService,
    private authService: AuthService,    
    private notifyService: NotifyService,
    private namingHelper: NamingHelperService,
    private router: Router,
    private dialog: MatDialog,
    public themeService: ThemeService,
    public configurationService: ConfigurationService,
    private frogFileService: FrogFileService) {
      this._boardService = boardService;
      this._illustrationService = illustrationService;
      this._teamService = teamService;
      this._authService = authService;
      this._notifyService = notifyService;
  }

  // Optimize window resizing
  onResize = () => {
    document.body.classList.add('disable-animations');

    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      document.body.classList.remove('disable-animations');
    }, 300);
  };

    onSearch() {
      const q = (this.searchControl.value ?? '').trim();

      if (q.length === 0) {
        // 1) Close first, then clear options to avoid overlay measuring/layout blips
        if (this.autocompleteTrigger && this.autocompleteTrigger.panelOpen) {
          this.autocompleteTrigger.closePanel();
        }
        this.filteredSearchItems = [];
        return;
      }

      // Normal flow
      this.filterItems(q);
      if (this.filteredSearchItems.length > 0) {
        this.autocompleteTrigger.openPanel();
      } else {
        this.autocompleteTrigger.closePanel();
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

  closeSettingsPanel() {
    this.showSettingsPanel = false;
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode(!this.themeService.getDarkMode());
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

  trackByUuid(index: number, item: { uuid: string }) {
    return item.uuid;
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.scrollListener, true);
    window.removeEventListener('resize', this.onResize);
  }

  private onScroll() {
    if (this.autocompleteTrigger.panelOpen) {
      this.autocompleteTrigger.closePanel();
    }
  }

  private resizeTimeout: any;
  ngOnInit(): void {

    this.scrollListener = this.onScroll.bind(this);
    window.addEventListener('scroll', this.scrollListener, true); // 'true' for capturing phase
    window.addEventListener('resize', this.onResize);

    // Grab teams for user by uid
    this._authService.getUserId().subscribe(uid => {
      this.uid = uid ?? '';
      this._teamService.getTeamsByUserId(this.uid).subscribe((res: any) => {
        this.teams = res.resultObject;
        this.currentTeam = this.teams[0];

        if (!this.currentTeam?.id) {
          // no teams — still stop the global loader
          this.isLoading = false;
          return;
        }

        // Fetch items for the user by current team
        // this._boardService.getBoardsByTeamId(this.currentTeam.id!).subscribe((res: any) => {
          
        //   if (res && res.resultObject && Array.isArray(res.resultObject)) {
        //     this.clearData();
        //     (res.resultObject as Board[]).forEach(board => {
        //       // Push board objects to lists
        //       this.boards.push(board);
        //       this.listItems.push(board);
        //       if (board.isFavorite && board.uuid != undefined) {
        //         this.favorites.add(board.uuid);
        //       }
        //     });
        //   }
        //   this.changeFileType(0);
        //   this.isLoading = false;
        // });
        this.loadAllItems();

        // ...

      });

    });
    
    // Sum design item count
    this.totalCreations = this.boards.length + this.designs.length + this.slides.length;

    this.themeService.toggleDarkMode(true);
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
    // Remove all the individual service calls and just use:
    this.loadAllItems();
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

  isSidenavOpen = false;
  toggleSidenav() {
    this.isSidenavOpen = !this.isSidenavOpen;
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

  frogmarksGalaxyClicked(): void {
    if (!this.isFrogmarksGalaxyActive) {
      this.clearData();
      this.isFrogmarksGalaxyActive = true;
      this.isDesignCenterActive = false;
      this.isFavoritesFilterActive = false;
      this.isArchivedFilterActive = false;
      this.isUpdatesActive = false;
      this.isTemplatesActive = false;
    }
  }

  designCenterClicked(): void {
    if (!this.isDesignCenterActive) {
      this.clearData();
      this.isDesignCenterActive = true;
      this.isFavoritesFilterActive = false;
      this.isFrogmarksGalaxyActive = false;
      this.isArchivedFilterActive = false;
      this.isUpdatesActive = false;
      this.isTemplatesActive = false;

      // this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false).subscribe((res: any) => {
      // if (res && res.resultObject && Array.isArray(res.resultObject)) {
      //       //this.clearData();
      //       (res.resultObject as Board[]).forEach(board => {
      //         // Push board objects to lists
      //         this.boards.push(board);
      //         this.listItems.push(board);
      //         this.filteredListItems = this.listItems;
      //         if (board.isFavorite && board.uuid != undefined) {
      //           this.favorites.add(board.uuid);
      //         }
      //       });
      //     }
      //     this.isLoadingItems = false;
      //   }
      //   );
      // }
      this.loadAllItems();
    }
  }

  favoriteClicked(): void {
    if (!this.isFavoritesFilterActive) {
      this.clearData();
      this.isFavoritesFilterActive = true;
      this.isDesignCenterActive = false;
      this.isFrogmarksGalaxyActive = false;
      this.isArchivedFilterActive = false;
      this.isUpdatesActive = false;
      this.isTemplatesActive = false;

      // this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', true).subscribe((res: any) => {
      //   if (res && res.resultObject && Array.isArray(res.resultObject)) {
      //     // this.clearData();
      //     (res.resultObject as Board[]).forEach(board => {
      //       // push board objects to lists
      //       this.boards.push(board);
      //       this.listItems.push(board);
      //       this.filteredListItems = this.listItems;

      //       if (board.isFavorite && board.uuid != undefined) {
      //         this.favorites.add(board.uuid);
      //       }

      //     });
      //   }
      //   this.isLoadingItems = false;
      // }
      // );
      this.loadAllItems();
    }
  }

  templatesClicked(): void {
    if (!this.isTemplatesActive) {
      this.clearData();
      this.isFavoritesFilterActive = false;
      this.isDesignCenterActive = false;
      this.isFrogmarksGalaxyActive = false;
      this.isArchivedFilterActive = false;
      this.isUpdatesActive = false;
      this.isTemplatesActive = true;

      // this._boardService.getTemplates().subscribe((res: any) => {
      //   if (res && res.resultObject && Array.isArray(res.resultObject)) {
      //     // this.clearData();
      //     (res.resultObject as Board[]).forEach(board => {
      //       // push board objects to lists
      //       this.boards.push(board);
      //       this.listItems.push(board);
      //       this.filteredListItems = this.listItems;
      //     });
      //   }
      //   this.isLoadingItems = false;
      // }
      // );
    }
  }

  changeFileType(option: number) {
    this.filteredListItems = this.listItems;
    this.fileType = option;
    switch(option) {
      case 0: // All files
        this.filteredListItems = this.listItems;
        break;
      case 1: // Boards
        this.filteredListItems = this.listItems.filter((item: any) => this.isBoard(item));
        break;
      case 2: // Illustrations
        this.filteredListItems = this.listItems.filter((item: any) => this.isIllustration(item));
        break;
    }
  }

  sort(option: number) {
    this.sortBy = option;
    // Remove all the board-only logic and replace with:
    this.loadAllItems();
  }

  order(option: number) {
    this.orderBy = option;
    // Replace with:
    this.loadAllItems();
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

  newIllustrationButtonClicked(): void {
    if (!this.currentTeam || !this.currentTeam.id) {
      this._notifyService.error('No current team selected');
      return;
    }

    let newIllustration: Illustration = {
      id: 0, // Assuming you need an initial id
      name: `${this.namingHelper.getRandomAdjective()} ${this.namingHelper.getRandomGemstone()} Illustration`, // Default name or handle name input
      description: '', // Default description or handle description input
      teamId: this.currentTeam.id
    };

    this._illustrationService.createIllustration(newIllustration).subscribe((res: any) => {
      if (res.resultType === ResultType.Success) {
        this.router.navigate(['/illustration', res.resultObject.uuid]);
      } else {
        this._notifyService.error('There was an error creating a new board :(');
      }
    }, (error) => {
      this._notifyService.error('There was an error creating a new board :(');
      console.error(error);
    });
  }

  /** Import a .frog file: pick file → parse it → create a new illustration → navigate to it with pending import data. */
  async importFrogFile(): Promise<void> {
    try {
      // 1. Pick and parse the .frog file
      const result = await this.frogFileService.importFrogFile();

      if (!this.currentTeam || !this.currentTeam.id) {
        this._notifyService.error('No current team selected');
        return;
      }

      // 2. Create a new illustration with the imported name
      const newIllustration: Illustration = {
        id: 0,
        name: result.manifest.name || 'Imported Illustration',
        description: '',
        teamId: this.currentTeam.id
      };

      this._illustrationService.createIllustration(newIllustration).subscribe({
        next: (res: any) => {
          if (res.resultType === ResultType.Success) {
            // 3. Stash the parsed data so the illustration editor can pick it up
            this.frogFileService.pendingImport = result;
            // 4. Navigate to the new illustration
            this.router.navigate(['/illustration', res.resultObject.uuid]);
          } else {
            this._notifyService.error('Failed to create illustration for import');
          }
        },
        error: (err) => {
          console.error('[Dashboard] import create failed', err);
          this._notifyService.error('Failed to create illustration for import');
        }
      });
    } catch (e: any) {
      if (e?.message === 'No file selected') return; // user cancelled picker
      console.error('[Dashboard] .frog import failed', e);
      this._notifyService.error('Failed to import .frog file');
    }
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

  listItemDoubleClicked(event: MouseEvent, listItem: DashboardItem) { 
  console.log(listItem);
    if(!listItem.isArchived) {
      if (this.isBoard(listItem)) {
        this.router.navigate(['/board', listItem.uuid]);
      } else if (this.isIllustration(listItem)) {
        this.router.navigate(['/illustration', listItem.uuid]);
      }
    }
  }

  toggleFavorite(uuid: string, item: DashboardItem) {
    item.teamId = this.currentTeam.id;
    if (this.favorites.has(uuid)) {
      item.isFavorite = false;
      if (this.isBoard(item)) {
        this.boardService.favoritedBoard(item).subscribe((res: any) => {
          if (res.resultType == 0) this.favorites.delete(uuid);
        });
      } else if (this.isIllustration(item)) {
        this.illustrationService.favoriteIllustration(item).subscribe((res: any) => {
          if (res.resultType == 0) this.favorites.delete(uuid);
        });
      }
    } else {
      item.isFavorite = true;
      this.favorites.add(uuid);
      if (this.isBoard(item)) {
        this.boardService.favoritedBoard(item).subscribe(() => {});
      } else if (this.isIllustration(item)) {
        this.illustrationService.favoriteIllustration(item).subscribe(() => {});
      }
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

  archivedClicked(): void {
    if (!this.isArchivedFilterActive) {
      this.clearData();
      this.isArchivedFilterActive = true;
      this.isFavoritesFilterActive = false;
      this.isDesignCenterActive = false;
      this.isFrogmarksGalaxyActive = false;
      this.isUpdatesActive = false;
      this.isTemplatesActive = false;

      // this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', false, true).subscribe((res: any) => {
      //   if (res && res.resultObject && Array.isArray(res.resultObject)) {
      //     (res.resultObject as Board[]).forEach(board => {
      //       this.boards.push(board);
      //       this.listItems.push(board);
      //       this.filteredListItems = this.listItems;

      //       if (board.isFavorite && board.uuid != undefined) {
      //         this.favorites.add(board.uuid);
      //       }
      //     });
      //   }
      //   this.isLoadingItems = false;
      // });
      this.loadAllItems();
    }
  }

  updatesClicked(): void {
    if (!this.isUpdatesActive) {
      this.clearData();
      this.isArchivedFilterActive = false;
      this.isFavoritesFilterActive = false;
      this.isDesignCenterActive = false;
      this.isFrogmarksGalaxyActive = false;
      this.isUpdatesActive = true;
      this.isTemplatesActive = false;
    }
  }

  copyItemLink(item: DashboardItem | null) {
    if (!item || !item.uuid) return;
    
    const baseUrl = this.configurationService.loadConfigurations().clientUrl;
    let url: string;
    
    if (this.isBoard(item)) {
      url = `${baseUrl}/board/${item.uuid}`;
    } else if (this.isIllustration(item)) {
      url = `${baseUrl}/illustration/${item.uuid}`;
    }
    
    navigator.clipboard.writeText(url);
    this.closeContextMenu();
    this.notifyService.success('Copied link to clipboard');
  }

  renameBoard(item: Board | null) {
    if (!item || !item.uuid) return;
    this.closeContextMenu();
  }

  duplicateItem(item: DashboardItem | null): void {
    if (!item || !item.uuid) return;
    this.closeContextMenu();
    
    if (this.isBoard(item)) {
      const payload = {
        name: `Copy of ${item.name}`,
        teamId: item.teamId,
        copyThumbnail: true // let the new board generate its own thumbnail after first render
      };

      this.boardService.duplicateBoard(item.id, payload).subscribe({
        next: (res: any) => {
          if (res.resultType === ResultType.Success) {
            const newUuid = res.resultObject.uuid;
            //this.router.navigate(['/board', newUuid]);
            this.listItems.unshift(res.resultObject);
            this.filteredListItems.unshift(res.resultObject);
            this.boards.unshift(res.resultObject);
          } else {
            this.notifyService.error('There was an error duplicating the board :(');
          }
        },
        error: (err) => {
          console.error(err);
          this.notifyService.error('There was an error duplicating the board :(');
        }
      });
    } else if (this.isIllustration(item)) {
      const payload = {
        name: `Copy of ${item.name}`,
        teamId: item.teamId,
        copyThumbnail: true // let the new board generate its own thumbnail after first render
      };

      this.illustrationService.duplicateIllustration(item.id, payload).subscribe({
        next: (res: any) => {
          if (res.resultType === ResultType.Success) {
            const newUuid = res.resultObject.uuid;
            //this.router.navigate(['/board', newUuid]);
            this.listItems.unshift(res.resultObject);
            this.filteredListItems.unshift(res.resultObject);
            this.boards.unshift(res.resultObject);
          } else {
            this.notifyService.error('There was an error duplicating the illustration :(');
          }
        },
        error: (err) => {
          console.error(err);
          this.notifyService.error('There was an error duplicating the illustration :(');
        }
      });
    }
  }

  private loadAllItems() {
    const promises = [];
    
    promises.push(
      this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, this.isArchivedFilterActive)
        .pipe(catchError(err => { console.error('[Dashboard] boards fetch failed:', err); return of(null); }))
    );
    
    promises.push(
      this._illustrationService.getIllustrationsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, this.isArchivedFilterActive)
        .pipe(catchError(err => { console.error('[Dashboard] illustrations fetch failed:', err); return of(null); }))
    );

    forkJoin(promises).subscribe({
      next: ([boardsRes, illustrationsRes] : any) => {
        this.clearData();
        
        console.log('[Dashboard] boardsRes:', boardsRes);
        console.log('[Dashboard] illustrationsRes:', illustrationsRes);
        
        // Handle boards
        if (boardsRes?.resultObject) {
          boardsRes.resultObject.forEach((board: Board) => {
            const item: DashboardItem = { ...board, type: 'board' };
            this.boards.push(board);
            this.listItems.push(item);
            if (board.isFavorite && board.uuid) {
              this.favorites.add(board.uuid);
            }
          });
        }
        
        // Handle illustrations
        if (illustrationsRes?.resultObject) {
          illustrationsRes.resultObject.forEach((illustration: Illustration) => {
            const item: DashboardItem = { ...illustration, type: 'illustration' };
            this.listItems.push(item);
            if (illustration.isFavorite && illustration.uuid) {
              this.favorites.add(illustration.uuid);
            }
          });
        }
        
        console.log('[Dashboard] total listItems:', this.listItems.length,
                    'boards:', this.boards.length,
                    'illustrations:', this.listItems.length - this.boards.length);
        
        this.filteredListItems = this.listItems;
        this.isLoadingItems = false;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('[Dashboard] forkJoin error:', err);
        this.isLoadingItems = false;
        this.isLoading = false;
      }
    });
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
