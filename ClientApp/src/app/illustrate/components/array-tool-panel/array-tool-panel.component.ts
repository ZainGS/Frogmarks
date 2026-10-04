import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ArrayToolService } from '../../services/array-tool.service';

/** Array tool options (mode, count, radius, arc, axis). A view over ArrayToolService (refactor-plan 2.9E). */
@Component({
  selector: 'app-array-tool-panel',
  templateUrl: './array-tool-panel.component.html',
  styleUrls: ['./array-tool-panel.component.scss'],
})
export class ArrayToolPanelComponent {
  /** Gizmo space (owned by the editor's 3D viewport); W/L buttons ask the editor to flip it. */
  @Input() scene3dGizmoOrientation: 'world' | 'local' = 'world';
  @Output() toggleGizmoOrientation = new EventEmitter<void>();
  constructor(public arrayTool: ArrayToolService) {}
}
