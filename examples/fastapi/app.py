"""FastAPI: one POST route that sends a welcome email.

    POST /send  {"email": "ada@example.com", "name": "Ada"}
    200         {"id": "..."}                     accepted
    400         {"error": "..."}                  not one address; the API was not called
    4xx/5xx     {"code": "...", "fix": "..."}     the API refused, and says what to do

Environment: AGENTISEND_API_KEY (a key with sending_access), MAIL_FROM (an
address on a domain you have verified), and optionally AGENTISEND_BASE_URL.
Run: uvicorn app:app
"""

from __future__ import annotations

import os
import re

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agentisend import AgentiSend, AgentiSendError, idempotency_key

agentisend = AgentiSend()  # reads AGENTISEND_API_KEY and AGENTISEND_BASE_URL
MAIL_FROM = os.environ["MAIL_FROM"]

# One address, no spaces, a dot in the domain. The API checks properly; this
# only stops a form typo from costing a request.
ADDRESS = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = FastAPI()


class Signup(BaseModel):
    email: str
    name: str = "there"


@app.post("/send")
def send(signup: Signup) -> JSONResponse:
    email = signup.email.strip()
    if not ADDRESS.match(email):
        return JSONResponse({"error": "email must be one address, like you@example.com"}, status_code=400)

    try:
        sent = agentisend.send_email(
            {
                "from": MAIL_FROM,
                "to": email,
                "subject": "Welcome",
                "text": f"Hi {signup.name}, your account is ready.",
            },
            # Derived from the thing being done, never from the moment: a retry
            # after a timeout replays the first send instead of mailing twice.
            idempotency=idempotency_key("welcome", email),
        )
    except AgentiSendError as err:
        return JSONResponse({"code": err.code, "fix": err.fix}, status_code=err.status)
    return JSONResponse({"id": sent["id"]})
