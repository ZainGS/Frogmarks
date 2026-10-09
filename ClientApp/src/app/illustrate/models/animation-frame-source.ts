export interface AnimationFrameSource {
  setCurrentFrame(frame: number): void;
  getCurrentFrame(): number;
  getFrameCount(): number;
  getFps(): number;
  captureDocumentBoundsToBlob(format: 'png' | 'jpeg', maxSize?: number): Promise<Blob>;
  /** The artboard's 2D content (drawings, shapes, ephemera) on a TRANSPARENT background — no canvas background, no
   *  3D (Export Image's Transparent). Needs a document size. */
  exportIllustrationTransparentPNG?(maxSize?: number): Promise<Blob>;
  getDocumentSize?(): { w: number; h: number } | null;
}
