import { Component, HostBinding, Input, ViewEncapsulation } from '@angular/core';

/**
 * The style host of the Armature sections (sections/*): wrap them in <app-arm-sections> and they get the classic
 * panel's look, or with skin="chrome" the retro-chrome one (the mode chrome's properties panel). Unencapsulated, so the
 * one stylesheet (arm-sections.scss, scoped under .arm-sections) serves every section component instead of each
 * carrying its own copy.
 */
@Component({
  selector: 'app-arm-sections',
  template: '<ng-content></ng-content>',
  styleUrls: ['./arm-sections.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ArmSectionsComponent {
  @Input() skin: 'classic' | 'chrome' = 'classic';
  @HostBinding('class.arm-sections') readonly hostClass = true;
  @HostBinding('class.arm-chrome') get chromeSkin(): boolean { return this.skin === 'chrome'; }
}
