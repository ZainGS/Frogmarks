import {
  DEFAULT_BASE_URL, LEGACY_LOCAL_MODEL_URL_KEY, LocalInferenceService, readInferenceConfig,
} from './local-inference.service';

/** One source of truth for the local GPU model address (audit 2026-10-09): Shell › Settings wrote
 *  frogmarks.localModelUrl, the AI features read fm_inference_config. */
describe('LocalInferenceService config', () => {
  const KEY = 'fm_inference_config';
  function memStorage(init: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(init));
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
  }
  afterEach(() => { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_LOCAL_MODEL_URL_KEY); });

  it('migrates an older Shell Settings address into the config once, then drops the old key', () => {
    const s = memStorage({ [LEGACY_LOCAL_MODEL_URL_KEY]: 'http://gpu.box:11434/' });
    expect(readInferenceConfig(s)).toEqual({ baseUrl: 'http://gpu.box:11434', selectedModel: '' });
    expect(JSON.parse(s.map.get(KEY)!).baseUrl).toBe('http://gpu.box:11434');
    expect(s.map.has(LEGACY_LOCAL_MODEL_URL_KEY)).toBeFalse();
  });

  it('a saved config wins over the old key (the old key is still removed)', () => {
    const s = memStorage({ [KEY]: JSON.stringify({ baseUrl: 'http://a:1', selectedModel: 'm' }), [LEGACY_LOCAL_MODEL_URL_KEY]: 'http://b:2' });
    expect(readInferenceConfig(s)).toEqual({ baseUrl: 'http://a:1', selectedModel: 'm' });
    expect(s.map.has(LEGACY_LOCAL_MODEL_URL_KEY)).toBeFalse();
    expect(readInferenceConfig(memStorage())).toBeNull();
    expect(readInferenceConfig(null)).toBeNull();
  });

  it('the service reads the migrated address; setBaseUrl saves it ("" = the default)', () => {
    localStorage.setItem(LEGACY_LOCAL_MODEL_URL_KEY, 'http://gpu.box:11434');
    const svc = new LocalInferenceService({} as never);
    expect(svc.baseUrl).toBe('http://gpu.box:11434');
    svc.setBaseUrl('http://other:8080/');
    expect(JSON.parse(localStorage.getItem(KEY)!).baseUrl).toBe('http://other:8080');
    expect(new LocalInferenceService({} as never).baseUrl).toBe('http://other:8080');
    svc.setBaseUrl('');
    expect(svc.baseUrl).toBe(DEFAULT_BASE_URL);
  });
});
