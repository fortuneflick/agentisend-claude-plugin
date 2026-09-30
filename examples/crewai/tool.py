"""CrewAI — one tool that posts to POST /emails, and a scripted agent loop.

`tool.run` is the path a crew uses. The first call sends. The second is a
different message, so a key whose budget is one comes back as
agent_budget_exceeded. No model is called.

The `agentisend` package is not on the Python package index. Install CrewAI
with `pip install crewai`.

AGENTISEND_API_KEY is the agent's key, with sending_access and a budget.
MAIL_FROM is an address on a domain you have verified.
AGENTISEND_BASE_URL is optional.
"""

from __future__ import annotations

import json
import os

from crewai.tools import tool

from agentisend import AgentiSend, AgentiSendError, idempotency_key

agentisend = AgentiSend()
TO = "crewai@example.com"
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


@tool("send email")
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


def run() -> None:
    """Two tool calls, then stop when the second is refused."""
    for call in (UPDATE, CLOSED):
        raw = send_email.run(**call)
        result = json.loads(raw)
        print(json.dumps(result), flush=True)
        if result.get("sent") is False:
            return


if __name__ == "__main__":
    run()
