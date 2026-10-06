import { AI_TOOL_DEV_KEY, aiToolEnabled, SHOW_AI_TOOL } from './ai-tool-flag';

describe('AI tool flag (tool rail, WIP)', () => {
  afterEach(() => localStorage.removeItem(AI_TOOL_DEV_KEY));

  it('is hidden from users by default', () => {
    expect(SHOW_AI_TOOL).toBeFalse();
    localStorage.removeItem(AI_TOOL_DEV_KEY);
    expect(aiToolEnabled()).toBeFalse();
  });

  it('comes back per machine with the dev override', () => {
    localStorage.setItem(AI_TOOL_DEV_KEY, '1');
    expect(aiToolEnabled()).toBeTrue();
  });
});
