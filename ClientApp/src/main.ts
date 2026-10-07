import { ApplicationRef, enableProdMode, isDevMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

export function getBaseUrl() {
  return document.getElementsByTagName('base')[0].href;
}

const providers = [
  { provide: 'BASE_URL', useFactory: getBaseUrl, deps: [] }
];

if (environment.production) {
  enableProdMode();
}

// ngZoneEventCoalescing: the change detection of one browser event runs once, on the next animation frame, instead of
// once per listener on the way up (a click was ~5-8 ticks, a keydown ~4-5). ngZoneRunCoalescing stays OFF: it also
// makes every ngZone.run's change detection async.
platformBrowserDynamic(providers).bootstrapModule(AppModule, { ngZoneEventCoalescing: true })
  .then(ref => {
    // Change-detection tick counter (zone audit 2026-10-07): window.__appRef = the ApplicationRef, so a console snippet
    // can wrap appRef.tick and count ticks per second. Dev builds, or any build opened with ?cd=1.
    if (isDevMode() || new URLSearchParams(window.location.search).get('cd') === '1') {
      (window as any).__appRef = ref.injector.get(ApplicationRef);
    }
  })
  .catch((err: any) => console.log(err));
