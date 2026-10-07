import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { MODE_CHROME_VARS, ModeTool } from '../mode-chrome.types';
import { modeIconPaths } from '../mode-icons';
import { releaseRootVar, setRootVar } from '../root-css-vars';

/** One strip entry: the tool + whether a group divider goes above it. */
export interface ModeToolRow { tool: ModeTool; sepBefore: boolean; paths: readonly string[] | null; }

/** Rows for the strip: a divider wherever `group` changes (not above the first). */
export function modeToolRows(tools: readonly ModeTool[]): ModeToolRow[] {
  return (tools ?? []).map((tool, i) => ({
    tool,
    sepBefore: i > 0 && (tool.group ?? '') !== (tools[i - 1].group ?? ''),
    paths: modeIconPaths(tool.icon),
  }));
}

/**
 * Mode tool strip (UI review 2026-10-07 §4 item 2): the mode's tools in the left rail's slot (the rail is hidden
 * while a mode with the chrome is active), one active tool, icon + small label, group dividers. The active tool's
 * one-line hint is shown beside the strip, just below the header bar. Publishes --fm-modestrip-w (70 px).
 */
@Component({
  selector: 'app-mode-tool-strip',
  templateUrl: './mode-tool-strip.component.html',
  styleUrls: ['./mode-tool-strip.component.scss'],
})
export class ModeToolStripComponent implements OnInit, OnChanges, OnDestroy {
  @Input() tools: ModeTool[] = [];
  @Input() activeTool = '';
  @Output() toolChange = new EventEmitter<string>();

  rows: ModeToolRow[] = [];

  ngOnInit(): void { setRootVar(MODE_CHROME_VARS.stripW, this, '70px'); }

  ngOnChanges(): void { this.rows = modeToolRows(this.tools); }

  ngOnDestroy(): void { releaseRootVar(MODE_CHROME_VARS.stripW, this); }

  get active(): ModeTool | null { return this.tools?.find(t => t.id === this.activeTool) ?? null; }

  toolTitle(t: ModeTool): string {
    return `${t.label}${t.key ? ` (${t.key})` : ''}${t.hint ? ` — ${t.hint}` : ''}`;
  }

  pick(t: ModeTool): void {
    if (t.disabled || t.id === this.activeTool) return;
    this.toolChange.emit(t.id);
  }

  trackRow(_: number, r: ModeToolRow): string { return r.tool.id; }
}
