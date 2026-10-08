/**
 * Shared types for the mode chrome (UI review 2026-10-07 §4, "Edit Mesh / Edit Armature redesign brief"): the header
 * bar, the left tool strip, the operation pill, the long-press radial menu and the right properties panel. Every
 * piece is presentational: a mode feeds it data and handles its outputs. See ./README.md.
 */

/** The modes that use the chrome (IllustrationComponent.useModeChrome / activeModeChrome). */
export type ModeChromeId = 'meshEdit' | 'armature';

/** One button of a segmented control (header bar: selection mode, Rig | Animate). */
export interface ModeSegment {
  id: string;
  label: string;
  /** Keyboard shortcut shown in the tooltip (e.g. '1'). The mode's keymap owns the key; this is only the hint. */
  key?: string;
  /** Tooltip (defaults to the label + key). */
  title?: string;
}

/** One row of the header bar's "⋯" menu. */
export interface ModeMenuItem {
  id: string;
  label: string;
  /** A check mark (a toggle / the picked option of a group); undefined = not a checkable row. */
  checked?: boolean;
  disabled?: boolean;
  /** Draw a divider above this row. */
  separatorBefore?: boolean;
}

/** One tool of the left tool strip. */
export interface ModeTool {
  id: string;
  label: string;
  /** A short glyph / text ('↔', 'E') or a built-in icon id written 'svg:<id>' (see MODE_ICON_IDS in mode-icons.ts). */
  icon: string;
  /** Keyboard shortcut (shown as a chip on desktop hover and in the tooltip). */
  key?: string;
  /** One line on how to use the tool, shown beside the strip while it is active. */
  hint: string;
  /** Tools with the same group sit together; a divider is drawn where the group changes. */
  group?: string;
  disabled?: boolean;
}

/** 'text' (a short name: Enter / blur commits, Esc restores) and 'select' (a dropdown of `options`, for lists too long
 *  for chips — e.g. joints) were added for the Armature pills. */
export type ModeOpParamKind = 'number' | 'int' | 'toggle' | 'axis' | 'choice' | 'button' | 'text' | 'select';

/** One live parameter of the operation pill. */
export interface ModeOpParam {
  id: string;
  label: string;
  kind: ModeOpParamKind;
  /**
   * number / int: the number. toggle: boolean. choice: the picked option id.
   * axis: 'x' | 'y' | 'z' | null (single pick, plus None), or an ARRAY of axis ids (multi-select, e.g. Mirror X/Y/Z).
   * button: ignored.
   */
  value: any;
  min?: number;
  max?: number;
  /** number: the scrub / −+ step and the shown precision (default 0.01). int: the step (default 1). */
  step?: number;
  /** Shown after the value ('°', 'm', '%'). */
  unit?: string;
  /** choice: the options. axis: overrides the default X / Y / Z chips. */
  options?: { id: string; label: string }[];
  disabled?: boolean;
  /** Tooltip. */
  title?: string;
}

/** paramChange payload of the operation pill. */
export interface ModeOpParamChange { id: string; value: any; }

/** One item of the long-press radial menu. */
export interface ModeRadialItem {
  id: string;
  label: string;
  /** A short glyph / text or 'svg:<id>' (mode-icons.ts). */
  icon?: string;
  /** Destructive (Delete): drawn red. */
  danger?: boolean;
  disabled?: boolean;
}

/** CSS custom properties the chrome publishes on <html> while it is mounted (removed again on destroy). */
export const MODE_CHROME_VARS = {
  /** Header bar height (40 px, 48 px on a coarse pointer, twice that when it wraps to two rows on a phone). */
  modebarH: '--fm-modebar-h',
  /** Tool strip width (70 px: the rail's slot). */
  stripW: '--fm-modestrip-w',
  /** Right properties panel width while open (280 px, its 4 px border included), 0px while collapsed. */
  propsW: '--fm-modeprops-w',
} as const;

/** Stacking order of the chrome (fixed elements; the editor's top bar is 1001, the rail 1000, the canvas menu 1200). */
export const MODE_CHROME_Z = {
  opPill: 950,
  hint: 950,
  propsPanel: 999,
  toolStrip: 1000,
  headerBar: 1000,
  radialMenu: 1300,
} as const;
