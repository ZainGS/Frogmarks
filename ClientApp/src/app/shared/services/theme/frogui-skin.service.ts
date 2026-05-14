import { Injectable } from '@angular/core';
import JSZip from 'jszip';

export interface SkinManifest {
  froguiVersion: number;
  name: string;
  author: string;
  description: string;
  preview: string;
  entry: string;
  permissions: { externalUrls: boolean; scripts: boolean };
  icons?: Record<string, string>;
  font?: string;
}

export const FM_TOKEN_DEFAULTS: Record<string, string> = {
  '--fm-app-bg':                   '#0d0d0d',
  '--fm-app-bg-image':             'none',
  '--fm-app-bg-size':              'cover',
  '--fm-sidebar-bg':               '#111111',
  '--fm-sidebar-bg-image':         'none',
  '--fm-sidebar-border-right':     '1px solid #222222',
  '--fm-sidebar-width':            '240px',
  '--fm-nav-item-text':            '#cccccc',
  '--fm-nav-item-icon':            '#888888',
  '--fm-nav-item-hover-bg':        'rgba(255,255,255,0.06)',
  '--fm-nav-item-hover-bg-image':  'none',
  '--fm-nav-item-active-bg':       'rgba(255,255,255,0.10)',
  '--fm-nav-item-active-bg-image': 'none',
  '--fm-nav-item-active-text':     '#ffffff',
  '--fm-nav-item-active-icon':     '#ffffff',
  '--fm-nav-item-radius':          '6px',
  '--fm-nav-divider':              'rgba(255,255,255,0.08)',
  '--fm-pane-bg':                  '#0d0d0d',
  '--fm-header-bg':                'transparent',
  '--fm-header-border-bottom':     'none',
  '--fm-search-bg':                '#1a1a1a',
  '--fm-search-bg-image':          'none',
  '--fm-search-border':            '1px solid #2a2a2a',
  '--fm-search-text':              '#e0e0e0',
  '--fm-search-placeholder':       '#666666',
  '--fm-search-icon':              '#666666',
  '--fm-search-radius':            '8px',
  '--fm-search-height':            '36px',
  '--fm-action-card-bg':           '#1a1a1a',
  '--fm-action-card-bg-image':     'none',
  '--fm-action-card-bg-size':      'cover',
  '--fm-action-card-border':       '1px solid #2a2a2a',
  '--fm-action-card-border-image': 'none',
  '--fm-action-card-radius':       '10px',
  '--fm-action-card-shadow':       'none',
  '--fm-action-card-title':        '#ffffff',
  '--fm-action-card-subtitle':     '#aaaaaa',
  '--fm-action-card-icon':         '#888888',
  '--fm-action-card-hover-bg':     '#222222',
  '--fm-action-card-height':       '80px',
  '--fm-chip-selected-bg':         '#333333',
  '--fm-chip-selected-bg-image':   'none',
  '--fm-chip-selected-text':       '#ffffff',
  '--fm-chip-selected-border':     '1px solid #555555',
  '--fm-chip-unselected-bg':       'transparent',
  '--fm-chip-unselected-bg-image': 'none',
  '--fm-chip-unselected-text':     '#888888',
  '--fm-chip-unselected-border':   '1px solid #333333',
  '--fm-chip-radius':              '20px',
  '--fm-chip-height':              '28px',
  '--fm-grid-gap':                 '8px',
  '--fm-grid-item-radius':         '8px',
  '--fm-grid-item-border':         'none',
  '--fm-grid-item-hover-border':   '2px solid rgba(255,255,255,0.3)',
  '--fm-grid-item-hover-border-image': 'none',
  '--fm-grid-item-shadow':         'none',
  '--fm-grid-item-hover-shadow':   '0 4px 20px rgba(0,0,0,0.5)',
  '--fm-grid-item-selected-border': '2px solid #7b5ea7',
  '--fm-grid-hover-overlay':       'none',
  '--fm-grid-selected-overlay':    'none',
  '--fm-overlay-gradient':         'linear-gradient(transparent 50%, rgba(0,0,0,0.85) 100%)',
  '--fm-overlay-title-color':      '#ffffff',
  '--fm-overlay-date-color':       '#aaaaaa',
  '--fm-overlay-font-size':        '12px',
  '--fm-context-bg':               '#1e1e1e',
  '--fm-context-bg-image':         'none',
  '--fm-context-border':           '1px solid #333333',
  '--fm-context-radius':           '8px',
  '--fm-context-shadow':           '0 8px 32px rgba(0,0,0,0.6)',
  '--fm-context-item-text':        '#e0e0e0',
  '--fm-context-item-hover-bg':    'rgba(255,255,255,0.07)',
  '--fm-context-divider':          'rgba(255,255,255,0.08)',
  '--fm-popup-bg':                 '#1e1e1e',
  '--fm-popup-bg-image':           'none',
  '--fm-popup-border':             '1px solid #333333',
  '--fm-popup-radius':             '12px',
  '--fm-popup-shadow':             '0 16px 48px rgba(0,0,0,0.7)',
  '--fm-popup-title-color':        '#ffffff',
  '--fm-popup-primary-btn-bg':     '#7b5ea7',
  '--fm-popup-primary-btn-text':   '#ffffff',
  '--fm-popup-primary-btn-radius': '6px',
  '--fm-popup-icon-btn-bg':        '#2a2a2a',
  '--fm-popup-icon-btn-bg-opacity':'100%',
  '--fm-popup-icon-btn-icon':      '#cccccc',
  '--fm-popup-icon-btn-radius':    '6px',
  '--fm-popup-meta-text':          '#888888',
  '--fm-popup-tail-color':         '#1e1e1e',
  '--fm-popup-glow-color':         '#ffffff',
  '--fm-popup-glow-size':          '2px',
  '--fm-popup-border-sprite':        'none',
  '--fm-popup-border-sprite-size':   '24px',
  '--fm-popup-border-sprite-spacing':'0px',
  '--fm-popup-border-speed':         '4s',
  '--fm-popup-border-animate':       '0',
  '--fm-popup-border-outer':         '0',
  '--fm-storage-track-bg':         '#2a2a2a',
  '--fm-storage-track-bg-image':   'none',
  '--fm-storage-track-radius':     '4px',
  '--fm-storage-track-height':     '6px',
  '--fm-storage-fill-bg':          '#7b5ea7',
  '--fm-storage-fill-bg-image':    'none',
  '--fm-storage-fill-warn-bg':     '#c0392b',
  '--fm-storage-label-color':      '#888888',
  '--fm-storage-value-color':      '#cccccc',
  '--fm-panel-bg':                 '#141414',
  '--fm-panel-border-left':        '1px solid #2a2a2a',
  '--fm-panel-title-color':        '#ffffff',
  '--fm-footer-bg':                '#0a0a0a',
  '--fm-footer-text':              '#444444',
  '--fm-footer-alt-bg':            '#111111',
  '--fm-footer-height':            '28px',
  '--fm-footer-font-size':         '11px',
  '--fm-font-ui':                  "'Inter', system-ui, sans-serif",
  '--fm-font-display':             'inherit',
  '--fm-font-mono':                "'Fira Mono', monospace",
  '--fm-accent':                   '#7b5ea7',
  '--fm-accent-hover':             '#9b7ec7',
  '--fm-text-primary':             '#e0e0e0',
  '--fm-text-secondary':           '#888888',
  '--fm-text-disabled':            '#444444',
};

export const FM_IMAGE_SLOTS: { label: string; assetFile: string; token: string; dimensions: string }[] = [
  { label: 'App background',          assetFile: 'dashboard-bg.png',          token: '--fm-app-bg-image',                  dimensions: 'any (rec 1920×1080)' },
  { label: 'Sidebar background',       assetFile: 'sidebar-bg.png',            token: '--fm-sidebar-bg-image',              dimensions: '240 × 900+' },
  { label: 'Nav item hover',           assetFile: 'nav-item-hover.png',        token: '--fm-nav-item-hover-bg-image',       dimensions: '200 × 36' },
  { label: 'Nav item active',          assetFile: 'nav-item-active.png',       token: '--fm-nav-item-active-bg-image',      dimensions: '200 × 36' },
  { label: 'Action card background',   assetFile: 'action-card-bg.png',        token: '--fm-action-card-bg-image',          dimensions: '400 × 80' },
  { label: 'Action card border',       assetFile: 'action-card-border.png',    token: '--fm-action-card-border-image',      dimensions: '16 × 16 (9-slice)' },
  { label: 'Search bar background',    assetFile: 'search-bg.png',             token: '--fm-search-bg-image',               dimensions: '300 × 36' },
  { label: 'Filter chip (selected)',   assetFile: 'chip-selected.png',         token: '--fm-chip-selected-bg-image',        dimensions: '80 × 28' },
  { label: 'Filter chip (unselected)', assetFile: 'chip-unselected.png',       token: '--fm-chip-unselected-bg-image',      dimensions: '80 × 28' },
  { label: 'Thumbnail hover border',   assetFile: 'thumbnail-hover-border.png',token: '--fm-grid-item-hover-border-image',  dimensions: '16 × 16 (9-slice)' },
  { label: 'Card hover frame',         assetFile: 'grid-hover-frame.png',      token: '--fm-grid-hover-overlay',            dimensions: '16:10 ratio, transparent centre' },
  { label: 'Card selected frame',      assetFile: 'grid-selected-frame.png',   token: '--fm-grid-selected-overlay',         dimensions: '16:10 ratio, transparent centre' },
  { label: 'Context menu background',  assetFile: 'context-menu-bg.png',       token: '--fm-context-bg-image',              dimensions: '180 × 200' },
  { label: 'Overlay card background',  assetFile: 'overlay-card-bg.png',       token: '--fm-popup-bg-image',                dimensions: '320 × 240' },
  { label: 'Storage bar track',        assetFile: 'storage-bar-track.png',     token: '--fm-storage-track-bg-image',        dimensions: '100 × 6' },
  { label: 'Storage bar fill',         assetFile: 'storage-bar-fill.png',      token: '--fm-storage-fill-bg-image',         dimensions: '100 × 6' },
  { label: 'Popup border sprite',       assetFile: 'popup-border-sprite.png',   token: '--fm-popup-border-sprite',           dimensions: 'any square (rec 24 × 24)' },
  { label: 'Logo',                     assetFile: 'logo.png',                  token: '',                                   dimensions: '160 × 40' },
  { label: 'Skin preview thumbnail',   assetFile: 'preview.png',               token: '',                                   dimensions: '400 × 250 (required)' },
];

export const FM_COLOR_GROUPS: { label: string; tokens: string[] }[] = [
  { label: 'Global', tokens: ['--fm-accent','--fm-accent-hover','--fm-text-primary','--fm-text-secondary','--fm-text-disabled','--fm-app-bg','--fm-pane-bg'] },
  { label: 'Sidebar', tokens: ['--fm-sidebar-bg','--fm-nav-item-text','--fm-nav-item-icon','--fm-nav-item-hover-bg','--fm-nav-item-active-bg','--fm-nav-item-active-text','--fm-nav-item-active-icon','--fm-nav-divider'] },
  { label: 'Header & Search', tokens: ['--fm-header-bg','--fm-search-bg','--fm-search-text','--fm-search-placeholder','--fm-search-icon'] },
  { label: 'Action Cards', tokens: ['--fm-action-card-bg','--fm-action-card-title','--fm-action-card-subtitle','--fm-action-card-icon','--fm-action-card-hover-bg'] },
  { label: 'Filter Chips', tokens: ['--fm-chip-selected-bg','--fm-chip-selected-text','--fm-chip-unselected-bg','--fm-chip-unselected-text'] },
  { label: 'Gallery', tokens: ['--fm-grid-item-hover-border','--fm-grid-item-selected-border','--fm-overlay-title-color','--fm-overlay-date-color'] },
  { label: 'Context Menu', tokens: ['--fm-context-bg','--fm-context-item-text','--fm-context-item-hover-bg','--fm-context-divider'] },
  { label: 'Popup Card', tokens: ['--fm-popup-bg','--fm-popup-title-color','--fm-popup-primary-btn-bg','--fm-popup-primary-btn-text','--fm-popup-icon-btn-bg','--fm-popup-icon-btn-bg-opacity','--fm-popup-icon-btn-icon','--fm-popup-meta-text','--fm-popup-glow-color','--fm-popup-glow-size','--fm-popup-border-sprite-size','--fm-popup-border-speed','--fm-popup-border-animate'] },
  { label: 'Storage & Panel', tokens: ['--fm-storage-track-bg','--fm-storage-fill-bg','--fm-storage-fill-warn-bg','--fm-storage-label-color','--fm-storage-value-color','--fm-panel-bg','--fm-panel-title-color'] },
  { label: 'Footer', tokens: ['--fm-footer-bg','--fm-footer-text'] },
];

export const FM_ICON_GROUPS: { group: string; label: string; icons: string[] }[] = [
  { group: 'navigation',   label: 'Navigation',    icons: ['explore','storefront','view_quilt','history_edu','inventory_2','newspaper','help','discord','photo_camera','add'] },
  { group: 'header',       label: 'Header',        icons: ['search','check_box_outline_blank','check_box','notifications_none','settings','person','add','logout'] },
  { group: 'gallery',      label: 'Gallery',       icons: ['grid_view','menu','favorite_border','favorite','drag_indicator','radio_button_unchecked','check_circle','draw'] },
  { group: 'popup',        label: 'Popup Card',    icons: ['link','file_copy','text_fields','inventory_2','unarchive','local_fire_department'] },
  { group: 'context',      label: 'Context Menu',  icons: ['open_in_new','link','file_copy','text_fields','inventory_2','unarchive','local_fire_department'] },
  { group: 'storage',      label: 'Storage',       icons: ['save','info','download','cloud'] },
  { group: 'settings',     label: 'Settings',      icons: ['close','campaign','palette','file_upload','format_color_reset','delete_forever'] },
];

export const FM_ICON_META: Record<string, string> = {
  explore:                 'Explore',
  storefront:              'Design Center',
  view_quilt:              'Templates',
  history_edu:             'Tutorials',
  inventory_2:             'Archive',
  newspaper:               'Updates',
  help:                    'Help & Feedback',
  discord:                 'Discord',
  photo_camera:            'Instagram',
  add:                     'Add',
  search:                  'Search',
  check_box_outline_blank: 'Batch select (off)',
  check_box:               'Batch select (on)',
  notifications_none:      'Notifications',
  settings:                'Settings',
  person:                  'Profile',
  logout:                  'Sign out',
  grid_view:               'Grid view',
  menu:                    'List view',
  favorite_border:         'Unfavourited',
  favorite:                'Favourited',
  drag_indicator:          'Drag handle',
  radio_button_unchecked:  'Batch checkbox (off)',
  check_circle:            'Batch checkbox (on)',
  draw:                    'Draw type',
  link:                    'Copy link',
  file_copy:               'Duplicate',
  text_fields:             'Rename',
  unarchive:               'Restore',
  local_fire_department:   'Delete permanently',
  open_in_new:             'Open in new tab',
  save:                    'OPFS storage',
  info:                    'Storage info',
  download:                'Backup',
  cloud:                   'Cloud storage',
  close:                   'Close',
  campaign:                'Empty notifications',
  palette:                 'Edit skin',
  file_upload:             'Import skin',
  format_color_reset:      'Remove skin',
  delete_forever:          'Empty trash',
};

@Injectable({ providedIn: 'root' })
export class FroguiSkinService {
  private readonly OPFS_SKIN_FILE = 'active-skin.frogui';
  private readonly STYLE_TAG_ID = 'frogui-skin';
  private readonly RUNNER_STYLE_TAG_ID = 'frogui-runner';
  private readonly FONT_FACE_TAG_ID = 'frogui-font-face';
  private readonly SKIN_ENABLED_KEY = 'frogui-skin-enabled';

  private _imageObjectUrls = new Map<string, string>();
  private _imageBlobs = new Map<string, Blob>();
  private _iconFiles = new Map<string, File>();
  private _iconUrls  = new Map<string, string>();
  private _fontFile: File | null = null;
  private _fontUrl: string | null = null;
  private _currentTokens: Record<string, string> = { ...FM_TOKEN_DEFAULTS };
  private _currentManifest: Partial<SkinManifest> = {};
  private _hasSkin = false;
  private _hasSavedSkin = false;

  get hasSkin(): boolean { return this._hasSkin; }
  get hasSavedSkin(): boolean { return this._hasSavedSkin; }
  get currentTokens(): Record<string, string> { return { ...this._currentTokens }; }
  get currentManifest(): Partial<SkinManifest> { return { ...this._currentManifest }; }
  get imageObjectUrls(): ReadonlyMap<string, string> { return this._imageObjectUrls; }
  get iconEntries(): ReadonlyMap<string, File> { return this._iconFiles; }
  get fontFile(): File | null { return this._fontFile; }

  setFont(file: File): void {
    if (this._fontUrl?.startsWith('blob:')) URL.revokeObjectURL(this._fontUrl);
    this._fontFile = file;
    this._fontUrl = URL.createObjectURL(file);
    let tag = document.getElementById(this.FONT_FACE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) { tag = document.createElement('style'); tag.id = this.FONT_FACE_TAG_ID; document.head.appendChild(tag); }
    tag.textContent = `@font-face { font-family: 'fm-skin-ui'; src: url('${this._fontUrl}'); font-weight: 100 900; font-style: normal; }`;
  }

  removeFont(): void {
    if (this._fontUrl?.startsWith('blob:')) URL.revokeObjectURL(this._fontUrl);
    this._fontFile = null;
    this._fontUrl = null;
    document.getElementById(this.FONT_FACE_TAG_ID)?.remove();
  }

  private _iconKey(name: string, state: 'base' | 'hover' | 'click' = 'base'): string {
    return state === 'base' ? name : `${name}:${state}`;
  }

  getIconUrl(name: string, state: 'base' | 'hover' | 'click' = 'base'): string | null {
    return this._iconUrls.get(this._iconKey(name, state)) ?? null;
  }

  setIcon(name: string, file: File, state: 'base' | 'hover' | 'click' = 'base'): void {
    const key = this._iconKey(name, state);
    const old = this._iconUrls.get(key);
    if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
    this._iconFiles.set(key, file);
    this._iconUrls.set(key, URL.createObjectURL(file));
  }

  removeIcon(name: string, state?: 'base' | 'hover' | 'click'): void {
    if (state) {
      const key = this._iconKey(name, state);
      const old = this._iconUrls.get(key);
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      this._iconFiles.delete(key);
      this._iconUrls.delete(key);
    } else {
      for (const s of ['base', 'hover', 'click'] as const) this.removeIcon(name, s);
    }
  }

  /** Build a File map from stored blobs for re-export when editing */
  buildImageFiles(): Map<string, File> {
    const result = new Map<string, File>();
    for (const [name, blob] of this._imageBlobs.entries()) {
      result.set(name, new File([blob], name, { type: blob.type }));
    }
    return result;
  }

  applyTokens(tokens: Record<string, string>): void {
    this._currentTokens = { ...tokens };
    const css = `:root {\n${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
    this.injectStyle(css);
    this.injectBorderRunnerCss();
    this._hasSkin = true;
  }

  removeSkin(): void {
    document.getElementById(this.STYLE_TAG_ID)?.remove();
    document.getElementById(this.RUNNER_STYLE_TAG_ID)?.remove();
    this.revokeImageUrls();
    this.revokeIconUrls();
    this.removeFont();
    this._currentTokens = { ...FM_TOKEN_DEFAULTS };
    this._currentManifest = {};
    this._hasSkin = false;
  }

  async importSkin(file: File): Promise<{ ok: boolean; error?: string }> {
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'Archive exceeds 10 MB limit.' };
    const bytes = await file.arrayBuffer();
    return this.applySkinFromBytes(new Uint8Array(bytes), true);
  }

  async applySkinFromBytes(bytes: Uint8Array, persist = false): Promise<{ ok: boolean; error?: string }> {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(bytes); }
    catch { return { ok: false, error: 'File is not a valid ZIP archive.' }; }

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) return { ok: false, error: 'Missing manifest.json.' };
    let manifest: SkinManifest;
    try { manifest = JSON.parse(await manifestFile.async('string')); }
    catch { return { ok: false, error: 'manifest.json is not valid JSON.' }; }
    if (manifest.froguiVersion !== 1) return { ok: false, error: `Unsupported froguiVersion: ${manifest.froguiVersion}.` };

    const validationError = this.validateZip(zip);
    if (validationError) return { ok: false, error: validationError };

    const tokenFile = zip.file(manifest.entry ?? 'tokens.css');
    let tokensCss = tokenFile ? await tokenFile.async('string') : '';

    this.revokeImageUrls();
    this._imageBlobs.clear();

    for (const slot of FM_IMAGE_SLOTS) {
      const imgFile = zip.file(`assets/${slot.assetFile}`);
      if (!imgFile) continue;
      const ab = await imgFile.async('arraybuffer');
      const blob = new Blob([ab], { type: this.mimeFor(slot.assetFile) });
      this._imageBlobs.set(slot.assetFile, blob);
      const url = URL.createObjectURL(blob);
      this._imageObjectUrls.set(slot.assetFile, url);
      const safeAsset = slot.assetFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      tokensCss = tokensCss.replace(new RegExp(`url\\(\\s*['"]?assets/${safeAsset}['"]?\\s*\\)`, 'g'), `url('${url}')`);
    }

    this.revokeIconUrls();
    if (manifest.icons) {
      for (const [iconName, iconPath] of Object.entries(manifest.icons)) {
        try {
          const iconZipFile = zip.file(iconPath);
          if (!iconZipFile) continue;
          const ab = await iconZipFile.async('arraybuffer');
          const ext = iconPath.split('.').pop() ?? 'png';
          const state = iconName.endsWith(':hover') ? 'hover' : iconName.endsWith(':click') ? 'click' : 'base';
          const baseName = state === 'base' ? iconName : iconName.replace(/:(?:hover|click)$/, '');
          const file = new File([ab], `${baseName}_${state}.${ext}`, { type: this.mimeFor(iconPath) });
          this.setIcon(baseName, file, state);
        } catch { /* skip bad icon entries */ }
      }
    }

    this.removeFont();
    if (manifest.font) {
      try {
        const fontZipFile = zip.file(manifest.font);
        if (fontZipFile) {
          const ab = await fontZipFile.async('arraybuffer');
          const ext = manifest.font.split('.').pop() ?? 'woff2';
          const fontFile = new File([ab], `ui.${ext}`, { type: this.mimeForFont(ext) });
          this.setFont(fontFile);
        }
      } catch { /* skip bad font */ }
    }

    this._currentManifest = { name: manifest.name, author: manifest.author, description: manifest.description };
    this._currentTokens = this.parseTokensFromCss(tokensCss);
    this.injectStyle(tokensCss);
    this.injectBorderRunnerCss();
    this._hasSkin = true;
    this._hasSavedSkin = true;
    if (persist) await this.persistSkin(bytes);
    return { ok: true };
  }

  async exportSkin(
    manifest: Omit<SkinManifest, 'froguiVersion' | 'entry' | 'permissions'>,
    tokens: Record<string, string>,
    images: Map<string, File>
  ): Promise<void> {
    const zip = new JSZip();

    const iconsManifest: Record<string, string> = {};
    const iconsFolder = zip.folder('icons')!;
    for (const [key, file] of this._iconFiles.entries()) {
      const ext = file.name.split('.').pop() ?? 'png';
      const filename = `${key.replace(':', '_')}.${ext}`;
      iconsManifest[key] = `icons/${filename}`;
      iconsFolder.file(filename, await file.arrayBuffer());
    }

    let fontPath: string | undefined;
    if (this._fontFile) {
      const ext = this._fontFile.name.split('.').pop() ?? 'woff2';
      fontPath = `fonts/ui.${ext}`;
      zip.folder('fonts')!.file(`ui.${ext}`, await this._fontFile.arrayBuffer());
    }

    const fullManifest: SkinManifest = {
      froguiVersion: 1,
      entry: 'tokens.css',
      permissions: { externalUrls: false, scripts: false },
      ...manifest,
      icons: Object.keys(iconsManifest).length ? iconsManifest : undefined,
      font: fontPath,
    };
    zip.file('manifest.json', JSON.stringify(fullManifest, null, 2));

    let css = ':root {\n';
    for (const [k, v] of Object.entries(tokens)) {
      const assetSlot = FM_IMAGE_SLOTS.find(s => s.token === k);
      css += assetSlot && images.has(assetSlot.assetFile)
        ? `  ${k}: url('assets/${assetSlot.assetFile}');\n`
        : `  ${k}: ${v};\n`;
    }
    css += '}\n';
    zip.file('tokens.css', css);

    const assetsFolder = zip.folder('assets')!;
    for (const [assetFile, file] of images.entries()) {
      assetsFolder.file(assetFile, await file.arrayBuffer());
    }

    if (images.has('preview.png')) {
      zip.file('preview.png', await images.get('preview.png')!.arrayBuffer());
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const safeName = (manifest.name || 'my-skin').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.frogui`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async saveSkin(
    manifest: Omit<SkinManifest, 'froguiVersion' | 'entry' | 'permissions'>,
    tokens: Record<string, string>,
    images: Map<string, File>
  ): Promise<void> {
    const zip = new JSZip();

    const iconsManifest: Record<string, string> = {};
    const iconsFolder = zip.folder('icons')!;
    for (const [key, file] of this._iconFiles.entries()) {
      const ext = file.name.split('.').pop() ?? 'png';
      const filename = `${key.replace(':', '_')}.${ext}`;
      iconsManifest[key] = `icons/${filename}`;
      iconsFolder.file(filename, await file.arrayBuffer());
    }

    let fontPath: string | undefined;
    if (this._fontFile) {
      const ext = this._fontFile.name.split('.').pop() ?? 'woff2';
      fontPath = `fonts/ui.${ext}`;
      zip.folder('fonts')!.file(`ui.${ext}`, await this._fontFile.arrayBuffer());
    }

    const fullManifest: SkinManifest = {
      froguiVersion: 1,
      entry: 'tokens.css',
      permissions: { externalUrls: false, scripts: false },
      ...manifest,
      icons: Object.keys(iconsManifest).length ? iconsManifest : undefined,
      font: fontPath,
    };
    zip.file('manifest.json', JSON.stringify(fullManifest, null, 2));

    let css = ':root {\n';
    for (const [k, v] of Object.entries(tokens)) {
      const assetSlot = FM_IMAGE_SLOTS.find(s => s.token === k);
      css += assetSlot && images.has(assetSlot.assetFile)
        ? `  ${k}: url('assets/${assetSlot.assetFile}');\n`
        : `  ${k}: ${v};\n`;
    }
    css += '}\n';
    zip.file('tokens.css', css);

    const assetsFolder = zip.folder('assets')!;
    for (const [assetFile, file] of images.entries()) {
      assetsFolder.file(assetFile, await file.arrayBuffer());
    }
    if (images.has('preview.png')) {
      zip.file('preview.png', await images.get('preview.png')!.arrayBuffer());
    }

    const bytes = await zip.generateAsync({ type: 'uint8array' });
    this._currentManifest = { name: manifest.name, author: manifest.author, description: manifest.description };
    this._currentTokens = { ...tokens };
    this._hasSavedSkin = true;
    localStorage.setItem(this.SKIN_ENABLED_KEY, 'true');
    await this.persistSkin(bytes);
  }

  disableSkin(): void {
    localStorage.setItem(this.SKIN_ENABLED_KEY, 'false');
    this.removeSkin();
  }

  async enableSavedSkin(): Promise<void> {
    localStorage.setItem(this.SKIN_ENABLED_KEY, 'true');
    const bytes = await this.loadFromOpfs();
    if (bytes) await this.applySkinFromBytes(bytes, false);
  }

  async loadPersistedSkin(): Promise<void> {
    if (localStorage.getItem(this.SKIN_ENABLED_KEY) === 'false') return;
    const bytes = await this.loadFromOpfs();
    if (bytes) {
      this._hasSavedSkin = true;
      await this.applySkinFromBytes(bytes, false);
    }
  }

  private parseTokensFromCss(css: string): Record<string, string> {
    const result: Record<string, string> = { ...FM_TOKEN_DEFAULTS };
    const regex = /(--fm-[\w-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(css)) !== null) {
      result[match[1]] = match[2].trim();
    }
    return result;
  }

  private validateZip(zip: JSZip): string | null {
    let hasJs = false;
    zip.forEach((path) => {
      if (path.toLowerCase().endsWith('.js')) hasJs = true;
    });
    if (hasJs) return 'JavaScript files are not permitted in .frogui skins.';
    return null;
  }

  private injectBorderRunnerCss(): void {
    const tokens = this._currentTokens;
    const sprite = tokens['--fm-popup-border-sprite'] ?? 'none';
    let el = document.getElementById(this.RUNNER_STYLE_TAG_ID) as HTMLStyleElement | null;

    if (sprite === 'none') { el?.remove(); return; }

    const sz   = parseFloat(tokens['--fm-popup-border-sprite-size']    ?? '24');
    const sp   = parseFloat(tokens['--fm-popup-border-sprite-spacing'] ?? '0');
    const speed = tokens['--fm-popup-border-speed'] ?? '4s';

    if (isNaN(sz) || sz <= 0) { el?.remove(); return; }

    const tile = Math.max(sz + (isNaN(sp) ? 0 : sp), 1);
    const N    = Math.min(Math.max(1, Math.ceil(sz / tile)), 16);
    // Use sz+tile+N in keyframe names so any config change spawns fresh animation names,
    // forcing the browser to restart animations with the new computed values.
    const tag  = `${Math.round(sz)}-${Math.round(tile)}-${N}`;

    const imgs   = Array(N).fill(sprite).join(', ');
    const sizes  = Array(N).fill(`${sz}px ${sz}px`).join(', ');
    const rptX   = Array(N).fill('repeat-x').join(', ');
    const rptY   = Array(N).fill('repeat-y').join(', ');

    // Advance by sz (one full sprite period) per cycle, not by tile.
    // This guarantees each layer returns to exactly its starting visual position at the
    // loop point (k*tile + sz mod sz == k*tile mod sz), making every N/sz/tile combination
    // seamless with no glitch at the animation reset.
    const posT0 = Array.from({length: N}, (_, k) => `${k * tile}px 0`).join(', ');
    const posT1 = Array.from({length: N}, (_, k) => `${k * tile + sz}px 0`).join(', ');
    const posB0 = Array.from({length: N}, (_, k) => `${-k * tile}px 0`).join(', ');
    const posB1 = Array.from({length: N}, (_, k) => `${-k * tile - sz}px 0`).join(', ');
    const posR0 = Array.from({length: N}, (_, k) => `0 ${k * tile}px`).join(', ');
    const posR1 = Array.from({length: N}, (_, k) => `0 ${k * tile + sz}px`).join(', ');
    const posL0 = Array.from({length: N}, (_, k) => `0 ${-k * tile}px`).join(', ');
    const posL1 = Array.from({length: N}, (_, k) => `0 ${-k * tile - sz}px`).join(', ');

    const css = `.border-runner .br-strip {
  background-image: ${imgs};
  background-size: ${sizes};
}
.border-runner .br-top    { background-repeat: ${rptX}; background-position: ${posT0}; animation-name: fm-r-${tag}; animation-duration: ${speed}; }
.border-runner .br-bottom { background-repeat: ${rptX}; background-position: ${posB0}; animation-name: fm-l-${tag}; animation-duration: ${speed}; }
.border-runner .br-right  { background-repeat: ${rptY}; background-position: ${posR0}; animation-name: fm-d-${tag}; animation-duration: ${speed}; }
.border-runner .br-left   { background-repeat: ${rptY}; background-position: ${posL0}; animation-name: fm-u-${tag}; animation-duration: ${speed}; }
@keyframes fm-r-${tag} { from { background-position: ${posT0}; } to { background-position: ${posT1}; } }
@keyframes fm-l-${tag} { from { background-position: ${posB0}; } to { background-position: ${posB1}; } }
@keyframes fm-d-${tag} { from { background-position: ${posR0}; } to { background-position: ${posR1}; } }
@keyframes fm-u-${tag} { from { background-position: ${posL0}; } to { background-position: ${posL1}; } }
`;

    if (!el) {
      el = document.createElement('style');
      el.id = this.RUNNER_STYLE_TAG_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  private injectStyle(css: string): void {
    let tag = document.getElementById(this.STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = this.STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }

  private revokeImageUrls(): void {
    for (const url of this._imageObjectUrls.values()) URL.revokeObjectURL(url);
    this._imageObjectUrls.clear();
  }

  private revokeIconUrls(): void {
    for (const url of this._iconUrls.values()) URL.revokeObjectURL(url);
    this._iconUrls.clear();
    this._iconFiles.clear();
  }

  private mimeForFont(ext: string): string {
    if (ext === 'woff2') return 'font/woff2';
    if (ext === 'woff')  return 'font/woff';
    if (ext === 'ttf')   return 'font/ttf';
    if (ext === 'otf')   return 'font/otf';
    return 'font/woff2';
  }

  private mimeFor(filename: string): string {
    if (filename.endsWith('.svg')) return 'image/svg+xml';
    if (filename.endsWith('.webp')) return 'image/webp';
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
    return 'image/png';
  }

  private async persistSkin(bytes: Uint8Array): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(this.OPFS_SKIN_FILE, { create: true });
      const writable = await (fh as any).createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch { /* OPFS not available */ }
  }

  private async loadFromOpfs(): Promise<Uint8Array | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(this.OPFS_SKIN_FILE);
      const file = await fh.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch { return null; }
  }
}
