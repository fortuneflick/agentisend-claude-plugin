"""Drive app.py through Flask's own test client, one JSON line per request.

The API it talks to is whatever AGENTISEND_BASE_URL names; the examples suite
points it at a real server with a fake transport. Run: python3 run.py
"""

import json

from app import app

client = app.test_client()


def post(step: str, body: dict) -> None:
    response = client.post("/send", json=body)
    print(json.dumps({"step": step, "status": response.status_code, **response.get_json()}))


post("send", {"email": "flask@example.com", "order_id": "1042"})
post("retry", {"email": "flask@example.com", "order_id": "1042"})
post("invalid", {"email": "flask@", "order_id": "1043"})
# The same order's receipt to a different address: the idempotency key
# matches and the payload does not, so the API refuses instead of sending.
post("refused", {"email": "flask-other@example.com", "order_id": "1042"})
