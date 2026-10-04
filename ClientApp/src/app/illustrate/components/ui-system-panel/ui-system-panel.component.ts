import { Component, inject, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';

/**
 * UI System panel: UI layers, state machine (states, transitions, variables), per-state shape/layer
 * visibility bindings, shape interactions, sounds, live preview.
 * Extracted from illustration.component (refactor-plan Phase 2.3).
 */
@Component({
  selector: 'app-ui-system-panel',
  templateUrl: './ui-system-panel.component.html',
  styleUrls: ['./ui-system-panel.component.scss'],
})
export class UiSystemPanelComponent implements OnInit, OnDestroy {
  private ngZone = inject(NgZone);
  @Input() shapeManager: ShapeManager = null;
  /** The editor layer list (vector layers are offered in per-state layer visibility). */
  @Input() rasterLayers: any[] = [];
  /** The shape currently selected in the canvas (fed by the editor's selection subscription). */
  @Input('selectedShapeId') uiSelectedShapeId: string | null = null;

  ngOnInit(): void {
    // The panel can be re-created (its column is removed while the layer tree is hidden / the CD designer is
    // open) — rebuild from the engine, which holds the UI layers and state machines.
    if (this.shapeManager) { this.uiRefreshLayers(); this.kitRefresh(); }
  }

  ngOnDestroy(): void {
    // Don't leave the engine in interactive preview with nothing ticking it.
    if (this.uiPreviewOn) { this.uiPreviewOn = false; this.shapeManager?.setUIInteractive(false); }
    this._stopUiTick();
  }

  /** Engine reported a UI state transition (the editor owns the event subscription). */
  onStateChange(toState: string | null): void {
    this.uiCurrentStateId = toState;
  }

  uiLayers: { id: string; name: string }[] = [];
  uiActiveLayerId: string | null = null;
  uiPreviewOn = false;
  uiCurrentStateId: string | null = null;
  uiActiveMachine: any | null = null;
  uiActiveShapeInteractions: Record<string, any> = {};
  uiSelectedStateId: string | null = null;
  uiSelectedTransitionId: string | null = null;
  uiAddingState = false;
  uiNewStateName = '';
  uiAddingVar = false;
  uiNewVarName = '';
  uiNewVarType = 'boolean';
  uiSoundList: { assetId: string }[] = [];
  private _uiTickRafId: number | null = null;
  private _uiTickLast = 0;

  uiRefreshLayers(): void {
    const sm = this.shapeManager;
    const list: any[] = sm.listUILayers() ?? [];
    if (list.length > 0) {
      this.uiLayers = list.map((l: any) => ({ id: l.id, name: l.name }));
      // sync active layer from engine state (important after restore)
      const engineActive = sm.activeUILayerId;
      if (engineActive && this.uiLayers.some(l => l.id === engineActive)) {
        this.uiActiveLayerId = engineActive;
      }
    }
    if (this.uiActiveLayerId) this.uiRefreshActive();
    this.uiRefreshSounds();
  }

  uiRefreshActive(): void {
    if (!this.uiActiveLayerId) return;
    const sm = this.shapeManager;
    this.uiActiveMachine = sm.getStateMachine(this.uiActiveLayerId) ?? null;
    const layer = sm.getUILayer(this.uiActiveLayerId);
    this.uiActiveShapeInteractions = layer?.shapeInteractions ?? {};
    // Rebuilt here (not via a template method) — a fresh array per CD pass makes
    // NgForOf recreate its ngModel rows every tick, which re-triggers CD: a freeze.
    this.uiInteractionRows = Object.entries(this.uiActiveShapeInteractions)
      .map(([shapeId, props]) => ({ shapeId, props }));
    this.uiCurrentStateId = sm.getCurrentUIState(this.uiActiveLayerId) ?? null;
    this._uiRebuildStateBindingRows();

    this.kitRefresh();
  }

  uiInteractionRows: { shapeId: string; props: any }[] = [];
  uiTrackByShapeId(_i: number, kv: { shapeId: string }): string { return kv.shapeId; }

  uiAddLayer(): void {
    const sm = this.shapeManager;
    const name = `UI Layer ${this.uiLayers.length + 1}`;
    const id = sm.createUILayer(name);
    if (!id) return;
    this.uiLayers = [...this.uiLayers, { id, name }];
    this.uiActiveLayerId = id;
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = null;
    const machine = this._uiBlankMachine(id);
    sm.setStateMachine(id, machine);
    sm.updateUILayer(id, { backgroundOverlay: { color: [0, 0, 0, 0.55] } });
    this.uiActiveMachine = machine;
    this.uiActiveShapeInteractions = {};
  }

  uiDeleteLayer(id: string): void {
    this.shapeManager.deleteUILayer(id);
    this.uiLayers = this.uiLayers.filter(l => l.id !== id);
    if (this.uiActiveLayerId === id) {
      this.uiActiveLayerId = this.uiLayers[0]?.id ?? null;
      this.uiActiveMachine = null;
      this.uiActiveShapeInteractions = {};
      this.uiSelectedStateId = null;
      this.uiSelectedTransitionId = null;
      if (this.uiActiveLayerId) this.uiRefreshActive();
    }
  }

  uiSelectLayer(id: string): void {
    this.uiActiveLayerId = id;
    this.shapeManager.setActiveUILayer(id);
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = null;
    this.uiRefreshActive();
  }

  uiTogglePreview(): void {
    this.uiPreviewOn = !this.uiPreviewOn;
    this.shapeManager.setUIInteractive(this.uiPreviewOn);
    if (this.uiPreviewOn) {
      this._startUiTick();
    } else {
      this._stopUiTick();
    }
    if (this.uiActiveLayerId) {
      this.uiCurrentStateId = this.shapeManager.getCurrentUIState(this.uiActiveLayerId) ?? null;
    }
  }

  uiGoToState(stateId: string): void {
    if (!this.uiActiveLayerId || !this.uiPreviewOn) return;
    this.shapeManager.goToUIState(this.uiActiveLayerId, stateId);
    this.uiCurrentStateId = stateId;
  }

  uiAddState(): void {
    if (!this.uiActiveMachine || !this.uiNewStateName.trim()) return;
    const id = 'state-' + Date.now();
    const newState: any = { id, name: this.uiNewStateName.trim(), layerVisibility: {}, shapeVisibility: {}, worldBlur: 0 };
    this.uiActiveMachine = { ...this.uiActiveMachine, states: [...(this.uiActiveMachine.states ?? []), newState] };
    this.uiNewStateName = '';
    this.uiAddingState = false;
    this.uiSelectedStateId = id;
    this.uiPushMachine();
  }

  uiDeleteState(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      states: this.uiActiveMachine.states.filter((s: any) => s.id !== id),
      transitions: (this.uiActiveMachine.transitions ?? []).filter((t: any) => t.fromState !== id && t.toState !== id),
      initialStateId: this.uiActiveMachine.initialStateId === id
        ? (this.uiActiveMachine.states.find((s: any) => s.id !== id)?.id ?? '')
        : this.uiActiveMachine.initialStateId,
    };
    if (this.uiSelectedStateId === id) this.uiSelectedStateId = null;
    this.uiPushMachine();
  }

  uiSetInitialState(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = { ...this.uiActiveMachine, initialStateId: id };
    this.uiPushMachine();
  }

  uiSetStateField(stateId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      states: this.uiActiveMachine.states.map((s: any) => s.id === stateId ? { ...s, [field]: value } : s),
    };
    this.uiPushMachine();
  }

  uiGetState(id: string | null): any {
    return this.uiActiveMachine?.states?.find((s: any) => s.id === id) ?? null;
  }

  uiTransitionsFrom(stateId: string): any[] {
    return (this.uiActiveMachine?.transitions ?? []).filter((t: any) => t.fromState === stateId);
  }

  uiGlobalTransitions(): any[] {
    return this.uiActiveMachine?.globalTransitions ?? [];
  }

  uiAddTransitionFromSelected(): void {
    if (!this.uiActiveMachine || !this.uiSelectedStateId) return;
    const states: any[] = this.uiActiveMachine.states ?? [];
    const toState = states.find((s: any) => s.id !== this.uiSelectedStateId)?.id ?? states[0]?.id ?? '';
    const id = 't-' + Date.now();
    const newT: any = {
      id, fromState: this.uiSelectedStateId, toState,
      trigger: { type: 'click', targetId: '' },
      actions: [{ type: 'goToState', stateId: toState }],
    };
    this.uiActiveMachine = { ...this.uiActiveMachine, transitions: [...(this.uiActiveMachine.transitions ?? []), newT] };
    this.uiSelectedTransitionId = id;
    this.uiPushMachine();
  }

  uiAddGlobalTransition(): void {
    if (!this.uiActiveMachine) return;
    const states: any[] = this.uiActiveMachine.states ?? [];
    const toState = states[0]?.id ?? '';
    const id = 'tg-' + Date.now();
    const newT: any = {
      id, fromState: '*', toState,
      trigger: { type: 'keyDown', key: 'Escape' },
      actions: [{ type: 'goToState', stateId: toState }],
    };
    this.uiActiveMachine = { ...this.uiActiveMachine, globalTransitions: [...(this.uiActiveMachine.globalTransitions ?? []), newT] };
    this.uiSelectedStateId = null;
    this.uiSelectedTransitionId = id;
    this.uiPushMachine();
  }

  uiDeleteTransition(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: (this.uiActiveMachine.transitions ?? []).filter((t: any) => t.id !== id),
      globalTransitions: (this.uiActiveMachine.globalTransitions ?? []).filter((t: any) => t.id !== id),
    };
    if (this.uiSelectedTransitionId === id) this.uiSelectedTransitionId = null;
    this.uiPushMachine();
  }

  uiGetTransition(id: string | null): any {
    if (!id || !this.uiActiveMachine) return null;
    return [...(this.uiActiveMachine.transitions ?? []), ...(this.uiActiveMachine.globalTransitions ?? [])]
      .find((t: any) => t.id === id) ?? null;
  }

  uiSetTransitionField(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => t.id === tId ? { ...t, [field]: value } : t);
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionTriggerField(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId ? { ...t, trigger: { ...t.trigger, [field]: value } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionTriggerType(tId: string, type: string): void {
    const defaults: Record<string, any> = {
      click:      { type: 'click', targetId: '' },
      keyDown:    { type: 'keyDown', key: 'Escape' },
      timer:      { type: 'timer', delay: 2000 },
      stateEnter: { type: 'stateEnter', stateId: '' },
    };
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId ? { ...t, trigger: defaults[type] ?? { type } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAction(tId: string, field: string, value: any): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => {
      if (t.id !== tId) return t;
      const actions = t.actions?.length ? [...t.actions] : [{ type: 'goToState', stateId: '' }];
      actions[0] = { ...actions[0], [field]: value };
      return { ...t, actions };
    });
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAnimation(tId: string, animType: string): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) => {
      if (t.id !== tId) return t;
      const animation = animType === 'none' ? undefined : { type: animType, duration: t.animation?.duration ?? 300, easing: 'easeInOut' };
      return { ...t, animation };
    });
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiSetTransitionAnimDuration(tId: string, ms: number): void {
    if (!this.uiActiveMachine) return;
    const patch = (arr: any[]) => arr.map((t: any) =>
      t.id === tId && t.animation ? { ...t, animation: { ...t.animation, duration: ms } } : t
    );
    this.uiActiveMachine = {
      ...this.uiActiveMachine,
      transitions: patch(this.uiActiveMachine.transitions ?? []),
      globalTransitions: patch(this.uiActiveMachine.globalTransitions ?? []),
    };
    this.uiPushMachine();
  }

  uiTriggerLabel(trigger: any): string {
    if (!trigger) return '?';
    switch (trigger.type) {
      case 'click':      return `click:${trigger.targetId ? trigger.targetId.slice(0, 6) + '…' : '?'}`;
      case 'keyDown':    return `key:${trigger.key || '?'}`;
      case 'timer':      return `${trigger.delay ?? 0}ms`;
      case 'stateEnter': return `enter:${trigger.stateId ? trigger.stateId.slice(0, 6) + '…' : '?'}`;
      default:           return trigger.type;
    }
  }

  uiAddVariable(): void {
    if (!this.uiActiveMachine || !this.uiNewVarName.trim()) return;
    const id = 'var-' + Date.now();
    const defaults: any = { boolean: false, number: 0, string: '' };
    const newVar: any = { id, name: this.uiNewVarName.trim(), type: this.uiNewVarType, defaultValue: defaults[this.uiNewVarType] };
    this.uiActiveMachine = { ...this.uiActiveMachine, variables: [...(this.uiActiveMachine.variables ?? []), newVar] };
    this.uiNewVarName = '';
    this.uiAddingVar = false;
    this.uiPushMachine();
  }

  uiDeleteVariable(id: string): void {
    if (!this.uiActiveMachine) return;
    this.uiActiveMachine = { ...this.uiActiveMachine, variables: (this.uiActiveMachine.variables ?? []).filter((v: any) => v.id !== id) };
    this.uiPushMachine();
  }

  uiGetVariable(id: string): any {
    if (!this.uiActiveLayerId) return null;
    return this.shapeManager.getUIVariable(this.uiActiveLayerId, id);
  }

  uiSetVariable(id: string, value: any): void {
    if (!this.uiActiveLayerId) return;
    this.shapeManager.setUIVariable(this.uiActiveLayerId, id, value);
  }

  uiAssignShapeInteraction(shapeId: string): void {
    if (!this.uiActiveLayerId) return;
    this.shapeManager.setShapeInteraction({ shapeId, cursor: 'pointer', focusable: true, tabIndex: 0 }, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiUpdateInteraction(shapeId: string, field: string, value: any): void {
    if (!this.uiActiveLayerId) return;
    const existing = this.uiActiveShapeInteractions[shapeId] ?? { shapeId };
    this.shapeManager.setShapeInteraction({ ...existing, [field]: value }, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiClearInteraction(shapeId: string): void {
    if (!this.uiActiveLayerId) return;
    this.shapeManager.clearShapeInteraction(shapeId, this.uiActiveLayerId);
    this.uiRefreshActive();
  }

  uiRefreshSounds(): void {
    const sounds: any[] = this.shapeManager.listUISounds() ?? [];
    this.uiSoundList = sounds.map((s: any) => ({ assetId: s.assetId ?? s }));
  }

  async uiUploadSound(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    if (!file) return;
    const assetId = file.name.replace(/\.[^.]+$/, '');
    // Engine takes a URL, not a File
    this.shapeManager.registerUISound(assetId, URL.createObjectURL(file));
    this.uiRefreshSounds();
  }

  uiDeleteSound(assetId: string): void {
    this.shapeManager.unregisterUISound(assetId);
    this.uiRefreshSounds();
  }

  uiPushMachine(): void {
    if (!this.uiActiveLayerId || !this.uiActiveMachine) return;
    const sm = this.shapeManager;
    sm.setStateMachine(this.uiActiveLayerId, this.uiActiveMachine);
    // setStateMachine re-enters the initial state — if previewing, jump back to where we were
    if (this.uiPreviewOn && this.uiCurrentStateId
        && this.uiActiveMachine.states?.some((st: any) => st.id === this.uiCurrentStateId)) {
      sm.goToUIState(this.uiActiveLayerId, this.uiCurrentStateId);
    }
    this._uiRebuildStateBindingRows();
  }

  // ── Per-state shape/layer visibility bindings ──────────────────────
  uiStateShapeRows: { shapeId: string; name: string; visible: boolean }[] = [];
  uiStateLayerRows: { id: string; name: string; mode: '' | 'show' | 'hide' }[] = [];

  uiSelectState(id: string): void {
    this.uiSelectedStateId = this.uiSelectedStateId === id ? null : id;
    this.uiSelectedTransitionId = null;
    this._uiRebuildStateBindingRows();
  }

  private _uiRebuildStateBindingRows(): void {
    const state = this.uiGetState(this.uiSelectedStateId);
    if (!state) { this.uiStateShapeRows = []; this.uiStateLayerRows = []; return; }
    const sm = this.shapeManager;
    this.uiStateShapeRows = Object.entries(state.shapeVisibility ?? {}).map(([shapeId, visible]) => {
      const n = sm.getNodeById(shapeId);
      return { shapeId, name: n?.name || (n as any)?.getType?.() || shapeId.slice(0, 8) + '…', visible: !!visible };
    });
    const lv = state.layerVisibility ?? {};
    this.uiStateLayerRows = (this.rasterLayers ?? [])
      .filter((l: any) => l.type === 'vector')
      .map((l: any) => ({
        id: l.id,
        name: l.name || 'Vector',
        mode: (l.id in lv ? (lv[l.id] ? 'show' : 'hide') : '') as '' | 'show' | 'hide',
      }));
  }

  uiAddSelectedShapeToState(): void {
    const state = this.uiGetState(this.uiSelectedStateId);
    if (!state || !this.uiSelectedShapeId) return;
    (state.shapeVisibility ??= {})[this.uiSelectedShapeId] = true;
    this.uiPushMachine();
  }

  uiToggleStateShape(shapeId: string): void {
    const state = this.uiGetState(this.uiSelectedStateId);
    if (!state?.shapeVisibility) return;
    state.shapeVisibility[shapeId] = !state.shapeVisibility[shapeId];
    this.uiPushMachine();
  }

  uiRemoveStateShape(shapeId: string): void {
    const state = this.uiGetState(this.uiSelectedStateId);
    if (!state?.shapeVisibility) return;
    delete state.shapeVisibility[shapeId];
    this.uiPushMachine();
  }

  uiSetStateLayerMode(layerId: string, mode: string): void {
    const state = this.uiGetState(this.uiSelectedStateId);
    if (!state) return;
    state.layerVisibility ??= {};
    if (mode === '') delete state.layerVisibility[layerId];
    else state.layerVisibility[layerId] = mode === 'show';
    this.uiPushMachine();
  }

  private _uiBlankMachine(layerId: string): any {
    const initId = 'state-' + Date.now();
    return {
      id: 'machine-' + layerId,
      initialStateId: initId,
      states: [{ id: initId, name: 'Initial', layerVisibility: {}, shapeVisibility: {}, worldBlur: 0 }],
      transitions: [],
      variables: [],
      globalTransitions: [],
    };
  }

  private _startUiTick(): void {
    this._uiTickLast = performance.now();
    const loop = (now: number) => {
      if (!this.uiPreviewOn) return;
      this.shapeManager.tickUI(now - this._uiTickLast);
      this._uiTickLast = now;
      this._uiTickRafId = requestAnimationFrame(loop);
    };
    // Outside Angular's zone (audit Phase 5.4): an in-zone rAF re-checked the whole editor every frame during preview.
    // The engine's UI events (state changes) re-enter the zone in the editor's onUIEvent handler.
    this.ngZone.runOutsideAngular(() => { this._uiTickRafId = requestAnimationFrame(loop); });
  }

  private _stopUiTick(): void {
    if (this._uiTickRafId != null) { cancelAnimationFrame(this._uiTickRafId); this._uiTickRafId = null; }
  }

  // ── Persona kit (Salsa UI kit — docs/ui/persona-ui-kit.md) ──────────────────────────────────────────────
  // Screen-space HUD / menu pieces stored on the UI layer. All engine calls are guarded (older Salsa builds).
  // Every array bound with *ngFor is CACHED here and rebuilt only on change (fresh arrays per CD pass freeze).
  kitOpen = true;
  kitPresets: { id: string; label: string; kind: string }[] = [];
  kitPresetId = '';
  kitTransitions: string[] = [];
  kitTransitionId = 'slash';
  kitAnchors: string[] = [];
  kitIntros: string[] = [];
  kitColorTokens: string[] = [];
  kitClips: string[] = [];
  kitRows: { id: string; label: string }[] = [];
  kitSelectedId: string | null = null;
  kitSel: any = null;
  kitPropRows: { key: string; label: string; type: string; min?: number; max?: number; step?: number; options?: string[]; value: any; isToken?: boolean }[] = [];
  kitStatesText = '';
  private _kitSchema: any = null;
  private readonly _kitTransitionLabels: Record<string, string> = { slash: 'Slash wipe', shatter: 'Shatter', stripeBurst: 'Stripe burst', panelSlide: 'Panel slide', zoomPunch: 'Zoom punch' };
  kitTransitionLabel(t: string): string { return this._kitTransitionLabels[t] ?? t; }
  get kitAvailable(): boolean { return !!this.shapeManager; }   // the UI kit is in every current Salsa build

  /** Load the kit schema/presets once (cached arrays) and rebuild the widget list for the active layer. */
  kitRefresh(): void {
    const sm = this.shapeManager;
    if (!sm) return;
    if (!this._kitSchema) {
      this._kitSchema = sm.getUIKitSchema() ?? null;
      this.kitPresets = sm.listUIKitPresets() ?? [];
      if (!this.kitPresetId && this.kitPresets.length) this.kitPresetId = this.kitPresets[0].id;
      this.kitTransitions = this._kitSchema?.transitions ?? [];
      this.kitAnchors = this._kitSchema?.anchors ?? [];
      this.kitIntros = this._kitSchema?.intros ?? [];
      this.kitColorTokens = this._kitSchema?.colorTokens ?? [];
      this.kitClips = this._kitSchema?.clips ?? [];
    }
    const widgets: any[] = this.uiActiveLayerId ? (sm.getUIKitWidgets(this.uiActiveLayerId) ?? []) : [];
    this.kitRows = widgets.map((w: any) => ({ id: w.id, label: `${this._kitSchema?.kinds?.[w.kind]?.label ?? w.kind}${w.name ? ' — ' + w.name : ''}` }));
    if (this.kitSelectedId && !widgets.some((w: any) => w.id === this.kitSelectedId)) this.kitSelectedId = null;
    this._kitRebuildProps();
  }

  private _kitAfterLayerChange(layerId: string | null): void {
    const sm = this.shapeManager;
    const list: any[] = sm.listUILayers() ?? [];
    this.uiLayers = list.map((l: any) => ({ id: l.id, name: l.name }));
    if (layerId) { this.uiActiveLayerId = layerId; sm.setActiveUILayer(layerId); }
    this.uiRefreshActive();
    this.kitRefresh();
  }

  kitInsertDemo(kind: 'hud' | 'pause'): void {
    if (this.uiPreviewOn) this.uiTogglePreview();   // inserting commits the machine (re-enters its initial state)
    const r = this.shapeManager.insertUIKitDemo(kind);
    if (r) this._kitAfterLayerChange(r.layerId);
  }
  kitInsertPreset(): void {
    if (!this.kitPresetId) return;
    const w = this.shapeManager.insertUIKitPreset(this.kitPresetId, this.uiActiveLayerId ?? undefined);
    if (!w) return;
    this._kitAfterLayerChange(this.shapeManager.activeUILayerId ?? this.uiActiveLayerId);
    this.kitSelect(w.id);
  }
  kitPreviewTransition(): void { this.shapeManager.previewUIKitTransition(this.kitTransitionId); }

  kitSelect(id: string | null): void { this.kitSelectedId = id || null; this._kitRebuildProps(); }

  private _kitRebuildProps(): void {
    const sm = this.shapeManager;
    const w = this.kitSelectedId ? sm?.getUIKitWidget(this.kitSelectedId) : null;
    this.kitSel = w ? { ...w, props: { ...w.props } } : null;
    this.kitStatesText = (w?.visibleInStates ?? []).join(', ');
    const specs: any[] = w ? (this._kitSchema?.kinds?.[w.kind]?.props ?? []) : [];
    this.kitPropRows = specs.map((p: any) => {
      const value = w.props?.[p.key] ?? p.def;
      return { key: p.key, label: p.label, type: p.type, min: p.min, max: p.max, step: p.step, options: p.options, value,
        isToken: p.type === 'color' && this.kitColorTokens.includes(String(value)) };
    });
  }

  /** Top-level field (anchor / x / y / scale / rotation / opacity / z / name). */
  kitSetField(key: string, value: any): void {
    if (!this.kitSelectedId) return;
    const num = ['x', 'y', 'scale', 'rotation', 'opacity', 'z'].includes(key);
    const v = num ? Number(value) : value;
    if (num && !Number.isFinite(v)) return;
    this.shapeManager.updateUIKitWidget(this.kitSelectedId, { [key]: v });
    if (this.kitSel) this.kitSel[key] = v;
    if (key === 'name') this.kitRefresh();
  }
  kitSetIntro(type: string): void {
    if (!this.kitSelectedId) return;
    const intro = { ...(this.kitSel?.intro ?? {}), type };
    this.shapeManager.updateUIKitWidget(this.kitSelectedId, { intro });
    if (this.kitSel) this.kitSel.intro = intro;
    this.shapeManager.playUIKitClip(this.kitSelectedId, 'intro');
  }
  kitSetStates(text: string): void {
    if (!this.kitSelectedId) return;
    const ids = String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    this.shapeManager.updateUIKitWidget(this.kitSelectedId, { visibleInStates: ids.length ? ids : undefined });
    this.kitStatesText = ids.join(', ');
  }
  kitSetProp(row: { key: string; type: string; value: any; isToken?: boolean }, value: any): void {
    if (!this.kitSelectedId) return;
    let v: any = value;
    if (row.type === 'number') { v = Number(value); if (!Number.isFinite(v)) return; }
    if (row.type === 'bool') v = !!value;
    row.value = v;
    if (row.type === 'color') row.isToken = this.kitColorTokens.includes(String(v));
    this.shapeManager.updateUIKitWidget(this.kitSelectedId, { props: { [row.key]: v } });
  }
  kitPlay(clip: string): void { if (this.kitSelectedId) this.shapeManager.playUIKitClip(this.kitSelectedId, clip); }
  kitDelete(): void {
    if (!this.kitSelectedId) return;
    this.shapeManager.removeUIKitWidget(this.kitSelectedId);
    this.kitSelectedId = null;
    this.kitRefresh();
  }
  kitTrackById(_i: number, r: { id: string }): string { return r.id; }
  kitTrackByKey(_i: number, r: { key: string }): string { return r.key; }
}
