"""LangChain — one tool that posts to POST /emails, and a scripted agent loop.

The loop is the two calls a model would make. The first sends. The second is
a different message, so a key whose budget is one comes back as
agent_budget_exceeded. No model is called.

The `agentisend` package is not on the Python package index. The suite puts
its directory on PYTHONPATH. Install LangChain with `pip install langchain-core`.

AGENTISEND_API_KEY is the agent's key, with sending_access and a budget.
MAIL_FROM is an address on a domain you have verified.
AGENTISEND_BASE_URL is optional.
"""

from __future__ import annotations

import json
import os

from langchain_core.tools import tool

from agentisend import AgentiSend, AgentiSendError, idempotency_key

agentisend = AgentiSend()
TO = "langchain-py@example.com"
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


@tool
def send_email(to: str, subject: str, text: str, purpose: str) -> dict:
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
        return {"sent": False, "code": err.code, "fix": err.fix}
    return {"sent": True, "id": sent["id"]}


def run() -> None:
    """Two tool calls, then stop when the second is refused."""
    for call in (UPDATE, CLOSED):
        result = send_email.invoke(call)
        print(json.dumps(result))
        if result.get("sent") is False:
            return


if __name__ == "__main__":
    run()
