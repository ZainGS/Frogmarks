import { cheatsheetColumns, chordLabel, dispatchKey, KeyBinding, MOD_KEYMAP, TOOL_KEYMAP } from './editor-keymap';

function key(k: string, mods: { shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, shiftKey: !!mods.shift, altKey: !!mods.alt, cancelable: true });
}

describe('editor keymap', () => {
  describe('dispatchKey', () => {
    const ed = {} as any;

    it('runs the first matching binding and prevents the default', () => {
      const a = jasmine.createSpy('a');
      const b = jasmine.createSpy('b');
      const table: KeyBinding[] = [{ keys: ['x'], group: 'Edit', help: '', run: a }, { keys: ['x'], group: 'Edit', help: '', run: b }];
      const e = key('x');
      expect(dispatchKey(table, ed, e, false)).toBeTrue();
      expect(a).toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBeTrue();
    });

    it('falls through when a binding declines (returns false), without preventing the default', () => {
      const table: KeyBinding[] = [{ keys: ['x'], group: 'Edit', help: '', run: () => false }];
      const e = key('x');
      expect(dispatchKey(table, ed, e, false)).toBeFalse();
      expect(e.defaultPrevented).toBeFalse();
    });

    it('honours mod / shift / alt constraints (omitted = either)', () => {
      const run = jasmine.createSpy('run');
      const table: KeyBinding[] = [{ keys: ['s', 'S'], mod: true, shift: false, group: 'Edit', help: '', run }];
      expect(dispatchKey(table, ed, key('s'), false)).toBeFalse();                    // mod required
      expect(dispatchKey(table, ed, key('S', { shift: true }), true)).toBeFalse();   // shift forbidden
      expect(dispatchKey(table, ed, key('s'), true)).toBeTrue();
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('matches event.key case-sensitively', () => {
      const run = jasmine.createSpy('run');
      expect(dispatchKey([{ keys: ['T'], shift: true, group: 'Edit', help: '', run }], ed, key('t', { shift: true }), false)).toBeFalse();
      expect(run).not.toHaveBeenCalled();
    });
  });

  describe('the real tables', () => {
    function editor() {
      return {
        saveNow: jasmine.createSpy('saveNow'),
        rasterFlipVertical: jasmine.createSpy('flipV'),
        rasterSelectionService: { paste: jasmine.createSpy('paste'), info: { hasSelection: false, isTransforming: false } },
        setActiveTool: jasmine.createSpy('setActiveTool'),
        animationService: { fillSelection: jasmine.createSpy('fill') },
        draw: { selectedPenColor: '#123456' },
        deleteSelectionOrLayers: jasmine.createSpy('delete'),
      } as any;
    }

    it('Ctrl+S saves; Ctrl+Shift+V flips; Ctrl+V pastes', () => {
      const ed = editor();
      dispatchKey(MOD_KEYMAP, ed, key('s'), true);
      dispatchKey(MOD_KEYMAP, ed, key('V', { shift: true }), true);
      dispatchKey(MOD_KEYMAP, ed, key('v'), true);
      expect(ed.saveNow).toHaveBeenCalledTimes(1);
      expect(ed.rasterFlipVertical).toHaveBeenCalledTimes(1);
      expect(ed.rasterSelectionService.paste).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+T without a selection is declined (falls through to the T tool)', () => {
      const ed = editor();
      expect(dispatchKey(MOD_KEYMAP, ed, key('t'), true)).toBeFalse();
      expect(dispatchKey(TOOL_KEYMAP, ed, key('t'), true)).toBeTrue();
      expect(ed.setActiveTool).toHaveBeenCalledWith('raster:text');
    });

    it('Alt+Backspace fills with the pen colour; plain Backspace deletes', () => {
      const ed = editor();
      dispatchKey(TOOL_KEYMAP, ed, key('Backspace', { alt: true }), false);
      dispatchKey(TOOL_KEYMAP, ed, key('Backspace'), false);
      expect(ed.animationService.fillSelection).toHaveBeenCalledOnceWith('#123456');
      expect(ed.deleteSelectionOrLayers).toHaveBeenCalledTimes(1);
    });
  });

  describe('generated cheatsheet (audit Phase 5.6)', () => {
    it('lists every binding exactly once', () => {
      const rows = cheatsheetColumns().flat().flatMap(sec => sec.rows);
      expect(rows.length).toBe(MOD_KEYMAP.length + TOOL_KEYMAP.length);
    });

    it('labels chords with modifiers and folds case-only duplicate keys', () => {
      expect(chordLabel({ keys: ['h', 'H'], mod: true, shift: true, group: 'Edit', help: '', run: () => {} })).toBe('Ctrl+Shift+H');
      expect(chordLabel({ keys: ['Delete', 'Backspace'], group: 'Edit', help: '', run: () => {} })).toBe('Del / Backspace');
      expect(chordLabel({ keys: ['Backspace'], alt: true, group: 'Edit', help: '', run: () => {} })).toBe('Alt+Backspace');
    });
  });
});
