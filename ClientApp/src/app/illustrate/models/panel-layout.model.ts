// ── Panel Layout Types ────────────────────────────────────────

export type PanelTemplate =
  | 'grid-2x2'
  | 'grid-3x2'
  | 'grid-2x3'
  | 'manga-4-panel'
  | 'manga-action'
  | 'manga-dialog'
  | 'full-page'
  | 'two-strip'
  | 'three-strip';

export interface PanelLayoutOptions {
  template: PanelTemplate;
  pageWidth: number;
  pageHeight: number;
  gutterWidth: number;
  bleedMargin: number;
  borderWidth: number;
  borderColor: { r: number; g: number; b: number; a: number };
  backgroundColor: { r: number; g: number; b: number; a: number };
  showBleedGuides: boolean;
  showGutterGuides: boolean;
}

export interface PanelDef {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  readingOrder: number;
}

export const PANEL_TEMPLATE_OPTIONS: { value: PanelTemplate; label: string }[] = [
  { value: 'grid-2x2', label: '2×2 Grid' },
  { value: 'grid-3x2', label: '3×2 Grid' },
  { value: 'grid-2x3', label: '2×3 Grid' },
  { value: 'manga-4-panel', label: '4-Panel (Yonkoma)' },
  { value: 'manga-action', label: 'Manga Action' },
  { value: 'manga-dialog', label: 'Manga Dialog' },
  { value: 'full-page', label: 'Full Page' },
  { value: 'two-strip', label: 'Two Strip' },
  { value: 'three-strip', label: 'Three Strip' },
];

export interface PageSizePreset {
  name: string;
  width: number;    // normalized units (engine coords)
  height: number;
  description: string;
}

export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { name: 'B4 Manga',    width: 2.0, height: 3.0,  description: '257 × 364 mm' },
  { name: 'A4 Comic',    width: 2.0, height: 2.83, description: '210 × 297 mm' },
  { name: 'US Comic',    width: 2.0, height: 3.10, description: '168 × 260 mm' },
  { name: 'Webtoon',     width: 2.0, height: 3.20, description: '800 × 1280 px' },
  { name: 'Square',      width: 2.0, height: 2.0,  description: '1:1' },
];

export const DEFAULT_PANEL_LAYOUT_OPTIONS: PanelLayoutOptions = {
  template: 'grid-3x2',
  pageWidth: 2.0,
  pageHeight: 3.0,
  gutterWidth: 0.02,
  bleedMargin: 0.01,
  borderWidth: 0.004,
  borderColor: { r: 0, g: 0, b: 0, a: 1 },
  backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
  showBleedGuides: true,
  showGutterGuides: true,
};
