import { ToolSubpanelCollapse } from './tool-subpanel-collapse';

describe('ToolSubpanelCollapse (brush list auto-close, touch only)', () => {
  it('touch: picking a brush folds the panel; tapping the active tool again reopens it without toggling the tool', () => {
    const c = new ToolSubpanelCollapse(() => true);
    c.onBrushPicked();
    expect(c.collapsed).toBeTrue();
    expect(c.onToolTap('drawing:pen', 'drawing:pen')).toBeTrue();   // consumed: reopen only
    expect(c.collapsed).toBeFalse();
    // Panel open again: the same tap is a normal tool tap (the caller toggles the tool off as before)
    expect(c.onToolTap('drawing:pen', 'drawing:pen')).toBeFalse();
  });

  it('desktop: picking a brush never folds the panel', () => {
    const c = new ToolSubpanelCollapse(() => false);
    c.onBrushPicked();
    expect(c.collapsed).toBeFalse();
    expect(c.onToolTap('drawing:pen', 'drawing:pen')).toBeFalse();
  });

  it('switching to another tool (or none) unfolds the panel and is not consumed', () => {
    const c = new ToolSubpanelCollapse(() => true);
    c.onBrushPicked();
    expect(c.onToolTap('fill', 'drawing:pen')).toBeFalse();
    expect(c.collapsed).toBeFalse();
    c.onBrushPicked();
    expect(c.onToolTap('', 'drawing:pen')).toBeFalse();
    expect(c.collapsed).toBeFalse();
  });

  it('follows the live pointer type (a tablet docked to a trackpad stops collapsing)', () => {
    let coarse = true;
    const c = new ToolSubpanelCollapse(() => coarse);
    coarse = false;
    c.onBrushPicked();
    expect(c.collapsed).toBeFalse();
  });
});
