import { Component, Input, NgZone } from '@angular/core';
import { runAuthoringSession, SceneAuthoringAPI, type CallModel } from '@zaings/salsa';

export interface AuthoringToolResult {
  name: string;
  isError: boolean;
}

@Component({
  selector: 'app-authoring-panel',
  templateUrl: './authoring-panel.component.html',
  styleUrls: ['./authoring-panel.component.scss'],
})
export class AuthoringPanelComponent {
  @Input() authoring: SceneAuthoringAPI | null = null;

  readonly models = [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fast & cheap' },
    { id: 'claude-sonnet-5',           label: 'Sonnet 5 — balanced' },
    { id: 'claude-opus-5',             label: 'Opus 5 — best quality' },
  ];
  selectedModel = 'claude-haiku-4-5-20251001';
  thinkingEnabled = false;
  thinkingEffort: 'low' | 'medium' | 'high' = 'high';

  get supportsThinking(): boolean {
    return this.selectedModel === 'claude-sonnet-5' || this.selectedModel === 'claude-opus-5';
  }

  prompt = '';
  running = false;
  resultText = '';
  stoppedReason = '';
  toolLog: AuthoringToolResult[] = [];
  turns = 0;
  error = '';

  private lastPrompt = '';

  constructor(private ngZone: NgZone) {}

  async send(): Promise<void> {
    if (!this.prompt.trim() || this.running || !this.authoring) return;

    this.lastPrompt = this.prompt;
    this.running = true;
    this.resultText = '';
    this.stoppedReason = '';
    this.toolLog = [];
    this.turns = 0;
    this.error = '';

    try {
      const result = await runAuthoringSession(this.prompt, this.authoring, this.callModel, {
        onToolResult: c => this.ngZone.run(() => this.toolLog.push({ name: c.name, isError: c.isError })),
      });
      this.ngZone.run(() => {
        this.resultText = result.text;
        this.turns = result.turns;
        this.stoppedReason = result.stoppedReason ?? '';
      });
    } catch (e: any) {
      this.ngZone.run(() => { this.error = String(e?.message ?? e); });
    } finally {
      this.ngZone.run(() => { this.running = false; });
    }
  }

  continue(): void {
    const counts = this.toolLog.reduce((acc, t) => {
      acc[t.name] = (acc[t.name] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const toolSummary = Object.entries(counts)
      .map(([name, n]) => n > 1 ? `${name} ×${n}` : name)
      .join(', ');
    const lastMsg = this.resultText ? `Last AI message: "${this.resultText.slice(0, 300)}". ` : '';
    this.prompt = `Continue from where you left off. Original task: "${this.lastPrompt}". ${lastMsg}Tools used so far: ${toolSummary}. Keep building until the task is complete.`;
    this.send();
  }

  get stoppedLabel(): string {
    switch (this.stoppedReason) {
      case 'end_turn':   return '';
      case 'max_tokens': return '⚠ Token limit hit';
      case 'max_turns':  return '⚠ Turn limit hit';
      default:           return this.stoppedReason ? `Stopped: ${this.stoppedReason}` : '';
    }
  }

  get showContinue(): boolean {
    return !!this.resultText && !this.running && !!this.authoring;
  }

  /** POST to the ASP.NET Core proxy — holds the Anthropic key server-side. */
  callModel: CallModel = async (req) => {
    const res = await fetch('/api/authoring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...req,
        model: this.selectedModel,
        thinkingEnabled: this.supportsThinking && this.thinkingEnabled,
        thinkingEffort: this.thinkingEffort,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`authoring proxy ${res.status}: ${body}`);
    }
    return res.json();
  };

  resetSession(): void {
    this.prompt = '';
    this.resultText = '';
    this.stoppedReason = '';
    this.toolLog = [];
    this.turns = 0;
    this.error = '';
    this.lastPrompt = '';
  }
}
