import { Component, OnInit } from '@angular/core';
import { FroguiSkinService } from './shared/services/theme/frogui-skin.service';
import { ScreenCornerService } from './illustrate/services/screen-corner.service';
import { AppUpdateService } from './shared/services/pwa/app-update.service';
import { StoragePersistenceService } from './shared/services/pwa/storage-persistence.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  title = 'app';

  /** screenCorners: injected only to start it at boot. It keeps --fm-screen-corner-radius on :root current on every
   *  route (the retro-chrome green screen-edge border is drawn on <body>, not just inside the editor). */
  constructor(private skinService: FroguiSkinService, readonly screenCorners: ScreenCornerService,
              private updates: AppUpdateService, private storagePersistence: StoragePersistenceService) {}

  ngOnInit(): void {
    void this.skinService.loadPersistedSkin();
    // PWA (salsa/docs/ui/pwa.md): ask for persistent storage (TIER-8) and start the service-worker update checks.
    void this.storagePersistence.start();
    this.updates.start();
  }
}
