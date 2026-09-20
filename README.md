<p align="center"><img src="assets/logo.svg" alt="AgentiSend" width="88"></p>

<!-- GENERATED:lede START -->
# AgentiSend for AI agents

AgentiSend is a transactional email API: send through verified domains with a message log, budgets, a preflight and refusals that name the fix; built so AI agents can send on your behalf. The hosted MCP server at https://api.agentisend.com/mcp exposes 82 tools (44 on tools/list; the rest via list_more_tools). A send is one message or a batch of up to 500 items with per-item results. preflight_email runs every gate a real send runs, sends nothing, and costs nothing. Every 4xx returns code, message, and fix. There is no tool for unsolicited mail. Auth is a bearer API key or OAuth 2.1 with dynamic client registration. Starter prompts: "Send this receipt to the customer." "Preflight this send and tell me what would stop it." "What can I spend today?"
<!-- GENERATED:lede END -->

This repository ships the skill (`SKILL.md`) and the plugin manifests for
Claude Code, Cursor and Grok Build. The MCP server itself is hosted at
`https://api.agentisend.com/mcp`.

## Install

<!-- GENERATED:install START -->
**Claude Code — the plugin brings the server and the skill together:**

```
/plugin marketplace add fortuneflick/agentisend-claude-plugin
/plugin install agentisend@agentisend
```

Every line below carries the same endpoint (https://api.agentisend.com/mcp) and a placeholder key — replace `as_YOUR_API_KEY_HERE` with a key from the console.

### Cursor

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=agentisend&config=eyJ1cmwiOiJodHRwczovL2FwaS5hZ2VudGlzZW5kLmNvbS9tY3AiLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiJCZWFyZXIgYXNfWU9VUl9BUElfS0VZX0hFUkUifX0=
```

Open this link and Cursor offers to add the server. Replace the placeholder key in Settings → MCP afterwards, or paste the same object into `.cursor/mcp.json`.

### Claude Code

```bash
claude mcp add --transport http agentisend https://api.agentisend.com/mcp \
  --header "Authorization: Bearer as_YOUR_API_KEY_HERE"
```

Or install the plugin, which brings the server and the sending skill together: `/plugin marketplace add fortuneflick/agentisend-claude-plugin` then `/plugin install agentisend@agentisend`.

### Codex CLI

```bash
codex mcp add agentisend --url https://api.agentisend.com/mcp \
  --bearer-token-env-var AGENTISEND_API_KEY
```

The token stays in your environment; Codex writes only the variable name to `~/.codex/config.toml`.

### Gemini CLI

```bash
gemini mcp add --transport http \
  --header "Authorization: Bearer as_YOUR_API_KEY_HERE" \
  agentisend https://api.agentisend.com/mcp
```

Check it with `gemini mcp list`.

### VS Code

```bash
code --add-mcp '{"name":"agentisend","type":"http","url":"https://api.agentisend.com/mcp","headers":{"Authorization":"Bearer as_YOUR_API_KEY_HERE"}}'
```

Or write the same server into `.vscode/mcp.json` under `servers`.

### Windsurf

```json
{
  "mcpServers": {
    "agentisend": {
      "serverUrl": "https://api.agentisend.com/mcp",
      "headers": {
        "Authorization": "Bearer as_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Goes in `~/.codeium/windsurf/mcp_config.json`, then refresh the MCP panel.

### OpenCode

```json
{
  "mcp": {
    "agentisend": {
      "type": "remote",
      "url": "https://api.agentisend.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:AGENTISEND_API_KEY}"
      }
    }
  }
}
```

Goes in `opencode.json`; the key is read from your environment rather than written to the file.

### Anything else that speaks stdio

```bash
AGENTISEND_API_KEY=as_YOUR_API_KEY_HERE npx -y @agentisend/mcp-server
```

The local launcher proxies to the same server, so the tool list, the budget and the refusals are identical.
<!-- GENERATED:install END -->

**Cursor:** open Customize in the sidebar, find AgentiSend, and select Install.
For local development, clone this repository and symlink it into your Cursor
plugins directory (`ln -s "$PWD" ~/.cursor/plugins/agentisend`), then reload
Cursor — the manifest is `.cursor-plugin/plugin.json`.

**Grok Build:** run `/marketplace` and pick AgentiSend, or add this repository
as a marketplace source. Grok reads the server out of the plugin manifest, so
`.grok-plugin/plugin.json` carries it under `mcpServers` and one install brings
the tools and the skill together.

Claude Code reads `.mcp.json` at the repository root instead, so `/plugin
install` brings both as well — after it, `claude mcp list` shows the server as
`plugin:agentisend:agentisend`. If you already have an AgentiSend connector,
remove one of the two rather than running both. Cursor reads neither file: the
Cursor plugin installs the skill alone, and the deeplink above adds the
server.

**Any agent (skill only):**

```bash
npx skills add fortuneflick/agentisend-claude-plugin
```

## What the agent can do

- Send one message or a batch, schedule a send, cancel or reschedule one that
  has not gone out, and replay a retry safely with an idempotency key.
- Preflight a send for free: the same validation, domain, suppression, budget,
  loop, trust and content checks the real send runs, with nothing sent.
- Add a sending domain, read the DNS records it needs, and verify it.
- Read what it may spend, set a ceiling, and check whether it can send now.
- Ask a person to approve a risky send and read back what they decided.
- Explain a message after the fact: the verdict, the evidence, and the
  remediation as callable steps.

Every tool, the scopes it needs and the ceilings it counts against are listed
at https://agentisend.com/docs/guides/mcp.

## What the agent cannot do

- **It cannot raise its own budget**, lift its own kill switch, or approve its
  own held send. An approval you can grant yourself is not an approval.
- **It cannot read a message it was stopped from sending** — it sees shapes:
  recipient counts, whether there is a body.
- **It cannot send unsolicited mail.** There is no feature for it, at any tier.

## Examples

`examples/` carries one runnable directory per integration — Next.js App
Router, Supabase's Send Email Hook, Better Auth, Auth.js, Hono, Express, a
SvelteKit form action, and an agent with a daily ceiling that refuses the
fourth identical send. Each one is executed against a real API server on every
build of the platform, so an example that stops working fails that build rather
than your first send.

## Security

- **No executable code in the install path.** The skill is Markdown and the
  manifests are JSON. Nothing here runs, downloads a binary, or installs
  anything beyond copying those files into your agent.
- **One runtime endpoint:** `https://api.agentisend.com/mcp` over HTTPS. Every
  connect command above names that address; the tools run there.
- **Credentials:** a bearer API key (`as_…`) minted at
  https://console.agentisend.com, or OAuth 2.1 sign-in — both reach the same
  tools with the same ceilings. This repository contains no keys and never asks
  for one in chat. The Claude Code manifest reads `AGENTISEND_API_KEY` from
  your environment rather than writing it to a config file.
- **Optional local launcher:** clients that only speak stdio run the published
  npm package `@agentisend/mcp-server`, which proxies to that same endpoint.
- **No telemetry.** Nothing here phones home.

## Links

- MCP server and tool list: https://agentisend.com/docs/guides/mcp
- Quickstart: https://agentisend.com/docs/guides/quickstart
- Budgets and the kill switch: https://agentisend.com/docs/guides/budgets-and-the-kill-switch
- Errors: https://agentisend.com/docs/errors
- Pricing: https://agentisend.com/pricing
- Support: hello@agentisend.com

## License

MIT — see [LICENSE](LICENSE).
