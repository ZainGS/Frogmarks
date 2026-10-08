import { MODE_RAIL_TOOLS, installModeRailExit, railTapExitsMode } from './mode-toolbar-scope';

/** Round-2 feedback (2026-10-08): leaving a mode from the main toolbar. */
describe('mode toolbar scope', () => {
  it('Edit Mesh keeps Select / Pan / Move / Rotate / Scale; any other rail tool leaves; its own button toggles itself', () => {
    expect(MODE_RAIL_TOOLS.meshEdit).toEqual(['select', 'pan', 'move', 'rotate', 'scale']);
    for (const t of ['select', 'pan', 'move', 'rotate', 'scale']) expect(railTapExitsMode('meshEdit', t)).withContext(t).toBeFalse();
    expect(railTapExitsMode('meshEdit', 'editMesh')).toBeFalse();   // its own toggle leaves it
    expect(railTapExitsMode('meshEdit', 'armature')).toBeTrue();
    expect(railTapExitsMode('meshEdit', '')).toBeTrue();            // an untagged tool (City, UV, Array…)
    expect(railTapExitsMode(null, '')).toBeFalse();
  });

  it('the capture listener leaves the mode before the tool button\'s own click runs', () => {
    const rail = document.createElement('div');
    rail.innerHTML = '<div class="vertical-tool-button" data-rail-tool="move"><svg><path></path></svg></div>'
      + '<div class="vertical-tool-button" id="city"><svg></svg></div><div class="gap"></div>';
    document.body.appendChild(rail);
    const order: string[] = [];
    const host = { activeModeChrome: 'meshEdit' as const, exitModeChrome: jasmine.createSpy('exit').and.callFake(() => order.push('exit')) };
    const off = installModeRailExit(rail, host);
    const city = rail.querySelector('#city') as HTMLElement;
    city.addEventListener('click', () => order.push('tool'));
    rail.querySelector('path')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // Move: stays
    (rail.querySelector('.gap') as HTMLElement).click();                                       // not a tool
    expect(host.exitModeChrome).not.toHaveBeenCalled();
    city.click();
    expect(order).toEqual(['exit', 'tool']);
    off();
    city.click();
    expect(host.exitModeChrome).toHaveBeenCalledTimes(1);
    rail.remove();
  });
});
