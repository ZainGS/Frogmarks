/**
 * Built-in line icons for the mode chrome, written `icon: 'svg:<id>'` on a ModeTool / ModeRadialItem. Each is a list
 * of SVG path `d` strings on a 24 × 24 grid, stroked with currentColor (no innerHTML, so nothing to sanitise). Any
 * other icon string is drawn as text (a glyph such as '↔' or a letter).
 */
export const MODE_ICONS: Readonly<Record<string, readonly string[]>> = {
  select: ['M6 3l12 9-5.5 1.2L16 20l-2.6 1.2-3-6.6L6 18z'],
  move: ['M12 2v20M2 12h20', 'M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3'],
  rotate: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v4h-4'],
  scale: ['M4 20V10h10v10z', 'M10 4h10v10', 'M14 10l6-6M15 4h5v5'],
  extrude: ['M4 14h16v6H4z', 'M12 12V3M8.5 6.5L12 3l3.5 3.5'],
  inset: ['M3 3h18v18H3z', 'M8 8h8v8H8z'],
  loopcut: ['M3 5h18v14H3z', 'M12 3v18'],
  knife: ['M4 20L18 6l2 2L8 20z', 'M14 4l6 6'],
  bevel: ['M3 21V9l6-6h12', 'M7 21V11l4-4h10'],
  bone: ['M7 7a2.5 2.5 0 1 0-3 3l10 10a2.5 2.5 0 1 0 3-3z', 'M17 7a2.5 2.5 0 1 0 3 3'],
  addBone: ['M5 19L15 9', 'M15 9a2.5 2.5 0 1 0 0-.01', 'M18 16v6M15 19h6'],
  ik: ['M4 20l6-8 6 2 4-10', 'M4 20h.01M10 12h.01M16 14h.01M20 4h.01'],
  brush: ['M14 4l6 6-8 8H6v-6z', 'M4 20c1-2 2-3 4-3'],
  merge: ['M5 4l7 8 7-8', 'M12 12v8'],
  delete: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  child: ['M6 4v8a4 4 0 0 0 4 4h8', 'M15 13l3 3-3 3'],
};

/** Ids usable as 'svg:<id>'. */
export const MODE_ICON_IDS = Object.keys(MODE_ICONS);

/** The path list of an 'svg:<id>' icon, or null for a text icon (or an unknown id). */
export function modeIconPaths(icon: string | undefined | null): readonly string[] | null {
  if (!icon || !icon.startsWith('svg:')) return null;
  return MODE_ICONS[icon.slice(4)] ?? null;
}
