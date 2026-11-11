# Clerk Google authentication setup

Agentic Inbox now uses Clerk sessions instead of Cloudflare Access OTP for application authentication. Access is restricted to **hellocloud.webdev@gmail.com**. Existing mailbox records and settings remain in Neon; the first Google sign-in creates or recognizes the corresponding Clerk identity.

## 1. Configure Clerk

Create a Clerk application in the Clerk Dashboard (or select the existing Clerk application you intend to use). Do not use development keys in production.

In **Configure → SSO connections**:
1. Add **Google** for all users and enable sign-up and sign-in.
2. For a production Clerk instance, enable custom credentials and configure a Google OAuth Web application in Google Cloud Console.
3. Copy the exact Authorized Redirect URI shown by Clerk into Google Cloud Console. Add your deployed application origin to Authorized JavaScript origins.
4. In Clerk, disable other sign-in methods if you want Google to be the only sign-in option.

Google's production social connection requires custom OAuth credentials. Clerk's development instance can use its preconfigured shared credentials.

## 2. Add the session email claim

The backend intentionally checks the signed-in user's email against the one allowed account. In Clerk Dashboard → **Sessions** → **Customize session token** → Claims, add:

```json
{
  "primaryEmail": "{{user.primary_email_address}}"
}
```

Save the claim. The worker reads this signed claim; it does not trust a client-supplied email address.

## 3. Configure Worker environment

Set these values for both local development and the deployed Worker:

- `CLERK_PUBLISHABLE_KEY`: the Clerk publishable key (`pk_test_...` in development, `pk_live_...` in production). This is public and is passed to the frontend by the root loader.
- `CLERK_JWT_KEY`: the PEM public key from Clerk Dashboard → API keys → **Show JWT public key**. Store it as a Worker secret; do not put it in source control.
- `CLERK_ALLOWED_EMAIL`: `hellocloud.webdev@gmail.com` (already set in `wrangler.jsonc`).

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in your real keys. For production, add `CLERK_PUBLISHABLE_KEY` as a Worker variable and `CLERK_JWT_KEY` as a secret. Example secret command:

```bash
wrangler secret put CLERK_JWT_KEY
```

The JWT public key is not the Clerk Secret Key. This app verifies the signed session JWT with the public key, without calling Clerk's Backend API on every request.

## 4. Cut over from Cloudflare Access OTP

Keep the current Cloudflare Access OTP application enabled until this Clerk build is deployed and tested. Then:
1. Open the app and sign in using Google as `hellocloud.webdev@gmail.com`.
2. Confirm the mailbox list, settings, API calls, and AI chat work.
3. Disable/remove the Cloudflare Access OTP requirement for this Agentic Inbox hostname so Clerk becomes the only interactive login gate. Do not change Access applications for unrelated services.

The Worker now redirects unauthenticated page requests to `/sign-in`, returns 401 for unauthenticated API/Agent/MCP requests, and rejects authenticated Clerk users whose primary email is not the allowlisted account.

## Identity and data migration note

Cloudflare Access OTP is an edge access policy, not a user/password record in Agentic Inbox. There is no Cloudflare OTP password or user profile to import into Clerk. Signing in with Google using the same Gmail address creates or signs into the Clerk user for that email. Existing Neon mailboxes, messages, LLM configuration, and saved skills are not rewritten by this auth migration.
