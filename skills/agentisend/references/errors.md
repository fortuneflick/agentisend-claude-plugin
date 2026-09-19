# AgentiSend errors — what each one means and what to do

Generated from the error catalogue the API answers with. Branch on `code`,
never on the message text.

**Retryable means waiting can help.** Everything marked "no" needs a
different action or a person; retrying it is a loop against the thing that
stopped you.

| Code | Retryable | What to do |
|---|---|---|
| `validation_error` | no | Correct the fields listed in the error details and retry the request. |
| `invalid_idempotency_key` | no | Send a non-empty Idempotency-Key header of at most 256 characters. |
| `missing_required_field` | no | Include from, to and subject in POST /emails. |
| `invalid_from_address` | no | Use a plain address or "Name <addr@domain>" format in POST /emails. |
| `invalid_parameter` | no | Correct the named parameter and retry. |
| `invalid_cursor` | no | Call the list again without a cursor, or pass the next_cursor from a page you still have. |
| `invalid_attachment` | no | Provide attachment.content or attachment.path in POST /emails. |
| `invalid_region` | no | Pass region as us (Oregon) or eu (Helsinki) in POST /domains. Omitting it stores us. For this release us-east-1, sa-east-1 and ap-northeast-1 map to us, and eu-west-1 maps to eu. |
| `tracking_subdomain_unverified` | no | Publish the tracking CNAME shown by GET /domains/:id, then POST /domains/:id/verify. Tracking starts on the next send. |
| `tracking_subdomain_cannot_be_removed` | no | Pass a new label such as "clicks" in PATCH /domains/:id. To stop counting opens and clicks, turn those switches off instead. |
| `domain_field_immutable` | no | Add a new domain with POST /domains. PATCH /domains/:id accepts click_tracking, open_tracking, and tracking_subdomain only. |
| `open_tracking_on_transactional` | no | Leave open tracking off for receipts, password resets, and alerts. Turn it on for broadcasts if you want open counts. |
| `domain_already_exists` | no | Use the existing domain from GET /domains, or remove it with DELETE /domains/:id first. |
| `domain_verified_elsewhere` | no | Contact support to move the domain. We cannot verify it here while another account already has it verified. |
| `domain_not_verified` | no | If it is pending, publish the required records from GET /domains/:id; checks continue for 72 hours. Test now by sending to an address ending in @simulator.agentisend.com. If it is not registered, POST /domains first. If it is failed, GET /domains/:id names the record to fix, then POST /domains/:id/verify to reopen the window. |
| `dns_unreachable` | wait 300s | Wait; checks continue on their own. Retry this call after the seconds given in Retry-After. |
| `dkim_key_mismatch` | no | Replace that TXT record with the value shown on GET /domains/:id, then POST /domains/:id/verify. |
| `domain_check_window_expired` | no | Publish the required records from GET /domains/:id, then POST /domains/:id/verify. That reopens the window for another 72 hours. |
| `service_unavailable` | no | Retry after the seconds given in Retry-After. If it persists beyond a few minutes, check the public status page (GET /status) for the affected component. |
| `account_suspended` | no | Suspensions follow the published enforcement policy (docs/TRUST-SAFETY). Contact support to appeal; unused prepaid balance is refunded on termination. |
| `account_sandboxed` | no | Verify the recipient domain with POST /domains + POST /domains/:id/verify, or file POST /trust/appeal for a person to review this account. |
| `trust_throttled` | no | Send volume is temporarily capped because deliverability metrics crossed a published threshold. Check GET /trust/standing for the metric and value, file POST /trust/appeal if this is unexpected. |
| `suppressed_recipient` | no | GET /suppressions says which address and why. A hard bounce you have fixed can be cleared with DELETE /suppressions/:id; an unsubscribe or a spam complaint cannot — that address asked not to be contacted. |
| `missing_api_key` | no | Sign in at /login so the console sends its session cookie, or create a key with POST /api-keys and send "Authorization: Bearer as_...". |
| `session_required` | no | Sign in to the console, then retry. API keys cannot call this route. |
| `human_action_required` | no | Ask whoever runs this account to do it in the console. Scoping the key differently does not change the answer, and retrying fails the same way. |
| `csrf_origin_rejected` | no | Call the API with an API key (Authorization: Bearer …) instead of a session cookie, or make the request from the console. Create a key in the console under Settings, API keys. |
| `mfa_required` | no | Finish signing in at /verify with a code from your authenticator app, or one of your recovery codes. Manage the second factor in the console under Settings, Security. |
| `billing_not_configured` | no | The operator must set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (docs/STRIPE.md §4). Until then nothing can be bought; GET /billing/plan still answers and the 14-day Pro trial still starts. |
| `plan_not_purchasable` | no | Pass one of the tier ids listed under `plans` by GET /billing/plan (starter, pro, scale) to POST /billing/checkout. |
| `plan_required` | no | A person on this account chooses a plan, or starts the 14-day Pro trial, in the console under Settings → Billing. Simulation sends keep working meanwhile. |
| `trial_already_used` | no | Choose a plan in the console under Settings → Billing; POST /billing/checkout starts the payment. |
| `plan_already_active` | no | Nothing to start. GET /billing/plan shows the plan, and plan changes are made in the console under Settings → Billing. |
| `term_not_on_sale` | no | Pass one of the terms listed under `terms_on_sale` by GET /billing/plan (monthly and yearly) to POST /billing/checkout. |
| `subscription_active` | no | Change plans with POST /billing/portal — the Stripe customer portal prorates the change and shows the amount before it is confirmed. Checkout is only for an account with no subscription. |
| `billing_customer_missing` | no | Start a subscription with POST /billing/checkout first; the customer portal only exists once a checkout has run. |
| `stripe_signature_invalid` | no | Only Stripe calls POST /webhooks/stripe. If you are Stripe: the endpoint secret configured as STRIPE_WEBHOOK_SECRET must be the whsec_ of THIS endpoint in THIS mode (test and live differ), and the body must be delivered unmodified. |
| `invalid_api_key` | no | Create a new key with POST /api-keys; deleted keys cannot be restored. |
| `restricted_api_key` | no | Use a full_access key (POST /api-keys with permission=full_access) for management endpoints. |
| `insufficient_role` | no | Ask an owner to make the change, or to raise your role with PATCH /team/members/:id. |
| `last_owner_required` | no | Promote another member to owner with PATCH /team/members/:id first, then retry. |
| `seat_limit_reached` | no | Remove a member with DELETE /team/members/:id, cancel a pending invite with DELETE /team/invites/:id, or move to a plan with more seats. Seats are never billed per seat. |
| `invite_not_valid` | no | Ask an owner or admin to send a new one with POST /team/invites. |
| `invite_email_mismatch` | no | Sign out, sign in as the invited address, then open the invitation link again — POST /invite/:token/accept binds the membership to the signed-in address. |
| `already_in_account` | no | Leave the current account first, or ask the inviter to send the invitation to an address that has no account. |
| `domain_scope_violation` | no | Send from the scoped domain, or create a key without a domain scope via POST /api-keys. |
| `not_found` | no | Check the path against GET /openapi.json and the resource id against your account. |
| `session_expired` | no | Reconnect your AI client so it opens a new connection, then retry the request. |
| `payload_too_large` | no | Send a smaller body. Limits are per endpoint — /mcp accepts 1 MB per JSON-RPC call, and attachments belong on POST /emails, which accepts 40 MB after base64. |
| `unsupported_media_type` | no | Send the body as JSON with `Content-Type: application/json`. |
| `method_not_allowed` | no | Use a method listed in Allow for this route. |
| `idempotency_in_flight` | wait 5s | Wait and retry with the same Idempotency-Key to receive the original response. |
| `idempotency_payload_mismatch` | no | Reuse the exact same body for retries, or send a new Idempotency-Key for a new request. |
| `agent_budget_exceeded` | no | Wait for the period to reset — get_agent_budget and GET /limits/keys/:id both say when. Raising a budget is a person’s decision, made in the console; a key cannot raise its own. |
| `plan_limit_reached` | no | Upgrade in Settings → Billing, or wait until the reset date in this error. |
| `key_budget_exceeds_plan` | no | Set a whole number at or below the plan inclusion, or upgrade in Settings → Billing. |
| `domain_limit_reached` | no | Delete a domain with DELETE /domains/:id, or upgrade in Settings → Billing. |
| `rate_ceiling_exceeded` | wait 60s | Wait the seconds below and send the same request again. Raising the ceiling is a person’s decision, made in the console; a key cannot raise its own. |
| `daily_quota_exceeded` | no | Upgrade the plan or wait for the UTC reset; see GET /usage for what this account has spent. |
| `monthly_quota_exceeded` | no | Upgrade the plan or wait for the cycle reset; see GET /usage for what this account has spent. |
| `rate_limiter_unavailable` | wait 5s | Retry in a few seconds. Nothing was sent and nothing was changed — writes are refused rather than run unmetered against a shared sending reputation. |
| `rate_limit_exceeded` | wait 60s | Back off and retry honoring the Retry-After header. |
| `approval_required` | no | It is waiting in the console approvals inbox; GET /agent-actions shows it and what it says. A person decides — the key that asked cannot approve itself. |
| `trust_paused` | no | Review reasons via GET /trust/standing, then file an appeal via POST /trust/appeal. |
| `kill_switch_active` | no | Read GET /trust/standing for why it was paused. Only a person signed in to the console can resume it; the paused key cannot resume itself. |
| `internal_server_error` | no | Retry ONCE after a short pause, with the same Idempotency-Key so the retry cannot double-send. If it fails again, stop retrying and report the x-request-id from the response — that id is what identifies this exact failure in support. |
| `support_ticket_not_found` | no | Open Support in the console and pick a request from the list, or start a new one. |
| `support_closed` | no | Start a new request from Support in the console. If this one was resolved in the last 14 days, reopen it first. |
| `support_reopen_expired` | no | A request can be reopened within 14 days of being marked resolved. Start a new request from Support in the console. |
| `support_merge_conflict` | no | Merge only requests from the same account. |
| `support_upload_rejected` | no | Attach a screenshot, PDF, CSV or log file up to 10 MB. Up to 5 files, 25 MB in total, per message. |
| `support_upload_too_large` | no | Remove a file or send a smaller one. Each file must be 10 MB or smaller, and the message 25 MB in total. |
| `support_attachment_expired` | no | Ask the person who uploaded it to send the file again on the request. |
| `support_rate_limited` | wait 3600s | Wait and try again. You can open 5 new requests an hour and send 30 replies an hour. |
