# aiduCAT☤爱嘟可爱糖 — Claude-code Agent Texting on Feishu

<p align="center">
  <img src="docs/images/aidububble-banner.webp" alt="aiduCAT 爱嘟可爱糖 · 泡波横幅（aidu 家族同款）" width="100%">
</p>

> **aiduCAT = Claude-code Agent Texting — a cat living inside Feishu, typing code for you**
>
> **Ask on top, process folded into one small panel, the result told by the panel's color.**
>
> Dress your Claude Code / Codex CLI in a Bubble-Wave Feishu card: deep-blue veins on paper white, one cat, zero noise.

[![Version](https://img.shields.io/badge/version-f0.2%2B-blue.svg)](https://github.com/monkey2jack/aiduCAT)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20.12%2B-brightgreen.svg)](https://nodejs.org/)
[![Claude Code](https://img.shields.io/badge/agent-Claude%20Code%20%7C%20Codex-orange.svg)](https://docs.anthropic.com/en/docs/claude-code/quickstart)
[![aiduCAT](https://img.shields.io/badge/aiduCAT-Claude--code_Agent_Texting-1f4e79.svg)](https://github.com/monkey2jack/aiduCAT)

**[📖 中文](./README.md)** | **English**

<!-- distribution-policy: github-source-only -->
> **Distribution note**: aiduCAT is not published to npm / PyPI. Run it from this repository source (`npm install && npm run build`). The local `bin` entry is for development and testing only.

---

## What is aiduCAT?

**aiduCAT** = **Claude-code Agent Texting** — aiduCAT dresses **Claude Code / Codex CLI** as a Feishu cat — streaming your local coding agent's thinking, tool calls, and final answer into one Feishu card styled after the [aiduPOP](https://github.com/monkey2jack/aiduPOP) Bubble Wave look.

aiduCAT originates from and credits the upstream [zarazhangrui/lark-coding-agent-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge) (npm package `lark-channel-bridge`), an MIT-licensed project. On top of that code, aiduCAT adds a complete **Bubble Wave transformation**:

| Feature | Description |
|---------|-------------|
| 🫧 **Single Bubble panel** | The answer streams on top; thinking and all tool calls fold into one collapsible panel (aiduPOP layout) |
| ☤ **Two-line counter header** | Collapsed, the header reads `🌊 thinking · 🫧 tools · ✨ elapsed` over `model · effort · 25k/1M (2%)` — no caption text |
| 👩🏻‍💻 **Per-tool emoji** | Bash👩🏻‍💻 Read👩🏻‍🏫 Edit👩🏻‍🔧 Write👩🏻‍🎨 Grep🕵🏻 Glob🥷🏻 Web👩🏻‍🚀 Agent👯🏻 — one face per tool family |
| 🚦 **Border = status** | done green / stopped yellow / error red — read the result at a glance, no trailing notes |
| 🎹 **Typing reaction** | A Typing emoji lands on your message the moment it arrives, and vanishes as soon as real work starts |
| 🗣 **`/model` free switching** | Pass through any gateway combo id (e.g. `Gemini-3.8-Flash`) with no whitelist clamping |
| 📝 **Copywriting menu** | Every visible string is cataloged in a wiki table for à-la-carte customization |

## Quick start

```bash
git clone https://github.com/monkey2jack/aiduCAT.git
cd aiduCAT
npm install
npm run build

# Run in foreground (first run opens a QR binding wizard)
npm run dev -- run
```

Requires Node.js >= 20.12.0 and one local agent installed and logged in: [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart) or [Codex CLI](https://developers.openai.com/codex/cli).

The first run: renders a binding QR code → you scan and pick/create a PersonalAgent app → config is written to `~/.lark-channel/config.json`.

## Commands

### Slash commands inside Feishu / Lark

| Command | Effect |
|---|---|
| `/help` | List all commands |
| `/model` | Show / switch the model (any gateway combo id; `/model default` restores) |
| `/new` | Interrupt the current run and start a fresh session |
| `/stop` | Stop the current running task |
| `/timeout [N\|off]` | Set the session idle watchdog |
| `/cd <path>` | Switch the working directory |
| `/ws` | Manage named workspaces |
| `/resume` | Resume the same session history |
| `/status` | Show run state |
| `/config` | Adjust presentation preferences and access policy |

### Host CLI

```bash
aiduCAT run      # foreground
aiduCAT start    # background daemon (launchd/systemd)
aiduCAT status
aiduCAT stop
aiduCAT ps
aiduCAT kill <id|#>
```

## Card anatomy

One card, three parts:

```
[final answer, streamed]

🫧Poping…                                    ← live status line (above panel)
┌─────────────────────────────────────┐
│  2 · 🫧 4 · ✨ 38s                  │  ← header line 1: counters
│ Gemini-3.8-Flash · max · 25k/1M (2%) │  ← header line 2: model · effort · context
└─────────────────────────────────────┘
```

- **While running**: a live status word (🌊Waving… / 🫧Poping… / ☤aiduCATing…) rides on its own line above the panel; the two-line header shows thinking segments / tool count / elapsed time on top, model · effort · live context usage (`25k/1M (2%)`, refreshed per API call) below
- **Expanded panel**: thinking text is prefixed 🌊; each tool line carries its own emoji (👩🏻‍💻Bash 👩🏻‍🏫Read 👩🏻‍🔧Edit 👩🏻‍🎨Write 🕵🏻Grep 🥷🏻Glob 👩🏻‍🚀Web 👯🏻agent 🤵🏻other)
- **On completion**: the status word disappears; the **panel border carries the result** — done green / stopped yellow / error red

## Sessions and queueing

- Each DM / group / topic / doc-comment thread keeps its own session
- Messages sent in quick succession merge into one batch; messages sent during a run queue up as the next turn
- Session history persists locally; `/resume` restores it

## Runtime notes

### Per-profile service and CLI

The daemon installs one **per-profile service** per PersonalAgent app: macOS launchd `ai.lark-channel-bridge.bot.<profile>`, Linux systemd `lark-channel-bridge.bot.<profile>.service`, Windows Task Scheduler `LarkChannelBridge.Bot.<profile>` via a `.cmd` wrapper. Host CLI reference:

```bash
aiduCAT profile create claude --agent claude
aiduCAT profile create codex --agent codex
aiduCAT profile list
aiduCAT profile use <name>
aiduCAT profile remove <name>            # archive local state
aiduCAT profile remove <name> --purge --yes
aiduCAT profile export <name> [--output ./profile.json] [--force]
aiduCAT profile export <name> --include-secrets --yes
```

### Access control in chat

DMs do not require an @ mention; groups and topics require `@bot` by default. Manage access from chat itself:

```text
/invite user @name     allow a user in DMs
/invite admin @name    add an access-control admin
/invite group          allow a group
/invite all group      allow all groups
/remove user @name
/remove admin @name
/remove group
```

### Cloud-doc comments

Cloud-doc comments are document-scoped: a comment run follows the document's own permissions rather than a separate access gate. Mention the bot in a supported doc's comment to run.

### lark-cli identity policy

Each profile uses a profile-local lark-cli directory at `~/.lark-channel/profiles/<profile>/lark-cli`. The agent process receives `LARKSUITE_CLI_CONFIG_DIR` for that directory, so personal authorization in one profile is never shared with another. The default policy is `bot-only`; `/config` can switch an authorized user to `user-default`. `/status` shows the summary (`lark-cli: app` / `lark-cli: user-ready`).

This **lark-cli identity policy** is per profile, not global.

### Working directories

Each profile may define a default workspace through `workspaces.default`. `/cd` switches the current directory and resets the session; `/ws` saves and reuses named workspaces (`/ws list`, `/ws save <name>`, `/ws use <name>`, `/ws remove <name>`). The directory is the agent's current working directory, not a filesystem sandbox — file access still depends on the local agent process and its permission mode.

### Permissions

Access is controlled by the canonical `"permissions"` block:

```json
{
  "permissions": {
    "defaultAccess": "full",
    "maxAccess": "full"
  }
}
```

Set either value to `workspace` or `read-only` to tighten a profile. The legacy `sandbox` config keys are no longer read.

### Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## Credits

- **Upstream**: [zarazhangrui/lark-coding-agent-bridge](https://github.com/zarazhangrui/lark-coding-agent-bridge) (npm package `lark-channel-bridge` v0.7.1)
- **Style inspiration**: [monkey2jack/aiduPOP](https://github.com/monkey2jack/aiduPOP) — origin of the Bubble Wave design language
- **Customization**: aidu

---

<p align="center">
  <sub>Made with 💕 by aidu</sub>
</p>

## License

[MIT](./LICENSE)
