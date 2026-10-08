import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { NotifyService } from '../../../shared/services/notify/notify.service';
import { PaletteBook, PalettesService } from './palette-book';
import { PersistentColorPickerComponent } from './persistent-color-picker.component';

/** The Palettes button + popup of the colour picker (the logic itself: palette-book.spec.ts). */
describe('PersistentColorPickerComponent palettes', () => {
  let fixture: ComponentFixture<PersistentColorPickerComponent>;
  let c: PersistentColorPickerComponent;
  let book: PaletteBook;
  let undo$: Subject<void>;
  let notify: { success: jasmine.Spy };

  beforeEach(() => {
    book = new PaletteBook(null);
    undo$ = new Subject<void>();
    notify = { success: jasmine.createSpy('success').and.returnValue({ onAction: () => undo$ }) };
    TestBed.configureTestingModule({
      declarations: [PersistentColorPickerComponent],
      providers: [
        { provide: PalettesService, useValue: book },
        { provide: NotifyService, useValue: notify },
      ],
    });
    fixture = TestBed.createComponent(PersistentColorPickerComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('color', '#102030');
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const popup = (): HTMLElement | null => el().querySelector('.palettes-popup');
  const squares = (): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>('.palette-square'));
  const tapSquare = (i: number): void => {
    const sq = squares()[i];
    sq.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, pointerId: 1 }));
    sq.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0, pointerId: 1 }));
    fixture.detectChanges();
  };

  it('the Palettes button opens the popup and closes it again; Esc closes it', () => {
    const btn = el().querySelector<HTMLButtonElement>('button[title="Palettes"]')!;
    expect(btn).toBeTruthy();
    expect(popup()).toBeNull();
    btn.click(); fixture.detectChanges();
    expect(popup()).toBeTruthy();
    expect(squares().length).toBe(8);
    expect(squares().every((s) => s.classList.contains('palette-square--empty'))).toBeTrue();
    btn.click(); fixture.detectChanges();
    expect(popup()).toBeNull();
    btn.click(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(popup()).toBeNull();
  });

  it('an empty square takes the picker colour and follows picker changes; closing the popup unlinks it', () => {
    c.togglePalettes(); fixture.detectChanges();
    tapSquare(0);
    expect(book.rows[0][0]).toBe('#102030');
    expect(squares()[0].classList).toContain('palette-square--selected');
    fixture.componentRef.setInput('color', '#405060');
    fixture.detectChanges();
    expect(book.rows[0][0]).toBe('#405060');
    c.closePalettes();
    fixture.componentRef.setInput('color', '#708090');
    fixture.detectChanges();
    expect(book.rows[0][0]).toBe('#405060');
  });

  it('a filled square sets the picker colour (pickRecent) without linking it', () => {
    book.tap(0, 4, '#abcdef');
    book.deselect();
    const picked: string[] = [];
    c.pickRecent.subscribe((h: string) => picked.push(h));
    c.togglePalettes(); fixture.detectChanges();
    tapSquare(4);
    expect(picked).toEqual(['#abcdef']);
    expect(book.selected).toBeNull();
  });

  it('+ adds a row below; ✕ deletes it with an Undo toast that restores it', () => {
    c.togglePalettes(); fixture.detectChanges();
    tapSquare(0);
    const plus = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('.palette-row-btn[title="Add a row below"]'));
    const del = (): HTMLButtonElement[] => Array.from(el().querySelectorAll<HTMLButtonElement>('.palette-row-btn[title="Delete this row"]'));
    plus()[0].click(); fixture.detectChanges();
    expect(el().querySelectorAll('.palette-row').length).toBe(2);
    del()[0].click(); fixture.detectChanges();
    expect(notify.success).toHaveBeenCalledWith(jasmine.any(String), 'Undo');
    expect(book.rows.length).toBe(1);
    expect(book.rows[0][0]).toBeNull();
    undo$.next(); fixture.detectChanges();
    expect(book.rows.length).toBe(2);
    expect(book.rows[0][0]).toBe('#102030');
  });
});
