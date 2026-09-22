"""An AI agent that sends email through its own budgeted key, in Python.

Standard library only, so it runs anywhere Python 3.11 runs; the same three
requests work from FastAPI, Django, a LangChain tool or a cron job:

    POST  /api-keys              a key scoped to sending, and nothing else
    PATCH /limits/keys/{id}      a hard ceiling for the period, and a rate
    POST  /emails                the agent sends through its own key

The last part is the point. An agent stuck in a retry loop sends the same
message again and again; after the third near-identical send inside the window
the API refuses the fourth, holds it for a person to approve, and answers
`approval_required` with a `fix` that names the call which resolves it. Nothing
was delivered, and the agent is told what to do rather than left to guess.

Environment: AGENTISEND_API_KEY (your own key, full access; the agent never
sees it), MAIL_FROM (an address on a domain you have verified), and optionally
AGENTISEND_BASE_URL. Run: python3 agent.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("AGENTISEND_BASE_URL", "https://api.agentisend.com")


class Refused(Exception):
    """A 4xx or 5xx from the API. Every one carries code, message and fix."""

    def __init__(self, status: int, body: dict) -> None:
        error = body.get("error", {})
        self.status = status
        self.code = error.get("code", "unknown")
        self.fix = error.get("fix", "")
        super().__init__(error.get("message", f"HTTP {status}"))


def call(key: str, method: str, path: str, body: dict | None = None, idempotency_key: str | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE_URL + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {key}")
    request.add_header("Content-Type", "application/json")
    if idempotency_key:
        # Derived from the thing being done, never from the moment: a retry
        # after a timeout replays the first send instead of mailing twice.
        request.add_header("Idempotency-Key", idempotency_key)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        raise Refused(err.code, json.loads(err.read() or b"{}")) from None


def main() -> int:
    owner_key = os.environ["AGENTISEND_API_KEY"]  # yours; the agent never holds it
    mail_from = os.environ["MAIL_FROM"]
    to = "customer-py@example.com"

    # 1. A key the agent holds. `sending_access` cannot read your log, touch
    #    your domains, or mint further keys.
    key = call(owner_key, "POST", "/api-keys", {"name": "support-triage-agent-py", "permission": "sending_access"})

    # 2. A ceiling. The agent cannot spend past it, whatever it decides to do.
    limit = call(owner_key, "PATCH", f"/limits/keys/{key['id']}",
                 {"budget_per_period": 50, "period": "daily", "rate_ceiling_per_minute": 10})

    # 3. The agent, holding only its own key.
    agent_key = key["token"]
    message = {
        "from": mail_from,
        "to": to,
        "subject": "Ticket 4182, we are looking into it",
        "text": "Someone from support will reply within the hour.",
    }
    first = call(agent_key, "POST", "/emails", message, idempotency_key="ticket-4182/first")
    print(json.dumps({"step": "send", "id": first["id"], "budget_per_period": limit["budget_per_period"]}))

    # 4. The failure mode this exists for: the agent loops. Same recipient,
    #    same body, over and over. The guard refuses before the fourth copy
    #    reaches anyone.
    sends = 1
    for _ in range(10):
        try:
            call(agent_key, "POST", "/emails", message)
            sends += 1
        except Refused as refusal:
            if refusal.code == "approval_required":
                print(json.dumps({
                    "step": "refused",
                    "api_key_id": key["id"],
                    "first_message_id": first["id"],
                    "sends_before_refusal": sends,
                    "code": refusal.code,
                    "status": refusal.status,
                    "message": str(refusal),
                    "fix": refusal.fix,
                }))
                return 0
            raise
    print(json.dumps({"step": "error", "message": "the loop guard did not refuse a repeated send"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
