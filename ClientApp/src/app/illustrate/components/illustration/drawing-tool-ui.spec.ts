import { liveTextPillTop, vectorToolHint } from './drawing-tool-ui';
import { sampleCanvasHex } from '../../utils/canvas-eyedropper';

describe('drawing tool UI helpers', () => {
  it('vector tool hints say how the tool draws (drag on a newer engine, click on an older one)', () => {
    expect(vectorToolHint('shape:square', 'square', true)).toContain('Drag to draw a rectangle');
    expect(vectorToolHint('shape:circle', 'circle', false)).toBe('Click to place a circle.');
    expect(vectorToolHint('shape:triangle', 'circle', false)).toBe('Click to place a triangle.');   // the tool names the shape
    expect(vectorToolHint('arrow', 'square', true)).toContain('Drag from the start to the end');
    expect(vectorToolHint('arrow', 'square', false)).toContain('Click the start, then click the end');
    expect(vectorToolHint('drawing:pen', 'square', true)).toBe('');
  });

  describe('liveTextPillTop (the "Done editing text" pill never covers the box)', () => {
    it('sits just above the box when there is room', () => {
      expect(liveTextPillTop({ top: 300, bottom: 360 }, 800, 56, 64)).toBe(300 - 12 - 56);
    });
    it('below the box when the box is at the top', () => {
      expect(liveTextPillTop({ top: 70, bottom: 130 }, 800, 56, 64)).toBe(142);
    });
    it('at the top when the box fills the view; the default placement with no box', () => {
      expect(liveTextPillTop({ top: 70, bottom: 780 }, 800, 56, 64)).toBe(64);
      expect(liveTextPillTop(null, 800, 56, 64)).toBeNull();
    });
  });

  describe('sampleCanvasHex', () => {
    it('uses the engine read when the dist has it; a transparent read is no colour', async () => {
      const engine = { sampleCanvasColor: jasmine.createSpy('s').and.resolveTo({ hex: '#123456', a: 1 }) };
      expect(await sampleCanvasHex(engine, null, 5, 6)).toBe('#123456');
      expect(engine.sampleCanvasColor).toHaveBeenCalledOnceWith(5, 6);
      expect(await sampleCanvasHex({ sampleCanvasColor: async () => ({ hex: '#000000', a: 0 }) }, null, 0, 0)).toBeNull();
    });
    it('falls back to reading the canvas itself on an older dist', async () => {
      const cv = document.createElement('canvas');
      cv.width = 10; cv.height = 10;
      cv.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px';
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#ff8000';
      ctx.fillRect(0, 0, 10, 10);
      expect(await sampleCanvasHex({}, cv, 5, 5)).toBe('#ff8000');
      expect(await sampleCanvasHex({}, cv, 50, 50)).toBeNull();   // off the canvas
      cv.remove();
    });
  });
});
