import { ExportModalComponent, exportImageFileName, exportImageSize } from './export-modal.component';

describe('ExportModalComponent › image options', () => {
  it('exports at the document size (its long side is the cap); infinite canvas = no size', () => {
    expect(exportImageSize({ w: 1920, h: 1080 })).toEqual({ w: 1920, h: 1080, maxSize: 1920 });
    expect(exportImageSize({ w: 800, h: 3000 })?.maxSize).toBe(3000);
    expect(exportImageSize(null)).toBeNull();
  });

  it('names the file after the document', () => {
    expect(exportImageFileName('My: comic/page', 'png', false)).toBe('My comic page.png');
    expect(exportImageFileName('', 'jpeg', false)).toBe('frogmarks.jpg');
    expect(exportImageFileName('A', 'png', true)).toBe('A (transparent).png');
  });

  function make() {
    const files = { exportCartSounds: [] } as never;
    const persist = { illustration: { name: 'Doc' } } as never;
    const m = new ExportModalComponent(files, persist);
    return m;
  }

  it('Transparent forces PNG (JPEG has no transparency)', () => {
    const m = make();
    m.imageFormat = 'jpeg';
    m.setImageBackground('transparent');
    expect(m.imageFormat).toBe('png');
  });

  it('downloads through the engine and closes; a failure keeps the dialog open with a message', async () => {
    const m = make();
    const closed = jasmine.createSpy('close');
    m.close.subscribe(closed);
    const blob = new Blob(['x'], { type: 'image/png' });
    const sm = {
      getDocumentSize: () => ({ w: 400, h: 300 }),
      exportIllustrationTransparentPNG: jasmine.createSpy('transparent').and.resolveTo(blob),
      captureDocumentBoundsToBlob: jasmine.createSpy('capture').and.rejectWith(new Error('gpu')),
      fitArtboard: jasmine.createSpy('fit'), scheduleRender: () => {},
      interactionService: { getPanOffset: () => ({ x: 1, y: 2 }), getZoomFactor: () => 3, setPanOffset: jasmine.createSpy('pan'), setZoom: jasmine.createSpy('zoom') },
    };
    m.shapeManager = sm as never;
    spyOn(console, 'warn');

    await m.exportImage();                       // Canvas: the capture fails
    expect(sm.fitArtboard).toHaveBeenCalled();
    expect(sm.interactionService.setPanOffset).toHaveBeenCalledWith(1, 2);   // the view is put back
    expect(sm.interactionService.setZoom).toHaveBeenCalledWith(3);
    expect(m.imageError).not.toBe('');
    expect(closed).not.toHaveBeenCalled();

    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(HTMLAnchorElement.prototype, 'click');
    m.setImageBackground('transparent');
    await m.exportImage();
    expect(sm.exportIllustrationTransparentPNG).toHaveBeenCalledWith(400);
    expect(closed).toHaveBeenCalled();
  });
});
