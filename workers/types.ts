// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	DATABASE_URL: string;
	LLM_ENCRYPTION_KEY: string;
	ZOHO_SMTP_HOST: string;
	ZOHO_SMTP_PORT: string;
	ZOHO_SMTP_USERNAME: string;
	ZOHO_SMTP_FROM_NAME: string;
	ZOHO_SMTP_PASSWORD: string;
}
