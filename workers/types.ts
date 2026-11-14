// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

// Keep Wrangler-generated bindings (vars and Durable Object namespaces) as
// their generated types. Only add secrets here; redeclaring generated vars as
// plain string widens literal types and makes this interface incompatible with
// Cloudflare.Env after `wrangler types`.
export type Env = Cloudflare.Env & {
	CLERK_SECRET_KEY: string;
	CLERK_JWT_KEY: string;
	DATABASE_URL: string;
	ZOHO_SMTP_PASSWORD: string;
	LLM_ENCRYPTION_KEY: string;
};
