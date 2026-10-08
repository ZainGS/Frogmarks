import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NewIllustrationDialogComponent, type NewIllustrationDialogData } from './new-illustration-dialog.component';

/** New Illustration modal (2026-10-07): illustrations are always bounded (no Canvas row / Infinite option) and the
 *  Storage section is hidden (local-only for now) — every new / imported illustration is Local only (syncMode 2). */
describe('NewIllustrationDialogComponent', () => {
  function create(data: NewIllustrationDialogData = { isLoggedIn: true }) {
    const ref = jasmine.createSpyObj<MatDialogRef<NewIllustrationDialogComponent>>('ref', ['close']);
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [NewIllustrationDialogComponent],
      providers: [{ provide: MatDialogRef, useValue: ref }, { provide: MAT_DIALOG_DATA, useValue: data }],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(NewIllustrationDialogComponent);
    fixture.detectChanges();
    return { fixture, ref, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }
  const buttonLabels = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim());
  const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('.nid-label')).map(l => l.textContent?.trim());

  it('has no Canvas row (Bounded / Infinite) and no Storage section; the size controls stay', () => {
    const { el, fixture } = create();
    expect(labels(el)).not.toContain('Canvas');
    expect(labels(el)).not.toContain('Storage');
    expect(buttonLabels(el)).not.toContain('Infinite');
    expect(buttonLabels(el)).not.toContain('Bounded');
    expect(el.querySelector('.nid-storage-section')).toBeNull();
    expect(el.querySelector('.nid-infinite-hint')).toBeNull();
    expect(labels(el)).toEqual(jasmine.arrayContaining(['Preset', 'Size', 'Orientation']));
    fixture.destroy();
  });

  it('Create always sends a bounded, local-only illustration with the chosen size', () => {
    const { ref, cmp, fixture } = create();
    cmp.onPresetChange('HD 1080p');
    cmp.create();
    expect(ref.close).toHaveBeenCalledOnceWith(jasmine.objectContaining({ docW: 1920, docH: 1080, bounded: true, syncMode: 2 }));
    fixture.destroy();
  });

  it('import mode: no Storage section either, and the import is local-only', () => {
    const { el, ref, cmp, fixture } = create({ importMode: true, defaultName: 'Frog', isLoggedIn: true });
    expect(el.querySelector('.nid-storage-section')).toBeNull();
    cmp.create();
    expect(ref.close).toHaveBeenCalledOnceWith({ name: 'Frog', syncMode: 2 });
    fixture.destroy();
  });
});
