# Mailbox persistence boundaries

## Decision

Do not add a Neon outbox for email synchronization in the current architecture. Neon and Mailbox Durable Objects are separate stores with distinct responsibilities; email records are not dual-written to Neon.

## Current source-of-truth boundaries

- **Neon PostgreSQL** is the source of truth for the mailbox catalogue and mailbox settings, including app-level settings such as MCP key metadata and Agent conversation metadata.
- **Mailbox Durable Object SQLite** is the source of truth for mailbox folders, email records, thread metadata, attachment metadata, and attachment chunks.
- **Zoho SMTP** is the external delivery system for outbound mail. A Sent-folder copy is written to the corresponding Mailbox Durable Object after SMTP acceptance.
- **Cloudflare Email Routing** delivers inbound raw messages to the Worker; the Worker resolves the mailbox in Neon and writes the parsed message and attachments to that mailbox's Durable Object.

## Why Phase 5.2 does not apply

Inspected write paths do not synchronize email rows or attachment chunks from a Durable Object into Neon, nor do they store those records in Neon first. Neon is consulted to resolve mailbox metadata and permissions; the email payload itself is stored in a single Mailbox Durable Object. A transactional outbox in Neon would therefore add a new second persistence path and failure modes without repairing an existing dual-write.

## Revisit criteria

Introduce an outbox only if a product requirement adds an actual downstream projection or replication target, such as cross-mailbox global search, analytics, or a separate search index. In that case, write the outbox record in the same transaction as the authoritative source write, use a stable event id, process with bounded retries, make consumers idempotent, and provide reconciliation for stuck/dead-lettered events. Do not make Neon a second source of truth for email content by default.
