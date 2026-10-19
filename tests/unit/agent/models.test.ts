import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  isDefaultModel,
  modelLabel,
  normalizeModelSelection,
  resolveModelArg,
  supportedModels,
} from '../../../src/agent/models.js';

describe('agent model catalog', () => {
  it('offers a distinct catalog per agent kind, each led by the default sentinel', () => {
    const claude = supportedModels('claude');
    const codex = supportedModels('codex');
    expect(claude[0]?.value).toBe(DEFAULT_MODEL);
    expect(codex[0]?.value).toBe(DEFAULT_MODEL);
    expect(claude.map((m) => m.value)).toContain('claude-opus-4-8');
    expect(codex.map((m) => m.value)).toContain('gpt-5-codex');
    expect(claude.map((m) => m.value)).not.toContain('gpt-5-codex');
  });

  it('treats unset and the default sentinel as "use agent default"', () => {
    expect(isDefaultModel(undefined)).toBe(true);
    expect(isDefaultModel('')).toBe(true);
    expect(isDefaultModel(DEFAULT_MODEL)).toBe(true);
    expect(isDefaultModel('claude-opus-4-8')).toBe(false);
  });

  it('coerces unknown / cross-agent selections back to the default option', () => {
    expect(normalizeModelSelection('claude', 'claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeModelSelection('claude', undefined)).toBe(DEFAULT_MODEL);
    // aiduCAT: free-form gateway combo ids pass through — behind 10router
    // the useful model names sit outside the hardcoded picker catalog.
    expect(normalizeModelSelection('claude', 'Gemini-3.8-Flash')).toBe('Gemini-3.8-Flash');
    // Gateway ids with a vendor prefix or version tag pass through too.
    expect(normalizeModelSelection('claude', 'cu/claude-opus-5-5')).toBe('cu/claude-opus-5-5');
    expect(normalizeModelSelection('claude', 'model@2026-10')).toBe('model@2026-10');
    // Anything outside the charset still falls back.
    expect(normalizeModelSelection('claude', 'gpt-6-astra(xhigh)')).toBe(DEFAULT_MODEL);
  });

  it('resolves the --model argument, omitting it for the default', () => {
    expect(resolveModelArg('claude', 'claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(resolveModelArg('claude', DEFAULT_MODEL)).toBeUndefined();
    expect(resolveModelArg('claude', undefined)).toBeUndefined();
    // aiduCAT: free-form combo ids are forwarded verbatim.
    expect(resolveModelArg('claude', 'Gemini-3.8-Flash')).toBe('Gemini-3.8-Flash');
  });

  it('labels a stored value using the picker option text', () => {
    expect(modelLabel('claude', 'claude-opus-4-8')).toBe('Opus 4.8（最新）');
    expect(modelLabel('claude', DEFAULT_MODEL)).toContain('跟随默认');
  });
});
