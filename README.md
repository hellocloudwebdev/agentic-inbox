<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running on Cloudflare Workers, Neon PostgreSQL, and Durable Objects</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account and a Neon PostgreSQL database. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), global mailbox registry and settings are managed in [Neon PostgreSQL](https://neon.tech/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored sequentially as 1 MiB chunks directly within Durable Object SQLite storage.

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)

Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

---

## Architecture

```text
                         Browser
                            |
                            v
                    Cloudflare Worker
                   React Router + Hono
                            |
              +-------------+-------------+
              |                           |
              v                           v
       Neon PostgreSQL              Durable Objects
       Global application           One DO per mailbox
       metadata and settings        SQLite storage
              |                           |
              |                 +---------+----------+
              |                 |                    |
              |                 v                    v
              |           Email records         Attachments
              |           Folders               Metadata
              |           Threads               Binary chunks (1 MiB)
              |           Mailbox data
              v
       Mailbox registry
       Mailbox settings
       Global configuration


       Cloudflare Email Routing
                 |
                 v
          Cloudflare Worker
                 |
                 v
            Mailbox DO (SQLite)

       Cloudflare Email Service
                 |
                 v
          Outbound email

       Workers AI + Agents SDK
                 |
                 v
          AI Email Agent
```

### Storage Ownership

| Data | Storage Engine |
|---|---|
| Mailbox registry | Neon PostgreSQL (`mailboxes` table) |
| Mailbox settings | Neon PostgreSQL (`mailbox_settings` table) |
| Global configuration | Neon PostgreSQL (`app_settings` table) |
| Email records and bodies | Mailbox Durable Object (SQLite `emails` table) |
| Folder records | Mailbox Durable Object (SQLite `folders` table) |
| Thread relationships | Mailbox Durable Object (SQLite `emails` index & queries) |
| Attachment metadata | Mailbox Durable Object (SQLite `attachments` table) |
| Attachment binary content | Mailbox Durable Object (SQLite `attachment_chunks` table, 1 MiB chunks) |
| AI agent conversation state | EmailAgent Durable Object (`AIChatAgent`) |

---

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments.
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with dedicated SQLite storage.
- **SQLite chunked attachment storage** — Attachments are stored as 1 MiB binary chunks within the mailbox's SQLite database with stream-based retrieval, bounded memory usage, and full integrity validation. Zero R2 dependencies.
- **Centralized mailbox management** — Neon PostgreSQL manages the mailbox registry and configuration.
- **Built-in AI agent** — Side panel with email tools for reading, searching, drafting, and sending.
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending.
- **Model Context Protocol (MCP)** — Integrated MCP server at `/mcp` allowing external AI tools (Claude Code, Cursor, etc.) to connect and manage mailboxes.

---

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), Neon PostgreSQL (`@neondatabase/serverless`), Cloudflare Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (enforced outside local development)

---

## Prerequisites

- Cloudflare account with a custom domain on Cloudflare DNS
- [Neon account](https://neon.tech/) (free tier supported)
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled on your domain
- [Email Service](https://developers.cloudflare.com/email-service/) enabled on your Cloudflare account
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed environments

> **Access Trust Boundary:** Any user who passes the shared Cloudflare Access policy can access all mailboxes in this app by design. This includes the MCP server at `/mcp`. There is no per-mailbox authorization; the Cloudflare Access policy is the single trust boundary.

---

## Fresh Deployment Guide

Follow these 10 steps to deploy Agentic Inbox from scratch:

### 1. Create a Neon Project
1. Log in to your [Neon Console](https://console.neon.tech/).
2. Create a new project (e.g. `agentic-inbox`).
3. Note the database name (defaults to `neondb`).

### 2. Obtain the Neon Connection String
Copy your project's connection string from the Neon dashboard. It looks like:
```text
postgresql://<user>:<password>@<endpoint-id>.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 3. Database Migrations
Migrations are applied automatically when the Worker initializes or when mailboxes are first created. You can also inspect or run the SQL migration manually located at `migrations/neon/0001_initial_schema.sql` if desired.

### 4. Configure the Worker Database Secret
In your terminal, set the `DATABASE_URL` secret on your Cloudflare Worker:
```bash
npx wrangler secret put DATABASE_URL
```
Paste your Neon connection string when prompted.

### 5. Configure Cloudflare Email Routing
1. In the Cloudflare dashboard, go to your domain > **Email Routing**.
2. Enable Email Routing if not already enabled.
3. Under **Routing Rules**, create a **Catch-all rule** that action: **Send to a Worker** and select this Worker.

### 6. Enable Cloudflare Email Service (Outbound)
Ensure the `send_email` binding (`EMAIL`) in `wrangler.jsonc` is enabled on your Cloudflare account to send outbound emails. Refer to [Email Service Workers documentation](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/).

### 7. Configure Workers AI
Workers AI is configured via the `AI` binding in `wrangler.jsonc`. Ensure Workers AI is enabled in your Cloudflare dashboard.

### 8. Configure Cloudflare Access
1. Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under **Settings > Domains & Routes**.
2. The modal will provide your `POLICY_AUD` and `TEAM_DOMAIN` values.
3. Set these as secrets on your Worker:
   ```bash
   npx wrangler secret put POLICY_AUD
   npx wrangler secret put TEAM_DOMAIN
   ```

### 9. Deploy the Worker
Build and deploy the application:
```bash
npm install
npm run deploy
```

### 10. Create the First Mailbox
1. Visit your deployed Worker URL.
2. Log in through Cloudflare Access.
3. Click **Add Mailbox** and create a mailbox for any address on your configured domain (e.g. `hello@yourdomain.com`).
4. You are ready to send and receive emails!

---

## Local Development

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars`:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Configure your local `.dev.vars`:
   ```env
   POLICY_AUD=test-aud
   TEAM_DOMAIN=https://test.cloudflareaccess.com
   DATABASE_URL=postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. Set your test domain in `wrangler.jsonc`:
   ```jsonc
   "vars": {
     "DOMAINS": "yourdomain.com",
     "EMAIL_ADDRESSES": []
   }
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Run the test suite:
   ```bash
   npm test
   ```

7. Typecheck:
   ```bash
   npm run typecheck
   ```

---

## Resource and Free-Tier Safeguards

- **Attachment Chunks:** Attachments are split into sequential 1 MiB binary chunks. This keeps each chunk comfortably beneath the Cloudflare Durable Object SQLite row limit (8 MiB) and enables stream-based downloads with low memory overhead.
- **Neon HTTP Driver:** All database communication from Workers uses the serverless HTTP driver (`@neondatabase/serverless`), avoiding persistent TCP connection pools and scaling seamlessly to zero.
- **Idempotent Cleanup:** When an email is permanently deleted, all its associated attachment metadata and binary chunks are immediately purged from the Durable Object SQLite database.
- **Capacity Limits:** Note that Cloudflare Durable Object storage and Neon free-tier storage have independent quotas. High-volume attachments should be managed according to your plan's storage ceilings.

---

## Troubleshooting

### Cloudflare Access Issues
- **`Invalid or expired Access token`**: Verify that `POLICY_AUD` and `TEAM_DOMAIN` match the Access application settings in the Cloudflare dashboard.
- **`Cloudflare Access must be configured in production`**: The application enforces Cloudflare Access outside `localhost`. Set `POLICY_AUD` and `TEAM_DOMAIN` secrets via `wrangler secret put`.

### Database & Mailbox Issues
- **`DatabaseConfigError: DATABASE_URL environment variable is not configured`**: Run `wrangler secret put DATABASE_URL` (production) or add `DATABASE_URL` to `.dev.vars` (local dev).
- **`Mailbox already exists (409)`**: Mailbox IDs are case-insensitive and normalized (e.g. `User@Domain.com` and `user@domain.com` map to the same mailbox).

### Attachment Issues
- **`AttachmentCorruptionError`**: An attachment chunk was missing or the reconstructed size did not match the declared metadata size. Incomplete uploads are aborted and do not produce valid metadata.

---

## License

Apache 2.0 -- see [LICENSE](LICENSE).
