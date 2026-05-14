import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  FM_COLOR_GROUPS,
  FM_ICON_GROUPS,
  FM_ICON_META,
  FM_IMAGE_SLOTS,
  FM_TOKEN_DEFAULTS,
  FroguiSkinService,
} from '../../services/theme/frogui-skin.service';
import { SkinInspectorService } from '../../services/theme/skin-inspector.service';

interface TokenMeta {
  label: string;
  hint: string;
  type?: 'size' | 'duration';
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}

const TOKEN_META: Record<string, TokenMeta> = {
  // Global
  '--fm-accent':                    { label: 'Accent color',           hint: 'Primary accent for buttons, active nav items, and interactive highlights.' },
  '--fm-accent-hover':              { label: 'Accent (hover)',          hint: 'Accent shade when hovering over accented elements — usually a lighter tint.' },
  '--fm-text-primary':              { label: 'Primary text',            hint: 'Main body and label text across the entire app.' },
  '--fm-text-secondary':            { label: 'Secondary text',          hint: 'Subtitles, hints, and de-emphasized text.' },
  '--fm-text-disabled':             { label: 'Disabled text',           hint: 'Text color for inactive or disabled UI elements.' },
  '--fm-app-bg':                    { label: 'App background',          hint: 'Root canvas background — visible behind all content panels.' },
  '--fm-pane-bg':                   { label: 'Pane background',         hint: 'Background of the main content area and inner panes.' },
  // Sidebar
  '--fm-sidebar-bg':                { label: 'Sidebar background',      hint: 'Background of the left navigation sidebar.' },
  '--fm-sidebar-border-right':      { label: 'Sidebar border',          hint: 'Right-edge border separating the sidebar from the main pane.' },
  '--fm-sidebar-width':             { label: 'Sidebar width',           hint: 'Width of the left navigation sidebar.', type: 'size', unit: 'px', step: 8, min: 160, max: 480 },
  '--fm-nav-item-text':             { label: 'Nav item text',           hint: 'Text color of navigation items in their default state.' },
  '--fm-nav-item-icon':             { label: 'Nav item icon',           hint: 'Icon color of navigation items in their default state.' },
  '--fm-nav-item-hover-bg':         { label: 'Nav item hover',          hint: 'Background tint applied when hovering a navigation item.' },
  '--fm-nav-item-active-bg':        { label: 'Nav item active bg',      hint: 'Background of the currently active/selected navigation item.' },
  '--fm-nav-item-active-text':      { label: 'Nav active text',         hint: 'Text color of the active navigation item.' },
  '--fm-nav-item-active-icon':      { label: 'Nav active icon',         hint: 'Icon color of the active navigation item.' },
  // Header & Search
  '--fm-header-bg':                 { label: 'Header background',       hint: 'Background of the top header bar.' },
  '--fm-search-bg':                 { label: 'Search background',       hint: 'Background of the search input field.' },
  '--fm-search-text':               { label: 'Search text',             hint: 'Color of typed text inside the search bar.' },
  '--fm-search-placeholder':        { label: 'Search placeholder',      hint: 'Placeholder hint text color in the search bar.' },
  '--fm-search-icon':               { label: 'Search icon',             hint: 'Color of the search magnifier icon.' },
  // Action Cards
  '--fm-action-card-bg':            { label: 'Card background',         hint: 'Background of quick-action cards such as New Illustration and New Board.' },
  '--fm-action-card-title':         { label: 'Card title',              hint: 'Title text color on action cards.' },
  '--fm-action-card-subtitle':      { label: 'Card subtitle',           hint: 'Subtitle/description text color on action cards.' },
  '--fm-action-card-icon':          { label: 'Card icon',               hint: 'Icon color on action cards.' },
  '--fm-action-card-hover-bg':      { label: 'Card hover',              hint: 'Action card background when hovered.' },
  // Filter Chips
  '--fm-chip-selected-bg':          { label: 'Selected chip bg',        hint: 'Background of an active / selected filter chip.' },
  '--fm-chip-selected-text':        { label: 'Selected chip text',      hint: 'Text color of a selected filter chip.' },
  '--fm-chip-unselected-bg':        { label: 'Unselected chip bg',      hint: 'Background of an inactive filter chip.' },
  '--fm-chip-unselected-text':      { label: 'Unselected chip text',    hint: 'Text color of an inactive filter chip.' },
  // Gallery
  '--fm-grid-item-hover-border':    { label: 'Hover border',            hint: 'Border ring on gallery thumbnails while the cursor is over them.' },
  '--fm-grid-item-selected-border': { label: 'Selected border',         hint: 'Border ring on the selected thumbnail (popup card is open).' },
  '--fm-overlay-title-color':       { label: 'Title overlay',           hint: 'Color of the item name shown in the bottom hover gradient.' },
  '--fm-overlay-date-color':        { label: 'Date overlay',            hint: 'Color of the edit date shown in the bottom hover gradient.' },
  // Context Menu
  '--fm-context-bg':                { label: 'Menu background',         hint: 'Background of right-click context menus.' },
  '--fm-context-item-text':         { label: 'Menu item text',          hint: 'Text color of context menu items.' },
  '--fm-context-item-hover-bg':     { label: 'Menu item hover',         hint: 'Background applied to a context menu item when hovered.' },
  '--fm-context-divider':           { label: 'Menu divider',            hint: 'Color of horizontal dividers between context menu sections.' },
  // Popup Card
  '--fm-popup-bg':                  { label: 'Card background',         hint: 'Background of the popup card that appears when clicking a thumbnail.' },
  '--fm-popup-title-color':         { label: 'Title color',             hint: 'Color of the item name in the popup card header.' },
  '--fm-popup-primary-btn-bg':      { label: 'Primary button bg',       hint: 'Background of the primary action buttons (Open, New Tab).' },
  '--fm-popup-primary-btn-text':    { label: 'Primary button text',     hint: 'Text color of the primary action buttons.' },
  '--fm-popup-icon-btn-bg':         { label: 'Icon button bg',          hint: 'Background of secondary icon buttons in the popup card.' },
  '--fm-popup-icon-btn-bg-opacity': { label: 'Icon button opacity',     hint: 'Opacity of the icon button background. 100% = fully opaque, 0% = transparent.', type: 'size', unit: '%', step: 5, min: 0, max: 100 },
  '--fm-popup-icon-btn-icon':       { label: 'Icon button icon',        hint: 'Icon color of secondary icon buttons.' },
  '--fm-popup-meta-text':           { label: 'Metadata text',           hint: 'Color of metadata labels such as date and content type.' },
  '--fm-popup-glow-color':          { label: 'Glow color',              hint: 'Color of the 8-directional drop-shadow outline around the popup card.' },
  '--fm-popup-glow-size':           { label: 'Glow size',               hint: 'Pixel offset of the outline drop-shadow. 0 removes the glow entirely; larger values thicken it.', type: 'size', unit: 'px', step: 1, min: 0, max: 12 },
  '--fm-popup-border-sprite-size':  { label: 'Sprite size',             hint: 'Width and height of each sprite tile placed along the card\'s border runner.', type: 'size', unit: 'px', step: 2, min: 4, max: 128 },
  '--fm-popup-border-sprite-spacing':{ label: 'Sprite spacing',         hint: 'Gap between sprites (positive) or overlap (negative). 0 = sprites touch edge-to-edge.', type: 'size', unit: 'px', step: 2, min: -120, max: 120 },
  '--fm-popup-border-speed':        { label: 'Animation speed',         hint: 'Duration of one full border-runner loop. Smaller value = faster march.', type: 'duration', unit: 's', step: 0.5, min: 0.5, max: 30 },
  // Storage & Panel
  '--fm-storage-track-bg':          { label: 'Track background',        hint: 'Background color of the storage usage bar track.' },
  '--fm-storage-fill-bg':           { label: 'Fill color',              hint: 'Color of the used-space portion of the storage bar.' },
  '--fm-storage-fill-warn-bg':      { label: 'Warning fill',            hint: 'Fill color shown when storage is nearly full.' },
  '--fm-storage-label-color':       { label: 'Label text',              hint: 'Color of the "Storage" section label.' },
  '--fm-storage-value-color':       { label: 'Value text',              hint: 'Color of the usage number and total capacity text.' },
  '--fm-panel-bg':                  { label: 'Panel background',        hint: 'Background of the right settings / info panel.' },
  '--fm-panel-title-color':         { label: 'Panel title',             hint: 'Color of section title text in the settings panel.' },
  // Footer
  '--fm-footer-bg':                 { label: 'Footer background',       hint: 'Background of the footer bar at the bottom of the app.' },
  '--fm-footer-text':               { label: 'Footer text',             hint: 'Color of status and info text in the footer bar.' },
};

const ZONE_GROUP: Record<string, number> = {
  'sidebar': 1, 'header': 2, 'action-cards': 3, 'chips': 4,
  'gallery': 5, 'context-menu': 6, 'popup': 7, 'storage': 8, 'footer': 9,
};
const GROUP_ZONE: Record<number, string> = Object.fromEntries(
  Object.entries(ZONE_GROUP).map(([z, g]) => [g, z])
);

const ICON_GROUP_ZONE: Record<string, string> = {
  navigation: 'sidebar',
  header:     'header',
  gallery:    'gallery',
  popup:      'popup',
  storage:    'storage',
  settings:   'storage',
};


@Component({
  selector: 'app-skin-builder',
  templateUrl: './skin-builder.component.html',
  styleUrls: ['./skin-builder.component.scss'],
})
export class SkinBuilderComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  readonly colorGroups = FM_COLOR_GROUPS;
  readonly imageSlots = FM_IMAGE_SLOTS;
  readonly iconGroups = FM_ICON_GROUPS;

  metaForm = new FormGroup({
    name:        new FormControl('My Skin', [Validators.required, Validators.maxLength(64)]),
    author:      new FormControl('', Validators.maxLength(64)),
    description: new FormControl('', Validators.maxLength(200)),
  });

  tokens: Record<string, string> = { ...FM_TOKEN_DEFAULTS };
  images = new Map<string, File>();
  imagePreviewUrls = new Map<string, string>();

  exporting = false;
  saving = false;
  saveSuccess = false;
  importing = false;
  importError = '';

  activeIconGroup = 0;
  hoveredIconZoneGroup: number | null = null;
  iconsMode = false;
  iconState: 'base' | 'hover' | 'click' = 'base';

  private _activeGroup = 0;
  get activeGroup(): number { return this._activeGroup; }
  set activeGroup(v: number) {
    this._activeGroup = v;
    this.skinInspector.setPopupPreview(v === 7);
  }

  hoveredZoneGroup:  number | null = null;
  highlightedToken:  string | null = null;
  resetPending = false;

  tipVisible = false;
  tipText = '';
  tipX = 0;
  tipY = 0;

  showTip(event: MouseEvent, token: string): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tipText  = this.tokenHint(token);
    this.tipX     = rect.left + rect.width / 2;
    this.tipY     = rect.top;
    this.tipVisible = true;
  }
  hideTip(): void { this.tipVisible = false; }

  private originalTokens: Record<string, string> = {};
  private hadSkinOnOpen = false;
  private _inspectorSub?: Subscription;

  constructor(public skinService: FroguiSkinService, private skinInspector: SkinInspectorService) {}

  ngOnInit(): void {
    this.skinInspector.openPanel();
    this._inspectorSub = new Subscription();
    this._inspectorSub.add(
      this.skinInspector.dashboardZone$.subscribe(zone => {
        this.hoveredZoneGroup = (zone !== null && ZONE_GROUP[zone] !== undefined)
          ? ZONE_GROUP[zone] : null;
      })
    );
    this._inspectorSub.add(
      this.skinInspector.zoneClicked$.subscribe(zone => {
        if (ZONE_GROUP[zone] !== undefined) this.activeGroup = ZONE_GROUP[zone];
      })
    );
    this._inspectorSub.add(
      this.skinInspector.hoveredToken$.subscribe(token => { this.highlightedToken = token; })
    );
    this._inspectorSub.add(
      this.skinInspector.iconClicked$.subscribe(name => {
        const groupIndex = FM_ICON_GROUPS.findIndex(g => g.icons.includes(name));
        if (groupIndex >= 0) this.activeIconGroup = groupIndex;
        setTimeout(() => {
          const input = document.getElementById(`fm-icon-input-${name}-${this.iconState}`) as HTMLInputElement | null;
          input?.click();
        });
      })
    );
    this.hadSkinOnOpen = this.skinService.hasSkin;
    if (this.skinService.hasSkin) {
      this.tokens = this.skinService.currentTokens;
      const m = this.skinService.currentManifest;
      if (m.name)        this.metaForm.patchValue({ name: m.name });
      if (m.author)      this.metaForm.patchValue({ author: m.author });
      if (m.description) this.metaForm.patchValue({ description: m.description });
      for (const [assetFile, url] of this.skinService.imageObjectUrls) {
        this.imagePreviewUrls.set(assetFile, url);
      }
      for (const [assetFile, file] of this.skinService.buildImageFiles()) {
        this.images.set(assetFile, file);
      }
    }
    this.originalTokens = { ...this.tokens };
    this.applyPreview();
  }

  ngOnDestroy(): void {
    this._inspectorSub?.unsubscribe();
    this.skinInspector.setIconsGroupActive(false);
    this.skinInspector.closePanel();
  }

  isColorToken(token: string): boolean {
    const v = this.tokens[token] ?? '';
    return /^#[0-9a-f]{3,8}$/i.test(v) || v.startsWith('rgb') || v.startsWith('hsl');
  }

  onTokenChange(token: string, value: string): void {
    this.tokens[token] = value;
    this.applyPreview();
  }

  onColorInput(token: string, event: Event): void {
    this.onTokenChange(token, (event.target as HTMLInputElement).value);
  }

  onTextInput(token: string, event: Event): void {
    this.onTokenChange(token, (event.target as HTMLInputElement).value);
  }

  onImageSelected(assetFile: string, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert(`${assetFile}: image exceeds 2 MB limit.`); return; }
    this.images.set(assetFile, file);
    const old = this.imagePreviewUrls.get(assetFile);
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    this.imagePreviewUrls.set(assetFile, url);
    const slot = FM_IMAGE_SLOTS.find(s => s.assetFile === assetFile);
    if (slot?.token) this.onTokenChange(slot.token, `url('${url}')`);
  }

  removeImage(assetFile: string): void {
    this.images.delete(assetFile);
    const old = this.imagePreviewUrls.get(assetFile);
    if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
    this.imagePreviewUrls.delete(assetFile);
    const slot = FM_IMAGE_SLOTS.find(s => s.assetFile === assetFile);
    if (slot?.token) this.onTokenChange(slot.token, 'none');
  }

  async onImportSkin(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importing = true;
    this.importError = '';
    const result = await this.skinService.importSkin(file);
    this.importing = false;
    if (result.ok) {
      // Reload panel state from the freshly imported skin
      this.tokens = this.skinService.currentTokens;
      const m = this.skinService.currentManifest;
      this.metaForm.patchValue({ name: m.name ?? '', author: m.author ?? '', description: m.description ?? '' });
      this.imagePreviewUrls.clear();
      this.images.clear();
      for (const [assetFile, url] of this.skinService.imageObjectUrls) {
        this.imagePreviewUrls.set(assetFile, url);
      }
      for (const [assetFile, imgFile] of this.skinService.buildImageFiles()) {
        this.images.set(assetFile, imgFile);
      }
    } else {
      this.importError = result.error ?? 'Unknown error.';
    }
    (event.target as HTMLInputElement).value = '';
  }

  async onExport(): Promise<void> {
    if (this.metaForm.invalid) return;
    this.exporting = true;
    const { name, author, description } = this.metaForm.value;
    await this.skinService.exportSkin(
      { name: name!, author: author ?? '', description: description ?? '', preview: 'preview.png' },
      this.tokens,
      this.images
    );
    this.exporting = false;
  }

  resetTokens(): void {
    this.tokens = { ...FM_TOKEN_DEFAULTS };
    this.imagePreviewUrls.clear();
    this.images.clear();
    this.skinService.removeFont();
    this.applyPreview();
  }

  async onSave(): Promise<void> {
    if (this.metaForm.invalid || this.saving) return;
    this.saving = true;
    const { name, author, description } = this.metaForm.value;
    await this.skinService.saveSkin(
      { name: name!, author: author ?? '', description: description ?? '', preview: 'preview.png' },
      this.tokens,
      this.images
    );
    this.saving = false;
    this.saveSuccess = true;
    setTimeout(() => this.saveSuccess = false, 2000);
  }

  onGroupTabHover(index: number): void { this.skinInspector.setZoneFromEditor(GROUP_ZONE[index] ?? null); }
  onGroupTabLeave():  void { this.skinInspector.setZoneFromEditor(null); }

  onTokenRowHover(token: string): void { this.skinInspector.setTokenFromEditor(token); }
  onTokenRowLeave():  void { this.skinInspector.setTokenFromEditor(null); }

  onImageSlotHover(slot: { token: string }): void {
    if (slot.token) this.skinInspector.setTokenFromEditor(slot.token);
  }
  onImageSlotLeave(): void { this.skinInspector.setTokenFromEditor(null); }

  tokenLabel(token: string): string {
    return TOKEN_META[token]?.label ?? token.replace(/^--fm-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  tokenHint(token: string): string {
    const meta = TOKEN_META[token];
    return `${meta?.hint ?? 'Custom skin token.'}\n\n${token}`;
  }

  isSteppable(token: string): boolean {
    const t = TOKEN_META[token]?.type;
    return t === 'size' || t === 'duration';
  }

  stepToken(token: string, dir: 1 | -1): void {
    const meta = TOKEN_META[token];
    if (!meta) return;
    const unit  = meta.unit  ?? 'px';
    const step  = meta.step  ?? 1;
    const min   = meta.min   ?? -Infinity;
    const max   = meta.max   ??  Infinity;
    const raw   = parseFloat(this.tokens[token] ?? '0');
    const next  = Math.max(min, Math.min(max, raw + dir * step));
    this.onTokenChange(token, `${next}${unit}`);
  }

  confirmReset(): void { this.resetPending = true; }
  cancelReset():  void { this.resetPending = false; }
  doReset():      void { this.resetPending = false; this.resetTokens(); }

  discardAndClose(): void {
    // Restore whatever was active before the panel opened
    if (this.hadSkinOnOpen) {
      this.skinService.applyTokens(this.originalTokens);
    } else {
      this.skinService.removeSkin();
    }
    this.closed.emit();
  }

  close(): void {
    this.closed.emit();
  }

  toggleIconsMode(): void {
    this.iconsMode = !this.iconsMode;
    this.skinInspector.setIconsGroupActive(this.iconsMode);
  }

  onIconFileSelected(iconName: string, event: Event, state: 'base' | 'hover' | 'click' = 'base'): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert(`Icon "${iconName}": file exceeds 2 MB limit.`); return; }
    this.skinService.setIcon(iconName, file, state);
    (event.target as HTMLInputElement).value = '';
  }

  removeIcon(iconName: string, state: 'base' | 'hover' | 'click' = 'base'): void {
    this.skinService.removeIcon(iconName, state);
  }

  onFontSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert('Font file exceeds 4 MB limit.'); return; }
    this.skinService.setFont(file);
    this.tokens['--fm-font-ui'] = "'fm-skin-ui', system-ui, sans-serif";
    this.applyPreview();
    (event.target as HTMLInputElement).value = '';
  }

  removeFont(): void {
    this.skinService.removeFont();
    this.tokens['--fm-font-ui'] = FM_TOKEN_DEFAULTS['--fm-font-ui'];
    this.applyPreview();
  }

  iconLabel(name: string): string {
    return FM_ICON_META[name] ?? name;
  }

  onIconTabHover(group: string, i: number): void {
    this.hoveredIconZoneGroup = i;
    const zone = ICON_GROUP_ZONE[group];
    if (zone) this.skinInspector.setZoneFromEditor(zone);
  }
  onIconTabLeave(): void {
    this.hoveredIconZoneGroup = null;
    this.skinInspector.setZoneFromEditor(null);
  }

  onIconGroupHover(name: string): void { this.skinInspector.setIconFromEditor(name); }
  onIconGroupLeave(): void { this.skinInspector.setIconFromEditor(null); }

  private applyPreview(): void {
    this.skinService.applyTokens(this.tokens);
  }
}
