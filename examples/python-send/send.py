"""Send one email with AgentiSend from Python, with nothing installed.

Set AGENTISEND_API_KEY and MAIL_FROM (an address on your verified domain), then: python3 send.py
"""
import json
import os
import urllib.error
import urllib.request

BASE_URL = os.environ.get("AGENTISEND_BASE_URL", "https://api.agentisend.com")

request = urllib.request.Request(
    f"{BASE_URL}/emails",
    method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['AGENTISEND_API_KEY']}",
        "Content-Type": "application/json",
        # Named after the send, not the moment: a retry after a timeout replays it instead of mailing twice.
        "Idempotency-Key": "hello/someone@example.com",
    },
    data=json.dumps({
        "from": os.environ["MAIL_FROM"],
        "to": "someone@example.com",
        "subject": "Hello from AgentiSend",
        "text": "Ten minutes, start to sent.",
    }).encode(),
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        print(json.load(response)["id"])
except urllib.error.HTTPError as err:
    # Every refusal carries a code and a fix that says what to do next.
    error = json.load(err).get("error", {})
    raise SystemExit(f"{error.get('code')}: {error.get('fix')}")
