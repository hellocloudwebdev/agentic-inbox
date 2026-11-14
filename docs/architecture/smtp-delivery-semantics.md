# SMTP delivery and retry semantics

## Implemented behavior

- SMTP connection establishment may be retried once for a narrow set of transient socket setup errors (connection reset, timeout, temporary DNS failure, or broken pipe). No message has been submitted at this stage, so this retry cannot duplicate a delivery.
- Once `mailer.send()` begins, the application never automatically retries that message.
- An error during `mailer.send()` is classified as **unknown**, not as a confirmed failure. The SMTP server may have accepted the DATA transaction before the connection was lost.
- HTTP callers receive an explicit conflict response instructing them not to resend until they inspect Zoho Sent.
- Agent and MCP callers receive the same ambiguous-outcome warning.
- A failure before message submission is classified as `not_sent`.

## Why message delivery retries remain disabled

Safe message retry requires one stable idempotency key to be propagated through compose, reply, forward, Agent, and MCP send paths, backed by a durable per-mailbox delivery ledger with payload-hash conflict detection. The ledger needs explicit states such as `submitting`, `accepted`, `unknown`, and `sent_copy_saved`, with reconciliation against Zoho provider state or operator confirmation before any retry of an ambiguous attempt.

The application currently does not have that end-to-end idempotency path, and SMTP does not itself guarantee idempotent message submission. This change therefore implements only safe pre-submission connection retry and explicit ambiguous-outcome handling; it deliberately does not retry a message once `send()` has started.
