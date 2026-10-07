import { startCleanBoardEngine } from './board.component';

/** mobile-parity 7.3c: after a free3D illustration, a board kept the 3D view (orbit controller on the board's canvas,
 *  2D pan / zoom blocked, the 3D backdrop over the board) and the previous document's layers / 3D nodes. */
describe('startCleanBoardEngine (a board opens on a clean engine)', () => {
  it('resets the view to 2D FIRST, then starts a blank engine document with no document id', async () => {
    const order: string[] = [];
    const sm = {
      resetTo2DEditingView: () => order.push('2D view'),
      startBlankDocument: jasmine.createSpy('startBlankDocument').and.callFake(async () => { order.push('blank'); }),
    };
    await startCleanBoardEngine(sm as any);
    expect(order).toEqual(['2D view', 'blank']);
    // No id: the engine's own persistence has no target — a board saves its scene graph through the board API only.
    expect(sm.startBlankDocument.calls.mostRecent().args[0]).toBeUndefined();
  });

  it('never throws (the board still loads when a reset fails)', async () => {
    spyOn(console, 'warn');
    const sm = {
      resetTo2DEditingView: () => { throw new Error('view'); },
      startBlankDocument: () => Promise.reject(new Error('blank')),
    };
    await expectAsync(startCleanBoardEngine(sm as any)).toBeResolved();
  });
});
