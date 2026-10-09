import { AnimationExportComponent, effectiveExportBackground, gifTransparentIndex } from './animation-export.component';

/** Animation export background (audit 2026-10-09): Transparent / Colour work for PNG Sequence, Sprite Sheet and GIF
 *  through the engine's transparent capture; Canvas keeps the old as-on-screen frames; a sticker is transparent. */
describe('AnimationExportComponent background', () => {
  /** A 4×4 PNG: the left half red, the right half fully transparent (or opaque grey = "the canvas"). */
  async function png(opaque: boolean): Promise<Blob> {
    const c = new OffscreenCanvas(4, 4);
    const ctx = c.getContext('2d')!;
    if (opaque) { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 4, 4); }
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 4);
    return c.convertToBlob({ type: 'image/png' });
  }

  function setup(o: { docSize?: boolean; api?: boolean } = {}) {
    const sm: any = {
      setCurrentFrame: jasmine.createSpy('setCurrentFrame'),
      getCurrentFrame: () => 1, getFrameCount: () => 2, getFps: () => 12,
      captureDocumentBoundsToBlob: jasmine.createSpy('captureDocumentBoundsToBlob').and.callFake(() => png(true)),
      getDocumentSize: () => (o.docSize === false ? null : { w: 4, h: 4 }),
    };
    if (o.api !== false) sm.exportIllustrationTransparentPNG = jasmine.createSpy('exportIllustrationTransparentPNG').and.callFake(() => png(false));
    const cdr: any = { markForCheck: () => undefined };
    const host: any = { nativeElement: document.createElement('div') };
    const c = new AnimationExportComponent(cdr, host);
    c.shapeManager = sm;
    c.frameCount = 2;
    c.rangeStart = 1;
    c.rangeEnd = 2;
    let blob: Blob | null = null;
    spyOn(c as any, '_downloadBlob').and.callFake((b: Blob) => { blob = b; });
    return { c, sm, downloaded: () => blob };
  }

  async function pixel(blob: Blob, x: number, y: number): Promise<number[]> {
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }

  it('effectiveExportBackground: MP4 = canvas, sticker = transparent, no capture available = canvas', () => {
    expect(effectiveExportBackground('mp4', 'transparent', true)).toBe('canvas');
    expect(effectiveExportBackground('gif-sticker', 'canvas', true)).toBe('transparent');
    expect(effectiveExportBackground('gif-sticker', 'canvas', false)).toBe('canvas');
    expect(effectiveExportBackground('png-sequence', 'color', true)).toBe('color');
    expect(effectiveExportBackground('sprite-sheet', 'transparent', false)).toBe('canvas');
    expect(effectiveExportBackground('gif', 'canvas', true)).toBe('canvas');
  });

  it('gifTransparentIndex: the alpha-0 palette entry, -1 when none', () => {
    expect(gifTransparentIndex([[1, 2, 3, 255], [0, 0, 0, 0]])).toBe(1);
    expect(gifTransparentIndex([[1, 2, 3, 255]])).toBe(-1);
    expect(gifTransparentIndex([[1, 2, 3]])).toBe(-1);
  });

  it('the row shows for PNG Sequence / Sprite Sheet / GIF only; Transparent / Colour need a canvas size', () => {
    const { c } = setup();
    for (const f of ['png-sequence', 'sprite-sheet', 'gif'] as const) { c.format = f; expect(c.showBackground).withContext(f).toBeTrue(); }
    for (const f of ['mp4', 'gif-sticker'] as const) { c.format = f; expect(c.showBackground).withContext(f).toBeFalse(); }
    expect(c.canSeeThrough).toBeTrue();
    expect(c.stickerHint).toBeNull();
    const noDoc = setup({ docSize: false }).c;
    expect(noDoc.canSeeThrough).toBeFalse();
    noDoc.format = 'gif-sticker';
    expect(noDoc.stickerHint).toContain('canvas size');
    expect(setup({ api: false }).c.canSeeThrough).toBeFalse();
  });

  it('Sprite Sheet on a colour: the transparent capture composited on the colour', async () => {
    const { c, sm, downloaded } = setup();
    c.format = 'sprite-sheet';
    c.background = 'color';
    c.bgColor = '#0000ff';
    await c.onExport();
    expect(sm.exportIllustrationTransparentPNG).toHaveBeenCalledTimes(2);
    expect(sm.captureDocumentBoundsToBlob).not.toHaveBeenCalled();
    expect(await pixel(downloaded()!, 3, 1)).toEqual([0, 0, 255, 255]);   // the empty half shows the colour
    expect(await pixel(downloaded()!, 0, 1)).toEqual([255, 0, 0, 255]);
  });

  it('PNG Sequence transparent keeps the empty areas see-through; Canvas = the old as-on-screen capture', async () => {
    const t = setup();
    t.c.format = 'png-sequence';
    t.c.background = 'transparent';
    await t.c.onExport();
    expect(t.sm.exportIllustrationTransparentPNG).toHaveBeenCalledTimes(2);
    expect(t.sm.captureDocumentBoundsToBlob).not.toHaveBeenCalled();
    const canvas = setup();
    canvas.c.format = 'png-sequence';
    await canvas.c.onExport();
    expect(canvas.sm.captureDocumentBoundsToBlob).toHaveBeenCalledTimes(2);
    expect(canvas.sm.exportIllustrationTransparentPNG).not.toHaveBeenCalled();
  });

  it('GIF Sticker uses the transparent capture', async () => {
    const { c, sm, downloaded } = setup();
    c.format = 'gif-sticker';
    await c.onExport();
    expect(sm.exportIllustrationTransparentPNG).toHaveBeenCalled();
    expect(downloaded()?.type).toBe('image/gif');
  });
});
