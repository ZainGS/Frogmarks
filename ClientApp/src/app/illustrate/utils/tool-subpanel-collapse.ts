/**
 * The left tool sub-panel (brush list) folds away after a brush is picked, on touch only (mobile-parity TOUCH-10):
 * on a tablet the panel covers part of the canvas the finger wants to paint on. Tapping the active tool's rail button
 * again reopens it (instead of toggling the tool off, which is what that tap does while the panel is open). Desktop
 * (a fine pointer) never collapses, so its behaviour is unchanged.
 */
export class ToolSubpanelCollapse {
  /** True while the sub-panel is folded away (the tool itself stays active). */
  collapsed = false;

  constructor(private readonly isCoarse: () => boolean) {}

  /** A brush was tapped in the brush list. */
  onBrushPicked(): void {
    if (this.isCoarse()) this.collapsed = true;
  }

  /** A rail tool tap (setActiveTool). True = it only reopened the collapsed panel; the caller keeps the tool as is.
   *  Any other tap (a different tool, or no tool) unfolds it too, so a newly chosen tool's panel always shows. */
  onToolTap(tool: string, activeTool: string): boolean {
    const reopen = this.collapsed && !!tool && tool === activeTool;
    this.collapsed = false;
    return reopen;
  }
}
