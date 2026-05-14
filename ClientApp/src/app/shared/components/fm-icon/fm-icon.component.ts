import { Component, Input } from '@angular/core';
import { FroguiSkinService } from '../../services/theme/frogui-skin.service';

type IconState = 'base' | 'hover' | 'click';

@Component({
  selector: 'fm-icon',
  templateUrl: './fm-icon.component.html',
  styleUrls: ['./fm-icon.component.scss'],
  host: {
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
    '(mousedown)':  'onMouseDown()',
    '(mouseup)':    'onMouseUp()',
  },
})
export class FmIconComponent {
  @Input() name = '';

  state: IconState = 'base';

  constructor(public skinService: FroguiSkinService) {}

  get iconUrl(): string | null {
    if (this.state === 'click') {
      return this.skinService.getIconUrl(this.name, 'click')
          ?? this.skinService.getIconUrl(this.name, 'hover')
          ?? this.skinService.getIconUrl(this.name, 'base');
    }
    if (this.state === 'hover') {
      return this.skinService.getIconUrl(this.name, 'hover')
          ?? this.skinService.getIconUrl(this.name, 'base');
    }
    return this.skinService.getIconUrl(this.name, 'base');
  }

  onMouseEnter(): void { this.state = 'hover'; }
  onMouseLeave(): void { this.state = 'base'; }
  onMouseDown():  void { this.state = 'click'; }
  onMouseUp():    void { this.state = 'hover'; }
}
