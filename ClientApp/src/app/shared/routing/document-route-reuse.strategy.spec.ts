import { ActivatedRouteSnapshot, convertToParamMap, Route } from '@angular/router';
import { DocumentRouteReuseStrategy, NEW_INSTANCE_PER_DOCUMENT } from './document-route-reuse.strategy';

function snap(routeConfig: Route | null, params: Record<string, string>): ActivatedRouteSnapshot {
  return { routeConfig, paramMap: convertToParamMap(params) } as unknown as ActivatedRouteSnapshot;
}

describe('DocumentRouteReuseStrategy', () => {
  const strategy = new DocumentRouteReuseStrategy();
  const editor: Route = { path: ':id', data: { [NEW_INSTANCE_PER_DOCUMENT]: true } };
  const other: Route = { path: 'board/:id' };

  it('recreates the editor when the document id changes (New / Duplicate Illustration)', () => {
    expect(strategy.shouldReuseRoute(snap(editor, { id: 'B' }), snap(editor, { id: 'A' }))).toBeFalse();
  });

  it('keeps the editor for the same document (e.g. a query-param change)', () => {
    expect(strategy.shouldReuseRoute(snap(editor, { id: 'A' }), snap(editor, { id: 'A' }))).toBeTrue();
  });

  it('leaves every other route on Angular\'s default reuse', () => {
    expect(strategy.shouldReuseRoute(snap(other, { id: 'B' }), snap(other, { id: 'A' }))).toBeTrue();
    expect(strategy.shouldReuseRoute(snap(other, { id: 'A' }), snap(editor, { id: 'A' }))).toBeFalse();
  });
});
