// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Hono middleware to handle repetitive Mailbox Durable Object instantiation.
 * Checks if the mailbox exists in Neon PostgreSQL, then instantiates the DO stub
 * and attaches it to the Hono context (`c.var.mailboxStub`).
 */
import { createMiddleware } from "hono/factory";
import type { MailboxDO } from "../durableObject";
import type { Env } from "../types";
import { getNeonDb, ensureNeonSchema } from "../db/neon-client";
import { MailboxRepository, normalizeMailboxId } from "../db/repositories/mailbox-repository";

export type MailboxContext = {
	Bindings: Env;
	Variables: {
		mailboxStub: DurableObjectStub<MailboxDO>;
		mailboxRepo?: MailboxRepository;
	};
};

export const requireMailbox = createMiddleware<MailboxContext>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = decodeURIComponent(rawId);
	const normalizedId = normalizeMailboxId(mailboxId);

	// Verify mailbox exists in Neon
	await ensureNeonSchema(c.env);
	const repo = new MailboxRepository(getNeonDb(c.env));
	const mailbox = await repo.getMailbox(normalizedId);
	if (!mailbox) {
		return c.json({ error: "Not found" }, 404);
	}

	// Instantiate DO stub using normalized ID
	const ns = c.env.MAILBOX;
	const id = ns.idFromName(normalizedId);
	const stub = ns.get(id);

	c.set("mailboxStub", stub);
	c.set("mailboxRepo", repo);
	
	await next();
});
