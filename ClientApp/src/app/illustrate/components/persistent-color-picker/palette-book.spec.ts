import { PALETTES_STORAGE_KEY, PALETTE_ROW_LENGTH, PaletteBook, PaletteStorage, SquareGesture, emptyPaletteRow, parsePaletteRows } from './palette-book';

function memoryStorage(seed: Record<string, string> = {}): PaletteStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe('PaletteBook (colour picker palettes)', () => {
  it('starts with one empty row of 8 squares', () => {
    const b = new PaletteBook(memoryStorage());
    expect(b.rows.length).toBe(1);
    expect(b.rows[0]).toEqual(new Array(PALETTE_ROW_LENGTH).fill(null));
    expect(b.selected).toBeNull();
  });

  it('tapping an empty square fills it with the picker colour and links it: picker changes update it', () => {
    const b = new PaletteBook(memoryStorage());
    expect(b.tap(0, 2, '#112233')).toBeNull();   // the picker keeps its colour
    expect(b.rows[0][2]).toBe('#112233');
    expect(b.isSelected(0, 2)).toBeTrue();
    b.pickerChanged('#445566');
    b.pickerChanged('#778899');
    expect(b.rows[0][2]).toBe('#778899');
  });

  it('tapping a filled square gives the picker its colour and does not link it', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 0, '#aa0000');
    b.tap(0, 0, '#aa0000');   // tapping the selected square again deselects it
    expect(b.selected).toBeNull();
    expect(b.tap(0, 0, '#00ff00')).toBe('#aa0000');
    expect(b.selected).toBeNull();
    b.pickerChanged('#0000ff');
    expect(b.rows[0][0]).toBe('#aa0000');
  });

  it('link (long-press / double-tap) re-links a filled square and returns its colour; an empty square does nothing', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 1, '#123456');
    b.deselect();
    expect(b.link(0, 1)).toBe('#123456');
    expect(b.isSelected(0, 1)).toBeTrue();
    b.pickerChanged('#654321');
    expect(b.rows[0][1]).toBe('#654321');
    b.deselect();
    expect(b.link(0, 5)).toBeNull();
    expect(b.selected).toBeNull();
  });

  it('only one square is selected at a time', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 0, '#111111');
    b.tap(0, 1, '#222222');
    expect(b.isSelected(0, 1)).toBeTrue();
    expect(b.isSelected(0, 0)).toBeFalse();
    b.pickerChanged('#333333');
    expect(b.rows[0]).toEqual(['#111111', '#333333', null, null, null, null, null, null]);
    b.tap(0, 0, '#333333');   // a filled square: deselects, nothing linked
    expect(b.selected).toBeNull();
    b.link(0, 0);
    expect(b.isSelected(0, 0)).toBeTrue();
    expect(b.isSelected(0, 1)).toBeFalse();
  });

  it('+ adds an empty row right below that row (the selection moves with its row)', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 0, '#aaaaaa');
    b.addRowBelow(0);
    b.tap(1, 0, '#bbbbbb');
    b.addRowBelow(0);   // between the two
    expect(b.rows.map((r) => r[0])).toEqual(['#aaaaaa', null, '#bbbbbb']);
    expect(b.isSelected(2, 0)).toBeTrue();
  });

  it('✕ deletes a row; undo puts it back at the same place', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 0, '#a00000');
    b.addRowBelow(0);
    b.tap(1, 0, '#b00000');
    b.addRowBelow(1);
    b.tap(2, 0, '#c00000');
    b.deselect();
    const d = b.deleteRow(1)!;
    expect(b.rows.map((r) => r[0])).toEqual(['#a00000', '#c00000']);
    b.restoreRow(d);
    expect(b.rows.map((r) => r[0])).toEqual(['#a00000', '#b00000', '#c00000']);
  });

  it('deleting the last row leaves one empty row; undo brings the row back in its place', () => {
    const b = new PaletteBook(memoryStorage());
    b.tap(0, 3, '#abcdef');
    const d = b.deleteRow(0)!;
    expect(b.rows).toEqual([emptyPaletteRow()]);
    expect(b.selected).toBeNull();   // the selected square went with its row
    b.restoreRow(d);
    expect(b.rows.length).toBe(1);
    expect(b.rows[0][3]).toBe('#abcdef');
  });

  it('persists: a new book on the same storage reads the rows back', () => {
    const s = memoryStorage();
    const a = new PaletteBook(s);
    a.tap(0, 0, '#010203');
    a.addRowBelow(0);
    a.tap(1, 7, '#040506');
    a.pickerChanged('#070809');
    const b = new PaletteBook(s);
    expect(b.rows.length).toBe(2);
    expect(b.rows[0][0]).toBe('#010203');
    expect(b.rows[1][7]).toBe('#070809');
    expect(b.selected).toBeNull();   // the selection is not saved
    expect(JSON.parse(s.data[PALETTES_STORAGE_KEY]).rows.length).toBe(2);
  });

  it('never throws when storage is missing or failing, and keeps working for the session', () => {
    const throwing: PaletteStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    for (const storage of [throwing, null]) {
      let b!: PaletteBook;
      expect(() => { b = new PaletteBook(storage); }).not.toThrow();
      expect(b.rows).toEqual([emptyPaletteRow()]);
      expect(() => { b.tap(0, 0, '#ffffff'); b.pickerChanged('#eeeeee'); b.addRowBelow(0); b.restoreRow(b.deleteRow(1)!); }).not.toThrow();
      expect(b.rows[0][0]).toBe('#eeeeee');
    }
  });

  it('a malformed stored value reads as one empty row; short / long rows are padded / cut to 8', () => {
    expect(parsePaletteRows('{nope')).toEqual([emptyPaletteRow()]);
    expect(parsePaletteRows(JSON.stringify({ rows: 'x' }))).toEqual([emptyPaletteRow()]);
    expect(parsePaletteRows(JSON.stringify({ rows: [] }))).toEqual([emptyPaletteRow()]);
    const rows = parsePaletteRows(JSON.stringify({ rows: [['#111111', 5], new Array(12).fill('#222222')] }));
    expect(rows[0]).toEqual(['#111111', null, null, null, null, null, null, null]);
    expect(rows[1].length).toBe(PALETTE_ROW_LENGTH);
  });
});

describe('SquareGesture (palette square tap / long-press / double-tap)', () => {
  beforeEach(() => { jasmine.clock().install(); jasmine.clock().mockDate(new Date(2026, 0, 1)); });
  afterEach(() => jasmine.clock().uninstall());

  function make() {
    const h = { tap: jasmine.createSpy('tap'), link: jasmine.createSpy('link') };
    return { g: new SquareGesture(h), h };
  }

  it('a quick press is a tap', () => {
    const { g, h } = make();
    g.down(0, 1, 10, 10);
    jasmine.clock().tick(100);
    g.up();
    expect(h.tap).toHaveBeenCalledOnceWith(0, 1);
    expect(h.link).not.toHaveBeenCalled();
  });

  it('a long press (450 ms) links, and the release does nothing more', () => {
    const { g, h } = make();
    g.down(1, 2, 10, 10);
    jasmine.clock().tick(449);
    expect(h.link).not.toHaveBeenCalled();
    jasmine.clock().tick(1);
    expect(h.link).toHaveBeenCalledOnceWith(1, 2);
    g.up();
    expect(h.tap).not.toHaveBeenCalled();
  });

  it('a double tap on the same square: tap, then link', () => {
    const { g, h } = make();
    g.down(0, 3, 10, 10); jasmine.clock().tick(60); g.up();
    jasmine.clock().tick(120);
    g.down(0, 3, 11, 10); jasmine.clock().tick(60); g.up();
    expect(h.tap).toHaveBeenCalledOnceWith(0, 3);
    expect(h.link).toHaveBeenCalledOnceWith(0, 3);
  });

  it('two taps on different squares, or too far apart in time, are two taps', () => {
    const { g, h } = make();
    g.down(0, 0, 0, 0); g.up();
    g.down(0, 1, 0, 0); g.up();
    jasmine.clock().tick(400);
    g.down(0, 1, 0, 0); g.up();
    expect(h.tap).toHaveBeenCalledTimes(3);
    expect(h.link).not.toHaveBeenCalled();
  });

  it('moving away (a scroll) or a cancel is neither a tap nor a long press', () => {
    const { g, h } = make();
    g.down(0, 0, 0, 0);
    g.move(0, 30);
    jasmine.clock().tick(500);
    g.up();
    g.down(0, 1, 0, 0);
    g.cancel();
    jasmine.clock().tick(500);
    g.up();
    expect(h.tap).not.toHaveBeenCalled();
    expect(h.link).not.toHaveBeenCalled();
  });
});
