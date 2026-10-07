import { KeyBinding, MOD_KEYMAP, TOOL_KEYMAP } from './editor-keymap';

/** What the editor's hotkey handler looks at before the keymap tables (IllustrationComponent.handleHotkeys). */
export interface HotkeyGateState {
  /** Play mode: the game loop owns the keyboard (handleHotkeys returns at once). */
  playing: boolean;
  /** A LiveText node is being edited (Esc ends it, even from the text overlay). */
  liveTextEditing: boolean;
  /** The engine owns the keys (text tool typing, ...). */
  engineInputActive: boolean;
  /** View › Screencast keys: every key is shown (bound state). */
  screencastKeys: boolean;
}

/** The key is typed into a form field (handleHotkeys ignores it). */
export function isEditableKeyTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable;
}

/** A binding in `tables` would take this key — dispatchKey's match rules, without running anything. A plain key's
 *  auto-repeat matches only `repeat` bindings (dispatchKey skips the others); a held Ctrl chord still matches
 *  (dispatchKey claims its repeats). */
export function keymapMayHandle(e: KeyboardEvent, mod: boolean, tables: KeyBinding[][] = [MOD_KEYMAP, TOOL_KEYMAP]): boolean {
  for (const table of tables) {
    for (const b of table) {
      if (!b.keys.includes(e.key)) continue;
      if (b.mod !== undefined && b.mod !== mod) continue;
      if (b.shift !== undefined && b.shift !== e.shiftKey) continue;
      if (b.alt !== undefined && b.alt !== e.altKey) continue;
      if (e.repeat && !b.repeat && !b.mod) continue;
      return true;
    }
  }
  return false;
}

/**
 * Zone audit 2026-10-07, item 2: the editor's window keydown listener runs OUTSIDE Angular's zone and enters it only
 * when handleHotkeys could change bound state — a key some binding takes, Esc ending LiveText editing, or a key the
 * screencast overlay shows. Everything else (Play's WASD / arrows / space and their auto-repeats, typing into fields,
 * keys no shortcut uses) costs no change detection. Mirrors handleHotkeys' early returns; pure.
 */
export function hotkeyNeedsZone(e: KeyboardEvent, s: HotkeyGateState, isMac = navigator.userAgent.includes('Mac')): boolean {
  if (s.playing) return false;
  if (e.key === 'Escape' && s.liveTextEditing) return true;
  if (isEditableKeyTarget(e.target) || s.engineInputActive) return false;
  if (s.screencastKeys) return true;
  return keymapMayHandle(e, isMac ? e.metaKey : e.ctrlKey);
}
