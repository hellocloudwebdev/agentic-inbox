# Storage Architecture & R2 Migration Record

**Repository:** `hellocloudwebdev/agentic-inbox`  
**Status:** Migration completed  
**Last reviewed:** 2026-11-10

This document records the completed move away from the original R2-backed mailbox and attachment storage design. It is a historical implementation record, not a pending migration plan.

## Current architecture

Agentic Inbox separates global mailbox configuration from mailbox-local email data:

| Data | Current owner | Notes |
|---|---|---|
| Mailbox registry | Neon PostgreSQL | Normalized mailbox IDs and mailbox records |
| Mailbox settings | Neon PostgreSQL | Per-mailbox configuration |
| Application settings | Neon PostgreSQL | Shared application configuration |
| Email records and folders | Mailbox Durable Object SQLite | One Durable Object instance per mailbox |
| Attachment metadata | Mailbox Durable Object SQLite | Linked to email records |
| Attachment binary content | Mailbox Durable Object SQLite | Sequential 1 MiB chunks |
| AI agent conversation state | EmailAgent Durable Object | Managed by the Cloudflare Agents SDK |

The application uses `@neondatabase/serverless` for database access from Workers. Email and attachment data are served through the mailbox Durable Object rather than an R2 bucket.

## Migration outcome

The implementation now uses the following replacements for the original R2 responsibilities:

| Former R2 responsibility | Current implementation |
|---|---|
| List and look up mailboxes | Neon mailbox repository |
| Create, update, and delete mailbox settings | Neon mailbox repository |
| Store email records and folder state | Mailbox Durable Object SQLite |
| Store attachment objects | SQLite `attachment_chunks` table |
| Retrieve attachment content | Chunk reads with streamed response |
| Delete attachment objects | Email/attachment cleanup in Durable Object storage |
| Read agent system prompt settings | Neon mailbox settings |
| Verify mailbox access for API/MCP tools | Neon mailbox repository |

The current README is the primary operator guide for deployment, environment configuration, email routing, and storage responsibilities.

## Attachment storage invariants

- Binary content is split into sequential chunks of 1 MiB (1,048,576 bytes).
- Attachment metadata records the expected content size and MIME information.
- Downloads reconstruct content from the stored chunks and validate the reconstructed size.
- Attachment retrieval supports streaming to avoid loading an entire large attachment into memory.
- Deleting an email removes its attachment metadata and associated chunk data.
- A missing chunk or size mismatch is treated as an integrity failure, not as a successful download.

## Neon responsibilities

Neon stores global application data that should be addressable across mailbox Durable Objects:

- Mailbox registry and canonical mailbox identity.
- Mailbox settings.
- Application-level settings.

Worker database access uses the Neon serverless HTTP driver. Do not introduce a long-lived TCP connection pool into the Worker runtime.

## Durable Object responsibilities

Each mailbox is isolated behind its own Durable Object. Its SQLite database owns mailbox-local records, including:

- Folders.
- Email metadata and bodies.
- Thread relationships and indexes.
- Attachment metadata.
- Attachment binary chunks.

The AI agent uses its own Durable Object state for conversation continuity.

## Operational considerations

Neon PostgreSQL and Durable Objects have separate storage quotas, limits, and operational characteristics. Monitor both independently. Chunking bounds individual attachment writes, but it does not remove total storage limits.

When changing the storage implementation:

1. Preserve the mailbox ID normalization and existing API contracts.
2. Keep attachment metadata and binary chunks consistent.
3. Ensure deletion paths clean up both metadata and binary content.
4. Test single-chunk and multi-chunk attachments, binary integrity, missing chunks, and deletion.
5. Avoid reintroducing R2 bindings or bucket dependencies unless a new, explicit product requirement justifies them.

## Verification

The repository's automated tests cover attachment storage, Neon repository behavior, and API integration paths. Run:

```bash
npm test
npm run typecheck
```

Automated tests do not replace production monitoring. Validate storage behavior against the deployed environment after any storage-related change.
