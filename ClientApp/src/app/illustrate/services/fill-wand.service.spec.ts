import { FillWandService } from './fill-wand.service';

describe('FillWandService magic-wand options reach the engine', () => {
  function setup() {
    const sm = { setMagicWandOptions: jasmine.createSpy('setMagicWandOptions') };
    const fw = new FillWandService();
    fw.bind({ shapeManager: () => sm as any });
    return { fw, sm };
  }

  it('Mode New / +Add / −Sub is sent with every sync (it used to be dropped)', () => {
    const { fw, sm } = setup();
    fw.onWandModeChange('add');
    expect(sm.setMagicWandOptions.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ mode: 'add' }));
    fw.onWandModeChange('subtract');
    expect(sm.setMagicWandOptions.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ mode: 'subtract' }));
    fw.onWandToleranceChange(12.4);
    expect(sm.setMagicWandOptions.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ tolerance: 12, contiguous: true, mode: 'subtract' }));
  });

  it('Reference "None" sends the key (undefined) so the engine clears the reference layer', () => {
    const { fw, sm } = setup();
    fw.onWandReferenceLayerChange('L2');
    expect(sm.setMagicWandOptions.calls.mostRecent().args[0].referenceLayerId).toBe('L2');
    fw.onWandReferenceLayerChange('');
    const last = sm.setMagicWandOptions.calls.mostRecent().args[0];
    expect('referenceLayerId' in last).toBeTrue();
    expect(last.referenceLayerId).toBeUndefined();
  });
});
