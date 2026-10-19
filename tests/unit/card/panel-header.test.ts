import { describe, expect, it } from 'vitest';
import { renderCard } from '../../../src/card/run-renderer.js';
import { initialState, reduce, type RunState } from '../../../src/card/run-state.js';

/** Extract the collapsible_panel header title markdown from a rendered card. */
function panelTitle(card: object): string {
  const json = JSON.stringify(card);
  const m = json.match(/"title":\{"tag":"markdown","content":"((?:[^"\\]|\\.)*)"/);
  if (!m) throw new Error(`no panel title in card: ${json.slice(0, 200)}`);
  return JSON.parse(`"${m[1]}"`);
}

function stateWithUsage(overrides: Partial<RunState> = {}): RunState {
  let state = reduce(initialState, {
    type: 'usage',
    inputTokens: 4051,
    outputTokens: 532,
    cachedInputTokens: 20463,
    cacheCreationInputTokens: 0,
  });
  return { ...state, ...overrides };
}

describe('two-line panel header (猴哥点单 f0.2 终版)', () => {
  it('line1 = model·effort·ctx, line2 = counters + status word', () => {
    const state = stateWithUsage();
    const card = renderCard(state, {
      model: 'Gemini-3.8-Flash',
      effort: 'max',
      contextWindow: 1048576,
      startedAt: Date.now() - 5_000,
    });
    expect(panelTitle(card)).toBe(
      'Gemini-3.8-Flash · Max · 25k/1M (2%)\n💭 0 · 🛠️ 0 · ⏱️ 5s · ☤Reasoning...',
    );
  });

  it('omits ctx% when contextWindow unknown, omits effort when unset', () => {
    const state = stateWithUsage();
    const card = renderCard(state, { model: 'SomeModel' });
    expect(panelTitle(card)).toBe('SomeModel · 25k/1M (3%)\n💭 0 · 🛠️ 0 · ☤Reasoning...');
  });

  it('omits the whole ctx piece until usage arrives', () => {
    const card = renderCard(initialState, {
      model: 'GLM-5.3-Flash',
      effort: 'high',
      contextWindow: 1_000_000,
    });
    expect(panelTitle(card)).toBe('GLM-5.3-Flash · High\n💭 0 · 🛠️ 0 · ☤Reasoning...');
  });

  it('formats used/total with k/M units and percentage', () => {
    let state = reduce(initialState, {
      type: 'usage',
      inputTokens: 100_000,
      outputTokens: 100,
      cachedInputTokens: 400_000,
      cacheCreationInputTokens: 0,
    });
    const card = renderCard(state, { model: 'M', contextWindow: 1_000_000 });
    expect(panelTitle(card)).toContain('500.1k/1M (50%)');
  });

  it('formats accumulated usage without claiming an impossible 100% window fill', () => {
    let state = reduce(initialState, {
      type: 'usage',
      inputTokens: 900_000,
      outputTokens: 200_000,
    });
    const card = renderCard(state, { model: 'M', contextWindow: 1_000_000 });
    expect(panelTitle(card)).toContain('1.1M/1M (100%)');
  });

  it('ignores the cumulative result-event usage (would show inflated 100%)', () => {
    let state = reduce(initialState, {
      type: 'usage',
      inputTokens: 25_000,
      outputTokens: 500,
      cachedInputTokens: 0,
    });
    state = reduce(state, {
      type: 'usage',
      inputTokens: 900_000,
      outputTokens: 200_000,
      cumulative: true,
    });
    const card = renderCard(state, { model: 'M', contextWindow: 1_000_000 });
    expect(panelTitle(card)).toContain('25.5k/1M (3%)');
  });

  it('zero counts still render, status word trailing line 2', () => {
    const card = renderCard(initialState, { model: 'M', startedAt: Date.now() - 1000 });
    const [, bottom] = panelTitle(card).split('\n');
    expect(bottom).toBe('💭 0 · 🛠️ 0 · ⏱️ 1s · ☤Reasoning...');
  });

  it('status word disappears on completion; counters stay', () => {
    let state = reduce(initialState, { type: 'thinking', delta: 'hmm' });
    state = reduce(state, { type: 'tool_use', id: 't1', name: 'Bash', input: {} });
    state = reduce(state, { type: 'done', terminationReason: 'normal' });
    const card = renderCard(state, {
      model: 'M',
      effort: 'low',
      contextWindow: 1_000_000,
      startedAt: Date.now() - 2000,
    });
    const [, bottom] = panelTitle(card).split('\n');
    expect(bottom).toContain('💭 1');
    expect(bottom).toContain('🛠️ 1');
    expect(bottom).toContain('⏱️');
    expect(bottom).not.toContain('Reasoning...');
  });
});
