export interface AnimationFrameSource {
  setCurrentFrame(frame: number): void;
  getCurrentFrame(): number;
  getFrameCount(): number;
  getFps(): number;
  captureDocumentBoundsToBlob(format: 'png' | 'jpeg', maxSize?: number): Promise<Blob>;
}
