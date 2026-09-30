"""Verify an AgentiSend delivery with the standard library.

HMAC-SHA256 over `<unix seconds>.<raw body>`, header `t=<unix seconds>,v1=<hex>`.
Reject a timestamp more than five minutes off. Compare in constant time.

The examples suite sets WEBHOOK_SECRET, WEBHOOK_SIGNATURE, WEBHOOK_BODY and
WEBHOOK_NOW_SECONDS, then reads `ok` or `rejected`.
"""
import hashlib
import hmac
import os
import sys

TOLERANCE_SECONDS = 5 * 60


def accept_delivery(secret: str, signature: str, raw_body: str, now_seconds: int) -> bool:
    timestamp = None
    provided = []
    for part in signature.split(","):
        key, _, value = part.partition("=")
        if key == "t":
            timestamp = int(value) if value.isdigit() else None
        elif key == "v1" and value:
            provided.append(value)
    if timestamp is None or not provided:
        return False
    if abs(now_seconds - timestamp) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.{raw_body}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return any(hmac.compare_digest(expected, item) for item in provided)


def main() -> int:
    secret = os.environ["WEBHOOK_SECRET"]
    signature = os.environ["WEBHOOK_SIGNATURE"]
    raw_body = os.environ["WEBHOOK_BODY"]
    now_seconds = int(os.environ["WEBHOOK_NOW_SECONDS"])
    ok = accept_delivery(secret, signature, raw_body, now_seconds)
    sys.stdout.write("ok\n" if ok else "rejected\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
