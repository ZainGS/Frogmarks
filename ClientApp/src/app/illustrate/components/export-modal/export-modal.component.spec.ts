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

describe('ExportModalComponent › disc art', () => {
  function fakeEngine() {
    const preview = {
      setArt: jasmine.createSpy('setArt').and.resolveTo(true), setPattern: jasmine.createSpy('setPattern'),
      setFit: jasmine.createSpy('setFit'), dispose: jasmine.createSpy('dispose'),
    };
    let seed = 100;
    const cartDisc = {
      randomSeed: () => ++seed, seedFromId: (id: string) => id.length, clampFit: (f: unknown) => f,
      guides: (s: number) => ({ cx: s / 2, cy: s / 2, outerR: s / 2, holeR: s * 0.0625, safeR: s * 0.15 }),
      cropRect: (w: number, h: number) => ({ sx: 0, sy: 0, sw: w, sh: h }),
      panBy: (f: unknown) => f, zoomTo: (f: object, _w: number, _h: number, zoom: number) => ({ ...f, zoom }),
      renderArt: jasmine.createSpy('renderArt').and.resolveTo(new Blob(['a'], { type: 'image/webp' })), MAX_ZOOM: 8,
    };
    const sm = { cartDisc, createCartDiscPreview: jasmine.createSpy('createCartDiscPreview').and.returnValue(preview) };
    return { sm, preview, cartDisc };
  }
  function make(sm: unknown) {
    const files = {
      exportCartSounds: [], exportCartArtMode: 'pattern', exportCartPatternSeed: 7, exportCartArtImage: null,
      exportCartArtSnapshot: null, exportCartArtFit: { zoom: 1, panX: 0, panY: 0 }, exportCartArtError: '',
      get exportCartArtSource() { return this.exportCartArtMode === 'image' ? this.exportCartArtImage : this.exportCartArtMode === 'snapshot' ? this.exportCartArtSnapshot : null; },
    };
    const m = new ExportModalComponent(files as never, { illustration: { name: 'Doc' } } as never);
    m.shapeManager = sm as never;
    return { m, files };
  }

  it('the live preview is created on the disc canvas with the pattern seed, and disposed on close', () => {
    const { sm, preview } = fakeEngine();
    const { m } = make(sm);
    const canvas = document.createElement('canvas');
    m.discCanvas = { nativeElement: canvas } as never;
    expect(sm.createCartDiscPreview).toHaveBeenCalledWith(canvas, jasmine.objectContaining({ pattern: { seed: 7 } }));
    expect(m.hasDiscPreview).toBeTrue();
    m.discCanvas = undefined;              // the Scene tab closed
    expect(preview.dispose).toHaveBeenCalledTimes(1);
    m.discCanvas = { nativeElement: canvas } as never;
    m.ngOnDestroy();
    expect(preview.dispose).toHaveBeenCalledTimes(2);
  });

  it('▶ Preview launch plays the Shell launch on the live disc; an older engine hides the button', () => {
    const { sm, preview } = fakeEngine();
    const play = jasmine.createSpy('playLaunchPreview');
    (preview as Record<string, unknown>).playLaunchPreview = play;
    const { m } = make(sm);
    expect(m.canPreviewLaunch).toBeFalse();          // no preview yet
    m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    expect(m.canPreviewLaunch).toBeTrue();
    m.previewLaunch();
    expect(play).toHaveBeenCalledTimes(1);
    const old = fakeEngine();                        // a preview without the launch hook
    const o = make(old.sm);
    o.m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    expect(o.m.canPreviewLaunch).toBeFalse();
    expect(() => o.m.previewLaunch()).not.toThrow();
  });

  it('the corner button stops / plays the disc spin; hidden on a preview without start / stop', () => {
    const { sm, preview } = fakeEngine();
    const p = preview as Record<string, unknown>;
    p.running = true;
    p.start = jasmine.createSpy('start').and.callFake(() => { p.running = true; });
    p.stop = jasmine.createSpy('stop').and.callFake(() => { p.running = false; });
    const { m } = make(sm);
    m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    expect(m.canPauseDisc).toBeTrue();
    expect(m.discAnimating).toBeTrue();
    m.toggleDiscAnimation();
    expect(p.stop).toHaveBeenCalledTimes(1);
    expect(m.discAnimating).toBeFalse();
    m.toggleDiscAnimation();
    expect(p.start).toHaveBeenCalledTimes(1);
    expect(m.discAnimating).toBeTrue();
    const old = make(fakeEngine().sm);
    old.m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    expect(old.m.canPauseDisc).toBeFalse();
    expect(() => old.m.toggleDiscAnimation()).not.toThrow();
  });

  it('shuffle re-rolls the seed and updates the preview; an engine without the preview just hides it', () => {
    const { sm, preview } = fakeEngine();
    const { m, files } = make(sm);
    m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    m.shuffleDiscPattern();
    expect(files.exportCartPatternSeed).toBe(101);
    expect(preview.setPattern).toHaveBeenCalledWith(101);
    const old = make({});
    old.m.discCanvas = { nativeElement: document.createElement('canvas') } as never;
    expect(old.m.hasDiscPreview).toBeFalse();
    old.m.shuffleDiscPattern();
    expect(typeof old.files.exportCartPatternSeed).toBe('number');
  });

  it('Image mode with no file yet asks for one; a file that is not an image shows a message', async () => {
    const { sm } = fakeEngine();
    const { m, files } = make(sm);
    await m.setDiscMode('image');
    expect(files.exportCartArtMode).toBe('image');
    expect(m.discHint).toContain('Choose an image');
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['not an image'], 'x.png', { type: 'image/png' })] });
    await m.onDiscImagePicked({ target: input } as never);
    expect(files.exportCartArtError).toContain('not an image');
    expect(files.exportCartArtImage).toBeNull();
  });

  it('the crop guides come from the engine (the hole + the clear hub ring)', () => {
    const { sm } = fakeEngine();
    const { m } = make(sm);
    const g = m.discGuides;
    expect(g.c).toBe(m.cropSize / 2);
    expect(g.hole).toBeCloseTo(m.cropSize * 0.0625, 6);
    expect(g.safe).toBeCloseTo(m.cropSize * 0.15, 6);
  });
});
