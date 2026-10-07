import { ChangeDetectionStrategy, Component, Input, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetachWhenHiddenDirective } from './detach-when-hidden.directive';

/** A panel that counts how often its template is checked and shows a value its parent never binds (as a service's). */
@Component({
  selector: 'fm-test-panel',
  template: '<span class="label">{{ label }}</span><span class="state">{{ count() }}{{ external }}</span><b *ngIf="open" class="open-only"></b>',
})
class TestPanelComponent {
  @Input() label = '';
  @Input() open = false;
  external = 'a';
  checks = 0;
  count(): string { this.checks++; return ''; }
}

@Component({
  selector: 'fm-test-panel-onpush',
  template: '<span class="state">{{ external }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestOnPushPanelComponent {
  external = 'a';
}

@Component({
  template: `
    <div class="wrap" [class.visible]="shown">
      <fm-test-panel [fmDetachWhenHidden]="shown" [open]="shown" [label]="label"></fm-test-panel>
    </div>
    <fm-test-panel-onpush [fmDetachWhenHidden]="shown"></fm-test-panel-onpush>`,
})
class HostComponent {
  shown = false;
  label = 'one';
  @ViewChild(TestPanelComponent) panel!: TestPanelComponent;
  @ViewChild(TestOnPushPanelComponent) onPush!: TestOnPushPanelComponent;
  @ViewChild(TestPanelComponent, { read: DetachWhenHiddenDirective }) dir!: DetachWhenHiddenDirective;
}

describe('DetachWhenHiddenDirective (hidden panels are not change-checked)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const text = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel)?.textContent ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent, TestPanelComponent, TestOnPushPanelComponent],
      imports: [DetachWhenHiddenDirective],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();   // first render (the panel renders once, then detaches: it starts hidden)
  });

  it('renders a panel that starts hidden once, then stops checking it', () => {
    expect(text('.label')).toBe('one');
    expect(host.dir.detached).toBeTrue();
    const checks = host.panel.checks;
    fixture.detectChanges();
    fixture.detectChanges();
    expect(host.panel.checks).toBe(checks);
  });

  it('keeps receiving inputs while detached; the view catches up when shown', () => {
    host.label = 'two';
    host.panel.external = 'b';           // state a service changed while hidden
    fixture.detectChanges();
    expect(host.panel.label).toBe('two');                 // the input still arrives
    expect(text('.label')).toBe('one');                   // …but the template is not re-rendered
    host.shown = true;
    fixture.detectChanges();                              // ONE pass: reattached before the panel is checked
    expect(host.dir.detached).toBeFalse();
    expect(text('.label')).toBe('two');
    expect(text('.state')).toContain('b');
    expect((fixture.nativeElement as HTMLElement).querySelector('.wrap')!.classList.contains('visible')).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.open-only')).not.toBeNull();
  });

  it('checks a visible panel on every pass', () => {
    host.shown = true;
    fixture.detectChanges();
    const checks = host.panel.checks;
    fixture.detectChanges();
    expect(host.panel.checks).toBeGreaterThan(checks);
  });

  it('on hide, renders the closing state once more (tears down what it closes), then detaches', () => {
    host.shown = true;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.open-only')).not.toBeNull();
    host.shown = false;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.open-only')).toBeNull();   // [open]=false rendered
    expect(host.dir.detached).toBeTrue();
    const checks = host.panel.checks;
    fixture.detectChanges();
    expect(host.panel.checks).toBe(checks);
  });

  it('refreshes an OnPush panel on show (markForCheck)', () => {
    host.onPush.external = 'b';
    fixture.detectChanges();
    expect(text('fm-test-panel-onpush .state')).toBe('a');
    host.shown = true;
    fixture.detectChanges();
    expect(text('fm-test-panel-onpush .state')).toBe('b');
  });
});
