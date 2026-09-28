"""Drive app.py through Django's own test client, one JSON line per request.

The API it talks to is whatever AGENTISEND_BASE_URL names; the examples suite
points it at a real server with a fake transport. Run: python3 run.py
"""

import json

import app  # noqa: F401  configures Django and registers the view
from django.test import Client
from django.test.utils import setup_test_environment

setup_test_environment()  # lets the test client's host through ALLOWED_HOSTS
client = Client()


def post(step: str, body: dict) -> None:
    response = client.post("/send", data=body, content_type="application/json")
    print(json.dumps({"step": step, "status": response.status_code, **response.json()}))


post("send", {"email": "django@example.com", "order_id": "2042"})
post("retry", {"email": "django@example.com", "order_id": "2042"})
post("invalid", {"email": "django at example.com", "order_id": "2043"})
# The same order's notice to a different address: the idempotency key
# matches and the payload does not, so the API refuses instead of sending.
post("refused", {"email": "django-other@example.com", "order_id": "2042"})
