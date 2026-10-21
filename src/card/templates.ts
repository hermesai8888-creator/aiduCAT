interface ButtonSpec {
  text: string;
  value: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

function button(spec: ButtonSpec): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: spec.text },
    type: spec.style ?? 'default',
    value: spec.value,
  };
}

function divMd(content: string): object {
  return { tag: 'div', text: { tag: 'lark_md', content } };
}

function actions(buttons: ButtonSpec[]): object {
  return { tag: 'action', actions: buttons.map(button) };
}

const HR: object = { tag: 'hr' };

function shell(title: string, elements: object[]): object {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: title } },
    elements,
  };
}

export function workspacesCard(current: string | undefined, named: Record<string, string>): object {
  const entries = Object.entries(named);
  const elements: object[] = [];

  elements.push(divMd(`当前 cwd：\`${escapeCode(current ?? '(未设置)')}\``));

  if (entries.length === 0) {
    elements.push(HR);
    elements.push(divMd('暂无命名工作目录。'));
    elements.push(
      divMd('💡 发送 `/ws save <name>` 把当前 cwd 存为命名工作目录'),
    );
  } else {
    elements.push(HR);
    entries.forEach(([name, path], i) => {
      const marker = path === current ? '  ← 当前' : '';
      elements.push(divMd(`**${escapeMd(name)}** → \`${escapeCode(path)}\`${marker}`));
      elements.push(
        actions([
          { text: '切换到此处', value: { cmd: 'ws.use', name }, style: 'primary' },
          { text: '删除', value: { cmd: 'ws.remove', name }, style: 'danger' },
        ]),
      );
      if (i < entries.length - 1) elements.push(HR);
    });
  }

  return shell('📂 工作目录', elements);
}

export interface StatusInfo {
  profileName: string;
  cwd?: string;
  sessionId?: string;
  emptySessionText?: string;
  sessionStale: boolean;
  agentName: string;
  runtimeAccess: {
    label: string;
    value: string;
  };
  larkCliStatus?: 'app' | 'user-ready' | 'user-missing' | 'check-failed';
  activeRun: boolean;
  activeScopes?: string[];
  activeCommentScopes?: string[];
  queue?: { active: number; waiting: number; cap: number };
  ownerState: string;
  /** Session scope (= chatId or chatId:threadId in topic groups). */
  scope: string;
  /** Chat mode — used to label scope. */
  chatMode: 'p2p' | 'group' | 'topic';
  /** f0.2+ /status: session stats block (/new resets). */
  sessionStats?: {
    startedAt: number;
    tokensIn: number;
    tokensOut: number;
    cacheRead: number;
    cacheCreate: number;
    userMessages: number;
    agentMessages: number;
    tpsAvg?: number;
  };
  /** f0.2+: session start fallback for entries created pre-stats. */
  sessionUpdatedAt?: number;
  /** f0.2+ /status: current model/effort/ctx readout. */
  modelLine?: {
    model?: string;
    effort?: string;
    ctxUsed?: number;
    ctxTotal?: number;
    compactPct?: number;
  };
}

export function statusCard(info: StatusInfo): object {
  const sessionLine = info.sessionId
    ? `\`${info.sessionId}\`${info.sessionStale ? ' ⚠️ 旧 cwd，下一条会新建' : ''}`
    : (info.emptySessionText ?? '`(待首跑创建)`');
  const st = info.sessionStats;
  const fmtTok = (n: number) => {
    const t = (x: number) => x.toFixed(1).replace(/\.0$/, '');
    if (n >= 1_000_000) return `${t(n / 1_000_000)}M`;
    if (n >= 1_000) return `${t(n / 1_000)}k`;
    return String(n);
  };
  const ml = info.modelLine;
  // 🗜️ shows the COMPACT THRESHOLD setting (CLAUDE_CODE_AUTO_COMPACT_WINDOW),
  // not a live ratio — line 4 already carries the live ctx percentage. 猴哥:
  // the two lines answer different questions ("it compacts at X" vs "we are
  // at Y now").
  const modelBits = [
    ml?.model,
    ml?.effort,
    // 🗜️ = auto-compact trigger as a % of the usable window (600k/900k = 67%)
    ml?.compactPct !== undefined ? `🗜️ ${ml.compactPct}%` : undefined,
  ].filter(Boolean) as string[];
  // 旧会话（本轮 stats 上线前创建的）没有 stats.startedAt — 用 entry.updatedAt
  // 近似会话起点，保证第三行始终完整；stats 从本次 /status 观察后开始累计。
  const startedAtMs = st?.startedAt ?? info.sessionUpdatedAt;
  const dur = startedAtMs ? Date.now() - startedAtMs : 0;
  const durMin = Math.floor(dur / 60_000);
  const durTxt = durMin >= 60 ? `${Math.floor(durMin / 60)}h${durMin % 60}m` : durMin >= 1 ? `${durMin}m` : '刚刚';
  const startedTxt = startedAtMs
    ? new Date(startedAtMs).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
    : '';
  const cacheTotal = st ? st.cacheRead + st.cacheCreate : 0;
  const cacheHitPct = cacheTotal > 0 ? Math.round(((st?.cacheRead ?? 0) / cacheTotal) * 100) : 0;
  const ctxBits =
    ml?.ctxUsed !== undefined && ml?.ctxTotal
      ? `${fmtTok(ml.ctxUsed)}/${fmtTok(ml.ctxTotal)} (${Math.round((ml.ctxUsed / ml.ctxTotal) * 100)}%)`
      : undefined;
  const tokenBits = st
    ? `📥 ${fmtTok(st.tokensIn)} · 📤 ${fmtTok(st.tokensOut)} · 🎯 ${cacheHitPct}% · ⚡ ${st.tpsAvg ?? 0} tok/s`
    : undefined;
  const lines = [
    `🏷️ **Session**: ${sessionLine}`,
    `🤖 ${escapeMd(info.agentName)}${modelBits.length ? ` · ${modelBits.join(' · ')}` : ''}`,
    `🚩 ${startedTxt || '刚刚'} · ⏱️ ${durTxt} · 💬 User ${st?.userMessages ?? 0} / Agent ${st?.agentMessages ?? 0}`,
    `⏳ ${ctxBits ?? '—/— (—%)'} · 📥 ${st ? fmtTok(st.tokensIn) : '0'} · 📤 ${st ? fmtTok(st.tokensOut) : '0'} · 🎯 ${st && cacheTotal > 0 ? cacheHitPct : 0}% · ⚡ ${st?.tpsAvg ?? 0} tok/s`,
  ].filter(Boolean) as string[];
return shell('📊 当前状态', [divMd(lines.join('\n'))]);
}

export interface ResumeEntry {
  sessionId: string;
  displayId?: string;
  preview: string;
  relTime: string;
  lineCount?: number;
  detail?: string;
  current?: boolean;
}

export function resumeCard(cwd: string, entries: ResumeEntry[]): object {
  const elements: object[] = [];
  elements.push(divMd(`当前 cwd：\`${escapeCode(cwd)}\``));

  if (entries.length === 0) {
    elements.push(HR);
    elements.push(divMd('此 cwd 下没有历史会话。'));
    return shell('🔁 恢复历史会话', elements);
  }

  elements.push(HR);
  entries.forEach((e, i) => {
    const marker = e.current ? '  ← 当前' : '';
    const detail = e.detail ?? `${e.lineCount ?? 0} 条`;
    const displayId = e.displayId ?? e.sessionId;
    elements.push(
      divMd(
        `**${i + 1}.** ${escapeMd(e.preview)}${marker}\n\`${displayId.slice(0, 8)}…\` · ${e.relTime} · ${escapeMd(detail)}`,
      ),
    );
    elements.push(
      actions([
        {
          text: e.current ? '已是当前会话' : '▸ 恢复此会话',
          value: { cmd: 'resume.use', arg: e.sessionId },
          style: e.current ? 'default' : 'primary',
        },
      ]),
    );
    if (i < entries.length - 1) elements.push(HR);
  });

  return shell('🔁 恢复历史会话', elements);
}

/**
 * aiduCAT /help (猴哥点单): plain "command — 中文注解" lines (no bullet or
 * backtick noise), no bottom buttons, plus a dropdown that executes the
 * picked command immediately (select callback → dispatcher `help.run`).
 */
export const HELP_COMMANDS: Array<{ cmd: string; note: string }> = [
  { cmd: 'new', note: '新建会话，重新开始' },
  { cmd: 'resume', note: '列出并恢复历史会话' },
  { cmd: 'cd', note: '切换工作目录' },
  { cmd: 'ws', note: '工作目录管理' },
  { cmd: 'account', note: '查看/更换飞书应用凭据' },
  { cmd: 'config', note: '偏好、访问控制与身份策略' },
  { cmd: 'model', note: '切换模型与推理强度' },
  { cmd: 'status', note: '当前状态' },
  { cmd: 'stop', note: '结束正在跑的任务' },
  { cmd: 'timeout', note: '会话探活设置' },
  { cmd: 'ps', note: '列出本机所有 bot' },
  { cmd: 'exit', note: '关掉指定 bot' },
  { cmd: 'reconnect', note: '强制重连 WebSocket' },
  { cmd: 'doctor', note: '把日志交给 Agent 自助诊断' },
  { cmd: 'help', note: '本帮助' },
];

export function helpCard(agentName = 'Agent'): object {
  const escapedAgentName = escapeMd(agentName);
  const listLines = HELP_COMMANDS.map((c) => `/${c.cmd} — ${c.note}`);
  return {
    schema: '2.0',
    config: {},
    body: {
      elements: [
        {
          tag: 'markdown',
          content: `💡 **使用帮助**\n\n${listLines.join('\n')}\n\n其他内容直接交给 ${escapedAgentName}。`,
        },
        { tag: 'hr' },
        {
          tag: 'select_static',
          name: 'help_cmd',
          placeholder: { tag: 'plain_text', content: '选择命令，直接执行' },
          options: HELP_COMMANDS.map((c) => ({
            text: { tag: 'plain_text', content: `/${c.cmd} · ${c.note}` },
            value: c.cmd,
          })),
          // Selecting an option fires the callback right away — no submit
          // button. The dispatcher turns action.option into a real command.
          behaviors: [{ type: 'callback', value: { cmd: 'help.run' } }],
        },
      ],
    },
  };
}

function escapeMd(s: string): string {
  return s.replace(/([*_`\\])/g, '\\$1');
}

function escapeCode(s: string): string {
  return s.replace(/`/g, "'");
}
