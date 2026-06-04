import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { parameter_size?: string; family?: string; families?: string[] };
}

export interface InferenceConfig {
  baseUrl: string;
  selectedModel: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

export interface ToolExecutor {
  (name: string, args: Record<string, any>): Promise<any>;
}

const STORAGE_KEY = 'fm_inference_config';
const DEFAULT_BASE_URL = 'http://localhost:11434';

// Frogmarks scene tools exposed to local models
export const SCENE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_scene_graph',
      description: 'Get the current 3D scene hierarchy — all meshes, groups, and array groups with their IDs and names.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'select_mesh',
      description: 'Select a mesh or node by its ID.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Node ID from get_scene_graph' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_primitive',
      description: 'Add a 3D primitive to the scene.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['box', 'sphere', 'plane', 'cylinder', 'torus'], description: 'Primitive shape' },
          x: { type: 'number', description: 'World X position (default 0)' },
          y: { type: 'number', description: 'World Y position (default 0)' },
          z: { type: 'number', description: 'World Z position (default 0)' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_transform',
      description: 'Set position, rotation (degrees), or scale of a mesh.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Mesh ID' },
          px: { type: 'number', description: 'Position X' },
          py: { type: 'number', description: 'Position Y' },
          pz: { type: 'number', description: 'Position Z' },
          rx: { type: 'number', description: 'Rotation X (degrees)' },
          ry: { type: 'number', description: 'Rotation Y (degrees)' },
          rz: { type: 'number', description: 'Rotation Z (degrees)' },
          sx: { type: 'number', description: 'Scale X' },
          sy: { type: 'number', description: 'Scale Y' },
          sz: { type: 'number', description: 'Scale Z' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_material',
      description: 'Set the diffuse color and/or render style of a mesh.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Mesh ID' },
          color: { type: 'string', description: 'Hex color e.g. #ff6600' },
          style: { type: 'string', enum: ['default', 'cel', 'sketch', 'ink'], description: 'Render style' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_mesh',
      description: 'Delete a mesh from the scene.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Mesh ID to delete' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_linear_array',
      description: 'Create a linear array of instances from a source mesh along an axis.',
      parameters: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Source mesh ID' },
          count: { type: 'number', description: 'Number of instances (1–32)' },
          axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Axis to repeat along' },
          spacing: { type: 'number', description: 'Distance between instances' },
        },
        required: ['sourceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_radial_array',
      description: 'Create a radial ring of instances from a source mesh around an axis.',
      parameters: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Source mesh ID' },
          count: { type: 'number', description: 'Number of instances (1–32)' },
          radius: { type: 'number', description: 'Ring radius' },
          axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Rotation axis' },
          arcDeg: { type: 'number', description: 'Arc in degrees (1–360, default 360)' },
        },
        required: ['sourceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_viewport_screenshot',
      description: 'Capture a screenshot of the current 3D viewport as a base64 image. Use this to visually understand the scene before making changes.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

@Injectable({ providedIn: 'root' })
export class LocalInferenceService {
  private _baseUrl = DEFAULT_BASE_URL;
  private _selectedModel = '';

  readonly connectionStatus$ = new BehaviorSubject<ConnectionStatus>('disconnected');
  readonly availableModels$ = new BehaviorSubject<OllamaModel[]>([]);
  readonly lastError$ = new BehaviorSubject<string | null>(null);

  get baseUrl(): string { return this._baseUrl; }
  get selectedModel(): string { return this._selectedModel; }
  get isConnected(): boolean { return this.connectionStatus$.value === 'connected'; }

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const cfg: InferenceConfig = JSON.parse(saved);
        this._baseUrl = cfg.baseUrl || DEFAULT_BASE_URL;
        this._selectedModel = cfg.selectedModel || '';
      } catch {}
    }
  }

  setBaseUrl(url: string): void {
    this._baseUrl = url.replace(/\/$/, '');
    this._save();
    this.connectionStatus$.next('disconnected');
    this.availableModels$.next([]);
  }

  setSelectedModel(model: string): void {
    this._selectedModel = model;
    this._save();
  }

  async testConnection(): Promise<boolean> {
    this.connectionStatus$.next('connecting');
    this.lastError$.next(null);
    try {
      const url = `${this._baseUrl}/api/tags`;
      const res = await firstValueFrom(
        this.http.get<{ models: OllamaModel[] }>(url)
      );
      const models = res?.models ?? [];
      this.availableModels$.next(models);
      this.connectionStatus$.next('connected');
      if (models.length && !this._selectedModel) {
        this._selectedModel = models[0].name;
        this._save();
      }
      return true;
    } catch (err: any) {
      const isCors = err?.status === 0;
      const msg = isCors
        ? `CORS error — set OLLAMA_ORIGINS=* and restart Ollama, then try again.`
        : `Connection failed: ${err?.message ?? err?.status ?? 'unknown error'}`;
      this.lastError$.next(msg);
      this.connectionStatus$.next('error');
      return false;
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): Promise<{ message: ChatMessage; finishReason: string }> {
    const url = `${this._baseUrl}/v1/chat/completions`;
    const body: any = {
      model: this._selectedModel,
      messages,
      stream: false,
    };
    if (tools?.length) body.tools = tools;

    const res = await firstValueFrom(
      this.http.post<any>(url, body, {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      })
    );

    const choice = res.choices?.[0];
    return {
      message: choice?.message ?? { role: 'assistant', content: '' },
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }

  async runAgentLoop(
    systemPrompt: string,
    userPrompt: string,
    tools: ToolDefinition[],
    executor: ToolExecutor,
    onUpdate?: (text: string) => void
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const MAX_ROUNDS = 8;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { message, finishReason } = await this.chat(messages, tools);
      messages.push(message);

      if (finishReason === 'stop' || !message.tool_calls?.length) {
        return message.content ?? '';
      }

      // Execute each tool call and feed results back
      for (const call of message.tool_calls) {
        let result: any;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          result = await executor(call.function.name, args);
        } catch (e: any) {
          result = { error: e?.message ?? 'Tool execution failed' };
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
        onUpdate?.(`Executed: ${call.function.name}`);
      }
    }

    return 'Max tool-call rounds reached.';
  }

  disconnect(): void {
    this._selectedModel = '';
    this.availableModels$.next([]);
    this.lastError$.next(null);
    this.connectionStatus$.next('disconnected');
    this._save();
  }

  private _save(): void {
    const cfg: InferenceConfig = { baseUrl: this._baseUrl, selectedModel: this._selectedModel };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }
}
