"""Django: one view that sends a shipping notice from a POST.

    POST /send  {"email": "ada@example.com", "order_id": "1042"}
    200         {"id": "..."}                     accepted
    400         {"error": "..."}                  not one address; the API was not called
    4xx/5xx     {"code": "...", "fix": "..."}     the API refused, and says what to do

In a project, `send` goes in views.py and the path in urls.py; the settings
block below is only there so this file runs on its own, and is skipped when
Django is already configured.

Environment: AGENTISEND_API_KEY (a key with sending_access), MAIL_FROM (an
address on a domain you have verified), and optionally AGENTISEND_BASE_URL.
"""

from __future__ import annotations

import json
import os
import re
import secrets

import django
from django.conf import settings

if not settings.configured:
    settings.configure(
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["localhost"],
        # No sessions or signed cookies here, so a per-process key is enough.
        SECRET_KEY=os.environ.get("DJANGO_SECRET_KEY") or secrets.token_urlsafe(50),
    )
    django.setup()

from django.http import HttpRequest, JsonResponse  # noqa: E402
from django.urls import path  # noqa: E402
from django.views.decorators.csrf import csrf_exempt  # noqa: E402
from django.views.decorators.http import require_POST  # noqa: E402

from agentisend import AgentiSend, AgentiSendError, idempotency_key  # noqa: E402

agentisend = AgentiSend()  # reads AGENTISEND_API_KEY and AGENTISEND_BASE_URL
MAIL_FROM = os.environ["MAIL_FROM"]

# One address, no spaces, a dot in the domain. The API checks properly; this
# only stops a form typo from costing a request.
ADDRESS = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@csrf_exempt  # a JSON endpoint called by your own backend; keep CSRF for browser forms
@require_POST
def send(request: HttpRequest) -> JsonResponse:
    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        body = {}
    email = str(body.get("email", "")).strip()
    order_id = str(body.get("order_id", "")).strip()
    if not ADDRESS.match(email):
        return JsonResponse({"error": "email must be one address, like you@example.com"}, status=400)
    if not order_id:
        return JsonResponse({"error": "order_id is required"}, status=400)

    try:
        sent = agentisend.send_email(
            {
                "from": MAIL_FROM,
                "to": email,
                "subject": f"Order {order_id} has shipped",
                "text": "Tracking details are in your account.",
            },
            # One notice per shipped order: a retry after a timeout replays
            # the first send instead of mailing the customer twice.
            idempotency=idempotency_key("shipped", order_id),
        )
    except AgentiSendError as err:
        return JsonResponse({"code": err.code, "fix": err.fix}, status=err.status)
    return JsonResponse({"id": sent["id"]})


urlpatterns = [path("send", send)]
