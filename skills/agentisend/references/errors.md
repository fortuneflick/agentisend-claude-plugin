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
| `invalid_region` | no | Pass region as us or eu in POST /domains. Omitting it stores us. For this release us-east-1, sa-east-1 and ap-northeast-1 map to us, and eu-west-1 maps to eu. |
| `tracking_subdomain_unverified` | no | Publish the tracking CNAME shown by GET /domains/:id, then POST /domains/:id/verify. Tracking starts on the next send. |
| `tracking_subdomain_cannot_be_removed` | no | Pass a new label such as "clicks" in PATCH /domains/:id. To stop counting opens and clicks, turn those switches off instead. |
| `domain_field_immutable` | no | Add a new domain with POST /domains. PATCH /domains/:id accepts click_tracking, open_tracking, tracking_subdomain, and tls_mode only. |
| `open_tracking_on_transactional` | no | Leave open tracking off for receipts, password resets, and alerts. Turn it on for broadcasts if you want open counts. |
| `header_replaced` | no | Nothing to do for this send. To use your own unsubscribe link, send without topic_id and set List-Unsubscribe in headers from a verified domain. |
| `html_clipped_by_gmail` | no | Cut the HTML under 102 KB: inline less CSS, drop comments and whitespace, and link to long content instead of including it. POST /emails/lint checks it before you send. |
| `link_domain_listed` | no | Link to a domain that is not listed, or ask the list to review the domain. Check a domain with POST /emails/preflight before sending. |
| `domain_already_exists` | no | Use the existing domain from GET /domains. A person removes a domain in the console under Domains. |
| `domain_blocklisted` | no | Use a domain that is not listed, or wait until the listing is removed, then POST /domains again. |
| `mailbox_provider_domain` | no | Add a domain you own with POST /domains, such as acme.com or mail.acme.com, and send from an address on it. |
| `template_name_taken` | no | Choose another name, or edit the existing template with PATCH /templates/:id. GET /templates lists them with their ids. |
| `template_in_use` | no | Archive each broadcast named in the message with POST /broadcasts/:id/archive, then delete the template again. |
| `segment_in_use` | no | Archive each broadcast named in the message with POST /broadcasts/:id/archive, or give it another segment with PATCH /broadcasts/:id, then delete the segment again. |
| `contact_resubscribe_required` | no | POST /contacts/:id/resubscribe with consent_source and consent_at after the person opts back in. The id can be the contact id or the email address. A spam report is not lifted by that call. |
| `email_still_scheduled` | no | Cancel it first: POST /emails/:id/cancel, then delete it again. |
| `sending_domain_blocked` | no | Send from a different domain you own. If you believe this is a mistake, contact support and name the domain. |
| `young_domain_held` | no | Mail from your other verified domains still sends. Write to hello@agentisend.com and name this domain. |
| `domain_verified_elsewhere` | no | Contact support to move the domain. We cannot verify it here while another account already has it verified. |
| `domain_not_verified` | no | If it is pending, publish the required records from GET /domains/:id; checks continue for 72 hours. Test now by sending to an address ending in @simulator.agentisend.com. If it is not registered, POST /domains first. If it is failed, GET /domains/:id names the record to fix, then POST /domains/:id/verify to reopen the window. |
| `onboarding_recipient_not_a_member` | no | Send to a member sign-in address, or verify a domain with POST /domains and send from that domain. |
| `onboarding_shape_refused` | no | Omit those fields, or verify a domain with POST /domains and send from that domain. |
| `onboarding_daily_cap_reached` | wait 86400s | Wait until tomorrow (UTC), or verify a domain with POST /domains and send from that domain. |
| `onboarding_sender_unavailable` | no | Send to an address ending in @simulator.agentisend.com, or verify a domain with POST /domains and send from that domain. |
| `dns_unreachable` | wait 300s | Wait; checks continue on their own. Retry this call after the seconds given in Retry-After. |
| `dkim_key_mismatch` | no | Replace that TXT record with the value shown on GET /domains/:id, then POST /domains/:id/verify. |
| `domain_check_window_expired` | no | Publish the required records from GET /domains/:id, then POST /domains/:id/verify. That reopens the window for another 72 hours. |
| `return_path_subdomain_in_use` | no | Pass return_path_subdomain on POST /domains: a label of up to 63 characters that starts with a letter. send is the default; bounce is the usual choice when send already has an MX. |
| `spf_conflict` | no | Replace the existing TXT with the merged record we return. This is advice: the domain can verify and send without the apex SPF once the return-path records resolve. |
| `spf_lookup_limit` | no | Do not add a second SPF record. Rely on the return-path SPF, which is required anyway. The apex SPF is advice and never blocks sending. |
| `service_unavailable` | no | Retry after the seconds given in Retry-After. If it persists beyond a few minutes, check the public status page (GET /status) for the affected component. |
| `account_suspended` | no | Read the enforcement policy at https://agentisend.com/policy/enforcement, then contact hello@agentisend.com to appeal. |
| `account_sandboxed` | no | Verify the recipient domain with POST /domains + POST /domains/:id/verify, or file POST /trust/appeal for a person to review this account. |
| `review_sandbox_recipient_only` | no | Send to an address ending in @simulator.agentisend.com, or to reviewer@agentisend.com. Delivering to anyone else needs an account of your own: sign up at agentisend.com. |
| `trust_throttled` | no | Send volume is temporarily capped because deliverability metrics crossed a published threshold. Check GET /trust/standing for the metric and value, file POST /trust/appeal if this is unexpected. |
| `suppressed_recipient` | no | GET /suppressions says which address and why. A hard bounce you have fixed can be cleared with DELETE /suppressions/:id; an unsubscribe or a spam complaint cannot — that address asked not to be contacted. |
| `content_refused` | no | The message names the field and what matched in it. Remove or change that part and send again. POST /emails/preflight runs the same check without sending anything. |
| `recipient_blocklisted` | no | Send to a different address. An address ending in @simulator.agentisend.com is never blocked. |
| `missing_api_key` | no | Create an API key at https://console.agentisend.com/api-keys and send "Authorization: Bearer as_...". MCP clients can connect with OAuth instead of a key. |
| `session_required` | no | Sign in to the console, then retry. API keys cannot call this route. |
| `human_action_required` | no | Ask whoever runs this account to do it in the console. Scoping the key differently does not change the answer, and retrying fails the same way. |
| `csrf_origin_rejected` | no | Call the API with an API key (Authorization: Bearer …) instead of a session cookie, or make the request from the console. Create a key in the console under Settings, API keys. |
| `mfa_required` | no | Finish signing in at https://console.agentisend.com/verify with a code from your authenticator app, or one of your recovery codes. Manage the second factor in the console under Settings, Security. |
| `billing_not_configured` | no | GET /billing/plan still works, and the account stays on Free. |
| `charge_not_this_account` | no | Open the account and refund a payment listed on it. |
| `plan_not_purchasable` | no | Pass one of the tier ids listed under `plans` by GET /billing/plan (starter, pro, scale) to POST /billing/checkout. |
| `overage_cap_reached` | no | Raise the overage ceiling or move up a plan in Settings → Billing, or wait until the reset date in this error. |
| `overage_not_on_plan` | no | Choose a paid plan in Settings → Billing, then turn overage on. |
| `daily_limit_reached` | no | Wait for 00:00 UTC, or upgrade in Settings → Billing — every paid plan has no daily cap. |
| `term_not_on_sale` | no | Pass one of the terms listed under `terms_on_sale` by GET /billing/plan (monthly and yearly) to POST /billing/checkout. |
| `subscription_active` | no | Change plans with POST /billing/portal. The billing portal prorates the change and shows the amount before it is confirmed. Checkout is only for an account with no subscription. |
| `billing_customer_missing` | no | Start a subscription with POST /billing/checkout first; the customer portal only exists once a checkout has run. |
| `stripe_signature_invalid` | no | Only the billing service calls POST /webhooks/stripe. Use the signing secret for this endpoint in this mode, and deliver the body unmodified. |
| `invalid_api_key` | no | Create a new key with POST /api-keys; deleted keys cannot be restored. |
| `restricted_api_key` | no | Use a full_access key (POST /api-keys with permission=full_access) for management endpoints. |
| `insufficient_role` | no | Ask an owner to make the change, or to raise your role with PATCH /team/members/:id. |
| `last_owner_required` | no | Promote another member to owner with PATCH /team/members/:id first, then retry. |
| `seat_limit_reached` | no | Remove a member with DELETE /team/members/:id, cancel a pending invite with DELETE /team/invites/:id, or move to a plan with more seats. Seats are never billed per seat. |
| `invite_limit_reached` | wait 3600s | Wait the seconds given and invite again. A cancelled invitation still counts for 24 hours. Someone who already has an invitation can use the link in it. |
| `invite_not_valid` | no | Ask an owner or admin to send a new one with POST /team/invites. |
| `invite_email_mismatch` | no | Sign out, sign in as the invited address, then open the invitation link again — POST /invite/:token/accept binds the membership to the signed-in address. |
| `already_in_account` | no | Leave the current account first, or ask the inviter to send the invitation to an address that has no account. |
| `domain_scope_violation` | no | Send from the scoped domain, or create a key without a domain scope via POST /api-keys. |
| `not_found` | no | List that resource on this account and use an id from the list. For a domain, GET /domains accepts the id or the domain name. A path that is not a route is a typo in the URL. |
| `session_expired` | no | Reconnect your AI client so it opens a new connection, then retry the request. |
| `payload_too_large` | no | Send a smaller body. Most endpoints accept 1 MB. Sends (POST /emails, /emails/batch, replies) and template, broadcast and automation edits accept 50 MB, which fits 40 MB of attachments after base64. /mcp accepts 1 MB per JSON-RPC call. |
| `unsupported_media_type` | no | Send the body as JSON with `Content-Type: application/json`. |
| `method_not_allowed` | no | Use a method listed in Allow for this route. |
| `idempotency_in_flight` | wait 5s | Wait and retry with the same Idempotency-Key to receive the original response. |
| `idempotency_payload_mismatch` | no | Reuse the exact same body for retries, or send a new Idempotency-Key for a new request. |
| `agent_budget_exceeded` | no | Wait for the period to reset — get_agent_budget and GET /limits/keys/:id both say when. Raising a budget is a person’s decision, made in the console; a key cannot raise its own. |
| `plan_limit_reached` | no | Upgrade in Settings → Billing, or wait until the reset date in this error. |
| `key_budget_exceeds_plan` | no | Set a whole number at or below the plan inclusion, or upgrade in Settings → Billing. |
| `domain_limit_reached` | no | Remove a domain in the console under Domains, or upgrade in Settings → Billing. |
| `dedicated_ip_assigned_by_us` | no | Ask support for a dedicated IP (available on Scale, about $30 a month, warmup included). Once it is assigned, GET /dedicated-ips lists it and GET /dedicated-ips/ramp shows the warmup curve it follows. |
| `webhook_endpoint_limit_reached` | no | Delete an endpoint you no longer use with DELETE /webhooks/:id, or send more event types to one you keep — an endpoint takes a list of events. |
| `rate_ceiling_exceeded` | wait 60s | Wait the seconds below and send the same request again. Raising the ceiling is a person’s decision, made in the console; a key cannot raise its own. |
| `daily_quota_exceeded` | no | Upgrade the plan or wait for the UTC reset; see GET /usage for what this account has spent. |
| `monthly_quota_exceeded` | no | Upgrade the plan or wait for the cycle reset; see GET /usage for what this account has spent. |
| `rate_limiter_unavailable` | wait 5s | Retry in a few seconds. Nothing was sent and nothing was changed — writes are refused rather than run unmetered against a shared sending reputation. |
| `rate_limit_exceeded` | wait 60s | Back off and retry honoring the Retry-After header. |
| `approval_required` | no | Do not send it again: a person approves or rejects it in the console under Agents → Approvals, and approving sends it — the message then appears in GET /emails. action_id in this error names the held send; the key that asked cannot approve itself, and a retry waits on the same approval. |
| `approval_expired` | no | Send the message again if it should still go out. A hold lasts 24 hours unless the send named an earlier time. |
| `trust_paused` | no | Review reasons via GET /trust/standing, then file an appeal via POST /trust/appeal. |
| `kill_switch_active` | no | Read GET /trust/standing for why it was paused. Only a person signed in to the console can resume it; the paused key cannot resume itself. |
| `sending_paused_everywhere` | wait 300s | Retry the same request, with the same Idempotency-Key, after the seconds given in Retry-After. Scheduled sends wait and go out once sending resumes. |
| `internal_server_error` | no | Retry ONCE after a short pause, with the same Idempotency-Key so the retry cannot double-send. If it fails again, stop retrying and report the x-request-id from the response — that id is what identifies this exact failure in support. |
| `support_ticket_not_found` | no | Open Support in the console and pick a request from the list, or start a new one. |
| `support_closed` | no | Start a new request from Support in the console. If this one was resolved in the last 14 days, reopen it first. |
| `support_reopen_expired` | no | A request can be reopened within 14 days of being marked resolved. Start a new request from Support in the console. |
| `support_merge_conflict` | no | Merge only requests from the same account. |
| `support_reply_too_soon` | no | Reload the request and read the latest reply. To send a second reply anyway, send it again with allow_rapid_second set to true. |
| `support_draft_unavailable` | no | Write the reply by hand. When drafting is off, it turns on once the server has a drafting key configured. |
| `support_upload_rejected` | no | Attach a screenshot, PDF, CSV or log file up to 10 MB. Up to 5 files, 25 MB in total, per message. |
| `support_upload_too_large` | no | Remove a file or send a smaller one. Each file must be 10 MB or smaller, and the message 25 MB in total. |
| `support_attachment_expired` | no | Ask the person who uploaded it to send the file again on the request. |
| `support_rate_limited` | wait 3600s | Wait and try again. You can open 5 new requests an hour and send 30 replies an hour. |
| `sign_in_check_required` | no | Complete the check on the sign-in page, then ask for another code with the token it returns. |
