/**
 * The AI Scene Authoring tool (the ✦ button at the bottom of the tool rail + its sub-panel) is work in progress and
 * hidden from users. Turn it back on here, or per machine for development with localStorage 'fm-dev-ai-tool' = '1'.
 * It has no keyboard shortcut; only the rail button opens it. The dev-mode `window.salsa` authoring API is unaffected.
 */
export const SHOW_AI_TOOL = false;
export const AI_TOOL_DEV_KEY = 'fm-dev-ai-tool';

export function aiToolEnabled(): boolean {
  if (SHOW_AI_TOOL) return true;
  try { return localStorage.getItem(AI_TOOL_DEV_KEY) === '1'; } catch { return false; }
}
