import { Component, OnInit } from '@angular/core';
import { FroguiSkinService } from './shared/services/theme/frogui-skin.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  title = 'app';

  constructor(private skinService: FroguiSkinService) {}

  ngOnInit(): void {
    this.skinService.loadPersistedSkin();
  }
}
