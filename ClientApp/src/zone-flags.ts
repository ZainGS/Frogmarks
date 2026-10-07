/**
 * zone.js flags. They are read once, when zone.js loads, so this file is imported by polyfills.ts BEFORE 'zone.js'.
 *
 * requestAnimationFrame is NOT patched (zone audit 2026-10-07, fix A). zone.js binds a rAF to the zone it was
 * requested in, so any engine loop that a zoned Frogmarks call happened to start (the Salsa render loop, Play, the
 * city ticker, a clip player, the package / creator stages...) re-requested itself in the Angular zone and ran a full
 * app change detection on every display frame, for as long as it lived. With the patch off, a rAF callback runs in
 * whatever zone is current when it fires — the root zone, i.e. outside Angular.
 *
 * Rule: a rAF callback that touches Angular state must enter the zone itself (ngZone.run, or a local
 * cdr.detectChanges()). The same goes for Salsa callbacks / events that can fire from inside an engine frame.
 *
 * This disables the plain, moz- and webkit- variants together (zone.js 0.14 'requestAnimationFrame' patch).
 */
(window as any).__Zone_disable_requestAnimationFrame = true;
