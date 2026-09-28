"""Drive app.py through FastAPI's own test client, one JSON line per request.

The API it talks to is whatever AGENTISEND_BASE_URL names; the examples suite
points it at a real server with a fake transport. Run: python3 run.py
"""

import json

from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def post(step: str, body: dict) -> None:
    response = client.post("/send", json=body)
    print(json.dumps({"step": step, "status": response.status_code, **response.json()}))


post("send", {"email": "fastapi@example.com", "name": "Ada"})
post("retry", {"email": "fastapi@example.com", "name": "Ada"})
post("invalid", {"email": "not an address"})
# Same address, different body: the idempotency key matches and the payload
# does not, so the API refuses rather than guessing which one was meant.
post("refused", {"email": "fastapi@example.com", "name": "Grace"})
