# Catalog submissions — owner checklist

> **INTERNAL. NOT CUSTOMER-FACING.** A working checklist for the repository
> owner. It is safe to keep in the public repository (no secrets), but nothing
> here is product copy.

Order: **1. push this repo → 2. npm → 3. MCP registry → 4. Anthropic → 5. Cursor
→ 6. xAI → 7. claude.ai connectors directory → 8. ChatGPT plugins (last).**

This repository is the single canonical source every catalog points at. The
platform monorepo is private; the generated half of this repository is written
from it by `pnpm gen:agent-skill` and pinned by `agent_skill_repo_parity`.
**Never hand-edit a file inside a `<!-- GENERATED:… -->` region, `skills/`,
`examples/`, `server.json` or a manifest** — regenerate and push.

## 0. Before anything

- [x] Public repository created: https://github.com/fortuneflick/agentisend-claude-plugin (MIT).
- [ ] Record the 40-char SHA after each push: `git ls-remote https://github.com/fortuneflick/agentisend-claude-plugin.git HEAD`
- [x] `claude plugin validate .` passes locally.

## Live check — MCP OAuth (2026-09-18)

Both the claude.ai connectors directory and the ChatGPT review require working
OAuth discovery. Verified against production on 2026-09-18:

| Check | Result |
|---|---|
| `POST https://api.agentisend.com/mcp` with no credentials | **401**, body `{"code":"missing_api_key", … ,"fix":…}` |
| `WWW-Authenticate` on that 401 | `Bearer realm="agentisend-mcp", resource_metadata="https://api.agentisend.com/.well-known/oauth-protected-resource"` |
| `GET https://api.agentisend.com/.well-known/oauth-protected-resource` | **200**, resource `https://api.agentisend.com/mcp`, authorization server `https://api.agentisend.com`, **19** scopes advertised (`segments:write`, `topics:read`, `topics:write` added with W4.9b) |

Re-run before any submission:

```bash
curl -si -X POST https://api.agentisend.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i www-authenticate
curl -s https://api.agentisend.com/.well-known/oauth-protected-resource | jq .
```

## Live check — W4.9 catalog (2026-09-19)

The hosted MCP catalogue is **69** tools. `tools/list` advertises **40**
(`list_more_tools` and `get_email_events` join the default list; 29 sit behind
`list_more_tools` by category). Landing
`https://agentisend.com/docs/guides/mcp` names `list_more_tools`, `get_metrics`
and `create_api_key`. Regenerated from platform `d51b2dd` with
`pnpm gen:agent-skill --out` (36 generated files already matched; the install
region does not include the tool table). This section is the reviewer note that
the service grew; do not hand-edit generated files.

## 1. npm (the stdio launcher)

npm is not logged in on the build machine, so this is an owner step. From a
clean checkout of the platform monorepo on `main`:

```bash
npm login                       # account that owns the @agentisend scope
pnpm --filter @agentisend/mcp-server publish --access public
```

`prepublishOnly` runs the build. Verify from a directory outside the monorepo:

```bash
npx -y @agentisend/mcp-server --version
```

The registry (§2) checks that the `identifier` and `version` in `server.json`
exist on npm, so npm goes first.

## 2. MCP registry (registry.modelcontextprotocol.io)

`server.json` declares the namespace **`com.agentisend/mcp-server`**. A `com.*`
namespace is proved by DNS, not by the repository, so this needs a TXT record —
an owner step, and the only DNS in this checklist.

```bash
brew install mcp-publisher                     # or the release binary from github.com/modelcontextprotocol/registry
mcp-publisher login dns --domain agentisend.com --private-key <ed25519 hex>
```

That prints the record to publish at Cloudflare (AgentiSend account, zone
`agentisend.com`):

| Type | Name | Value |
|---|---|---|
| TXT | `_mcp-registry.agentisend.com` | `v=MCPv1; k=ed25519; p=<the base64 public key the CLI prints>` |

Then, from the monorepo:

```bash
cd packages/mcp-server && mcp-publisher publish
```

Verify:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=agentisend" | jq '.servers[].name'
```

**Alternative with no DNS:** rename the server in `server.json` to
`io.github.fortuneflick/agentisend-mcp-server` and prove it with
`mcp-publisher login github`, which is an interactive device-code flow the
owner runs. Keep the ed25519 private key offline; it is what republishing needs.

## 3. Anthropic plugin directory (Claude Code / Cowork)

- Portal: https://platform.claude.com/plugins/submit (Console; works on an
  individual account — the claude.ai-side path needs a Team/Enterprise org).
- Repository URL: `https://github.com/fortuneflick/agentisend-claude-plugin`
- Plugin name `agentisend` · marketplace name `agentisend` · manifest
  `.claude-plugin/plugin.json` · category `productivity` · license MIT
- Homepage: `https://agentisend.com/docs/guides/mcp`
- Description: use the `description` in `.claude-plugin/plugin.json` verbatim.
- Note for the reviewer: the plugin ships the skill and a `.mcp.json` that
  reads `AGENTISEND_API_KEY` from the environment. No credential is written to
  a config file and none is in this repository.
- Pushes to this repository are picked up automatically. **Never open a second
  submission.**

## 4. Cursor marketplace

- Portal: https://cursor.com/marketplace/publish (clicking Submit accepts the
  Cursor Publisher Terms — owner only).
- Repository URL `https://github.com/fortuneflick/agentisend-claude-plugin`,
  manifest `.cursor-plugin/plugin.json`, marketplace file
  `.cursor-plugin/marketplace.json`, logo
  `https://raw.githubusercontent.com/fortuneflick/agentisend-claude-plugin/main/assets/logo.svg`,
  org name `AgentiSend`, handle `agentisend`, contact `hello@agentisend.com`,
  website `https://agentisend.com`.
- The Cursor plugin is skill-only; the one-click server install is the deeplink
  in README.md.

## 5. xAI plugin marketplace (Grok Build)

1. Fork https://github.com/xai-org/plugin-marketplace, branch `add-agentisend`
   from upstream `main`.
2. Append the entry to `.grok-plugin/marketplace.json`, with `source.sha` set to
   the 40-char lowercase SHA of this repository's `main` (a tag or branch is
   rejected):

```json
{
  "name": "agentisend",
  "description": "Send email from an agent with a budget it cannot exceed, a free preflight that runs every gate a real send runs, and refusals that name the fix.",
  "category": "productivity",
  "source": {
    "source": "url",
    "url": "https://github.com/fortuneflick/agentisend-claude-plugin.git",
    "sha": "<40-char SHA>"
  },
  "homepage": "https://agentisend.com/docs/guides/mcp",
  "keywords": [
    "agentisend",
    "agentisend email",
    "agentisend mcp",
    "agentisend transactional email",
    "agentisend agent budget",
    "agentisend deliverability"
  ],
  "domains": ["agentisend.com"]
}
```

3. `python3 scripts/generate-plugin-index.py`, then
   `python3 scripts/validate-catalog.py` and
   `python3 scripts/generate-plugin-index.py --check` — all three must pass.
4. PR title `Add agentisend`. Keywords and domains are brand-scoped on purpose;
   xAI rejects generic terms such as `email`.
5. After any change to this repository, open a follow-up PR bumping `sha`.
   **Never a parallel entry.**

**Status 2026-09-18:** PR open — https://github.com/xai-org/plugin-marketplace/pull/785,
from fork `fortuneflick/plugin-marketplace`, branch `add-agentisend`. Expect the
"official org vs personal account" question; the answer offered in the PR is to
move this repository to an `agentisend` org and re-pin.

## 6. claude.ai connectors directory (Team/Enterprise gated)

Packet to have ready:

| Field | Value |
|---|---|
| Name | AgentiSend |
| Slug | `agentisend` |
| Tagline (≤55 chars) | `Email your agent can send without supervision` (45) |
| Description | The README's opening two paragraphs |
| Categories | Productivity, Developer tools |
| MCP server URL | `https://api.agentisend.com/mcp` |
| Auth | OAuth 2.1 with dynamic client registration (verified above) |
| Docs URL | `https://agentisend.com/docs/guides/mcp` |
| Privacy URL | `https://agentisend.com/privacy` |
| Support | `hello@agentisend.com` |
| Icon | `assets/icon-192.png` |
| Example prompts | "Send this receipt to the customer" · "What can I spend today?" · "Preflight this send and tell me what would stop it" · "Why did that message bounce?" · "Set up acme.com as a sending domain" |
| Test account | PLACEHOLDER — a demo workspace with a verified domain, a budget, one webhook and a few sent messages, signed in without MFA |

## 7. ChatGPT plugins (last)

- Portal: https://platform.openai.com/plugins (OpenAI org login with Apps
  Management access and a verified publisher identity; there is no public
  status check).
- Requirements: `/.well-known/openai-apps-challenge` served from the submitted
  domain with the token the portal issues; honest tool annotations
  (`readOnlyHint` / `destructiveHint` are already set per tool); a fully
  featured demo account **without MFA**; exactly 5 positive and 3 negative test
  cases; privacy, terms and support URLs; tested in Developer Mode on desktop
  and mobile.
- **Owner step before submitting:** ask the portal for the domain-verification
  token and set Coolify env `OPENAI_APPS_CHALLENGE` (runtime, literal). The
  route is live: `GET https://api.agentisend.com/.well-known/openai-apps-challenge`
  answers 200 `text/plain` with that token, or 404 when unset.
- Policy: OpenAI's guidelines ban unsolicited-contact tooling and in-plugin
  upselling of digital goods. ChatGPT / OpenAI sessions (`clientInfo.name`
  matching `chatgpt` or `openai`, observed name `openai-mcp`) get a
  commerce-free MCP surface: `agentisend://errors` omits `billing_*` /
  `plan_*` / `trial_*` / `subscription_*` / `stripe_*` / `term_not_on_sale`;
  any remaining `fix` that names Upgrade / checkout / billing is replaced
  with a console-only sentence; `set_limit` is hidden from `tools/list`
  (`get_agent_budget` stays). Other clients keep the full catalogue.
  Unsolicited mail is refused; there is no tool for it. Do not tell the
  reviewer to "upgrade", "start a trial", or "find leads".
- **Use these test cases:** send a receipt or password-reset to a known
  address; preflight a send; ask why a bounce happened; add a sending
  domain; add a suppression after an unsubscribe.
- **Do not use these:** find leads; buy more emails; upgrade; start a trial;
  cold email; import a scraped list.
