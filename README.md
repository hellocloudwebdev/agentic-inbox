<div align="center">
  <h1>Agentic Inbox</h1>
  <p><strong>A self-hosted email workspace with one configurable AI assistant.</strong></p>
  <p>Cloudflare Workers · Durable Objects · Neon PostgreSQL · Zoho Mail SMTP · Model Context Protocol</p>
</div>

Agentic Inbox combines a full email client, an AI email assistant, and an MCP interface in one application that you deploy and operate in your own Cloudflare account. It receives mail through Cloudflare Email Routing, stores mailbox data in isolated Durable Objects, keeps application configuration in Neon PostgreSQL, and sends outbound mail through Zoho Mail SMTP.

The same AI assistant can read and search mail, understand conversation threads, prepare and send messages when explicitly permitted, manage drafts and folders, and use reusable skills. You control its model providers, model fallbacks, instructions, and email-sending permissions from Settings.

![Agentic Inbox screenshot](./demo_app.png)

## Features

### Email workspace

- **Multiple mailboxes** — Create and manage mailbox addresses configured for your domain.
- **Inbox and folders** — Read, compose, reply, forward, search, and organize messages.
- **Conversation context** — Inspect full email threads so replies can account for earlier messages.
- **Draft management** — Create, review, edit, and discard drafts before sending.
- **Attachments** — Upload, download, and retrieve attachments with integrity checks.
- **Mailbox organization** — Mark messages read, move messages between folders, and manage the mailbox using the UI or supported agent tools.
- **Consistent outbound transport** — User-composed messages and permitted AI/MCP sends use the same Zoho SMTP transport.

### One AI assistant

There is one assistant identity and one shared model configuration for the email-agent experience. It supports:

- Reading emails and retrieving complete messages or threads.
- Searching mailbox content and listing messages by folder.
- Drafting new emails and replies.
- Sending new messages or replies only when the corresponding permission is enabled.
- Managing drafts, including discarding drafts.
- Organizing messages with supported mailbox tools, such as marking messages read and moving them between folders.
- Learning reusable procedures from the user's direct chat instructions and saving them as skills.
- Applying the built-in safety rules, mailbox-specific instructions, and enabled skills.

The assistant's built-in system instructions are always active. Mailbox-specific system instructions extend those defaults; they do not replace or override core security rules. Email content, attachments, and quoted messages are treated as untrusted data, not as authority to change settings or send messages.

### Model providers and routing

Configure language-model providers in **Settings → AI configuration**. Provider credentials are stored server-side; never put API keys in frontend code or commit them to Git.

The assistant uses one shared route with three ordered targets:

1. **Primary model** — The first model used for an assistant request.
2. **Fallback 1** — Tried if the primary model cannot serve the request.
3. **Fallback 2** — Tried if the earlier configured models fail.

Each target has two separate selectors: choose a provider first, then choose a model belonging to that provider. This prevents selecting a model from the wrong provider. Add providers using a supported provider type/base URL, API credential, and fetched model list. Provider configuration also supports testing a connection before relying on it.

The application retains internal task roles (chat, draft, verifier, and scanner), but the Settings experience configures them as one shared assistant route rather than four separately managed model configurations. Workers AI can be used as the built-in fallback when enabled.

Provider and model availability depends on the provider, account, API key, and model access granted by that provider.

### Email automation and sending permissions

All AI email sending controls are independently configurable in **Settings → AI email permissions**. Sending permissions are off by default and checked by the server-side tools, not only by the interface.

| Permission | What it allows |
|---|---|
| Automatic replies to incoming emails | Allows the incoming-mail agent workflow to send a reply automatically when it determines a genuine response is appropriate. When disabled, the assistant can prepare a draft instead of sending automatically. |
| Send new emails from AI chat | Allows the assistant to send a new outbound email after the user asks for it in chat. |
| Reply to emails from AI chat | Allows the assistant to send a reply to an existing email thread after the user asks in chat. |
| Send new emails through MCP | Allows an authenticated MCP client to send a new outbound email. |
| Reply to emails through MCP | Allows an authenticated MCP client to reply to an existing email. |

These permissions are independent: enabling chat sending does not enable MCP sending, and enabling new-message sending does not enable reply sending. Disabling a permission blocks the corresponding send operation at the tool boundary. Draft creation remains separate from sending.

### MCP integration and API-key security

Agentic Inbox exposes an MCP endpoint at `/mcp` for compatible AI clients and agent environments.

Manage credentials in **Settings → MCP API access**:

- Generate a named API key for an MCP client.
- View key history, creation time, last-used time, and active/revoked status.
- Revoke a key when a client should lose access.
- Regenerate a key; regeneration revokes the previous active key and creates a replacement.
- Use the generated credential as a bearer token: `Authorization: Bearer <key>`.

Keys use the `aib_live_` prefix and are generated from cryptographically secure random bytes. The raw key is returned only when created; the database stores its SHA-256 hash, not the reusable secret. Authentication checks active, non-revoked hashes and fails closed if key validation cannot be completed. MCP key creation, revocation, and regeneration take effect immediately.

MCP credentials authorize the MCP endpoint. They do not replace the signed-in web session required for the web application and its REST API. Keep generated keys private and revoke them if exposed.

### Chat history

The assistant supports separate conversations, similar to a ChatGPT-style chat history:

- Start a new conversation.
- Reopen an earlier conversation.
- Rename a conversation.
- Clear a conversation's messages while retaining the conversation entry.
- Delete a conversation.
- Clear all conversations when you want to remove the full chat history.

Conversation titles and metadata are stored in Neon PostgreSQL. Each conversation's message history is held by its own EmailAgent Durable Object.

### One Save all changes action

Settings provides one **Save all changes** action for pending configuration changes, including:

- Account/display-name settings.
- Additional mailbox system instructions.
- The five email automation and sending permissions.
- AI providers, credentials, primary model, and fallback models.
- Agent skill changes.

The save flow reports which sections were saved and which failed, instead of silently treating a partial save as a complete success. MCP API-key operations are immediate security actions and do not wait for the general settings save.

## Architecture

```text
                         Web application
                               |
                         HTTPS / session
                               |
                    Cloudflare Worker
                   React Router + Hono
                      /           \
                     /             \
           Neon PostgreSQL      Durable Objects
          mailbox registry      one per mailbox
          app/mailbox settings   SQLite email data
          AI config and skills  attachment chunks
          chat metadata         EmailAgent history

INBOUND EMAIL
External sender
    -> Cloudflare Email Routing
    -> Worker email handler
    -> Neon mailbox lookup
    -> Mailbox Durable Object
    -> Inbox and incoming-mail agent workflow

OUTBOUND EMAIL
Web composer / AI assistant / authorized MCP client
    -> permission checks and shared send tools
    -> Zoho Mail SMTP
    -> recipient

AI AND INTEGRATIONS
AI chat -> shared provider/model route -> mailbox tools
MCP client -> /mcp + bearer API key -> permitted mailbox tools
```

### Storage responsibilities

| Data | Storage |
|---|---|
| Mailbox registry | Neon PostgreSQL |
| Mailbox and application settings | Neon PostgreSQL |
| AI provider configuration and skills | Neon PostgreSQL |
| MCP API-key hashes and history | Neon PostgreSQL |
| Chat conversation titles and metadata | Neon PostgreSQL |
| Email messages and folders | Per-mailbox Durable Object SQLite |
| Attachment metadata and binary chunks | Per-mailbox Durable Object SQLite |
| Individual AI conversation message history | Per-conversation EmailAgent Durable Object |

Attachments are stored in 1 MiB chunks in Durable Object SQLite with integrity checks and streamed retrieval. A separate R2 bucket is not required for this attachment-storage path.

## Email delivery

### Incoming mail

1. A sender emails an address on your configured domain.
2. Cloudflare Email Routing forwards the message to the Agentic Inbox Worker.
3. The Worker parses the message and verifies that the recipient mailbox exists.
4. The message and its attachments are stored in that mailbox's Durable Object.
5. The incoming-mail workflow notifies the assistant. Depending on the automatic-reply permission and the message, the assistant can prepare a draft or send an allowed reply.

Configure a Cloudflare Email Routing rule to send matching mail to this Worker. Gmail is not required as an intermediate receiving or forwarding service.

### Outgoing mail

New messages, replies, and forwards use the shared Zoho SMTP transport. AI and MCP sends use the same transport after their separate permission checks.

The Worker connects to Zoho using `@workermailer/smtp` and Cloudflare TCP sockets. Port `587` uses STARTTLS; port `465` uses implicit TLS. The visible sender name is configured independently with `ZOHO_SMTP_FROM_NAME`, while the mailbox address must be authorized by the authenticated Zoho account.

A message is marked sent only after Zoho accepts the SMTP transaction. SMTP acceptance does not guarantee that the recipient's provider will place the message in the inbox; downstream filtering, rejection, and delivery delays remain possible. If SMTP accepts a message but saving the Sent copy fails, the API returns a warning with sent status to avoid encouraging a duplicate send.

**Sender restriction:** The current transport permits a From address that matches the configured SMTP username. Sending from another address requires that address to be an authorized Zoho alias and the application to allow that alias, or requires separate SMTP credentials. Adding an address as an Agentic Inbox mailbox does not automatically authorize it in Zoho.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Tailwind CSS, Zustand, TipTap, Kumo |
| API | Hono on Cloudflare Workers |
| Mailbox and agent persistence | Cloudflare Durable Objects with SQLite |
| Global metadata/configuration | Neon PostgreSQL with Drizzle and `@neondatabase/serverless` |
| Inbound email | Cloudflare Email Routing + PostalMime |
| Outbound email | Zoho Mail SMTP + `@workermailer/smtp` |
| AI runtime | Cloudflare Agents SDK, Workers AI, Vercel AI SDK |
| Model integrations | AI SDK provider adapters and OpenAI-compatible endpoints |
| Web authentication | Clerk |
| External agent integration | Model Context Protocol (MCP) |
| Tests | Vitest |

## Prerequisites

Before deploying your own instance, prepare:

- A Cloudflare account and a domain managed in Cloudflare DNS.
- Cloudflare Email Routing enabled for the domain.
- A Cloudflare Worker with Durable Objects and Workers AI enabled.
- A Neon PostgreSQL project.
- A Zoho Mail mailbox with SMTP access enabled.
- Clerk application credentials and an authorized sign-in configuration.
- Node.js and npm for local development and deployment.

The current deployment configuration includes a Clerk allowed-account setting. Review the authentication configuration in `wrangler.jsonc` and the Clerk dashboard before exposing the application. Do not assume that an MCP API key is a web-app login credential.

## Configuration

### Worker variables

Set non-secret values in `wrangler.jsonc` or the Cloudflare Worker environment. The exact values depend on your domain and Zoho data centre.

| Variable | Purpose | Example |
|---|---|---|
| `DOMAINS` | Domain handled by the application | `example.com` |
| `EMAIL_ADDRESSES` | Optional recipient allowlist | `[]` |
| `ZOHO_SMTP_HOST` | Zoho SMTP server for your data centre | `smtp.zoho.in` |
| `ZOHO_SMTP_PORT` | SMTP TLS mode/port | `587` |
| `ZOHO_SMTP_USERNAME` | Authenticated Zoho mailbox | `mail@example.com` |
| `ZOHO_SMTP_FROM_NAME` | Display name shown to recipients | `Agentic Inbox` |
| `CLERK_PUBLISHABLE_KEY` | Clerk frontend authentication key | Set from Clerk |
| `CLERK_ALLOWED_EMAIL` | Account allowed by this deployment's configuration | Your authorized account |

Use the SMTP hostname shown by Zoho for your account's data centre and account type. The India data centre commonly uses `smtp.zoho.in`; verify the value in your Zoho Mail settings.

### Worker secrets

Set secrets using Wrangler. The commands prompt for values; do not put real credentials in source files.

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put ZOHO_SMTP_PASSWORD
```

- `DATABASE_URL`: Neon PostgreSQL connection string.
- `ZOHO_SMTP_PASSWORD`: Zoho mailbox password or app-specific password, according to your Zoho account's security configuration.

Clerk credentials and any other deployment-specific secrets should be configured according to the current Clerk integration and Worker environment. Do not add real credentials to `.dev.vars.example`, source files, screenshots, logs, or Git history. Use separate values for development and production.

## Deploy a new instance

### 1. Create a Neon project

Create a project in the [Neon Console](https://console.neon.tech/) and copy its PostgreSQL connection string. The database name is commonly `neondb`, unless you choose another name.

### 2. Configure Cloudflare

- Add your domain to Cloudflare DNS.
- Enable Email Routing.
- Enable Workers AI if you plan to use the built-in model fallback.
- Configure the Worker, Durable Object bindings, and migrations in `wrangler.jsonc`.
- Configure the Worker environment and required secrets.

### 3. Configure Clerk and Zoho

- Configure the Clerk application and the authorized account(s) for your deployment.
- Configure the Zoho SMTP host, port, username, sender name, and SMTP password.
- Confirm that the authenticated Zoho mailbox is permitted to send from the configured From address.

### 4. Install, validate, and deploy

```bash
npm install
npm run typecheck
npm test
npm run deploy
```

### 5. Route incoming email

In Cloudflare Email Routing, create a rule for the desired address or catch-all domain and choose **Send to a Worker**, selecting the deployed Agentic Inbox Worker.

### 6. Create a mailbox and verify delivery

Open the deployed application, sign in with an authorized account, and create/configure a mailbox address. Then test both directions:

1. Send an external message to the mailbox and confirm it appears in Inbox.
2. Send a message from Agentic Inbox and confirm Zoho accepts it.
3. Test replies, forwards, and attachments.
4. Configure AI providers and test model connectivity.
5. Test each AI sending permission independently, including disabled states.
6. Generate an MCP key, connect a compatible client, verify allowed operations, then test revocation.

A successful build or test suite does not replace live SMTP, authentication, email-routing, and MCP smoke tests.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Add local development values to `.dev.vars` using the variable names required by the current Worker configuration. Use a development Neon database and test SMTP credentials; never use production credentials for untrusted local code.

4. Set `DOMAINS` and `EMAIL_ADDRESSES` in the local Wrangler configuration for your test environment.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Run checks:

   ```bash
   npm run typecheck
   npm test
   ```

## Tests and validation

The repository uses Vitest. Run the full test suite with:

```bash
npm test
```

Run type checking and the production build with:

```bash
npm run typecheck
npm run build
```

SMTP transport tests use a test SMTP mock; API integration tests isolate Worker-only modules where needed. A Preview build does not prove that production database, authentication, Email Routing, provider credentials, or SMTP secrets are configured correctly.

Before treating a deployment as production-ready, run a live smoke test for:

- Sign-in and authorized-account restrictions.
- Incoming Email Routing and mailbox storage.
- SMTP send, reply, and forward.
- Each independent AI email permission and its disabled behavior.
- Primary model and fallback behavior.
- MCP authentication, tool permissions, and key revocation.
- Conversation history persistence and deletion.
- Saving all Settings sections, including partial-failure reporting.

## Security and operational notes

- Keep API keys, SMTP credentials, database URLs, and bearer tokens in Worker secrets or the appropriate secure server-side store.
- AI provider credentials are server-side configuration; never expose them in browser bundles.
- MCP API keys are stored as SHA-256 hashes. The raw generated key is only shown at creation time.
- MCP authentication fails closed when key validation cannot be completed.
- Email content, attachments, and quoted messages are untrusted input. The assistant must not treat instructions inside them as permission to send mail, disclose data, or change settings.
- Sending permissions are enforced in server-side tools. Do not rely on hiding or disabling a frontend button as the security boundary.
- Neon and Durable Objects have independent storage and usage limits. Monitor both as mailbox, attachment, and chat volume grows.
- Attachment payloads are stored in sequential 1 MiB chunks to keep SQLite writes bounded and support streamed downloads.
- If SMTP accepts a message but saving the local Sent copy fails, check Sent and the API warning before attempting to resend.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Sign-in is rejected | Check Clerk application configuration and the authorized-account setting in the Worker environment. |
| Database configuration error | Verify `DATABASE_URL` in the correct environment and confirm Neon is reachable. |
| Outbound email fails | Verify the Zoho SMTP hostname for your data centre, port, username, app password, and SMTP access. Check Worker logs for the SMTP error. |
| Sender address is rejected | The From address must be permitted by the authenticated Zoho account and the application's sender policy. |
| Incoming email is not stored | Check the Email Routing rule, Worker email handler, recipient address, and that the mailbox exists in Neon. |
| AI provider cannot fetch models | Check provider type, base URL, API key, and whether the provider exposes a compatible models endpoint. |
| AI model request fails | Check the selected provider/model, provider account limits, API key permissions, and configured fallback targets. |
| AI send is blocked | Check the matching automatic-reply, chat, or MCP permission. Each send permission is independent. |
| MCP client is unauthorized | Check the bearer token, whether it has been revoked, and that the client sends it in the `Authorization` header. |
| Chat history is missing | Check Neon conversation metadata and the corresponding EmailAgent Durable Object history. |
| Settings save reports partial failure | Read the section-specific error. A successful section is not rolled back just because another settings section failed. |
| Attachment integrity error | The stored chunk set may be incomplete or its reconstructed size may not match attachment metadata. |

## License

Apache License 2.0. See [LICENSE](./LICENSE).
