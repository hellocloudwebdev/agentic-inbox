// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	CLERK_PUBLISHABLE_KEY: string;
	CLERK_SECRET_KEY: string;
	CLERK_JWT_KEY: string;
	CLERK_ALLOWED_EMAIL: string;
	DATABASE_URL: string;
	ZOHO_SMTP_HOST: string;
	ZOHO_SMTP_PORT: string;
	ZOHO_SMTP_USERNAME: string;
	ZOHO_SMTP_FROM_NAME: string;
	ZOHO_SMTP_PASSWORD: string;
	LLM_ENCRYPTION_KEY: string;
}
