"""Flask: one POST route that sends an order receipt.

    POST /send  {"email": "ada@example.com", "order_id": "1042"}
    200         {"id": "..."}                     accepted
    400         {"error": "..."}                  not one address; the API was not called
    4xx/5xx     {"code": "...", "fix": "..."}     the API refused, and says what to do

Environment: AGENTISEND_API_KEY (a key with sending_access), MAIL_FROM (an
address on a domain you have verified), and optionally AGENTISEND_BASE_URL.
Run: flask --app app run
"""

from __future__ import annotations

import os
import re

from flask import Flask, jsonify, request

from agentisend import AgentiSend, AgentiSendError, idempotency_key

agentisend = AgentiSend()  # reads AGENTISEND_API_KEY and AGENTISEND_BASE_URL
MAIL_FROM = os.environ["MAIL_FROM"]

# One address, no spaces, a dot in the domain. The API checks properly; this
# only stops a form typo from costing a request.
ADDRESS = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__)


@app.post("/send")
def send():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip()
    order_id = str(body.get("order_id", "")).strip()
    if not ADDRESS.match(email):
        return jsonify(error="email must be one address, like you@example.com"), 400
    if not order_id:
        return jsonify(error="order_id is required"), 400

    try:
        sent = agentisend.send_email(
            {
                "from": MAIL_FROM,
                "to": email,
                "subject": f"Receipt for order {order_id}",
                "text": f"Thanks for your order. Order {order_id} is paid.",
            },
            # One receipt per order, whoever asks and however often: a retry
            # after a timeout replays the first send instead of mailing twice.
            idempotency=idempotency_key("receipt", order_id),
        )
    except AgentiSendError as err:
        return jsonify(code=err.code, fix=err.fix), err.status
    return jsonify(id=sent["id"])
