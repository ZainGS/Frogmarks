import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Route `data` flag: a different `:id` gets a NEW component instance instead of the current one being reused. */
export const NEW_INSTANCE_PER_DOCUMENT = 'newInstancePerDocument';

/**
 * Angular reuses a routed component when only its params change, so /illustration/A → /illustration/B (New /
 * Duplicate Illustration from inside the editor) kept the same IllustrationComponent and its ~30 component-scoped
 * services — 3D settings, dither, canvas look, camera cuts, can designs, frame-link buckets, selection, open panels —
 * and the next document's saves wrote document A's values into document B. A route flagged with
 * NEW_INSTANCE_PER_DOCUMENT is recreated for each document instead: the old editor is destroyed (after its
 * canDeactivate guard saved it) and the new document gets a fresh one, exactly as when it is opened from the Shell.
 */
export class DocumentRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (!super.shouldReuseRoute(future, curr)) return false;
    if (future.routeConfig?.data?.[NEW_INSTANCE_PER_DOCUMENT] !== true) return true;
    return future.paramMap.get('id') === curr.paramMap.get('id');
  }
}
