import { readFile } from 'node:fs/promises';
import { paths } from '../config/paths';
import { log } from '../core/logger';
import { writeFileAtomic } from '../platform/atomic-write';

/** f0.2+ 猴哥点单: session-lifetime counters for /status. /new resets. */
export interface SessionStats {
  startedAt: number;
  /** Last per-API-call usage snapshot (tokens + when it arrived). */
  lastUsageAt?: number;
  lastOutputTokens?: number;
  /** Cumulative across every API call since session creation. */
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreate: number;
  userMessages: number;
  agentMessages: number;
  /** Output tokens / wall-clock seconds across the session (avg tps). */
  tpsAvg?: number;
}

export interface SessionEntry {
  /** May be absent if the entry was created by /timeout before any run
   * recorded a session id. Treat absence as "no resumable session". */
  sessionId?: string;
  /** Pinned cwd for the resumable session. Absent for the same reason. */
  cwd?: string;
  updatedAt: number;
  /** f0.2+ /status: per-session cumulative stats, /new wipes them. */
  stats?: SessionStats;
  /** Per-scope idle-timeout override (minutes). 0 = explicitly off for this
   * scope, undefined = follow global default. Session resets preserve this
   * scope preference while removing the resumable session id/cwd. */
  idleTimeoutMinutes?: number;
}

type SessionMap = Record<string, SessionEntry>;

export class SessionStore {
  private data: SessionMap = {};
  private saving: Promise<void> = Promise.resolve();
  private readonly path: string;

  constructor(path: string = paths.sessionsFile) {
    this.path = path;
  }

  async load(): Promise<void> {
    try {
      const text = await readFile(this.path, 'utf8');
      const raw = JSON.parse(text) as Record<string, Partial<SessionEntry>>;
      this.data = {};
      for (const [chatId, entry] of Object.entries(raw)) {
        if (!entry || typeof entry.updatedAt !== 'number') continue;
        // Drop entries without a `cwd`/`sessionId` pair *unless* there's
        // some other persisted state worth keeping (e.g. an idle-timeout
        // override). Resuming a session whose cwd we don't know about
        // would hang claude on a missing jsonl, so resume keys still need
        // the full pair; but a bare timeout override is fine on its own.
        const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : undefined;
        const cwd = typeof entry.cwd === 'string' ? entry.cwd : undefined;
        const idleTimeoutMinutes =
          typeof entry.idleTimeoutMinutes === 'number' ? entry.idleTimeoutMinutes : undefined;
        const hasSession = sessionId !== undefined && cwd !== undefined;
        if (!hasSession && idleTimeoutMinutes === undefined) continue;
        this.data[chatId] = {
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(cwd !== undefined ? { cwd } : {}),
          updatedAt: entry.updatedAt,
          ...(idleTimeoutMinutes !== undefined ? { idleTimeoutMinutes } : {}),
        };
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /**
   * Return the session id for this chat if it was created in the given cwd.
   * Sessions recorded in a different cwd are stale — claude can't resume
   * them from a different working directory.
   */
  resumeFor(chatId: string, cwd: string): string | undefined {
    const entry = this.data[chatId];
    if (!entry) return undefined;
    if (entry.cwd !== cwd) return undefined;
    return entry.sessionId;
  }

  getRaw(chatId: string): SessionEntry | undefined {
    return this.data[chatId];
  }

  set(chatId: string, sessionId: string, cwd: string): void {
    // Preserve idleTimeoutMinutes across run starts — it's a per-scope
    // preference, not per-run-instance state. /new (clear) wipes it.
    const prev = this.data[chatId];
    this.data[chatId] = {
      sessionId,
      cwd,
      updatedAt: Date.now(),
      ...(prev?.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: prev.idleTimeoutMinutes }
        : {}),
      ...(prev?.stats ? { stats: prev.stats } : {}),
    };
    this.schedulePersist();
  }

  #freshStats() {
    return {
      startedAt: Date.now(),
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      cacheCreate: 0,
      userMessages: 0,
      agentMessages: 0,
    };
  }

  /** f0.2+: accumulate one usage snapshot into the session's stats. */
  recordUsage(
    chatId: string,
    u: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheCreationInputTokens?: number },
  ): void {
    const entry = this.data[chatId];
    if (!entry) return;
    const st: SessionStats = entry.stats ?? {
      startedAt: Date.now(),
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      cacheCreate: 0,
      userMessages: 0,
      agentMessages: 0,
    };
    // Usage snapshots are per-API-call totals (not deltas) for the context
    // meter, but for lifetime accumulation a plain max() is wrong across
    // multi-turn (each turn reloads the prefix). Deltas are also unreliable
    // (cache hits collapse the numbers). Sum *output* deltas (a true counter —
    // each call generates fresh tokens) and keep latest *input* totals (the
    // context meter reads them directly).
    const outDelta = Math.max(0, (u.outputTokens ?? 0) - (st.lastOutputTokens ?? 0));
    if ((u.outputTokens ?? 0) >= (st.lastOutputTokens ?? 0)) {
      st.tokensOut += outDelta;
 st.lastOutputTokens = u.outputTokens;
    } else {
      // New API call started: output counter reset.
      st.tokensOut += u.outputTokens ?? 0;
      st.lastOutputTokens = u.outputTokens;
    }
    st.tokensIn = u.inputTokens ?? st.tokensIn;
    st.cacheRead = Math.max(st.cacheRead, u.cachedInputTokens ?? 0);
    st.cacheCreate += u.cacheCreationInputTokens ?? 0;
    st.lastUsageAt = Date.now();
    const elapsed = Math.max(1, (st.lastUsageAt - st.startedAt) / 1000);
    st.tpsAvg = Math.round(st.tokensOut / elapsed);
    entry.stats = st;
    this.schedulePersist();
  }

  /** f0.2+: count one user/agent message into session stats. */
  recordMessage(chatId: string, who: "user" | "agent"): void {
    const entry = this.data[chatId];
    if (!entry) return;
    const st: SessionStats = entry.stats ?? {
      startedAt: Date.now(),
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      cacheCreate: 0,
      userMessages: 0,
      agentMessages: 0,
    };
    if (who === "user") st.userMessages += 1;
    else st.agentMessages += 1;
    entry.stats = st;
    this.schedulePersist();
  }

  clear(chatId: string): void {
    const prev = this.data[chatId];
    if (!prev) {
      // /new on a brand-new scope: still lay down a stats skeleton so the
      // /status card has a session start to show (2026-10-21 猴哥点单).
      this.data[chatId] = { updatedAt: Date.now(), stats: this.#freshStats() };
      this.schedulePersist();
      return;
    }
    // Keep the entry alive with a fresh stats skeleton: updatedAt becomes the
    // new session start; idleTimeout preference survives; old counters go.
    this.data[chatId] = {
      updatedAt: Date.now(),
      stats: this.#freshStats(),
      ...(prev.idleTimeoutMinutes !== undefined
        ? { idleTimeoutMinutes: prev.idleTimeoutMinutes }
        : {}),
    };
    this.schedulePersist();
    this.schedulePersist();
  }

  /** Per-scope idle-timeout override. `undefined` means no override set. */
  getIdleTimeoutMinutes(chatId: string): number | undefined {
    return this.data[chatId]?.idleTimeoutMinutes;
  }

  setIdleTimeoutMinutes(chatId: string, minutes: number): void {
    const clamped = Math.min(Math.max(Math.floor(minutes), 0), 120);
    const prev = this.data[chatId];
    this.data[chatId] = {
      ...(prev ?? { updatedAt: Date.now() }),
      idleTimeoutMinutes: clamped,
      updatedAt: Date.now(),
    };
    this.schedulePersist();
  }

  /** Remove the override so this scope falls back to the global default.
   * Returns true if something was actually removed. */
  clearIdleTimeoutOverride(chatId: string): boolean {
    const prev = this.data[chatId];
    if (!prev || prev.idleTimeoutMinutes === undefined) return false;
    const { idleTimeoutMinutes: _, ...rest } = prev;
    this.data[chatId] = { ...rest, updatedAt: Date.now() };
    this.schedulePersist();
    return true;
  }

  async flush(): Promise<void> {
    await this.saving;
  }

  private schedulePersist(): void {
    this.saving = this.saving
      .then(async () => {
        await writeFileAtomic(this.path, `${JSON.stringify(this.data, null, 2)}\n`, {
          mode: 0o600,
        });
      })
      .catch((err: unknown) => {
        log.fail('session', err, { step: 'persist' });
      });
  }
}
