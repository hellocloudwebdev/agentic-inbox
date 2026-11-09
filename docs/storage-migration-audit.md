# Storage Architecture & R2 Dependency Audit

**Project:** `agentic-inbox` (`hellocloudwebdev/agentic-inbox`)  
**Audit Date:** 2026-11-08  
**Scope:** Storage architecture migration from Cloudflare R2 to Neon PostgreSQL (metadata/settings) and Cloudflare Durable Objects SQLite (email data & chunked attachment storage).

---

## 1. Executive Summary

This document establishes the baseline architecture, maps every R2 operation in the codebase, catalogs all consumers of mailbox settings and attachment storage, records existing API contracts, and defines the target schema and dependency transitions required for the complete removal of Cloudflare R2.

---

## 2. Inventory of R2 Operations

Every R2 reference and operation currently present in the codebase was identified and categorized:

| Location | Code Pattern | Context / Intent | Replacement Strategy |
|---|---|---|---|
| `workers/lib/email-helpers.ts:40` | `bucket.list({ prefix: "mailboxes/" })` | List all mailboxes | Neon `mailboxes` query |
| `workers/lib/attachments.ts:45` | `bucket.put(key, bytes)` | Store email attachments to R2 key `attachments/{emailId}/{attachmentId}/{filename}` | MailboxDO `storeAttachmentChunks` into SQLite `attachment_chunks` |
| `workers/index.ts:98` | `listMailboxes(c.env.BUCKET)` | `GET /api/v1/mailboxes` endpoint | Neon mailbox repository `listMailboxes()` |
| `workers/index.ts:110` | `c.env.BUCKET.head(key)` | `POST /api/v1/mailboxes` (duplicate check) | Neon mailbox repository `getMailbox()` or unique constraint |
| `workers/index.ts:113` | `c.env.BUCKET.put(key, JSON.stringify(finalSettings))` | `POST /api/v1/mailboxes` (save settings JSON) | Neon `mailboxes` and `mailbox_settings` insert |
| `workers/index.ts:121` | `c.env.BUCKET.get("mailboxes/${mailboxId}.json")` | `GET /api/v1/mailboxes/:mailboxId` | Neon `mailbox_settings` select |
| `workers/index.ts:130` | `c.env.BUCKET.head(key)` | `PUT /api/v1/mailboxes/:mailboxId` (check exists) | Neon `mailbox_settings` update check |
| `workers/index.ts:131` | `c.env.BUCKET.put(key, JSON.stringify(settings))` | `PUT /api/v1/mailboxes/:mailboxId` (update settings) | Neon `mailbox_settings` upsert/update |
| `workers/index.ts:138` | `c.env.BUCKET.head(key)` | `DELETE /api/v1/mailboxes/:mailboxId` (check exists) | Neon `mailboxes` delete check |
| `workers/index.ts:139` | `c.env.BUCKET.delete(key)` | `DELETE /api/v1/mailboxes/:mailboxId` | Neon `mailboxes` cascade delete |
| `workers/index.ts:185` | `storeAttachments(c.env.BUCKET, messageId, attachments)` | `POST /api/v1/mailboxes/:mailboxId/emails` (send email) | MailboxDO attachment storage service |
| `workers/index.ts:248` | `c.env.BUCKET.delete(...)` | `DELETE /api/v1/mailboxes/:mailboxId/emails/:id` | MailboxDO attachment chunk deletion via cascade or helper |
| `workers/index.ts:319` | `c.env.BUCKET.get("attachments/${emailId}/${attachmentId}/${filename}")` | `GET /api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId` | MailboxDO attachment stream/chunk retrieval |
| `workers/index.ts:367` | `env.BUCKET.head("mailboxes/${mailboxId}.json")` | `receiveEmail` inbound check if mailbox exists | Neon mailbox repository lookup |
| `workers/index.ts:376` | `env.BUCKET.put("attachments/${messageId}/${attId}/${filename}", att.content)` | `receiveEmail` inbound attachment storage | MailboxDO attachment chunk storage |
| `workers/agent/index.ts:97` | `env.BUCKET.get(key)` | `getSystemPrompt` (fetch custom prompt) | Neon `mailbox_settings` query |
| `workers/lib/mailbox.ts:28` | `c.env.BUCKET.head(key)` | `requireMailbox` middleware verification | Neon `mailboxes` check |
| `workers/mcp/index.ts:78` | `env.BUCKET.head("mailboxes/${mailboxId}.json")` | `verifyMailbox` MCP helper | Neon `mailboxes` check |
| `workers/lib/tools.ts:49` | `listMailboxes(env.BUCKET)` | `toolListMailboxes` MCP/Agent tool | Neon `mailboxes` query |
| `workers/routes/reply-forward.ts:56` | `storeAttachments(c.env.BUCKET, messageId, attachments)` | `handleReplyEmail` reply attachments | MailboxDO attachment storage service |
| `workers/routes/reply-forward.ts:146` | `storeAttachments(c.env.BUCKET, messageId, attachments)` | `handleForwardEmail` forward attachments | MailboxDO attachment storage service |
| `wrangler.jsonc:25-31` | `r2_buckets` configuration | Worker binding declaration | Remove entirely; add `DATABASE_URL` secret |
| `README.md:6,22,41,49,63,86` | Documentation & setup text | Documentation describing R2 bucket setup | Update with Neon setup guide |
| `package.json:8` | `"R2"` in `"products"` | Cloudflare metadata | Update to `"Hyperdrive"` or remove R2 |

---

## 3. Consumers of Mailbox Settings and Registry

1. **HTTP Routing & Middleware (`workers/lib/mailbox.ts`)**:
   - `requireMailbox` middleware executes before any `/api/v1/mailboxes/:mailboxId/*` route. It validates existence of `mailboxId`.
2. **Mailbox CRUD Endpoints (`workers/index.ts`)**:
   - `GET /api/v1/mailboxes`: Returns `[{ id, email, name }]`.
   - `POST /api/v1/mailboxes`: Normalizes email, validates against `EMAIL_ADDRESSES` whitelist if set, enforces uniqueness, saves initial settings, initializes DO folders.
   - `GET /api/v1/mailboxes/:mailboxId`: Returns `{ id, name, email, settings }`.
   - `PUT /api/v1/mailboxes/:mailboxId`: Updates settings JSON.
   - `DELETE /api/v1/mailboxes/:mailboxId`: Removes mailbox metadata and settings.
3. **Inbound Email Processor (`workers/index.ts: receiveEmail`)**:
   - Checks if the recipient mailbox exists. Silently ignores inbound mail if mailbox does not exist.
4. **AI Agent (`workers/agent/index.ts: getSystemPrompt`)**:
   - Reads `agentSystemPrompt` from the mailbox's settings.
5. **MCP Server (`workers/mcp/index.ts: verifyMailbox`, `toolListMailboxes`)**:
   - Verifies mailbox before servicing external tool invocations.

---

## 4. Consumers of Attachment Storage

1. **Outbound Composer (`workers/index.ts: POST /api/v1/mailboxes/:mailboxId/emails`)**:
   - Receives base64 attachments in request body, writes to storage, creates `attachments` metadata records in `MailboxDO`, passes attachments to `sendEmail` binding.
2. **Reply Handler (`workers/routes/reply-forward.ts: handleReplyEmail`)**:
   - Similar to outbound composer: writes attachments, saves metadata, passes to `sendEmail`.
3. **Forward Handler (`workers/routes/reply-forward.ts: handleForwardEmail`)**:
   - Writes attachments, saves metadata, passes to `sendEmail`.
4. **Inbound Email Routing (`workers/index.ts: receiveEmail`)**:
   - Extracts attachments from `PostalMime`, writes binary content, saves metadata in `MailboxDO`.
5. **Attachment Download Endpoint (`workers/index.ts: GET /api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId`)**:
   - Looks up attachment metadata from `MailboxDO`, retrieves binary data, returns response with `Content-Type` and `Content-Disposition`.
6. **Email Deletion Endpoint (`workers/index.ts: DELETE /api/v1/mailboxes/:mailboxId/emails/:id`)**:
   - Deletes email record and cascades/cleans up associated attachment binary blobs.

---

## 5. Existing Schemas

### 5.1 Durable Object SQLite (`workers/db/schema.ts` & `workers/durableObject/migrations.ts`)

- **`folders`**
  - `id TEXT PRIMARY KEY`
  - `name TEXT NOT NULL UNIQUE`
  - `is_deletable INTEGER NOT NULL DEFAULT 1`
  - Seeded rows: `inbox`, `sent`, `trash`, `archive`, `spam`, `draft`
- **`emails`**
  - `id TEXT PRIMARY KEY`
  - `folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE`
  - `subject TEXT`
  - `sender TEXT`
  - `recipient TEXT`
  - `cc TEXT`
  - `bcc TEXT`
  - `date TEXT`
  - `read INTEGER DEFAULT 0`
  - `starred INTEGER DEFAULT 0`
  - `body TEXT`
  - `in_reply_to TEXT`
  - `email_references TEXT`
  - `thread_id TEXT`
  - `message_id TEXT`
  - `raw_headers TEXT`
- **`attachments`**
  - `id TEXT PRIMARY KEY`
  - `email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE`
  - `filename TEXT NOT NULL`
  - `mimetype TEXT NOT NULL`
  - `size INTEGER NOT NULL`
  - `content_id TEXT`
  - `disposition TEXT`

---

## 6. Target Schema Design

### 6.1 Neon PostgreSQL (Global Storage)

```sql
CREATE TABLE IF NOT EXISTS mailboxes (
    id TEXT PRIMARY KEY,               -- normalized email (lowercase, trimmed)
    email TEXT NOT NULL,              -- canonical email display
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mailbox_settings (
    mailbox_id TEXT PRIMARY KEY REFERENCES mailboxes(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status);
```

### 6.2 Durable Object SQLite (Attachment Chunks)

Add migration `9_add_attachment_chunks`:

```sql
CREATE TABLE IF NOT EXISTS attachment_chunks (
    attachment_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (attachment_id, chunk_index),
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachment_chunks_id ON attachment_chunks(attachment_id);
```

**Attachment Chunking Invariants:**
- Chunk size: exactly 1 MiB (`1,048,576` bytes).
- Max attachments supported comfortably within DO SQLite limits.
- Bounded memory streaming and chunk iteration.
- Integrity verification: reconstructed byte size must equal `attachments.size`.
- Foreign key cascade: deleting an email cascades to `attachments`, which cascades to `attachment_chunks`.

---

## 7. Existing API Contracts to Preserve

1. `GET /api/v1/config` -> `{ domains: string[], emailAddresses: string[] }`
2. `GET /api/v1/mailboxes` -> `Array<{ id: string, email: string, name: string, settings?: any }>`
3. `POST /api/v1/mailboxes` -> `{ id: string, email: string, name: string, settings: any }` (201 Created)
4. `GET /api/v1/mailboxes/:mailboxId` -> `{ id: string, name: string, email: string, settings: any }`
5. `PUT /api/v1/mailboxes/:mailboxId` -> `{ id: string, name: string, email: string, settings: any }`
6. `DELETE /api/v1/mailboxes/:mailboxId` -> 204 No Content
7. `GET /api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId` -> Binary stream with `Content-Type` & `Content-Disposition` headers.

---

## 8. Test & Verification Plan

1. **Vitest Setup**: Install Vitest and test utilities to enable automated unit and integration tests.
2. **Neon Repository Tests**: Mailbox create, retrieve, list, duplicate rejection, settings read/write, missing mailbox handling, connection failure handling.
3. **Attachment Storage Tests**: Zero-byte, small, single 1 MiB chunk, multi-chunk (e.g. 2.5 MiB), binary integrity, unicode filename, deletion cascade, missing chunk detection.
4. **End-to-End API Tests**: Verify all routes with mock Neon and DO backends.
