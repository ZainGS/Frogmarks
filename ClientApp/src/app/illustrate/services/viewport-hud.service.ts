import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { formatNumber } from '@angular/common';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

import { EditorStateService } from './editor-state.service';
/** Exactly the editor state the 3D viewport HUD reads. */
export type ViewportHudHost = Pick<IllustrationComponent, 'shapeManager' |
  'canvasRef' | 'angleLabelRef'
>;

/**
 * 3D viewport HUD: the keyboard-transform readout (G / R / S + axis + numeric, and the key handling that drives it),
 * the Ctrl snap badge (on / fading / hidden), and the gizmo drag angle label polled each frame outside the zone while
 * the 3D panel is up, and the screencast-keys overlay. Component-scoped (provided by IllustrationComponent). Bodies
 * moved verbatim from illustration.component (refactor-plan 2.9F).
 */
@Injectable()
export class ViewportHudService implements OnDestroy {
  private host!: ViewportHudHost;
  constructor(private editorState: EditorStateService, private ngZone: NgZone) {}
  bind(host: ViewportHudHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearTimeout(this._snapFadeTimer);
    if (this._scene3dGizmoRafId != null) cancelAnimationFrame(this._scene3dGizmoRafId);
  }

  // Viewport transform shortcut HUD (synced from Salsa getters)
  scene3dShortcutActive = false;
  scene3dShortcutMode: string | null = null;
  scene3dShortcutAxis: string | null = null;
  scene3dShortcutNumeric = '';

  /** Re-read the keyboard-transform readout after a non-key driver (the touch pill's Grab / X / Apply…) changed it. */
  syncShortcutHud(): void { this._syncShortcutHud(); }

  private _syncShortcutHud(): void {
    const sm = this.shapeManager;
    this.scene3dShortcutActive = sm?.isShortcutActive3D ?? false;
    this.scene3dShortcutMode   = sm?.shortcutMode3D ?? null;
    this.scene3dShortcutAxis   = sm?.shortcutAxis3D ?? null;
    this.scene3dShortcutNumeric = sm?.shortcutNumericDisplay3D ?? '';
  }

  /** Ctrl held: show the snap badge (ON). */
  snapKeyDown(): void {
    if (this._snapFadeTimer) { clearTimeout(this._snapFadeTimer); this._snapFadeTimer = null; }
    this.ngZone.run(() => {
      this.scene3dSnapActive = true;
      this.scene3dSnapFadingOut = false;
      this.scene3dSnapBadgeVisible = true;
    });
  }

  /** Ctrl released: badge shows OFF, fades after 1 s, hides after 2 s. */
  snapKeyUp(): void {
    this.ngZone.run(() => { this.scene3dSnapActive = false; });
    this._snapFadeTimer = setTimeout(() => {
      this.ngZone.run(() => { this.scene3dSnapFadingOut = true; });
      this._snapFadeTimer = setTimeout(() => {
        this.ngZone.run(() => {
          this.scene3dSnapBadgeVisible = false;
          this.scene3dSnapFadingOut = false;
          this._snapFadeTimer = null;
        });
      }, 1000);
    }, 1000);
  }

  /** Blender-style keyboard transform on the selected mesh: G / R / S, then X / Y / Z, digits, Enter / Esc. */
  handleTransformKey(e: KeyboardEvent): void {
    const active = document.activeElement;
    const inInput = active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
      || (active as HTMLElement)?.isContentEditable;
    if (!inInput) {
      const sm = this.shapeManager;
      const key = e.key.toLowerCase();

      if (key === 'g') { sm.beginTransform3D('grab');   e.preventDefault(); this._syncShortcutHud(); return; }
      if (key === 'r') { sm.beginTransform3D('rotate');  e.preventDefault(); this._syncShortcutHud(); return; }
      if (key === 's' && !e.ctrlKey && !e.metaKey) { sm.beginTransform3D('scale'); e.preventDefault(); this._syncShortcutHud(); return; }

      if (sm.isShortcutActive3D) {
        if (key === 'x') { sm.constrainAxis3D('x'); e.preventDefault(); this._syncShortcutHud(); return; }
        if (key === 'y') { sm.constrainAxis3D('y'); e.preventDefault(); this._syncShortcutHud(); return; }
        if (key === 'z') { sm.constrainAxis3D('z'); e.preventDefault(); this._syncShortcutHud(); return; }
        if (key === 'enter') { sm.commitTransform3D(); e.preventDefault(); this._syncShortcutHud(); return; }
        if (/^[\d.\-]$/.test(e.key)) { sm.appendNumericInput(e.key); e.preventDefault(); this._syncShortcutHud(); return; }
      }

      // Claim Esc only while a keyboard transform runs — otherwise it belongs to the editor (exit knife / decal tool, …)
      if (key === 'escape' && sm.isShortcutActive3D) { sm.cancelTransform3D(); e.preventDefault(); this._syncShortcutHud(); return; }
    }
  }

  // Rotation drag readout
  scene3dDragAngleDeg: number | null = null;

  scene3dDragLabelPos: { x: number; y: number } | null = null;

  private _scene3dGizmoRafId: number | null = null;

  // -- Snap indicator
  scene3dSnapActive = false;

  scene3dSnapBadgeVisible = false;

  scene3dSnapFadingOut = false;

  private _snapFadeTimer: any = null;

  startGizmoLoop(): void {
    if (this._scene3dGizmoRafId != null) return;
    this.ngZone.runOutsideAngular(() => {
      const loop = () => {
        this._scene3dPollDragInfo();
        if (this.editorState.scene3dPanelVisible) {
          this._scene3dGizmoRafId = requestAnimationFrame(loop);
        } else {
          this._scene3dGizmoRafId = null;
        }
      };
      this._scene3dGizmoRafId = requestAnimationFrame(loop);
    });
  }

  stopGizmoLoop(): void {
    if (this._scene3dGizmoRafId != null) {
      cancelAnimationFrame(this._scene3dGizmoRafId);
      this._scene3dGizmoRafId = null;
    }
    if (this.scene3dDragAngleDeg !== null) {
      this.ngZone.run(() => {
        this.scene3dDragAngleDeg = null;
        this.scene3dDragLabelPos = null;
      });
    }
  }

  private _scene3dPollDragInfo(): void {
    const sm = this.shapeManager;

    // Poll snap indicator
    const snapNow = !!(sm.snapActive3D);
    if (snapNow !== this.scene3dSnapActive) {
      this.ngZone.run(() => { this.scene3dSnapActive = snapNow; });
    }

    const info = sm.scene3d?.getDragInfo();
    if (!info?.isDragging || info.angleDeg == null || !info.gizmoCenterWorld) {
      if (this.scene3dDragAngleDeg !== null) {
        this.ngZone.run(() => {
          this.scene3dDragAngleDeg = null;
          this.scene3dDragLabelPos = null;
        });
      }
      return;
    }
    const canvas = this.host.canvasRef?.nativeElement;
    const cw = canvas ? (canvas.clientWidth || canvas.width) : 0;
    const ch = canvas ? (canvas.clientHeight || canvas.height) : 0;
    const [wx, wy, wz] = info.gizmoCenterWorld as [number, number, number];
    const screen = sm.scene3d?.projectWorldToScreen3D(wx, wy, wz, cw, ch);
    const newAngle = Math.round(info.angleDeg * 10) / 10;
    const newPos = screen ? { x: screen.x, y: screen.y } : null;
    if (this.scene3dDragAngleDeg === newAngle &&
        this.scene3dDragLabelPos?.x === newPos?.x &&
        this.scene3dDragLabelPos?.y === newPos?.y) return;
    // M2 (zone audit): enter the zone only when the label appears / disappears (the *ngIf). While it is up, this runs
    // every frame of the drag: move it and write its text directly (the bindings render the same values later).
    const label = this.host.angleLabelRef?.nativeElement;
    const wasShown = this.scene3dDragAngleDeg !== null && !!this.scene3dDragLabelPos;
    if (!wasShown || !newPos || !label) {
      this.ngZone.run(() => {
        this.scene3dDragAngleDeg = newAngle;
        this.scene3dDragLabelPos = newPos;
      });
      return;
    }
    this.scene3dDragAngleDeg = newAngle;
    this.scene3dDragLabelPos = newPos;
    label.style.left = (newPos.x + 20) + 'px';
    label.style.top = (newPos.y - 12) + 'px';
    // Write Angular's own interpolation text node (replacing textContent would detach the node the binding updates)
    const text = label.firstChild;
    if (text && text.nodeType === Node.TEXT_NODE) text.nodeValue = ' ' + formatNumber(newAngle, 'en-US', '1.1-1') + '° ';
  }
  // ── Screencast keys (on-screen key display) ──
  screencastKeysEnabled = false;
  screencastKeyEntries: { text: string; id: number }[] = [];
  private _screencastKeyIdCounter = 0;

  toggleScreencastKeys(): void {
    this.screencastKeysEnabled = !this.screencastKeysEnabled;
    if (!this.screencastKeysEnabled) this.screencastKeyEntries = [];
  }

  trackScreencastKey(_: number, entry: { text: string; id: number }): number {
    return entry.id;
  }

  /** Called for every editor hotkey (before routing) while the overlay is on. */
  recordScreencastKey(e: KeyboardEvent): void {
    const label = this._formatKeyForScreencast(e);
    if (label) this._pushScreencastKey(label);
  }

  private _pushScreencastKey(text: string): void {
    if (!this.screencastKeysEnabled) return;
    const id = ++this._screencastKeyIdCounter;
    this.ngZone.run(() => {
      this.screencastKeyEntries = [{ text, id }, ...this.screencastKeyEntries.slice(0, 4)];
    });
    setTimeout(() => {
      this.ngZone.run(() => {
        this.screencastKeyEntries = this.screencastKeyEntries.filter(e => e.id !== id);
      });
    }, 2500);
  }

  private _formatKeyForScreencast(e: KeyboardEvent): string | null {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    const parts: string[] = [];
    const isMac = navigator.userAgent.includes('Mac');
    if (isMac ? e.metaKey : e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    const keyMap: Record<string, string> = {
      ' ': 'Space', 'ArrowLeft': '←', 'ArrowRight': '→',
      'ArrowUp': '↑', 'ArrowDown': '↓',
      'Delete': 'Del', 'Backspace': '⌫', 'Escape': 'Esc', 'Enter': '↵',
    };
    parts.push(keyMap[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key));
    return parts.join('+');
  }
}
