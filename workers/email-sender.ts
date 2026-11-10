// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Outbound email delivery through the Zoho Mail SMTP account.
 *
 * This transport runs directly inside Cloudflare Workers using TCP sockets
 * through @workermailer/smtp. Credentials are supplied only by Worker secrets.
 */

import { WorkerMailer } from "@workermailer/smtp";

export interface ZohoSmtpEnv {
	ZOHO_SMTP_HOST?: string;
	ZOHO_SMTP_PORT?: string;
	ZOHO_SMTP_USERNAME?: string;
	ZOHO_SMTP_FROM_NAME?: string;
	ZOHO_SMTP_PASSWORD?: string;
}

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
}

/**
 * Send through Zoho SMTP and resolve only after the SMTP server accepts the
 * message. A rejected or failed SMTP transaction is propagated to the route.
 */
export async function sendEmail(
	env: ZohoSmtpEnv,
	params: SendEmailParams,
): Promise<void> {
	const host = env.ZOHO_SMTP_HOST?.trim();
	const username = env.ZOHO_SMTP_USERNAME?.trim();
	const password = env.ZOHO_SMTP_PASSWORD;
	const port = Number(env.ZOHO_SMTP_PORT || "587");

	if (!host || !username || !password) {
		throw new Error(
			"Zoho SMTP is not fully configured. Check ZOHO_SMTP_HOST, ZOHO_SMTP_USERNAME, and the ZOHO_SMTP_PASSWORD Worker secret.",
		);
	}
	if (!Number.isInteger(port) || (port !== 465 && port !== 587)) {
		throw new Error("Zoho SMTP port must be 465 (implicit TLS) or 587 (STARTTLS).");
	}

	const fromEmail = (typeof params.from === "string" ? params.from : params.from.email).trim().toLowerCase();
	const fromName = env.ZOHO_SMTP_FROM_NAME?.trim() || "Neeraj Singh";
	if (fromEmail !== username.toLowerCase()) {
		throw new Error(
			"Zoho SMTP authenticates as " + username +
			". Sending from " + fromEmail +
			" requires that address to be configured as an authorized Zoho alias or to use its own SMTP account.",
		);
	}

	const mailer = await WorkerMailer.connect({
		host,
		port,
		secure: port === 465,
		startTls: port === 587,
		authType: "plain",
		credentials: { username, password },
		socketTimeoutMs: 20_000,
		responseTimeoutMs: 20_000,
	});

	try {
		await mailer.send({
			to: params.to,
			from: { email: fromEmail, name: fromName },
			subject: params.subject,
			...(params.html ? { html: params.html } : {}),
			...(params.text ? { text: params.text } : {}),
			...(params.cc ? { cc: params.cc } : {}),
			...(params.bcc ? { bcc: params.bcc } : {}),
			...(params.replyTo ? { reply: params.replyTo } : {}),
			...(params.headers && Object.keys(params.headers).length > 0
				? { headers: params.headers }
				: {}),
			...(params.attachments && params.attachments.length > 0
				? {
					attachments: params.attachments.map((attachment) => ({
						filename: attachment.filename,
						content: attachment.content,
						mimeType: attachment.type,
						inline: attachment.disposition === "inline",
						...(attachment.contentId ? { cid: attachment.contentId } : {}),
					})),
				}
				: {}),
		});
	} finally {
		await mailer.close();
	}
}
