import type { Type } from '@angular/core';
import { perfMark } from './shared/utilities/perf-marks';

/**
 * The Illustrate editor chunk (~2.5 MB): the lazy `illustration` / `view` routes AND the Shell's preload use this one
 * loader, so whichever asks first starts the download + evaluation and the other reuses it.
 *
 * Why preload: opening an illustration from the Shell used to pay the chunk fetch + parse + evaluation between the
 * tap and the editor's first frame. StudioComponent now triggers it while static UI is up (the New Illustration
 * dialog opening, the Illustrations grid after its fade-in, an idle moment on the home), so navigation finds it ready.
 */
let _loading: Promise<Type<unknown>> | null = null;

export function loadIllustrateModule(): Promise<Type<unknown>> {
  if (!_loading) {
    _loading = import('./illustrate/illustrate.module').then(m => {
      perfMark('chunk-loaded');
      return m.IllustrateModule;
    });
    _loading.catch(() => { _loading = null; });   // a failed download may be retried by the next call
  }
  return _loading;
}

/** Start loading the editor chunk without navigating. Idempotent; a failure is retried by the router's own load. */
export function preloadIllustrateModule(): void {
  void loadIllustrateModule().catch(() => undefined);
}

/** True once a load was started (preload or navigation). */
export function illustrateModuleRequested(): boolean { return _loading !== null; }
