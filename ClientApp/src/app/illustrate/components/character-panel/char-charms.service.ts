import { Injectable, OnDestroy } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { CharacterPanelComponent } from './character-panel.component';

/** What CharCharmsService reads / writes on the panel. */
export type CharCharmsHost = Pick<CharacterPanelComponent,
  'shapeManager' | 'dirty' | 'scene3dEditCharBodyId' | 'sub'
>;

/**
 * Character charms: attachments by type (add / remove / params / placement), place-pick + preview, chains, belt loops, sparkle.
 * Panel-scoped (provided by CharacterPanelComponent, bound in its constructor). Bodies moved verbatim from
 * character-panel.component (audit Phase 5.5).
 */
@Injectable()
export class CharCharmsService implements OnDestroy {
  private host!: CharCharmsHost;
  bind(host: CharCharmsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    this.scene3dEndPlacePick();
    this._hideCharmPreview();
    Object.values(this._attachmentParamTimers).forEach(t => clearTimeout(t));
  }

  // Charms / accessories
  scene3dAttachments: Array<{ id: string; type: string; params: any; placement: { joint: string; offset: [number, number, number]; scale: number } }> = [];

  scene3dAttachmentTypes: string[] = [];

  scene3dNewAttachmentType = 'chain';

  scene3dPlacingCharmType: string | null = null;

  scene3dDrawingChain = false;

  scene3dChainPickProgress: 'first' | 'second' | null = null;

  scene3dPreviewActive = false;

  scene3dCharSparkle = false;

  scene3dCharSparkleMode: 'glint' | 'star' = 'glint';

  scene3dAccordionOpen: Record<string, boolean> = {};


  scene3dAttachmentsByType: Array<{ type: string; items: typeof this.scene3dAttachments }> = [];

  private _attachmentParamTimers: Map<string, any> = new Map();

  scene3dRefreshAttachments(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dAttachmentTypes = sm.attachmentTypeNames3D() ?? ['chain', 'pocket', 'pendant', 'bracelet', 'watch', 'choker', 'clip', 'flower', 'loop', 'beltloop', 'button'];
    this.scene3dAttachments = sm.listAttachments3D(id) ?? [];
    // Recompute grouped view (stored property — never a getter, avoids change-detection loop)
    const _groups = new Map<string, typeof this.scene3dAttachments>();
    for (const a of this.scene3dAttachments) {
      if (!_groups.has(a.type)) _groups.set(a.type, []);
      _groups.get(a.type)!.push(a);
      if (!(a.type in this.scene3dAccordionOpen)) this.scene3dAccordionOpen[a.type] = false;
    }
    this.scene3dAttachmentsByType = Array.from(_groups.entries()).map(([type, items]) => ({ type, items }));
    if (this.scene3dAttachmentTypes.length && !this.scene3dAttachmentTypes.includes(this.scene3dNewAttachmentType)) {
      this.scene3dNewAttachmentType = this.scene3dAttachmentTypes[0];
    }
  }

  private _scene3dLoopsCache: Array<{ id: string; type: string; params: any; placement: any }> | null = null;

  private _scene3dLoopsRef: any[] | null = null;

  get scene3dLoops(): Array<{ id: string; type: string; params: any; placement: any }> {
    if (this._scene3dLoopsCache && this._scene3dLoopsRef === this.scene3dAttachments) {
      return this._scene3dLoopsCache;
    }
    this._scene3dLoopsRef = this.scene3dAttachments;
    this._scene3dLoopsCache = this.scene3dAttachments.filter(a => a.type === 'loop');
    return this._scene3dLoopsCache;
  }

  scene3dAddBeltLoops(count: number = 5): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    sm.addBeltLoops3D(id, count);
    this.scene3dRefreshAttachments();
    this.host.dirty.emit();
  }

  scene3dTogglePlacePick(): void {
    if (this.scene3dPlacingCharmType) {
      this.scene3dEndPlacePick();
    } else {
      this.scene3dStartPlacePick(this.scene3dNewAttachmentType);
    }
  }

  scene3dStartPlacePick(type: string): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dPlacingCharmType = type;
    this._showCharmPreview();
    sm.beginAttachmentPlacePick3D(id, type as any, {
      onPlaced: (placedId: string) => {
        this.scene3dRefreshAttachments();
        if (placedId) {
          this.scene3dAccordionOpen[type] = true;
          this._openCharm(placedId, type);
        }
        this.host.dirty.emit();
      },
    });
  }

  scene3dEndPlacePick(): void {
    if (!this.scene3dPlacingCharmType && !this.scene3dDrawingChain) return;
    this.scene3dPlacingCharmType = null;
    this.scene3dDrawingChain = false;
    this.scene3dChainPickProgress = null;
    this.shapeManager.endAttachmentPlacePick3D();
    this._hideCharmPreview();
  }

  scene3dToggleChainPick(): void {
    if (this.scene3dDrawingChain || this.scene3dPlacingCharmType) {
      this.scene3dEndPlacePick();
      return;
    }
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this._hideCharmPreview();
    this.scene3dDrawingChain = true;
    this.scene3dChainPickProgress = 'first';
    sm.beginChainPick3D(id, {
      onPlaced: (chainId: string) => {
        this.scene3dDrawingChain = false;
        this.scene3dChainPickProgress = null;
        this.scene3dRefreshAttachments();
        if (chainId) {
          this.scene3dAccordionOpen['chain'] = true;
          this._openCharm(chainId, 'chain');
        }
        this.host.dirty.emit();
      },
      onProgress: (p: 'first' | 'second') => {
        this.scene3dChainPickProgress = p;
      },
    });
  }

  scene3dToggleCharSparkle(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dCharSparkle = !this.scene3dCharSparkle;
    sm.setCharacterSparkle3D(id, this.scene3dCharSparkle, this.scene3dCharSparkleMode);
  }

  scene3dSetCharSparkleMode(mode: 'glint' | 'star'): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    this.scene3dCharSparkleMode = mode;
    if (this.scene3dCharSparkle) {
      sm.setCharacterSparkle3D(id, true, mode);
    }
  }

  private _showCharmPreview(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id || !sm.showAttachmentPreview3D) return;
    sm.showAttachmentPreview3D(id, this.scene3dNewAttachmentType as any);
    this.scene3dPreviewActive = true;
  }

  _hideCharmPreview(): void {
    if (!this.scene3dPreviewActive) return;
    this.shapeManager.hideAttachmentPreview3D();
    this.scene3dPreviewActive = false;
  }

  scene3dNewAttachmentTypeChanged(type: string): void {
    this.scene3dNewAttachmentType = type;
    if (this.scene3dPreviewActive) {
      this.shapeManager.updateAttachmentPreview3D(null, type as any);
    }
  }

  scene3dAddAttachment(): void {
    const sm = this.shapeManager;
    const id = this.host.scene3dEditCharBodyId;
    if (!id) return;
    let newId: string | null = null;
    if (this.scene3dPreviewActive) {
      newId = sm.commitAttachmentPreview3D() ?? null;
    } else {
      let placement = sm.getDefaultAttachmentPlacement3D(this.scene3dNewAttachmentType as any);
      let params    = sm.getDefaultAttachmentParams3D(this.scene3dNewAttachmentType as any);
      if (this.scene3dNewAttachmentType === 'chain') {
        placement = { ...placement, offset: [0, 0, 0.04] as [number,number,number], scale: 1.0 };
        params = { ...params, chainMode: 'dangle', linkCount: 20, thickness: 0.0015, span: 0, sag: 0, metalness: 0.40, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'choker') {
        params = { ...params, metalness: 1.0, roughness: 0.46, sparkle: false, position: 0.0, thickness: 0.001 };
      }
      if (this.scene3dNewAttachmentType === 'pocket') {
        params = { ...params, width: 0.08, height: 0.09 };
      }
      if (this.scene3dNewAttachmentType === 'clip') {
        params = { ...params, width: 0.02, height: 0.005, thickness: 0.002, metalness: 1.0, roughness: 0.50 };
      }
      if (this.scene3dNewAttachmentType === 'pendant') {
        placement = { ...placement, offset: [0.04, 0.02, 0.01] as [number,number,number], scale: 1.25 };
        params = { ...params, dropLength: 0.02, width: 0.01, thickness: 0.002, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'watch') {
        placement = { ...placement, joint: 'lowerarm_l' };
        params = { ...params, position: 1.0, thickness: 0.001, width: 0.01, height: 0.01, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      if (this.scene3dNewAttachmentType === 'bracelet') {
        placement = { ...placement, joint: 'lowerarm_l' };
        params = { ...params, position: 0.80, thickness: 0.001, metalness: 1.0, roughness: 0.28, sparkle: false };
      }
      newId = sm.addAttachment3D(id, this.scene3dNewAttachmentType as any, placement, params) ?? null;
    }
    this.scene3dRefreshAttachments();
    if (newId) {
      this.scene3dAccordionOpen[this.scene3dNewAttachmentType] = true;
      this._openCharm(newId, this.scene3dNewAttachmentType);
    }
    this.host.dirty.emit();
    if (this.scene3dPlacingCharmType) this._showCharmPreview();
  }

  /** A new charm opens its own view (the panel's drill-down), as its settings card used to expand. */
  private _openCharm(id: string, type: string): void {
    this.host.sub.open('charm:' + id, type);
  }

  scene3dRemoveAttachment(attachId: string): void {
    const sm = this.shapeManager;
    sm.removeAttachment3D(attachId);
    if (this.host.sub.id === 'charm:' + attachId) this.host.sub.close();
    this.scene3dRefreshAttachments();
    this.host.dirty.emit();
  }

  scene3dRemoveAttachmentsByType(type: string): void {
    const sm = this.shapeManager;
    const ids = this.scene3dAttachments.filter(a => a.type === type).map(a => a.id);
    for (const id of ids) {
      sm.removeAttachment3D(id);
      if (this.host.sub.id === 'charm:' + id) this.host.sub.close();
    }
    delete this.scene3dAccordionOpen[type];
    this.scene3dRefreshAttachments();
    this.host.dirty.emit();
  }

  scene3dAttachmentParamChanged(attachId: string, params: any): void {
    clearTimeout(this._attachmentParamTimers.get(attachId));
    this._attachmentParamTimers.set(attachId, setTimeout(() => {
      this.shapeManager.setAttachmentParams3D(attachId, params);
      this.host.dirty.emit();
    }, 30));
  }

  scene3dSetAttachmentPlacement(attachId: string, field: string, value: any): void {
    const a = this.scene3dAttachments.find(x => x.id === attachId);
    if (!a) return;
    if (field === 'joint') a.placement.joint = value;
    else if (field === 'scale') a.placement.scale = +value;
    else if (field === 'offsetX') a.placement.offset[0] = +value;
    else if (field === 'offsetY') a.placement.offset[1] = +value;
    else if (field === 'offsetZ') a.placement.offset[2] = +value;
    this.shapeManager.setAttachmentPlacement3D(attachId, a.placement);
    this.host.dirty.emit();
  }
}
