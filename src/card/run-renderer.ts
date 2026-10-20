import { deepMaskEmails } from './mask-email';
import type { Block, FooterStatus, RunState, ToolEntry } from './run-state';
import { logoImgKeyForModel } from './model-logo';
import { toolBodyMd, toolHeaderPlain, toolHeaderText } from './tool-render';
const REASONING_MAX = 1500;
const COLLAPSE_TOOL_THRESHOLD = 3;

interface ToolGroup {
  kind: 'tools';
  tools: ToolEntry[];
}
interface TextGroup {
  kind: 'text';
  content: string;
}
type Group = ToolGroup | TextGroup;

export interface RunCardRenderOptions {
  signCallback?: (action: string) => string;
  /** aiduCAT: model name shown in the meta panel (e.g. Gemini-3.8-Flash). */
  model?: string;
  /** aiduCAT: epoch ms when the run started, for elapsed-time in meta panel. */
  startedAt?: number;
  /** aiduCAT: reasoning effort (low..max), shown on the panel header line 1. */
  effort?: string;
  /** aiduCAT: model context window (tokens) from 10router; enables the
   * context-usage percentage on header line 1. Undefined = no percentage. */
  contextWindow?: number;
  /** f0.2: the clarify question the user just answered — buttons collapse
   * into a chosen-answer line so the same card can't be answered twice. */
  clarifyAnswered?: string;
}

export function renderCard(state: RunState, options: RunCardRenderOptions = {}): object {
  const elements: object[] = [];

  // aiduCAT: answer (text blocks or final_text) first, single aiduPOP panel below.
  const answerBlocks: string[] = [];
  for (const group of groupBlocks(state.blocks)) {
    if (group.kind === 'text') {
      const trimmed = group.content.trim();
      if (trimmed) {
        // aiduCAT clarify: strip anything from a [CLARIFY] sentinel on — the
        // marker line (complete or half-streamed) never reaches the card.
        answerBlocks.push((group.content.split('[CLARIFY]')[0] ?? '').replace(/\n+$/, ''));
      }
    }
  }
  // Codex delivers the terminal response as `finalText` rather than stream text blocks.
  // Ensure it renders in the answer area above the panel so codex and claude have
  // the exact same unified single-card layout.
  if (state.finalText && state.finalText.trim()) {
    const stripped = (state.finalText.split('[CLARIFY]')[0] ?? '').replace(/\n+$/, '');
    if (!answerBlocks.some((b) => b.includes(stripped) || stripped.includes(b))) {
      answerBlocks.push(stripped);
    }
  }
  for (const text of answerBlocks) {
    if (text.trim()) {
      elements.push(markdown(text));
    }
  }

  // f0.2 猴哥点单: the live status word (☤Reasoning... / ☤Tooling... /
  // ☤aiduCATing...) moved INTO the panel header line 1, leftmost — ahead of
  // the 💭/🛠️/⏱️ counters. It disappears once the run ends; the panel border
  // color carries the result. No standalone status line above the panel.
  // f0.2+ 猴哥点单 (2026-10-20): the live status line moves OUT of the panel —
  // rendered between the answer and the panel. Words renamed: Reasoning→
  // Thinking, Tooling→Processing. Header keeps only hard counters.
  const statusWord =
    state.terminal === 'running'
      ? state.footer === 'tool_running'
        ? 'Processing…'
        : state.footer === 'streaming'
          ? 'aiduCATing…'
          : 'Thinking…'
      : '';

  // aiduCAT: one collapsed panel carrying reasoning + every tool call + the
  // run meta header (aiduPOP layout). Hidden when there is nothing to show.
  const popPanel = aiduPopPanel(state, options, '');
  // f0.2+ 猴哥点单: notation size so the status line reads as a caption,
  // matching the panel body size instead of full answer text.
  if (statusWord) elements.push(noteMd(`☤ ${statusWord}`));
  if (popPanel) elements.push(popPanel);

  // aiduCAT clarify: when the run ended while waiting on a parsed
  // [CLARIFY] marker, render the question + one button per option right
  // below the answer. A click forwards the choice back into the scope's
  // pending queue so the agent's session resumes with the answer.
  if (state.clarify && state.terminal !== 'running' && !options.clarifyAnswered) {
    // f0.2 猴哥点单: dropdown instead of a button array — select_static is
    // naturally single-choice (repeat clicks just re-open the same form) and
    // routes through the SAME cardAction submit path /model uses, which is
    // known-good; the old button array's callbacks never reached the bot.
    elements.push(markdown(`⁉️ **TBC**：${state.clarify.question}\n_下拉选择后点确认_`));
    elements.push({
      tag: 'form',
      name: 'clarify_form',
      elements: [
        {
          tag: 'select_static',
          name: 'clarify_choice',
          placeholder: { tag: 'plain_text', content: '选择一个选项' },
          options: state.clarify.options.map((option) => ({
            text: { tag: 'plain_text', content: option },
            value: option,
          })),
        },
        {
          tag: 'column_set',
          flex_mode: 'stretch',
          columns: [
            {
              tag: 'column',
              width: 'auto',
              vertical_align: 'center',
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '✅ 确认' },
                type: 'primary',
                form_action_type: 'submit',
                name: 'clarify_submit',
                behaviors: [
                  {
                    type: 'callback',
                    value: {
                      cmd: 'clarify.answer',
                      arg: JSON.stringify({ q: state.clarify!.question }),
                    },
                  },
                ],
              }],
            },
          ],
        },
      ],
    });
  }
  // f0.2: answered state — swap the question+buttons for a single receipt
  // line so the same card can't be answered twice.
  if (options.clarifyAnswered) {
    elements.push(markdown(`✅ **已选**：${options.clarifyAnswered}`));
  }

  // aiduCAT: terminal state is expressed by the panel border color (aiduPOP
  // style) — 完成绿 / 停止黄 / 出错红 — not by a trailing text note. Keep an
  // empty-answer fallback note so a streamed card is never fully empty.
  if (state.terminal === 'done' && elements.length === 0) {
    elements.push(noteMd('🚫'));
  }

  // aiduCAT: no footer status line and no stop button — the live status word
  // lives at the far left of the panel header while running and vanishes on
  // completion (border color takes over), and stopping goes through /stop.

  // Mask raw emails across every text field so the Feishu tenant audit doesn't
  // reject the (streamed) card with a 400 EMAIL_ADDRESS — see mask-email.ts.
  return deepMaskEmails({
    schema: '2.0',
    config: {
      streaming_mode: state.terminal === 'running',
      summary: { content: summaryText(state) },
    },
    body: { elements },
  });
}

/**
 * aiduCAT single panel (aiduPOP layout): the collapsed header carries only
 * `☤ model · 🌊 thinking-count · 🫧 tool-count · ✨ elapsed`, and the body
 * holds the thinking text plus one entry per tool call. Rendered below the
 * answer; omitted entirely for a run with no reasoning, tools, or meta.
 *
 * While running, the footer already carries the live status line, so the
 * collapsed header stays pure meta (counts + elapsed); on completion the
 * counts/values are final.
 */
function aiduPopPanel(state: RunState, options: RunCardRenderOptions, statusWord = ''): object | null {
  const tools = state.blocks.filter((b): b is Extract<Block, { kind: 'tool' }> => b.kind === 'tool');
  const hasReasoning = state.reasoning.content.trim().length > 0;
  const hasError = state.terminal === 'error' && !!state.errorMsg;

  const meta = metaHeader(state, options);
  if (!hasReasoning && tools.length === 0 && !meta) return null;

  const title = meta;

  const bodyParts: string[] = [];
  if (hasError) bodyParts.push(`⚠️ ${state.errorMsg}`);
  if (hasReasoning) {
    // aiduCAT: 💭 marks a thinking burst — same emoji as the collapsed header.
    bodyParts.push(`💭 ${truncate(state.reasoning.content, REASONING_MAX)}`);
  }
  if (tools.length > 0) {
    // Latest tool on top so the freshest activity is what you see on expand.
    // 猴哥点菜单：每个工具用自己的专属 emoji（👩🏻‍💻Bash 等），不再加统一的 🫧。
    const lines = tools
      .slice()
      .reverse()
      .map((b) => `- ${toolHeaderText(b.tool)}`);
    bodyParts.push(lines.join('\n'));
  }

  return collapsiblePanel({
    title,
    expanded: false,
    // aiduCAT: border color carries the terminal state (aiduPOP style) —
    // running/none grey, done green, stopped/timeout yellow, error red.
    border: panelBorderColor(state),
    body: bodyParts.join('\n\n') || '_（无过程记录）_',
    // f0.2 猴哥点单: the panel header icon slot shows the current model's
    // vendor logo; un-mapped models keep the default chevron.
    ...(options.model && logoImgKeyForModel(options.model)
      ? { logoImgKey: logoImgKeyForModel(options.model) }
      : {}),
  });
}

/** aiduCAT: 完成绿 / 停止黄 / 出错红 / 运行或无过程灰。 */
function panelBorderColor(state: RunState): 'grey' | 'green' | 'yellow' | 'red' {
  if (state.terminal === 'done') return 'green';
  if (state.terminal === 'interrupted' || state.terminal === 'idle_timeout') return 'yellow';
  if (state.terminal === 'error') return 'red';
  return 'grey';
}

/**
 * aiduPOP header, two lines (猴哥点单 f0.1):
 *   top line:    🌊 thinking-n · 🫧 tool-n · ✨ elapsed
 *   bottom line: model · effort · 23k/1M (2%)   (plain text, no emoji)
 * Each piece only appears when it has a value; separators are the aiduPOP `·`.
 * Elapsed keeps ticking across card updates because renderCard is re-run on
 * every streaming update with the fixed `options.startedAt`.
 */
function metaHeader(state: RunState, options: RunCardRenderOptions): string {
  // f0.2+ 猴哥点单 (2026-10-20): one-line minimal header —
  //   modelID · 思考n · 工具n · 耗时ns   (no emoji, no effort/ctx line)
  // The model vendor logo stays in the header icon slot (left side).
  const parts: string[] = [];
  if (options.model) parts.push(options.model);
  parts.push(`💭 ${state.reasoning.segments}`);
  const toolCount = state.blocks.filter((b) => b.kind === "tool").length;
  parts.push(`🛠️ ${toolCount}`);
  if (options.startedAt) {
    const secs = Math.max(0, Math.round((Date.now() - options.startedAt) / 1000));
    const label = secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`;
    parts.push(`⏱️ ${label}`);
  }
  return parts.join(" · ");
}

/**
 * aiduCAT: effort reads as a proper noun in the header — `Max`, `High`,
 * `XHigh`, `Ultra` (首字母大写, per 猴哥). Unknown values pass through as-is.
 */
function effortLabel(effort: string): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

/**
 * aiduCAT: `***k/1M (xx%)` — how full the model's context window is right now.
 * Used tokens = prompt tokens (accounting for cached subsets) + output tokens.
 * Always scales against the real 1M context window deployed on 10router.
 */
function contextUsageText(state: RunState, options: RunCardRenderOptions): string {
  const u = state.usage;
  if (!u) return '';
  const inTokens = u.inputTokens ?? 0;
  const cachedTokens = u.cachedInputTokens ?? 0;
  // If inTokens >= cachedTokens, cached is already counted inside input_tokens (OpenAI/Codex standard).
  // Otherwise, cached tokens are complementary to prompt tokens (Anthropic standard).
  const effectiveInput = inTokens >= cachedTokens ? inTokens : inTokens + cachedTokens;
  const used = effectiveInput + (u.cacheCreationInputTokens ?? 0) + (u.outputTokens ?? 0);
  if (used === 0) return '';

  // 猴哥点单: 10router 上模型全量开放 1M (1,000,000) 上下文，分母基准统一保底 1M，彻底杜绝 '(累计)' 字样
  const windowSize = Math.max(options.contextWindow ?? 1_000_000, 1_000_000);
  const pct = Math.min(100, Math.round((used / windowSize) * 100));
  return `${formatTokens(used)}/${formatTokens(windowSize)} (${pct}%)`;
}

/** aiduCAT: 25046 -> `25k`, 1048576 -> `1M`, 500100 -> `500.1k`, 950 -> `950`. */
function formatTokens(n: number): string {
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '');
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}k`;
  return String(n);
}

function* groupBlocks(blocks: Block[]): Generator<Group> {
  let toolBuf: ToolEntry[] = [];
  for (const b of blocks) {
    if (b.kind === 'tool') {
      toolBuf.push(b.tool);
    } else {
      if (toolBuf.length > 0) {
        yield { kind: 'tools', tools: toolBuf };
        toolBuf = [];
      }
      yield { kind: 'text', content: b.content };
    }
  }
  if (toolBuf.length > 0) yield { kind: 'tools', tools: toolBuf };
}

function toolPanel(tool: ToolEntry, expanded: boolean): object {
  return collapsiblePanel({
    title: toolHeaderText(tool),
    expanded,
    border: tool.status === 'error' ? 'red' : 'grey',
    body: toolBodyMd(tool) || '_无输出_',
  });
}

interface PanelOpts {
  title: string;
  expanded: boolean;
  border: 'grey' | 'red' | 'blue' | 'green' | 'yellow';
  body: string;
  /** f0.2: model logo img_key — replaces the chevron in the header icon slot. */
  logoImgKey?: string;
}

function collapsiblePanel(opts: PanelOpts): object {
  return {
    tag: 'collapsible_panel',
    expanded: opts.expanded,
    header: panelHeader(opts.title, opts.logoImgKey),
    border: { color: opts.border, corner_radius: '5px' },
    vertical_spacing: '4px',
    padding: '6px 8px 6px 8px',
    elements: [{ tag: 'markdown', content: opts.body, text_size: 'notation' }],
  };
}

function panelHeader(titleMd: string, logoImgKey?: string): object {
  return {
    // aiduCAT: text_size=notation shrinks the collapsed header title to match
    // aiduPOP's small panel type (verified live: <font> tags are ignored on
    // panel headers, text_size on the title markdown is not).
    title: { tag: 'markdown', content: titleMd, text_size: 'notation' },
    vertical_align: 'center',
    // f0.2 猴哥点单: logo replaces the chevron in the header icon slot.
    // Omitting icon_position puts the mark at the title's left edge — the
    // closest structural approximation to "before the model id". When the
    // model has no logo we fall back to the chevron pinned right so the
    // collapse affordance stays.
    icon: logoImgKey
      ? { tag: 'custom_icon', img_key: logoImgKey, size: '16px 16px' }
      : { tag: 'standard_icon', token: 'down-small-ccm_outlined', size: '16px 16px' },
    ...(logoImgKey ? {} : { icon_position: 'right' }),
    icon_expanded_angle: -180,
  };
}

function markdown(content: string): object {
  return { tag: 'markdown', content };
}

function noteMd(content: string): object {
  return { tag: 'markdown', content, text_size: 'notation' };
}

function summaryText(state: RunState): string {
  if (state.terminal === 'interrupted') return '⭕️Stop';
  if (state.terminal === 'idle_timeout') return '⚠️Timeout';
  if (state.terminal === 'error') return '❌Error';
  if (state.terminal === 'done') return '✅Done';
  if (state.footer === 'tool_running') return '☤Processing…';
  if (state.footer === 'streaming') return '☤aiduCATing…';
  return '☤Thinking…';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
