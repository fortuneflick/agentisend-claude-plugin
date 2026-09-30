"""OpenAI Agents SDK — one function tool that posts to POST /emails.

The loop invokes the tool through the SDK's own `on_invoke_tool`, which is
the path a run uses after the model emits a tool call. The first call sends.
The second is a different message, so a key whose budget is one comes back
as agent_budget_exceeded. No model is called.

The `agentisend` package is not on the Python package index. Install the
Agents SDK with `pip install openai-agents`.

AGENTISEND_API_KEY is the agent's key, with sending_access and a budget.
MAIL_FROM is an address on a domain you have verified.
AGENTISEND_BASE_URL is optional.
"""

from __future__ import annotations

import asyncio
import json
import os

from agents import function_tool
from agents.tool_context import ToolContext

from agentisend import AgentiSend, AgentiSendError, idempotency_key

agentisend = AgentiSend()
TO = "openai-agents@example.com"
UPDATE = {
    "to": TO,
    "subject": "Ticket 4182 — we are looking into it",
    "text": "Someone from support will reply within the hour.",
    "purpose": "ticket-4182-update",
}
CLOSED = {
    "to": TO,
    "subject": "Ticket 4182 — closed",
    "text": "The ticket is closed.",
    "purpose": "ticket-4182-closed",
}


@function_tool
def send_email(to: str, subject: str, text: str, purpose: str) -> str:
    """Send one email to a person who asked for it.

    Returns the message id, or a refusal with a code and a fix. When the fix
    says a person decides, stop and report it: calling again will not change
    the answer.
    """
    try:
        sent = agentisend.send_email(
            {"from": os.environ["MAIL_FROM"], "to": to, "subject": subject, "text": text},
            idempotency=idempotency_key(purpose, to),
        )
    except AgentiSendError as err:
        return json.dumps({"sent": False, "code": err.code, "fix": err.fix})
    return json.dumps({"sent": True, "id": sent["id"]})


async def _once(arguments: dict) -> dict:
    ctx = ToolContext(
        context=None,
        tool_name="send_email",
        tool_call_id="call_" + arguments["purpose"],
        tool_arguments=json.dumps(arguments),
    )
    raw = await send_email.on_invoke_tool(ctx, json.dumps(arguments))
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"tool returned {raw!r}")
    return parsed


def run() -> None:
    """Two tool calls through the SDK, then stop on the refusal."""

    async def loop() -> None:
        for call in (UPDATE, CLOSED):
            result = await _once(call)
            print(json.dumps(result))
            if result.get("sent") is False:
                return

    asyncio.run(loop())


if __name__ == "__main__":
    run()
