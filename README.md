<div align="center">
  <h1>Agentic Inbox</h1>
  <p><strong>A self-hosted email workspace with an AI agent.</strong></p>
  <p>Cloudflare Workers · Durable Objects · Neon PostgreSQL · Zoho Mail SMTP</p>
</div>

Agentic Inbox is a self-hosted email client that brings mailbox management and an AI assistant into one web application. It runs on your Cloudflare account, stores mailbox metadata in Neon PostgreSQL, keeps mailbox data in isolated Durable Objects, receives mail through Cloudflare Email Routing, and sends mail through Zoho Mail SMTP.

The AI agent can inspect messages, search conversations, prepare drafts, and use the application's email tools. Sending remains an explicit action: generated replies are drafts until a user or authorized tool sends them.

![Agentic Inbox screenshot](./demo_app.png)

## Highlights

- **Complete email workflow** — Read, compose, reply, forward, search, organize, and manage attachments.
- **Cloudflare-native inbound delivery** — Cloudflare Email Routing forwards incoming messages to the Worker email handler.
- **Zoho SMTP outbound delivery** — Compose, reply, forward, and agent-initiated sends use the same authenticated SMTP transport.
- **SMTP-aware send status** — A message is not marked as sent until Zoho accepts the SMTP transaction. If saving the Sent copy fails after acceptance, the API returns a warning rather than encouraging a duplicate send.
- **AI email assistant** — An agent can read messages, search mailbox content, and prepare draft replies.
- **MCP integration** — The MCP endpoint at `/mcp` exposes mailbox capabilities to compatible AI clients.
- **Mailbox isolation** — Each mailbox has its own Durable Object and SQLite database.
- **Chunked attachment storage** — Attachments are stored in 1 MiB chunks in Durable Object SQLite, with integrity checks and streamed retrieval. No R2 bucket is required for attachment storage.
- **Centralized configuration** — Neon PostgreSQL stores the mailbox registry and mailbox/application settings.
- **Access protection** — Deployed environments enforce Cloudflare Access JWT validation.

## Architecture

```text
                                  ┌──────────────────────┐
                                  │      Web client      │
                                  └──────────┬───────────┘
                                             │ HTTPS
                                             ▼
                                  ┌──────────────────────┐
                                  │   Cloudflare Worker  │
                                  │ React Router + Hono  │
                                  └───────┬────────┬─────┘
                                          │        │
                         ┌────────────────┘        └──────────────────┐
                         ▼                                             ▼
              ┌────────────────────┐                       ┌────────────────────┐
              │   Neon PostgreSQL  │                       │  Durable Objects   │
              │ Mailbox registry   │                       │ One per mailbox    │
              │ Mailbox settings   │                       │ SQLite email data  │
              │ Application config │                       │ Attachments/chunks │
              └────────────────────┘                       └────────────────────┘

  INBOUND
  External senders → Cloudflare Email Routing → Worker email handler
                  → Neon mailbox lookup → Mailbox Durable Object → Inbox

  OUTBOUND
  Web app / AI email tools → shared send handlers → Zoho Mail SMTP → Recipient

  AI
  Cloudflare Agents SDK + Workers AI → mailbox tools and draft assistance

  INTEGRATIONS
  Compatible MCP clients → Cloudflare Worker /mcp endpoint
```

### Storage responsibilities

| Data | Storage |
|---|---|
| Mailbox registry | Neon PostgreSQL |
| Mailbox and application settings | Neon PostgreSQL |
| Email messages and folders | Per-mailbox Durable Object SQLite |
| Attachment metadata | Per-mailbox Durable Object SQLite |
| Attachment binary content | Durable Object SQLite, stored in 1 MiB chunks |
| AI agent conversation state | EmailAgent Durable Object |

## Email delivery

### Incoming mail

1. A sender emails an address on your configured domain.
2. Cloudflare Email Routing routes the message to the Agentic Inbox Worker.
3. The Worker parses the message and checks that the recipient mailbox exists in Neon.
4. The message and its attachments are stored in that mailbox's Durable Object.
5. The AI agent is notified so it can prepare assistance, such as a draft reply.

Configure your Cloudflare Email Routing rule to send matching mail to this Worker. Gmail is not required as an intermediate receiving or forwarding service.

### Outgoing mail

All outbound paths share the Zoho SMTP transport:

- New messages from the composer
- Replies and forwards
- Agent/tool-initiated sends and replies

The Worker connects to Zoho using `@workermailer/smtp` and Cloudflare TCP sockets. Port `587` uses STARTTLS; port `465` uses implicit TLS. The visible sender name is configured independently with `ZOHO_SMTP_FROM_NAME` (currently `Neeraj Singh`), while the mailbox address remains `mail@neerajsingh.me`. The SMTP password is read from a Cloudflare Worker secret and must never be committed to the repository.

The API reports success after the SMTP server accepts the message. SMTP acceptance is not a guarantee that the recipient's provider will place the message in the inbox; downstream filtering, rejection, and delivery delays remain possible.

**Sender restriction:** The current transport permits a From address that matches the configured SMTP username. Sending from another address requires that address to be an authorized Zoho alias and the application to be updated to allow that alias, or requires separate SMTP credentials. Do not assume that adding an address as a mailbox in Agentic Inbox automatically authorizes it in Zoho.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Tailwind CSS, Zustand, TipTap, Kumo |
| API | Hono on Cloudflare Workers |
| Mailbox persistence | Cloudflare Durable Objects with SQLite |
| Global metadata | Neon PostgreSQL with `@neondatabase/serverless` |
| Inbound email | Cloudflare Email Routing + PostalMime |
| Outbound email | Zoho Mail SMTP + `@workermailer/smtp` |
| AI | Cloudflare Agents SDK, Workers AI, AI SDK |
| Authentication | Cloudflare Access JWT validation |
| External AI integration | Model Context Protocol (MCP) |

## Prerequisites

Before deploying your own instance, prepare:

- A Cloudflare account and a domain managed in Cloudflare DNS.
- Cloudflare Email Routing enabled for the domain.
- A Cloudflare Worker deployment with Durable Objects and Workers AI enabled.
- A Neon PostgreSQL project.
- A Zoho Mail mailbox with SMTP access enabled.
- A Cloudflare Access application for the deployed Worker.
- Node.js and npm for local development and deployment.

> **Access model:** Cloudflare Access is the application's outer trust boundary. A user who passes the shared Access policy can access all mailboxes exposed by this application. There is no per-mailbox user authorization layer in the current implementation. Only grant access to trusted users.

## Configuration

### Worker variables

Set the following non-secret values in `wrangler.jsonc` or the Cloudflare Worker environment:

| Variable | Purpose | Example |
|---|---|---|
| `DOMAINS` | Domain handled by the application | `example.com` |
| `EMAIL_ADDRESSES` | Optional recipient allowlist; an empty array allows configured-domain mailbox routing | `[]` |
| `ZOHO_SMTP_HOST` | Zoho SMTP server for your data centre | `smtp.zoho.in` |
| `ZOHO_SMTP_PORT` | SMTP TLS mode/port | `587` |
| `ZOHO_SMTP_USERNAME` | Authenticated Zoho mailbox | `mail@example.com` |
| `ZOHO_SMTP_FROM_NAME` | Display name shown to recipients | `Neeraj Singh` |

Use the SMTP hostname shown by Zoho for your account's data centre and account type. The India data centre commonly uses `smtp.zoho.in`; verify the value in your Zoho Mail settings.

### Worker secrets

Set secrets using Wrangler. The commands prompt for values; do not put real credentials in source files.

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put POLICY_AUD
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put ZOHO_SMTP_PASSWORD
```

- `DATABASE_URL`: Neon PostgreSQL connection string.
- `POLICY_AUD`: Cloudflare Access application's audience tag.
- `TEAM_DOMAIN`: Cloudflare Access team domain (base URL or certificate URL as supported by the app).
- `ZOHO_SMTP_PASSWORD`: Zoho mailbox password or app-specific password, according to your Zoho account's security configuration.

Keep secrets out of Git, screenshots, logs, issue reports, and client-side code. Use separate values for development and production.

## Deploy a new instance

### 1. Create a Neon project

Create a project in the [Neon Console](https://console.neon.tech/) and copy its PostgreSQL connection string. The database name is commonly `neondb`, unless you choose another name.

### 2. Configure Cloudflare

- Add your domain to Cloudflare DNS.
- Enable Email Routing.
- Enable Workers AI.
- Configure the Worker and Durable Object bindings/migrations from `wrangler.jsonc`.
- Configure a Cloudflare Access application for the Worker.

### 3. Configure the application

Set the domain, optional recipient allowlist, and Zoho SMTP host/port/username in `wrangler.jsonc`. Add the four secrets listed above with Wrangler or the Cloudflare dashboard.

### 4. Install, test, and deploy

```bash
npm install
npm run typecheck
npm test
npm run deploy
```

### 5. Route incoming email

In Cloudflare Email Routing, create a rule for the desired address or catch-all domain and choose **Send to a Worker**, selecting the deployed Agentic Inbox Worker.

### 6. Create a mailbox and verify delivery

Open the Worker URL through Cloudflare Access and create the mailbox address. Then test both directions:

1. Send an external message to the mailbox and confirm it appears in Inbox.
2. Send a message from Agentic Inbox and confirm Zoho accepts it and the recipient receives it.
3. Test replies, forwards, attachments, and any authorized sender aliases separately.

A successful build or test suite does not replace a live SMTP delivery test.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Fill in local development values in `.dev.vars`:

   ```env
   POLICY_AUD=test-aud
   TEAM_DOMAIN=https://test.cloudflareaccess.com
   DATABASE_URL=postgresql://user:password@your-neon-endpoint/neondb?sslmode=require
   ZOHO_SMTP_HOST=smtp.zoho.in
   ZOHO_SMTP_PORT=587
   ZOHO_SMTP_USERNAME=mail@example.com
   ZOHO_SMTP_PASSWORD=your-zoho-app-password
   ```

4. Set `DOMAINS` and `EMAIL_ADDRESSES` in the local Wrangler configuration as appropriate for your test environment.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Run checks:

   ```bash
   npm run typecheck
   npm test
   ```

Never use production credentials or a production database for untrusted local code.

## Tests and validation

The repository uses Vitest. Run the full test suite with:

```bash
npm test
```

The Zoho transport tests validate the sender integration through a test SMTP mock; API integration tests isolate the Worker-only `cloudflare:sockets` module. CI/Preview builds validate compilation and Preview deployment, but Preview intentionally does not contain production database, Access, or SMTP secrets.

A live production smoke test is still required to verify Zoho authentication and real external delivery in a deployed environment.

## AI sending permissions and MCP credentials

AI email sending is controlled independently for automatic replies, AI chat, and external MCP clients. All three permissions default to off. When automatic replies are disabled, incoming mail can still be analyzed and a reply draft can be created, but the Worker blocks automatic sending. The Worker also enforces chat and MCP send permissions at the tool boundary.

Generate MCP bearer credentials from Settings → MCP API access. A generated key is shown once; only its SHA-256 hash is stored. Revoke or regenerate keys from the same screen. Regeneration revokes the previous credential. Use the key as an `Authorization: Bearer <key>` header when connecting to the `/mcp` endpoint. MCP keys authorize the MCP endpoint only and do not replace the Clerk session required by the web app and REST API.

The AI assistant keeps separate persistent conversations. Chat titles and metadata are stored in Neon, while each conversation's message history is stored in its own EmailAgent Durable Object. Use the chat history controls to search, rename, clear, or delete conversations.

Settings uses one Save all changes action for mailbox/account settings, agent instructions, email permissions, AI providers/model routing, and agent skills. MCP key creation and revocation take effect immediately so credential changes do not remain pending.

## Operational notes

- Attachment payloads are stored in sequential 1 MiB chunks to keep SQLite writes bounded and support streamed downloads.
- Neon is accessed using the serverless HTTP driver; the Worker does not maintain a traditional persistent PostgreSQL connection pool.
- Deleting an email removes its attachment metadata and associated chunks.
- Neon and Durable Objects have independent storage and usage limits. Monitor both as mailbox and attachment volume grows.
- If SMTP accepts a message but saving the local Sent copy fails, the API returns a warning with a sent status. Check Sent before attempting to resend.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Access returns `403` | Confirm the request has a valid Cloudflare Access JWT and that the user is allowed by the Access policy. |
| Worker reports Access is not configured | Set `POLICY_AUD` and `TEAM_DOMAIN` as Worker secrets. |
| Database configuration error | Verify `DATABASE_URL` in the correct environment. |
| Outbound email fails | Verify the Zoho SMTP hostname for your data centre, port, username, app password, and SMTP access. Check Worker logs for the SMTP error. |
| Sender address is rejected | The From address must match the authenticated SMTP username under the current sender policy. |
| Incoming email is not stored | Check the Email Routing rule, Worker email handler, recipient address, and that the mailbox exists in Neon. |
| Attachment integrity error | The stored chunk set may be incomplete or its reconstructed size may not match attachment metadata. |

## License

Apache License 2.0. See [LICENSE](./LICENSE).
