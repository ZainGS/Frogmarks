import { AfterViewChecked, AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
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
import { FroguiSkinService } from 'app/shared/services/theme/frogui-skin.service';
import { SkinInspectorService } from 'app/shared/services/theme/skin-inspector.service';
import { ConfigurationService } from 'app/shared/services/api/configuration.service';
import { Illustration } from 'app/illustrate/models/illustration.model';
import { IllustrationService } from 'app/shared/services/illustrate/illustration.service';
import { FrogFileService } from 'app/shared/services/illustrate/frog-file.service';
import { LocalIllustrationService, LocalIllustration } from 'app/shared/services/illustrate/local-illustration.service';
import { OpfsMetadataService } from 'app/shared/services/illustrate/opfs-metadata.service';
import { firstValueFrom, forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import JSZip from 'jszip';
import { NewIllustrationDialogComponent } from '../new-illustration-dialog/new-illustration-dialog.component';

type DashboardItem = Board | Illustration;

interface GridRowItem {
  item: DashboardItem;
  globalIndex: number;
  aspect: number;
  maxWidth: number;
}

interface GridRow {
  items: GridRowItem[];
  height: number;
  isPartial: boolean;
}

interface MasonryItem {
  item: DashboardItem;
  globalIndex: number;
  aspect: number;
  height: number; // px
}

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

export class DashboardComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {

  editingId: string | null = null;
  nameControl = new FormControl<string>('');
  @ViewChildren('renameInput') renameInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild('gridContainer') gridContainerEl?: ElementRef;

  // Justified grid
  gridRows: GridRow[] = [];
  private readonly GRID_TARGET_ROW_HEIGHT = 200;

  // Masonry grid
  masonryColumns: MasonryItem[][] = [];
  private _gridDirty = false;
  private _resizeObserver?: ResizeObserver;
  _exitingIds = new Set<string>(); // public so template can bind
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
    } else if (this.isLocalIllustration(item)) {
      this.localIllustrationService.rename(item.uuid!, newName).catch(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.renameIllustration(item.id, newName).subscribe(() => {});
    }
  }

  cancelInlineRename() {
    this.editingId = null;
  }

  @HostListener('mouseover', ['$event'])
  onZoneHover(event: MouseEvent): void {
    if (!document.body.classList.contains('sb-inspecting')) return;
    const target = event.target as Element;

    const zone = target.closest('[data-fm-zone]')?.getAttribute('data-fm-zone') ?? null;
    if (zone !== this._hoveringZone) {
      this._hoveringZone = zone;
      this.skinInspector.setZoneFromDashboard(zone);
    }

    const token = target.closest('[data-fm-token]')?.getAttribute('data-fm-token') ?? null;
    if (token !== this._hoveringToken) {
      this._hoveringToken = token;
      this.skinInspector.setTokenFromDashboard(token);
    }
  }

  @HostListener('mouseleave')
  onZoneLeave(): void {
    if (this._hoveringZone)  { this._hoveringZone  = null; this.skinInspector.setZoneFromDashboard(null); }
    if (this._hoveringToken) { this._hoveringToken = null; this.skinInspector.setTokenFromDashboard(null); }
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

    if (!target.closest('.menu-container')
      && !target.closest('.storage-dropdown-arrow')
      && !target.closest('.storage-dropdown-chip')) {
      this.showStorageDropdown = false;
    }
  }

  @ViewChild(MatAutocompleteTrigger) autocompleteTrigger!: MatAutocompleteTrigger;
  scrollListener!: () => void;

  // Application State
  initialLoad: boolean = true;
  isLoading: boolean = false;
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
    this.closeContextMenu();
    this._animateArchive(item);
  }

  private _animateArchive(item: DashboardItem): void {
    const id = item.uuid!;
    const container = this.gridContainerEl?.nativeElement as HTMLElement | undefined;

    // Fire-and-forget the backend call immediately
    item.isArchived = true;
    if (this.isBoard(item)) {
      this.boardService.updateBoard(item).subscribe(() => {});
    } else if (this.isLocalIllustration(item)) {
      this.localIllustrationService.archive(id, true).catch(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.updateIllustration(item).subscribe(() => {});
    }

    // List view or masonry not mounted — remove immediately
    if (!container || this.viewType === 'list') {
      this._removeFromLists(item);
      return;
    }

    // 1. Apply exit class so the tile fades/scales out
    this._exitingIds.add(id);
    this.cdr.detectChanges();

    // 2. After exit animation, snapshot survivors and FLIP them into new positions
    setTimeout(() => {
      const snapshots = new Map<string, DOMRect>();
      container.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
        const uuid = el.dataset['itemId']!;
        if (uuid !== id) snapshots.set(uuid, el.getBoundingClientRect());
      });

      this._exitingIds.delete(id);
      this._removeFromLists(item);
      this._gridDirty = false; // prevent ngAfterViewChecked from re-running mid-FLIP
      this.recomputeGrid();
      this.cdr.detectChanges();

      requestAnimationFrame(() => {
        container.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
          const uuid = el.dataset['itemId']!;
          const before = snapshots.get(uuid);
          if (!before) return;
          const after = el.getBoundingClientRect();
          const dx = before.left - after.left;
          const dy = before.top - after.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

          // Snap back to old position instantly, then transition to natural position
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;

          requestAnimationFrame(() => {
            el.style.transition = 'transform 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            el.style.transform = '';
            el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
          });
        });
      });
    }, 180); // match CSS exit animation duration
  }

  onUnarchiveBoard(item: DashboardItem | null) {
    if (!item) return;
    this._removeFromLists(item);
    this.closeContextMenu();
    item.isArchived = false;
    if (this.isBoard(item)) {
      this.boardService.updateBoard(item).subscribe(() => {});
    } else if (this.isLocalIllustration(item)) {
      this.localIllustrationService.archive(item.uuid!, false).catch(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.updateIllustration(item).subscribe(() => {});
    }
  }

  toggleGridItemSelection(event: MouseEvent, uuid: string): void {
    event.stopPropagation();
    if (this.selectedItems.has(uuid)) {
      this.selectedItems.delete(uuid);
    } else {
      this.selectedItems.add(uuid);
    }
  }

  confirmDeleteAll(): void { this.deleteAllPending = true; }
  cancelDeleteAll(): void  { this.deleteAllPending = false; }

  doDeleteAll(): void {
    for (const item of [...this.filteredListItems]) {
      this.onDeleteBoard(item);
    }
    this.deleteAllPending = false;
  }

  batchDelete(): void {
    for (const uuid of [...this.selectedItems]) {
      const item = this.filteredListItems.find((i: any) => i.uuid === uuid);
      if (!item) continue;
      if (this.isArchivedFilterActive) {
        this.onDeleteBoard(item);
      } else {
        this.onArchiveItem(item);
      }
    }
    this.selectedItems.clear();
  }

  onDeleteBoard(item: DashboardItem | null) {
    if (!item) return;
    this._removeFromLists(item);
    this.closeContextMenu();
    if (this.isBoard(item)) {
      this.boardService.deleteBoard(item.id).subscribe(() => {});
    } else if (this.isLocalIllustration(item)) {
      // delete() cleans up IndexedDB + OPFS metadata JSON + salsa raster data
      this.localIllustrationService.delete(item.uuid!).catch(() => {});
    } else if (this.isIllustration(item)) {
      this.illustrationService.deleteIllustration(item.id).subscribe(() => {});
      // Clean up any locally cached OPFS data for this cloud illustration
      this.opfsMetadataService.delete(item.id.toString()).catch(() => {});
      this._deleteRasterOpfs(item.id.toString()).catch(() => {});
    }
  }

  private async _deleteRasterOpfs(docId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const salsaDir = await root.getDirectoryHandle('salsa-documents');
      await (salsaDir as any).removeEntry(docId, { recursive: true });
    } catch { /* not found — ignore */ }
  }

  isLocalIllustration(item: DashboardItem): boolean {
    return this.isIllustration(item) && (item as Illustration).syncMode === 2;
  }

  private _removeFromLists(item: DashboardItem): void {
    // Local items have no numeric id — filter by uuid
    const isLocal = this.isLocalIllustration(item);
    if (isLocal) {
      this.listItems         = this.listItems.filter((b: any) => b.uuid !== item.uuid);
      this.filteredListItems = this.filteredListItems.filter((b: any) => b.uuid !== item.uuid);
    } else {
      this.listItems         = this.listItems.filter((b: any) => b.id !== item.id);
      this.filteredListItems = this.filteredListItems.filter((b: any) => b.id !== item.id);
      this.boards            = this.boards.filter((b: any) => b.id !== item.id);
    }
    this._gridDirty = true;
  }

  private _illustrationRoute(ill: Illustration): any[] {
    return ill.syncMode === 2
      ? ['/illustration/local', ill.uuid]
      : ['/illustration', ill.uuid];
  }

  private _navigateToIllustration(ill: Illustration): void {
    this.router.navigate(this._illustrationRoute(ill), { state: { illustration: ill } });
  }

  openItemInNewTab(item: DashboardItem | null) {
    if (!item || !item.uuid) return;
    this.closeContextMenu();

    let url: string;
    if (this.isBoard(item)) {
      url = this.router.serializeUrl(this.router.createUrlTree(['/board', item.uuid]));
    } else if (this.isIllustration(item)) {
      url = this.router.serializeUrl(this.router.createUrlTree(this._illustrationRoute(item as Illustration)));
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
onWinResize() { this.closeContextMenu(); this._gridDirty = true; }

@HostListener('document:keydown.escape')
onEsc() { this.closeContextMenu(); }

@HostListener('document:keydown', ['$event'])
onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    this.showDevPanel = !this.showDevPanel;
  }
}

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
  deleteAllPending: boolean = false;
  isUpdatesActive: boolean = false;
  currentRecentCreationsTab = 1;
  sortBy: number = SortByOptions.LastViewed;
  orderBy: number = OrderByOptions.Descending;
  fileType: number = FileTypeOptions.All;
  showSortOrderDropdown: boolean = false;
  showFileTypeDropdown: boolean = false;
  showStorageDropdown: boolean = false;
  showNotificationPanel: boolean = false;
  showSettingsPanel: boolean = false;
  showProfilePanel: boolean = false;
  sortOrderDropdownText: string[] = ['Alphabetical', 'Date created', 'Last viewed'];
  fileTypeDropdownText: string[] = ['All file types', 'Boards', 'Illustrations', 'Animations'];
  storageFilterText: string[] = ['All storage', 'Local-Only', 'No-Cloud', 'Cloud-Only'];
  storageFilter: number = 0;
  viewType: string = "grid";
  teamInviteLink: string = 'https://www.frogmarks.com/team_invite/redeem/...';

  // Grid item overlay (Explore-style)
  overlayOpen = false;
  overlayItem: DashboardItem | null = null;
  overlayIndex: number | null = null;
  menuStyle: { [key: string]: any } = {};
  menuSide: 'left' | 'right' | null = null;
  menuTailStyle: { [key: string]: any } | null = null;
  pressedIndex: number | null = null;
  releasedIndex: number | null = null;

  // OPFS storage stats
  opfsSupported = false;
  opfsUsageMb = 0;
  opfsQuotaGb = 0;
  opfsUsagePct = 0;
  isBackingUp = false;

  // Cloud storage stats
  cloudUsedMb = 0;
  cloudQuotaGb = 0;
  cloudUsagePct = 0;
  cloudIsPro = false;

  // Auth / login state
  isLoggedIn = false;

  // Post-login backup prompt
  showBackupPrompt = false;
  backupLocalItems: LocalIllustration[] = [];
  backupProgress: { uuid: string; name: string; status: 'pending' | 'uploading' | 'done' | 'error' }[] = [];
  isBackingUpLocal = false;

  // Session-expired login modal
  showLoginModal = false;
  loginEmail = '';
  loginCodeSent = false;
  loginCode = '';
  loginSending = false;
  loginVerifying = false;
  loginError = '';
  private _sessionExpiredSub?: Subscription;
  private _inspectorPreviewSub?: Subscription;
  private _overlayAutoOpened = false;
  private _galleryPreviewSub?: Subscription;
  private _previewOverlayIndex: number | null | undefined = undefined;
  private _hoveringZone:  string | null = null;
  private _hoveringToken: string | null = null;
  private _inspectClickHandler = (e: MouseEvent) => this._onInspectClick(e);
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
    private el: ElementRef,
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
    private frogFileService: FrogFileService,
    private localIllustrationService: LocalIllustrationService,
    public skinService: FroguiSkinService,
    private skinInspector: SkinInspectorService,
    private opfsMetadataService: OpfsMetadataService) {
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
    this._gridDirty = true;
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

  importingSkin = false;
  hasSkin = false;
  showSkinBuilder = false;

  get borderRunnerAnimated(): boolean {
    return this.skinService.currentTokens['--fm-popup-border-animate'] === '1';
  }

  get borderRunnerOuter(): boolean {
    return this.skinService.currentTokens['--fm-popup-border-outer'] === '1';
  }

  get hasBorderSprite(): boolean {
    return this.skinService.currentTokens['--fm-popup-border-sprite'] !== 'none';
  }

  openSkinBuilder(): void {
    this.showSkinBuilder = true;
    this.showSettingsPanel = false;
  }

  onSkinBuilderClosed(): void {
    this.showSkinBuilder = false;
    this.hasSkin = this.skinService.hasSkin;
  }

  async onImportSkin(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importingSkin = true;
    const result = await this.skinService.importSkin(file);
    this.importingSkin = false;
    if (result.ok) {
      this.hasSkin = true;
    } else {
      this._notifyService.error(result.error ?? 'Failed to import skin.');
    }
    (event.target as HTMLInputElement).value = '';
  }

  disableSkin(): void {
    this.skinService.disableSkin();
    this.hasSkin = false;
  }

  async enableSavedSkin(): Promise<void> {
    await this.skinService.enableSavedSkin();
    this.hasSkin = this.skinService.hasSkin;
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

  trackByRowItem(_: number, ri: GridRowItem): string {
    return ri.item.uuid ?? ri.globalIndex.toString();
  }

  trackByMasonryItem(_: number, mi: MasonryItem): string {
    return mi.item.uuid ?? mi.globalIndex.toString();
  }

  // ── Masonry grid ───────────────────────────────────────────────

  getItemAspect(item: DashboardItem): number {
    if (this.isIllustration(item) && (item as Illustration).documentAspect) {
      return (item as Illustration).documentAspect!;
    }
    return 16 / 10;
  }

  private getMasonryColumnCount(width: number): number {
    if (width >= 1600) return 8;
    if (width >= 1100) return 6;
    if (width >= 700)  return 4;
    return 2;
  }

  private recomputeGrid(overrideWidth?: number): void {
    if (this.viewType === 'masonry') {
      this._recomputeMasonry(overrideWidth);
    } else {
      this._recomputeJustified(overrideWidth);
    }
  }

  private _recomputeJustified(overrideWidth?: number): void {
    const el = this.gridContainerEl?.nativeElement;
    const containerWidth: number = overrideWidth ?? (el ? el.getBoundingClientRect().width : 0);
    const items: DashboardItem[] = this.filteredListItems;

    if (!containerWidth || !items.length) {
      this.gridRows = [];
      return;
    }

    const TARGET = this.GRID_TARGET_ROW_HEIGHT;
    const rows: GridRow[] = [];
    let rowItems: GridRowItem[] = [];
    let rowAspectSum = 0;

    items.forEach((item: DashboardItem, idx: number) => {
      const aspect = this.getItemAspect(item);
      if (rowItems.length > 0 && (rowAspectSum + aspect) * TARGET > containerWidth) {
        rows.push({ items: rowItems, height: Math.min(containerWidth / rowAspectSum, TARGET), isPartial: false });
        rowItems = [];
        rowAspectSum = 0;
      }
      rowItems.push({ item, globalIndex: idx, aspect, maxWidth: TARGET * aspect });
      rowAspectSum += aspect;
    });

    if (rowItems.length > 0) {
      // Only cap widths when the last row is noticeably underfull (< 75% of container).
      // When it has nearly the same items as a full row, let it stretch like one.
      const fillRatio = (rowAspectSum * TARGET) / containerWidth;
      rows.push({ items: rowItems, height: Math.min(containerWidth / rowAspectSum, TARGET), isPartial: fillRatio < 0.75 });
    }

    this.gridRows = rows;
  }

  private _recomputeMasonry(overrideWidth?: number): void {
    const el = this.gridContainerEl?.nativeElement;
    const containerWidth: number = overrideWidth ?? (el
      ? (el.getBoundingClientRect().width || el.parentElement?.getBoundingClientRect().width || 0)
      : 0);
    const items: DashboardItem[] = this.filteredListItems;

    if (!containerWidth || !items.length) {
      this.masonryColumns = [];
      return;
    }

    const gap = 8;
    const numCols = this.getMasonryColumnCount(containerWidth);
    const colWidth = (containerWidth - gap * (numCols - 1)) / numCols;

    const columns: MasonryItem[][] = Array.from({ length: numCols }, () => []);
    const colHeights = new Array<number>(numCols).fill(0);

    items.forEach((item: DashboardItem, idx: number) => {
      const aspect = this.getItemAspect(item);
      const height = Math.round(colWidth / aspect);
      const shortest = colHeights.indexOf(Math.min(...colHeights));
      columns[shortest].push({ item, globalIndex: idx, aspect, height });
      colHeights[shortest] += height + gap;
    });

    this.masonryColumns = columns;
  }

  ngAfterViewChecked(): void {
    const el = this.gridContainerEl?.nativeElement;
    const measuredWidth = el?.clientWidth || el?.parentElement?.clientWidth || 0;
    if ((this.viewType === 'grid' || this.viewType === 'masonry') && this._gridDirty && measuredWidth) {
      this._gridDirty = false;

      if (!this._resizeObserver) {
        this._resizeObserver = new ResizeObserver(() => {
          if (this.overlayOpen) return;
          if (this._sidebarTransitioning) return;
          this.recomputeGrid();
        });
        this._resizeObserver.observe(this.gridContainerEl.nativeElement);
      }

      setTimeout(() => this.recomputeGrid(), 0);
    }
  }

  ngOnDestroy() {
    this.el.nativeElement.removeEventListener('click', this._inspectClickHandler, true);
    window.removeEventListener('scroll', this.scrollListener, true);
    window.removeEventListener('resize', this.onResize);
    this._resizeObserver?.disconnect();
    this._sessionExpiredSub?.unsubscribe();
    this._inspectorPreviewSub?.unsubscribe();
    this._galleryPreviewSub?.unsubscribe();
  }

  private _onInspectClick(event: MouseEvent): void {
    if (!document.body.classList.contains('sb-inspecting')) return;

    // Icons-section: intercept icon clicks before zone handling
    const iconEl = (event.target as Element).closest('[data-fm-icon]');
    const iconName = iconEl?.getAttribute('data-fm-icon') ?? null;
    if (iconName && this.skinInspector.isIconsGroupActive) {
      event.stopPropagation();
      event.preventDefault();
      this.skinInspector.clickIconFromDashboard(iconName);
      return;
    }

    const zoneEl = (event.target as Element).closest('[data-fm-zone]');
    const zone = zoneEl?.getAttribute('data-fm-zone') ?? null;
    if (zone) this.skinInspector.clickZoneFromDashboard(zone);
    // Allow gallery clicks through (opens the popup card); block everything else
    if (zone && zone !== 'gallery') {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  private onScroll() {
    if (this.autocompleteTrigger?.panelOpen) {
      this.autocompleteTrigger.closePanel();
    }
  }

  private resizeTimeout: any;
  ngOnInit(): void {
    this.hasSkin = this.skinService.hasSkin;
    setTimeout(() => this.initialLoad = false, 1200);

    this.el.nativeElement.addEventListener('click', this._inspectClickHandler, true);
    this.scrollListener = this.onScroll.bind(this);
    window.addEventListener('scroll', this.scrollListener, true); // 'true' for capturing phase
    window.addEventListener('resize', this.onResize);

    this._inspectorPreviewSub = this.skinInspector.popupPreview$.subscribe(show => {
      if (show) {
        if (this.filteredListItems.length > 0 && !this.overlayOpen) {
          this.openItemOverlay(this.filteredListItems[0], 0);
          this._overlayAutoOpened = true;
        }
      } else if (this._overlayAutoOpened) {
        if (this.overlayOpen) this.closeItemOverlay();
        this._overlayAutoOpened = false;
      }
    });

    this._galleryPreviewSub = this.skinInspector.galleryPreview$.subscribe(mode => {
      if (mode === 'selected') {
        if (this._previewOverlayIndex === undefined && !this.overlayOpen && this.filteredListItems.length > 0) {
          this._previewOverlayIndex = this.overlayIndex;
          this.overlayIndex = 0;
        }
      } else {
        if (this._previewOverlayIndex !== undefined) {
          if (!this.overlayOpen) this.overlayIndex = this._previewOverlayIndex ?? null;
          this._previewOverlayIndex = undefined;
        }
      }
    });

    // 1. Load local items immediately — no auth needed
    this._loadLocalItemsOnly();

    // 2. Try to load cloud items in parallel — fails gracefully if not logged in
    // Verify the session is live against a protected endpoint before trusting the cached uid
    this._authService.verifySession().pipe(
      catchError(() => of(null))
    ).subscribe(uid => {
      if (!uid) {
        this.isLoggedIn = false;
        this.isLoading = false;
        return;
      }

      this.uid = uid;
      this.isLoggedIn = true;

      this._teamService.getTeamsByUserId(this.uid).subscribe({
        next: (res: any) => {
          this.teams = res.resultObject;
          this.currentTeam = this.teams[0];

          if (!this.currentTeam?.id) {
            this.isLoading = false;
            return;
          }

          this.loadAllItems();
        },
        error: () => {
          this.isLoading = false;
        }
      });
    });
    
    // Sum design item count
    this.totalCreations = this.boards.length + this.designs.length + this.slides.length;

    this.themeService.toggleDarkMode(true);
    this._loadOpfsStats();
    this._loadCloudStorageQuota();

    this._sessionExpiredSub = this._authService.sessionExpired$.subscribe(() => {
      if (!this.showLoginModal) {
        this.showLoginModal = true;
        this.loginCodeSent = false;
        this.loginEmail = '';
        this.loginCode = '';
        this.loginError = '';
      }
    });
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

  isSidenavCollapsed = false;
  private _sidebarTransitioning = false;
  private _flipAnimGen = 0;

  toggleSidenavCollapsed(): void {
    const container = this.gridContainerEl?.nativeElement as HTMLElement | undefined;

    // Snapshot current positions before anything changes
    const snapshots = new Map<string, DOMRect>();
    if (container) {
      container.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
        snapshots.set(el.dataset['itemId']!, el.getBoundingClientRect());
      });
    }

    // Sidebar is always 250px expanded / 70px collapsed → delta is always ±180px
    const currentWidth = container?.getBoundingClientRect().width ?? 0;
    const newWidth = currentWidth + (this.isSidenavCollapsed ? -180 : 180);

    this._sidebarTransitioning = true;
    this.isSidenavCollapsed = !this.isSidenavCollapsed;

    if (container && newWidth > 0) {
      // Recompute grid for the final width immediately — sidebar CSS transition runs in parallel
      this.recomputeGrid(newWidth);
      this.cdr.detectChanges();

      // Snap synchronously — no flash frame at new positions
      const toAnimate: HTMLElement[] = [];
      container.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
        const before = snapshots.get(el.dataset['itemId']!);
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        toAnimate.push(el);
      });

      requestAnimationFrame(() => {
        toAnimate.forEach(el => {
          el.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
          el.style.transform = '';
          el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
        });
      });
    }

    setTimeout(() => { this._sidebarTransitioning = false; }, 210);
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

  private _applyFilters(): void {
    let items = this.listItems;

    switch (this.fileType) {
      case 1: items = items.filter((item: any) => this.isBoard(item)); break;
      case 2: items = items.filter((item: any) => this.isIllustration(item)); break;
    }

    switch (this.storageFilter) {
      case 1: items = items.filter((item: any) => item.syncMode === 2); break;  // Local-Only
      case 2: items = items.filter((item: any) => item.syncMode === 1); break;  // No-Cloud
      case 3: items = items.filter((item: any) => item.syncMode === 0); break;  // Cloud-Only
    }

    this.filteredListItems = items;
    this._gridDirty = true;
  }

  changeFileType(option: number) {
    this.fileType = option;
    this._applyFilters();
  }

  changeStorageFilter(option: number) {
    this.storageFilter = option;
    this._applyFilters();
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
    if (this.showSortOrderDropdown) { this.showFileTypeDropdown = false; this.showStorageDropdown = false; }
  }

  toggleFileTypeDropdown() {
    this.showFileTypeDropdown = !this.showFileTypeDropdown;
    if (this.showFileTypeDropdown) { this.showSortOrderDropdown = false; this.showStorageDropdown = false; }
  }

  toggleStorageDropdown() {
    this.showStorageDropdown = !this.showStorageDropdown;
    if (this.showStorageDropdown) { this.showFileTypeDropdown = false; this.showSortOrderDropdown = false; }
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
    if (this._newIllustrationDialogRef) return;
    this._newIllustrationDialogRef = this.dialog.open(NewIllustrationDialogComponent, {
      width: '420px',
      panelClass: 'new-illustration-dialog',
      disableClose: false,
      enterAnimationDuration: '0ms',
      data: { isLoggedIn: this.isLoggedIn },
    });
    const ref = this._newIllustrationDialogRef;

    ref.afterClosed().subscribe(async (result: { name: string; docW: number | null; docH: number | null; bounded: boolean; syncMode: number } | null) => {
      this._newIllustrationDialogRef = null;
      if (!result) return;

      const generatedName = `${this.namingHelper.getRandomAdjective()} ${this.namingHelper.getRandomGemstone()} Illustration`;
      const docAspect = result.bounded && result.docW && result.docH ? result.docW / result.docH : undefined;

      // Local-only: skip API, create in IndexedDB, navigate to local route
      if (result.syncMode === 2) {
        try {
          const local = await this.localIllustrationService.create(generatedName, docAspect);
          const queryParams = result.bounded && result.docW && result.docH
            ? { docW: result.docW, docH: result.docH } : {};
          this.router.navigate(['/illustration/local', local.uuid], {
            queryParams,
            state: { illustration: local, isNew: true }
          });
        } catch (e) {
          this._notifyService.error('There was an error creating a local illustration :(');
        }
        return;
      }

      if (!this.currentTeam || !this.currentTeam.id) {
        this._notifyService.error('No current team selected');
        return;
      }

      const newIllustration: Illustration = {
        id: 0,
        name: generatedName,
        description: '',
        teamId: this.currentTeam.id,
        documentAspect: docAspect,
        syncMode: result.syncMode,
      };

      this._illustrationService.createIllustration(newIllustration).subscribe({
        next: async (res: any) => {
          if (res.resultType === ResultType.Success) {
            const ill = res.resultObject;
            await this.localIllustrationService.createFromCloudMetadata({
              uuid: ill.uuid, name: ill.name ?? generatedName, syncMode: 2,
              createdAt: Date.now(), updatedAt: Date.now(), documentAspect: docAspect,
              isFavorite: false, isArchived: false, type: 'illustration',
              syncStatus: result.syncMode === 0 ? 'synced' : 'cloud-metadata-only',
              localLibraryId: this.localIllustrationService['_profileService']?.getLocalLibraryId?.() ?? '',
              cloudIllustrationId: ill.id, cloudOwnerUserId: this.uid,
            });
            if (result.bounded && result.docW && result.docH) {
              this.router.navigate(['/illustration', ill.uuid], {
                queryParams: { docW: result.docW, docH: result.docH },
                state: { illustration: ill, isNew: true }
              });
            } else {
              this.router.navigate(['/illustration', ill.uuid], { state: { illustration: ill, isNew: true } });
            }
          } else {
            this._notifyService.error('There was an error creating a new illustration :(');
          }
        },
        error: () => this._notifyService.error('There was an error creating a new illustration :('),
      });
    });
  }

  newAnimationButtonClicked(): void {
    if (this._newIllustrationDialogRef) return;
    this._newIllustrationDialogRef = this.dialog.open(NewIllustrationDialogComponent, {
      width: '420px',
      panelClass: 'new-illustration-dialog',
      disableClose: false,
      enterAnimationDuration: '0ms',
      data: { isLoggedIn: this.isLoggedIn },
    });
    const ref = this._newIllustrationDialogRef;

    ref.afterClosed().subscribe(async (result: { name: string; docW: number | null; docH: number | null; bounded: boolean; syncMode: number } | null) => {
      this._newIllustrationDialogRef = null;
      if (!result) return;

      const generatedName = `${this.namingHelper.getRandomAdjective()} ${this.namingHelper.getRandomGemstone()} Animation`;
      const docAspect = result.bounded && result.docW && result.docH ? result.docW / result.docH : undefined;

      if (result.syncMode === 2) {
        try {
          const local = await this.localIllustrationService.create(generatedName, docAspect);
          const queryParams = result.bounded && result.docW && result.docH
            ? { docW: result.docW, docH: result.docH } : {};
          this.router.navigate(['/illustration/local', local.uuid], {
            queryParams,
            state: { illustration: local, isNew: true, startAnimation: true },
          });
        } catch (e) {
          this._notifyService.error('There was an error creating a local animation :(');
        }
        return;
      }

      if (!this.currentTeam?.id) {
        this._notifyService.error('No current team selected');
        return;
      }

      const newIllustration: Illustration = {
        id: 0,
        name: generatedName,
        description: '',
        teamId: this.currentTeam.id,
        documentAspect: docAspect,
        syncMode: result.syncMode,
      };

      this._illustrationService.createIllustration(newIllustration).subscribe({
        next: async (res: any) => {
          if (res.resultType === ResultType.Success) {
            const ill = res.resultObject;
            await this.localIllustrationService.createFromCloudMetadata({
              uuid: ill.uuid, name: ill.name ?? generatedName, syncMode: 2,
              createdAt: Date.now(), updatedAt: Date.now(), documentAspect: docAspect,
              isFavorite: false, isArchived: false, type: 'illustration',
              syncStatus: result.syncMode === 0 ? 'synced' : 'cloud-metadata-only',
              localLibraryId: this.localIllustrationService['_profileService']?.getLocalLibraryId?.() ?? '',
              cloudIllustrationId: ill.id, cloudOwnerUserId: this.uid,
            });
            const queryParams = result.bounded && result.docW && result.docH
              ? { docW: result.docW, docH: result.docH } : {};
            this.router.navigate(['/illustration', ill.uuid], {
              queryParams,
              state: { illustration: ill, isNew: true, startAnimation: true },
            });
          } else {
            this._notifyService.error('There was an error creating a new animation :(');
          }
        },
        error: () => this._notifyService.error('There was an error creating a new animation :('),
      });
    });
  }

  /** Import a .frog file: pick file → ask for sync mode → create illustration → navigate. */
  async importFrogFile(): Promise<void> {
    try {
      // 1. Pick and parse the .frog file
      const result = await this.frogFileService.importFrogFile();

      // 2. Ask the user which storage mode to use
      if (this._newIllustrationDialogRef) return;
      this._newIllustrationDialogRef = this.dialog.open(NewIllustrationDialogComponent, {
        width: '420px',
        panelClass: 'new-illustration-dialog',
        disableClose: false,
        enterAnimationDuration: '0ms',
        data: { importMode: true, defaultName: result.manifest.name || 'Imported Illustration', isLoggedIn: this.isLoggedIn }
      });

      const modeResult: { syncMode: number } | null = await firstValueFrom(this._newIllustrationDialogRef.afterClosed());
      this._newIllustrationDialogRef = null;
      if (!modeResult) return; // user cancelled

      const importName = result.manifest.name || 'Imported Illustration';

      // 3a. Local-only: create in IndexedDB
      if (modeResult.syncMode === 2) {
        const local = await this.localIllustrationService.create(importName);
        this.frogFileService.pendingImport = result;
        this.router.navigate(['/illustration/local', local.uuid], { state: { illustration: local } });
        return;
      }

      // 3b. Cloud / No-cloud: create via API
      if (!this.currentTeam || !this.currentTeam.id) {
        this._notifyService.error('No current team selected');
        return;
      }

      const newIllustration: Illustration = {
        id: 0,
        name: importName,
        description: '',
        teamId: this.currentTeam.id,
        syncMode: modeResult.syncMode,
      };

      this._illustrationService.createIllustration(newIllustration).subscribe({
        next: (res: any) => {
          if (res.resultType === ResultType.Success) {
            this.frogFileService.pendingImport = result;
            this.router.navigate(['/illustration', res.resultObject.uuid], { state: { illustration: res.resultObject } });
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
    if (!listItem.isArchived) {
      if (this.isBoard(listItem)) {
        this.router.navigate(['/board', listItem.uuid]);
      } else if (this.isIllustration(listItem)) {
        this._navigateToIllustration(listItem as Illustration);
      }
    }
  }

  toggleFavorite(uuid: string, item: DashboardItem) {
    const nowFavorite = !this.favorites.has(uuid);
    item.isFavorite = nowFavorite;
    if (nowFavorite) {
      this.favorites.add(uuid);
    } else {
      this.favorites.delete(uuid);
    }

    if (this.isBoard(item)) {
      item.teamId = this.currentTeam.id;
      this.boardService.favoritedBoard(item).subscribe(() => {});
    } else if (this.isLocalIllustration(item)) {
      this.localIllustrationService.favorite(uuid, nowFavorite).catch(() => {});
    } else if (this.isIllustration(item)) {
      item.teamId = this.currentTeam.id;
      this.illustrationService.favoriteIllustration(item).subscribe(() => {});
    }
  }

  isFavorite(uuid: string): boolean {
    return this.favorites.has(uuid);
  }

  getThumbnailSrc(item: DashboardItem): string {
    const local = (item as any).thumbnailDataUrl;
    if (local) return local;
    const url = (item as any).thumbnailUrl;
    return url && url !== '' ? url : 'https://placehold.jp/ffffff/ffffff/150x150.png';
  }

  gridViewClicked() {
    if (this.viewType === 'list') { this._flipListTransition('grid'); return; }
    this._flipViewSwitch('grid');
  }

  masonryViewClicked() {
    if (this.viewType === 'list') { this._flipListTransition('masonry'); return; }
    this._flipViewSwitch('masonry');
  }

  listViewClicked() {
    if (this.viewType === 'grid' || this.viewType === 'masonry') { this._flipListTransition('list'); return; }
    this.viewType = 'list';
  }

  private _flipViewSwitch(newView: 'grid' | 'masonry'): void {
    if (this.viewType === newView) return;
    const gen = ++this._flipAnimGen;

    // Snapshot positions before the old container is destroyed
    const snapshots = new Map<string, DOMRect>();
    (this.el.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-item-id]').forEach((el: HTMLElement) => {
      snapshots.set(el.dataset['itemId']!, el.getBoundingClientRect());
    });

    // Open overflow so items animating from outside the new (shorter) layout aren't clipped
    const workPane = (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('.base-work-pane');
    if (workPane) workPane.style.overflow = 'visible';
    // Max stagger (160ms) + animation duration (300ms) + small buffer
    setTimeout(() => { if (workPane) workPane.style.overflow = ''; }, 480);

    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;

    this.viewType = newView;
    // Don't set _gridDirty — we manage the recompute ourselves so ngAfterViewChecked
    // doesn't schedule a competing setTimeout that would jump items mid-FLIP
    this.cdr.detectChanges(); // new container is in DOM, gridContainerEl updated

    // Wire up ResizeObserver for the new container
    const newContainerEl = this.gridContainerEl?.nativeElement;
    if (newContainerEl) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.overlayOpen) return;
        if (this._sidebarTransitioning) return;
        this.recomputeGrid();
      });
      this._resizeObserver.observe(newContainerEl);
    }

    this.recomputeGrid();
    this.cdr.detectChanges(); // rows/columns applied to DOM

    // Build a row-index map from pre-switch top positions for stagger delays
    const uniqueTops = [...new Set(
      [...snapshots.values()].map(r => Math.round(r.top / 8) * 8)
    )].sort((a, b) => a - b);
    const rowDelay = (top: number) => Math.min(uniqueTops.indexOf(Math.round(top / 8) * 8) * 20, 160);

    // Apply snaps synchronously — no rAF here, so there's no flash frame at new positions
    const toAnimate: Array<{ el: HTMLElement; delay: number }> = [];
    (this.el.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-item-id]').forEach((el: HTMLElement) => {
      const before = snapshots.get(el.dataset['itemId']!);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      toAnimate.push({ el, delay: rowDelay(before.top) });
    });

    // Play: browser has committed the snap by next frame, enable transition with stagger
    requestAnimationFrame(() => {
      if (gen !== this._flipAnimGen) return;
      toAnimate.forEach(({ el, delay }) => {
        el.style.transition = `transform 300ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
        el.style.transform = '';
        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
      });
    });
  }

  private _flipListTransition(toView: 'grid' | 'masonry' | 'list'): void {
    const fromView = this.viewType;
    if (fromView === toView) return;
    const gen = ++this._flipAnimGen;

    const root = this.el.nativeElement as HTMLElement;

    // Snapshot thumbnail rects and build stagger map from current layout
    const imgSnapshots = new Map<string, DOMRect>();
    const staggerByUuid = new Map<string, number>();
    {
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-item-id]'));
      const uniqueTops = [...new Set(
        cards.map(el => Math.round(el.getBoundingClientRect().top / 8) * 8)
      )].sort((a, b) => a - b);
      cards.forEach(el => {
        const img = el.querySelector<HTMLImageElement>('img.thumbnail-img');
        if (img) imgSnapshots.set(el.dataset['itemId']!, img.getBoundingClientRect());
        const rowKey = Math.round(el.getBoundingClientRect().top / 8) * 8;
        staggerByUuid.set(el.dataset['itemId']!, Math.min(uniqueTops.indexOf(rowKey) * 20, 160));
      });
    }

    // Open work-pane overflow for the full animation window
    const workPane = root.querySelector<HTMLElement>('.base-work-pane');
    if (workPane) workPane.style.overflow = 'visible';
    setTimeout(() => { if (workPane) workPane.style.overflow = ''; }, 600);

    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;

    this.viewType = toView;
    this.cdr.detectChanges();

    if (toView !== 'list') {
      const newContainerEl = this.gridContainerEl?.nativeElement;
      if (newContainerEl) {
        this._resizeObserver = new ResizeObserver(() => {
          if (this.overlayOpen || this._sidebarTransitioning) return;
          this.recomputeGrid();
        });
        this._resizeObserver.observe(newContainerEl);
      }
      this.recomputeGrid();
      this.cdr.detectChanges();
    }

    // FLIP: animate only the thumbnail image, fade in non-image meta for list view
    const toAnimate: Array<{ img: HTMLImageElement; card: HTMLElement; imgWrapper: HTMLElement | null; delay: number }> = [];
    const metaEls: Array<{ el: HTMLElement; delay: number }> = [];

    root.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
      const uuid = el.dataset['itemId']!;
      const before = imgSnapshots.get(uuid);
      if (!before) return;

      const img = el.querySelector<HTMLImageElement>('img.thumbnail-img');
      if (!img) return;
      const after = img.getBoundingClientRect();
      if (after.width < 1 || after.height < 1) return;

      const dx = before.left - after.left;
      const dy = before.top - after.top;
      const scaleX = before.width / after.width;
      const scaleY = before.height / after.height;
      const delay = staggerByUuid.get(uuid) ?? 0;

      // Allow overflow so the thumbnail can travel outside its clipping container
      el.style.overflow = 'visible';
      const imgWrapper = el.querySelector<HTMLElement>('.image-wrapper');
      if (imgWrapper) imgWrapper.style.overflow = 'visible';

      img.style.transition = 'none';
      img.style.transformOrigin = '0 0';
      img.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;

      toAnimate.push({ img, card: el, imgWrapper, delay });

      // Fade in non-image content when arriving at list or grid/masonry view
      const metaSelector = toView === 'list' ? '[data-list-meta]' : '[data-grid-meta]';
      el.querySelectorAll<HTMLElement>(metaSelector).forEach(metaEl => {
        metaEl.style.opacity = '0';
        metaEl.style.transition = 'none';
        metaEls.push({ el: metaEl, delay: delay + 120 });
      });
    });

    requestAnimationFrame(() => {
      if (gen !== this._flipAnimGen) return;
      toAnimate.forEach(({ img, card, imgWrapper, delay }) => {
        img.style.transition = `transform 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
        img.style.transform = '';
        img.addEventListener('transitionend', () => {
          img.style.transition = '';
          img.style.transformOrigin = '';
          card.style.overflow = '';
          if (imgWrapper) imgWrapper.style.overflow = '';
        }, { once: true });
      });

      metaEls.forEach(({ el, delay }) => {
        el.style.transition = `opacity 200ms ease ${delay}ms`;
        el.style.opacity = '1';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.opacity = '';
        }, { once: true });
      });
    });
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
    this.deleteAllPending = false;
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
    if (this.isLocalIllustration(item)) {
      this.closeContextMenu();
      this.notifyService.error('Local-only illustrations do not have a shareable link.');
      return;
    }

    const baseUrl = this.configurationService.loadConfigurations().clientUrl;
    let url: string;
    if (this.isBoard(item)) {
      url = `${baseUrl}/board/${item.uuid}`;
    } else {
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
    } else if (this.isLocalIllustration(item)) {
      this.localIllustrationService.create(`Copy of ${item.name}`, (item as Illustration).documentAspect).then(copy => {
        this.listItems.unshift(copy as any);
        this.filteredListItems.unshift(copy as any);
      }).catch(() => this.notifyService.error('There was an error duplicating the illustration :('));
    } else if (this.isIllustration(item)) {
      const payload = { name: `Copy of ${item.name}`, teamId: item.teamId, copyThumbnail: true };
      this.illustrationService.duplicateIllustration(item.id, payload).subscribe({
        next: (res: any) => {
          if (res.resultType === ResultType.Success) {
            this.listItems.unshift(res.resultObject);
            this.filteredListItems.unshift(res.resultObject);
          } else {
            this.notifyService.error('There was an error duplicating the illustration :(');
          }
        },
        error: () => this.notifyService.error('There was an error duplicating the illustration :('),
      });
    }
  }

  isLeftHalf(index: number): boolean {
    const approxCols = Math.max(1, Math.floor(window.innerWidth / 280));
    return (index % approxCols) < approxCols / 2;
  }

  onGridItemMouseDown(_item: DashboardItem, index: number, ev: MouseEvent) {
    ev.stopPropagation();
    this.pressedIndex = index;
    this.releasedIndex = null;
  }

  onGridItemMouseUp(item: DashboardItem, index: number, ev: MouseEvent) {
    ev.stopPropagation();
    this.pressedIndex = null;
    this.releasedIndex = index;
    if (ev.ctrlKey) {
      this.listItemSelected(ev, item.uuid!);
    } else {
      this.openItemOverlay(item, index);
    }
  }

  onGridItemMouseLeave(index: number) {
    if (this.pressedIndex === index) this.pressedIndex = null;
  }

  openItemOverlay(item: DashboardItem, index: number) {
    this.overlayItem = item;
    this.overlayIndex = index;
    this.overlayOpen = true;
    setTimeout(() => {
      const el = document.querySelector(`[data-item-id="${item.uuid}"]`) as HTMLElement | null;
      const menuWidth = Math.min(460, Math.round(window.innerWidth * 0.40));
      const rect = el?.getBoundingClientRect();
      if (rect) {
        const vc = rect.top + rect.height / 2;
        const menuHalf = 170;
        const top = Math.max(12, Math.min(vc - menuHalf, window.innerHeight - 24 - menuHalf * 2));
        if (rect.left < window.innerWidth / 2) {
          const left = Math.max(8, Math.min(rect.right + 16, window.innerWidth - menuWidth - 8));
          this.menuStyle = { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` };
          this.menuSide = 'right';
          this.menuTailStyle = { position: 'fixed', left: `${left - 9}px`, top: `${Math.max(8, Math.min(vc - 12, window.innerHeight - 24))}px` };
        } else {
          const left = Math.max(8, Math.min(rect.left - 24 - menuWidth, window.innerWidth - menuWidth - 8));
          this.menuStyle = { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` };
          this.menuSide = 'left';
          this.menuTailStyle = { position: 'fixed', left: `${left + menuWidth + 8}px`, top: `${Math.max(8, Math.min(vc - 12, window.innerHeight - 24))}px` };
        }
      } else {
        this.menuStyle = {}; this.menuSide = null; this.menuTailStyle = null;
      }
    }, 8);
  }

  closeItemOverlay(ev?: Event) {
    ev?.stopPropagation();
    this.overlayOpen = false;
    this.overlayItem = null;
    this.overlayIndex = null;
    this.releasedIndex = null;
    this.menuStyle = {};
    this.menuSide = null;
    this.menuTailStyle = null;
  }

  navigateToItem(item: DashboardItem | null) {
    if (!item || item.isArchived) return;
    this.closeItemOverlay();
    if (this.isBoard(item)) {
      this.router.navigate(['/board', item.uuid]);
    } else if (this.isIllustration(item)) {
      this._navigateToIllustration(item as Illustration);
    }
  }

  private async _loadLocalItemsOnly(): Promise<void> {
    try {
      const localItems = await this.localIllustrationService.getAll(this.isArchivedFilterActive);
      const filtered = this.isFavoritesFilterActive ? localItems.filter(i => i.isFavorite) : localItems;
      filtered.forEach(local => {
        this.listItems.push({ ...local, dateModified: new Date(local.updatedAt).toISOString() } as any);
        if (local.isFavorite && local.uuid) this.favorites.add(local.uuid);
      });
      this.filteredListItems = [...this.listItems];
      this._gridDirty = true;
      this.cdr.detectChanges();
    } catch (e) {
      console.warn('[Dashboard] local illustrations load failed:', e);
    }
  }

  getSyncStatusIcon(status: string): string {
    switch (status) {
      case 'syncing':              return 'sync';
      case 'cloud-record-created': return 'cloud_upload';
      case 'cloud-metadata-only':  return 'cloud_download';
      case 'synced':               return 'cloud_done';
      case 'sync-paused':          return 'cloud_off';
      case 'sync-error':           return 'sync_problem';
      case 'conflict':             return 'warning';
      default:                     return 'cloud_off'; // local-only
    }
  }

  isSyncingCloud = false;
  showDevPanel = false;
  private _newIllustrationDialogRef: import('@angular/material/dialog').MatDialogRef<NewIllustrationDialogComponent> | null = null;

  async syncCloudToLocal(): Promise<void> {
    if (!this.currentTeam?.id || this.isSyncingCloud) return;
    this.isSyncingCloud = true;

    try {
      const illustrationsRes: any = await firstValueFrom(
        this._illustrationService.getIllustrationsByTeamId(this.currentTeam.id, '', false, false)
          .pipe(catchError(() => of(null)))
      );

      const cloudIlls: Illustration[] = illustrationsRes?.resultObject ?? [];
      const localIlls = await this.localIllustrationService.getAll(true);

      this._downloadJson('cloud-metadata.txt', cloudIlls);
      this._downloadJson('local-indexeddb.txt', localIlls);

      this._notifyService.success('Downloaded cloud + local metadata for inspection');
    } catch (e) {
      console.error('[Dashboard] metadata export failed', e);
      this._notifyService.error('Failed to export metadata');
    } finally {
      this.isSyncingCloud = false;
    }
  }

  async backfillCloudToLocal(): Promise<void> {
    if (!this.currentTeam?.id || this.isSyncingCloud) return;
    this.isSyncingCloud = true;
    try {
      const illustrationsRes: any = await firstValueFrom(
        this._illustrationService.getIllustrationsByTeamId(this.currentTeam.id, '', false, false)
          .pipe(catchError(() => of(null)))
      );
      const cloudIlls: Illustration[] = illustrationsRes?.resultObject ?? [];
      const existing = await this.localIllustrationService.getAll(true);
      const existingCloudIds = new Set(existing.map(i => i.cloudIllustrationId).filter(Boolean));
      let created = 0;
      const libraryId = (this.localIllustrationService as any)._profileService?.getLocalLibraryId?.() ?? '';
      for (const ill of cloudIlls) {
        if (!ill.id || existingCloudIds.has(ill.id)) continue;
        await this.localIllustrationService.createFromCloudMetadata({
          uuid: ill.uuid ?? crypto.randomUUID(),
          name: ill.name ?? 'Untitled',
          syncMode: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          documentAspect: ill.documentAspect,
          isFavorite: ill.isFavorite ?? false,
          isArchived: ill.isArchived ?? false,
          type: 'illustration',
          syncStatus: 'cloud-metadata-only',
          localLibraryId: libraryId,
          cloudIllustrationId: ill.id,
          cloudOwnerUserId: this.uid,
          thumbnailUrl: ill.thumbnailUrl,
        });
        created++;
      }
      this._notifyService.success(
        created > 0
          ? `Backfilled ${created} cloud project${created > 1 ? 's' : ''} to IndexedDB`
          : 'All cloud projects already in IndexedDB'
      );
      this.loadAllItems();
    } catch (e) {
      console.error('[Dashboard] backfill failed', e);
      this._notifyService.error('Backfill failed');
    } finally {
      this.isSyncingCloud = false;
    }
  }

  private _downloadJson(filename: string, data: any): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async _loadOpfsStats(): Promise<void> {
    if (!navigator?.storage?.estimate) return;
    try {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      this.opfsQuotaGb = quota / (1024 ** 3);
      this.opfsUsageMb = usage / (1024 ** 2);
      this.opfsUsagePct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
      this.opfsSupported = true;
    } catch {
      this.opfsSupported = false;
    }
  }

  sendReauthCode(): void {
    if (!this.loginEmail.trim()) return;
    this.loginSending = true;
    this.loginError = '';
    this._authService.sendReauthCode(this.loginEmail.trim()).subscribe({
      next: () => {
        this.loginSending = false;
        this.loginCodeSent = true;
      },
      error: () => {
        this.loginSending = false;
        this.loginError = 'Could not send a code to that email. Please check the address and try again.';
      }
    });
  }

  verifyReauthCode(): void {
    const code = this.loginCode.trim();
    if (!code) return;
    this.loginVerifying = true;
    this.loginError = '';
    this._authService.verifyReauthCode(this.loginEmail.trim(), code).subscribe({
      next: (res) => {
        if (res?.resultObject) {
          this.uid = res.resultObject;
          this.isLoggedIn = true;
          this.showLoginModal = false;
          this.loginVerifying = false;
          // Load teams and cloud content in the background
          this._teamService.getTeamsByUserId(this.uid).subscribe((teamsRes: any) => {
            this.teams = teamsRes.resultObject ?? [];
            this.currentTeam = this.teams[0];
            if (this.currentTeam?.id) {
              this.loadAllItems();
            }
          });
          // Check for un-backed-up local projects and offer to sync them
          this.localIllustrationService.getAll().then(items => {
            const localOnly = items.filter(i => i.syncStatus === 'local-only');
            if (localOnly.length > 0) {
              this.backupLocalItems = localOnly;
              this.backupProgress = localOnly.map(i => ({
                uuid: i.uuid,
                name: i.name,
                status: 'pending' as const,
              }));
              this.showBackupPrompt = true;
            }
          });
        } else {
          this.loginVerifying = false;
          this.loginError = 'Invalid or expired code. Please try again.';
        }
      },
      error: () => {
        this.loginVerifying = false;
        this.loginError = 'Invalid or expired code. Please try again.';
      }
    });
  }

  reloadPage(): void {
    window.location.reload();
  }

  onLogout(): void {
    this._authService.logout().subscribe({
      next: () => {
        this.isLoggedIn = false;
        this.uid = '';
        this.loadAllItems();
      },
      error: () => {
        this.isLoggedIn = false;
        this.uid = '';
        this.loadAllItems();
      }
    });
  }

  onPersonButtonClicked(): void {
    console.log(this.isLoggedIn);
    if (!this.isLoggedIn) {
      this.showLoginModal = true;
      this.loginCodeSent = false;
      this.loginEmail = '';
      this.loginCode = '';
      this.loginError = '';
    } else {
      this.showProfilePanel = !this.showProfilePanel;
    }
  }

  get backupProgressStarted(): boolean {
    return this.backupProgress.some(p => p.status !== 'pending');
  }

  skipLocalBackup(): void {
    this.showBackupPrompt = false;
  }

  async startLocalBackup(): Promise<void> {
    if (!this.currentTeam?.id) {
      this._notifyService.error('Team not loaded yet — please try again in a moment.');
      return;
    }
    this.isBackingUpLocal = true;

    for (const item of this.backupLocalItems) {
      const prog = this.backupProgress.find(p => p.uuid === item.uuid)!;
      prog.status = 'uploading';
      try {
        await this.localIllustrationService.updateSyncStatus(item.uuid, 'syncing');
        const res: any = await firstValueFrom(
          this.illustrationService.createIllustration({
            id: 0,
            name: item.name,
            description: '',
            teamId: this.currentTeam.id!,
            documentAspect: item.documentAspect,
            syncMode: 0,
          })
        );
        if (res?.resultType === ResultType.Success && res?.resultObject?.id) {
          await this.localIllustrationService.updateSyncStatus(
            item.uuid, 'cloud-record-created', res.resultObject.id, this.uid
          );
          prog.status = 'done';
        } else {
          throw new Error('create failed');
        }
      } catch {
        await this.localIllustrationService.updateSyncStatus(item.uuid, 'sync-error');
        prog.status = 'error';
      }
    }

    this.isBackingUpLocal = false;
    setTimeout(() => {
      this.showBackupPrompt = false;
      this.loadAllItems();
    }, 1400);
  }

  private _loadCloudStorageQuota(): void {
    this.illustrationService.getStorageQuota().subscribe({
      next: (res) => {
        const q = res?.resultObject;
        if (!q) return;
        this.cloudUsedMb = q.usedBytes / (1024 ** 2);
        this.cloudQuotaGb = q.quotaBytes / (1024 ** 3);
        this.cloudUsagePct = q.quotaBytes > 0 ? Math.min(100, (q.usedBytes / q.quotaBytes) * 100) : 0;
        this.cloudIsPro = q.isPro;
      },
      error: () => {}
    });
  }

  private async _addDirToZip(dir: FileSystemDirectoryHandle, zip: JSZip, path: string): Promise<void> {
    for await (const [name, handle] of (dir as any).entries()) {
      const entryPath = path ? `${path}/${name}` : name;
      if ((handle as any).kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        zip.file(entryPath, file);
      } else {
        await this._addDirToZip(handle as FileSystemDirectoryHandle, zip, entryPath);
      }
    }
  }

  async downloadLocalBackup(): Promise<void> {
    this.isBackingUp = true;
    try {
      const root = await navigator.storage.getDirectory();
      const zip = new JSZip();
      await this._addDirToZip(root, zip, '');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frogmarks-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Dashboard] backup failed', e);
      this.notifyService.error('Backup failed');
    } finally {
      this.isBackingUp = false;
    }
  }

  private loadAllItems() {
    const cloudPromises = [
      this._boardService.getBoardsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, this.isArchivedFilterActive)
        .pipe(catchError(err => { console.error('[Dashboard] boards fetch failed:', err); return of(null); })),
      this._illustrationService.getIllustrationsByTeamId(this.currentTeam.id!, '', this.isFavoritesFilterActive, this.isArchivedFilterActive)
        .pipe(catchError(err => { console.error('[Dashboard] illustrations fetch failed:', err); return of(null); })),
    ];

    forkJoin(cloudPromises).subscribe({
      next: async ([boardsRes, illustrationsRes]: any) => {
        this.clearData();

        if (boardsRes?.resultObject) {
          boardsRes.resultObject.forEach((board: Board) => {
            this.boards.push(board);
            this.listItems.push({ ...board, type: 'board' });
            if (board.isFavorite && board.uuid) this.favorites.add(board.uuid);
          });
        }

        if (illustrationsRes?.resultObject) {
          illustrationsRes.resultObject.forEach((illustration: Illustration) => {
            this.listItems.push({ ...illustration, type: 'illustration' });
            if (illustration.isFavorite && illustration.uuid) this.favorites.add(illustration.uuid);
          });
        }

        // Merge local IndexedDB items, skipping any already represented by a cloud record
        try {
          const cloudIds = new Set<number>(
            (illustrationsRes?.resultObject ?? []).map((i: Illustration) => i.id).filter(Boolean)
          );
          const localItems: LocalIllustration[] = await this.localIllustrationService.getAll(this.isArchivedFilterActive);
          const archiveFiltered = this.isArchivedFilterActive ? localItems.filter(i => i.isArchived) : localItems;
          const filtered = this.isFavoritesFilterActive ? archiveFiltered.filter(i => i.isFavorite) : archiveFiltered;
          filtered.forEach(local => {
            // If this local item has been backed up and the cloud copy is present, skip it
            if (local.cloudIllustrationId && cloudIds.has(local.cloudIllustrationId)) return;
            this.listItems.push({ ...local, dateModified: new Date(local.updatedAt).toISOString() } as any);
            if (local.isFavorite && local.uuid) this.favorites.add(local.uuid);
          });
        } catch (e) {
          console.warn('[Dashboard] local illustrations load failed:', e);
        }

        this._applyFilters();
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
