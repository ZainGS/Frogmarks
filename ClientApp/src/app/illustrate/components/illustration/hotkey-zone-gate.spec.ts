import { MOD_KEYMAP, TOOL_KEYMAP } from './editor-keymap';
import { HotkeyGateState, hotkeyNeedsZone, isEditableKeyTarget, keymapMayHandle } from './hotkey-zone-gate';

function key(k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; repeat?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, repeat: !!mods.repeat, cancelable: true });
}
/** A keydown whose target is `el` (dispatched on it, so event.target is set). */
function keyOn(el: HTMLElement, k: string): KeyboardEvent {
  let got!: KeyboardEvent;
  el.addEventListener('keydown', e => { got = e; }, { once: true });
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  return got;
}
const idle: HotkeyGateState = { playing: false, liveTextEditing: false, engineInputActive: false, screencastKeys: false };
const needs = (e: KeyboardEvent, s: Partial<HotkeyGateState> = {}) => hotkeyNeedsZone(e, { ...idle, ...s }, false);

describe('hotkey zone gate (the editor keydown enters the zone only when a shortcut can act)', () => {
  it('Play: no key enters the zone (WASD, arrows, space, and every shortcut key)', () => {
    for (const k of ['w', 'a', 's', 'd', 'W', 'ArrowUp', 'ArrowLeft', ' ', 'Shift', 'b', 'Escape', 'Delete']) {
      expect(needs(key(k), { playing: true })).withContext(k).toBeFalse();
      expect(needs(key(k, { repeat: true }), { playing: true })).withContext(k + ' repeat').toBeFalse();
    }
  });

  it('editing: a key some binding takes enters; keys no shortcut uses stay outside', () => {
    expect(needs(key('b'))).toBeTrue();                          // raster brush
    expect(needs(key('x'))).toBeTrue();                          // hide UI
    expect(needs(key('f'))).toBeTrue();                          // fullscreen
    expect(needs(key('s', { ctrl: true }))).toBeTrue();          // save
    expect(needs(key('z', { ctrl: true }))).toBeTrue();          // undo
    expect(needs(key('Delete'))).toBeTrue();
    expect(needs(key('Escape'))).toBeTrue();
    expect(needs(key('ArrowUp'))).toBeFalse();
    expect(needs(key(' '))).toBeFalse();
    expect(needs(key('Shift'))).toBeFalse();
    expect(needs(key('Control'))).toBeFalse();
    expect(needs(key('j'))).toBeFalse();
  });

  it('auto-repeat: only repeating bindings (undo / zoom) and held Ctrl chords enter', () => {
    expect(needs(key('b', { repeat: true }))).toBeFalse();               // a tool switch acts once
    expect(needs(key('x', { repeat: true }))).toBeFalse();
    expect(needs(key('+', { repeat: true }))).toBeTrue();                // zoom keeps zooming
    expect(needs(key('z', { ctrl: true, repeat: true }))).toBeTrue();    // undo keeps stepping
    expect(needs(key('s', { ctrl: true, repeat: true }))).toBeTrue();    // claimed (no browser Save dialog)
  });

  it('typing into a field or an engine text input stays outside; Esc still ends LiveText editing', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      expect(isEditableKeyTarget(input)).toBeTrue();
      expect(needs(keyOn(input, 'b'))).toBeFalse();
      expect(needs(keyOn(input, 'Escape'), { liveTextEditing: true })).toBeTrue();
    } finally { input.remove(); }
    expect(needs(key('b'), { engineInputActive: true })).toBeFalse();
    expect(needs(key('Escape'), { liveTextEditing: true, engineInputActive: true })).toBeTrue();
  });

  it('screencast keys on: every (non-field) key enters, it is shown', () => {
    expect(needs(key('j'), { screencastKeys: true })).toBeTrue();
    expect(needs(key('j'), { screencastKeys: true, playing: true })).toBeFalse();
  });

  it('never blocks a real binding: every key of every binding is let through', () => {
    for (const b of [...MOD_KEYMAP, ...TOOL_KEYMAP]) {
      for (const k of b.keys) {
        const e = key(k, { ctrl: !!b.mod, shift: b.shift ?? (k.length === 1 && k !== k.toLowerCase()), alt: !!b.alt });
        expect(keymapMayHandle(e, !!b.mod)).withContext(`${b.help} (${k})`).toBeTrue();
      }
    }
  });
});
