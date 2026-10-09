import { MeshFrameLinkSectionComponent } from './mesh-frame-link-section.component';

/** Frame Link 3D (audit 2026-10-09): only the fields the picked type reads; Scroll (UV) only where it scrolls. */
describe('MeshFrameLinkSectionComponent per-type fields', () => {
  function setup(o: { ribbons?: string[]; group?: boolean; saved?: any } = {}) {
    const ribbons = new Set(o.ribbons ?? []);
    const sm: any = {
      scene3d: {
        getMesh: (id: string) => (o.group ? null : { id }),
        getMeshGroup: (id: string) => (o.group ? { id } : null),
      },
      getFrameLinkAnimation3D: () => o.saved ?? null,
      getRibbonData3D: (id: string) => (ribbons.has(id) ? { id } : null),
    };
    const c = new MeshFrameLinkSectionComponent();
    c.shapeManager = sm;
    c.meshId = 'm1';
    c.scene3dSelectedIsGroup = !!o.group;
    c.scene3dHierarchy = [{ id: 'm1', children: [{ id: 'a' }, { id: 'r1' }] }];
    c.load();
    return c;
  }

  it('Cycle + Phase only for Bounce / Sway / Pulse (not Spin / Shake / Scroll)', () => {
    const c = setup();
    for (const t of ['bounce', 'sway', 'pulse'] as const) {
      c.scene3dFrameLinkType = t;
      expect(c.scene3dFrameLinkUsesCycle).withContext(t).toBeTrue();
      expect(c.scene3dFrameLinkUsesPhase).withContext(t).toBeTrue();
    }
    for (const t of ['spin', 'shake', 'scroll'] as const) {
      c.scene3dFrameLinkType = t;
      expect(c.scene3dFrameLinkUsesCycle).withContext(t).toBeFalse();
      expect(c.scene3dFrameLinkUsesPhase).withContext(t).toBeFalse();
    }
  });

  it('Scroll (UV) is offered on a ribbon (or a group with a ribbon child), not on another mesh', () => {
    expect(setup().scene3dFrameLinkShowScroll).toBeFalse();
    expect(setup({ ribbons: ['m1'] }).scene3dFrameLinkShowScroll).toBeTrue();
    expect(setup({ group: true, ribbons: ['r1'] }).scene3dFrameLinkShowScroll).toBeTrue();
    expect(setup({ group: true }).scene3dFrameLinkShowScroll).toBeFalse();
  });

  it('a saved Scroll on a plain mesh still shows in the select', () => {
    const c = setup({ saved: { enabled: true, type: 'scroll', axis: 'x', amplitude: 1, framesPerCycle: 48, phase: 0 } });
    expect(c.scene3dFrameLinkType).toBe('scroll');
    expect(c.scene3dFrameLinkShowScroll).toBeTrue();
  });
});
