import { describe, expect, it } from 'vitest';
import { helpCard, statusCard, HELP_COMMANDS, type StatusInfo } from '../../../src/card/templates';

describe('helpCard (猴哥点单: 简洁文本 + 下拉直执行)', () => {
  const json = JSON.stringify(helpCard('Claude Code'));

  it('lists every command as plain "/cmd — 注解" without bullets or backticks', () => {
    for (const c of HELP_COMMANDS) {
      expect(json).toContain(`/${c.cmd} — ${c.note}`);
    }
    expect(json).not.toContain('**命令列表**');
    expect(json).not.toContain('\\`/new\\`');
  });

  it('has no bottom action buttons', () => {
    expect(json).not.toContain('"tag":"button"');
    expect(json).not.toContain('"tag":"action"');
  });

  it('carries one select_static wired to the help.run callback', () => {
    const card = helpCard('Agent') as { body: { elements: Array<Record<string, unknown>> } };
    const selects = card.body.elements.filter((e) => e.tag === 'select_static');
    expect(selects).toHaveLength(1);
    const sel = selects[0]!;
    expect(sel.behaviors).toEqual([{ type: 'callback', value: { cmd: 'help.run' } }]);
    const options = sel.options as Array<{ value: string }>;
    expect(options.map((o) => o.value)).toEqual(HELP_COMMANDS.map((c) => c.cmd));
  });
});

describe('statusCard (猴哥点单: 只读, 无底部按钮)', () => {
  const info: StatusInfo = {
    profileName: 'claude',
    cwd: '/home/ubuntu/aiduCAT',
    sessionId: 'abcdef1234567890',
    sessionStale: false,
    agentName: 'Claude Code',
    runtimeAccess: { label: 'runtime', value: 'ok' },
    activeRun: false,
    ownerState: 'idle owner=present',
    scope: 'oc_123',
    chatMode: 'p2p',
  };

  it('renders the 4-line status card, no buttons', () => {
    const json = JSON.stringify(statusCard(info));
    expect(json).toContain('\ud83d\udcca \u5f53\u524d\u72b6\u6001');
    // f0.2+ placeholder mode: all four lines always render with 0/\u2014 fillers
    expect(json).toContain('\ud83d\udea9');            // \ud83d\udea9 line present
    expect(json).toContain('User 0 / Agent 0');
    expect(json).toContain('\u26a1 0 tok/s');
    expect(json).toContain('\u23f3 \u2014/\u2014');      // ctx placeholder
    expect(json).toContain('\u5f85\u9996\u8dd1\u521b\u5efa');  // session placeholder
    expect(json).not.toContain('"tag":"button"');
    expect(json).not.toContain('"tag":"action"');
  });
});
