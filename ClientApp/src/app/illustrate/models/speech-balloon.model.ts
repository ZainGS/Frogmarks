// ── Speech Balloon Types ──────────────────────────────────────

export type TailSide = 'top' | 'right' | 'bottom' | 'left';
export type BalloonStyle = 'rounded-rect' | 'ellipse' | 'cloud' | 'burst' | 'thought';
export type WritingMode = 'horizontal-tb' | 'vertical-rl';

export interface SpeechBalloonOptions {
  text: string;
  writingMode: WritingMode;
  tailSide: TailSide;
  tailPosition: number;      // 0–1 along the edge
  showTail: boolean;
  style: BalloonStyle;
  fillColor: { r: number; g: number; b: number; a: number };
  strokeColor: { r: number; g: number; b: number; a: number };
  textColor: { r: number; g: number; b: number; a: number };
  fontFamily: string;
  fontSize: number;
  maxWidth: number;
}

export const BALLOON_STYLE_OPTIONS: { value: BalloonStyle; label: string }[] = [
  { value: 'rounded-rect', label: 'Rounded' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'burst', label: 'Burst' },
  { value: 'thought', label: 'Thought' },
];

export const DEFAULT_BALLOON_OPTIONS: SpeechBalloonOptions = {
  text: '',
  writingMode: 'horizontal-tb',
  tailSide: 'bottom',
  tailPosition: 0.3,
  showTail: true,
  style: 'rounded-rect',
  fillColor: { r: 1, g: 1, b: 1, a: 1 },
  strokeColor: { r: 0, g: 0, b: 0, a: 1 },
  textColor: { r: 0, g: 0, b: 0, a: 1 },
  fontFamily: 'Arial',
  fontSize: 90,
  maxWidth: 1.5,
};
