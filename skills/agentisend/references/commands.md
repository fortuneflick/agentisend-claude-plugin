# AgentiSend CLI — every command

Generated from the CLI command table. Options not listed here are refused
before anything runs, so a typo cannot become a send with a field missing.

## Global options

- `--json`
- `--help`
- `--profile`
- `--api-key`
- `--base-url`

Output is JSON whenever stdout is not a terminal; `--json` forces it. Errors
are one line of JSON on stderr carrying `code`, `message` and `fix`. Exit
codes: 0 ok, 1 the API refused, 2 you made a mistake.

## Commands

### `agentisend emails send`

Send one email. Use - with --text-file/--html-file to read the body from stdin.

Options: `--from`, `--to`, `--cc`, `--bcc`, `--reply-to`, `--subject`, `--html`, `--text`, `--html-file`, `--text-file`, `--tag`, `--scheduled-at`, `--idempotency-key`

### `agentisend emails get`

Fetch one message by id.

### `agentisend emails list`

List messages, newest first.

Options: `--status`, `--limit`, `--to`

### `agentisend emails cancel`

Cancel a scheduled or queued message.

### `agentisend emails explain`

Why a message ended the way it did, with the fix as callable steps.

### `agentisend domains list`

List sending domains and their status.

### `agentisend domains verify`

Re-check a domain's DNS records.

### `agentisend webhooks listen`

Verify deliveries locally and forward them to your app with the same headers and bytes.

Options: `--secret`, `--forward-to`, `--port`, `--verify-only`

### `agentisend receiving listen`

Stream inbound messages as NDJSON, one JSON object per line.

Options: `--interval`, `--limit`, `--to`, `--once`

### `agentisend limits kill`

Stop a key sending, immediately.

Options: `--reason`

### `agentisend limits resume`

Undo a kill switch. A person signed in to the console does this; a key is refused.

### `agentisend trust standing`

This account's standing and the reasons behind it.

### `agentisend doctor`

Check credentials, reachability, kill switch, budget, domains and standing.

### `agentisend profile list`

Show configured profiles and which is current.

### `agentisend profile use`

Switch the current profile.

### `agentisend profile set`

Create or update a profile. The key is stored 0600 and never printed back.

Options: `--api-key`, `--base-url`

### `agentisend completions`

Print a completion script for bash, zsh or fish.
