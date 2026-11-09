// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { eq } from "drizzle-orm";
import type { NeonDb } from "../neon-client";
import { mailboxes, mailboxSettings } from "../neon-schema";
import { z } from "zod";

export const MailboxSettingsSchema = z
	.object({
		fromName: z.string().optional(),
		forwarding: z
			.object({
				enabled: z.boolean(),
				email: z.string(),
			})
			.optional(),
		signature: z
			.object({
				enabled: z.boolean(),
				text: z.string(),
			})
			.optional(),
		autoReply: z
			.object({
				enabled: z.boolean(),
				subject: z.string(),
				message: z.string(),
			})
			.optional(),
		agentSystemPrompt: z.string().optional(),
	})
	.passthrough();

export type MailboxSettings = z.infer<typeof MailboxSettingsSchema>;

export interface MailboxRecord {
	id: string; // normalized email
	email: string; // canonical email
	name: string; // display name
	status: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface MailboxWithSettings extends MailboxRecord {
	settings: Record<string, unknown>;
}

export class DuplicateMailboxError extends Error {
	constructor(public email: string) {
		super(`Mailbox "${email}" already exists`);
		this.name = "DuplicateMailboxError";
	}
}

export class MailboxNotFoundError extends Error {
	constructor(public id: string) {
		super(`Mailbox "${id}" not found`);
		this.name = "MailboxNotFoundError";
	}
}

/**
 * Normalize an email address to a consistent identifier:
 * lowercase and whitespace-trimmed.
 */
export function normalizeMailboxId(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * Mailbox repository providing Neon-backed persistence.
 */
export class MailboxRepository {
	constructor(private db: NeonDb) {}

	/**
	 * Create a new mailbox and its initial settings.
	 * Enforces address normalization and prevents concurrent duplicate creation.
	 */
	async createMailbox(params: {
		email: string;
		name: string;
		settings?: Record<string, unknown>;
	}): Promise<MailboxWithSettings> {
		const canonicalEmail = params.email.trim();
		const normalizedId = normalizeMailboxId(canonicalEmail);
		const displayName = params.name.trim();

		const defaultSettings = {
			fromName: displayName,
			forwarding: { enabled: false, email: "" },
			signature: { enabled: false, text: "" },
			autoReply: { enabled: false, subject: "", message: "" },
		};

		const finalSettings = {
			...defaultSettings,
			...(params.settings || {}),
		};

		// Validate settings structure
		MailboxSettingsSchema.parse(finalSettings);

		const now = new Date();

		try {
			await this.db.insert(mailboxes).values({
				id: normalizedId,
				email: canonicalEmail,
				name: displayName,
				status: "active",
				createdAt: now,
				updatedAt: now,
			});

			await this.db.insert(mailboxSettings).values({
				mailboxId: normalizedId,
				settingsJson: finalSettings,
				updatedAt: now,
			});

			return {
				id: normalizedId,
				email: canonicalEmail,
				name: displayName,
				status: "active",
				createdAt: now,
				updatedAt: now,
				settings: finalSettings,
			};
		} catch (err: any) {
			// Check for PostgreSQL unique constraint violation (code 23505) or duplicate key
			const cause = err?.cause || err;
			const code = cause?.code || err?.code;
			const message = String(cause?.message || err?.message || "");
			if (code === "23505" || message.includes("unique") || message.includes("already exists") || message.includes("duplicate key")) {
				throw new DuplicateMailboxError(canonicalEmail);
			}
			throw err;
		}
	}

	/**
	 * Get a mailbox by ID or email (normalized).
	 */
	async getMailbox(mailboxId: string): Promise<MailboxWithSettings | null> {
		const normalizedId = normalizeMailboxId(mailboxId);

		const box = await this.db
			.select()
			.from(mailboxes)
			.where(eq(mailboxes.id, normalizedId))
			.limit(1);

		if (!box.length) return null;

		const m = box[0];

		const settingsRow = await this.db
			.select()
			.from(mailboxSettings)
			.where(eq(mailboxSettings.mailboxId, normalizedId))
			.limit(1);

		const settings = (settingsRow[0]?.settingsJson as Record<string, unknown>) ?? {
			fromName: m.name,
			forwarding: { enabled: false, email: "" },
			signature: { enabled: false, text: "" },
			autoReply: { enabled: false, subject: "", message: "" },
		};

		return {
			id: m.id,
			email: m.email,
			name: m.name,
			status: m.status,
			createdAt: m.createdAt,
			updatedAt: m.updatedAt,
			settings,
		};
	}

	/**
	 * List all mailboxes.
	 */
	async listMailboxes(): Promise<MailboxWithSettings[]> {
		const boxes = await this.db
			.select()
			.from(mailboxes)
			.where(eq(mailboxes.status, "active"));

		if (boxes.length === 0) return [];

		const settingsRows = await this.db.select().from(mailboxSettings);
		const settingsMap = new Map<string, Record<string, unknown>>();
		for (const row of settingsRows) {
			settingsMap.set(row.mailboxId, row.settingsJson as Record<string, unknown>);
		}

		return boxes.map((box) => ({
			id: box.id,
			email: box.email,
			name: box.name,
			status: box.status,
			createdAt: box.createdAt,
			updatedAt: box.updatedAt,
			settings: settingsMap.get(box.id) ?? {
				fromName: box.name,
				forwarding: { enabled: false, email: "" },
				signature: { enabled: false, text: "" },
				autoReply: { enabled: false, subject: "", message: "" },
			},
		}));
	}

	/**
	 * Delete a mailbox and its settings.
	 */
	async deleteMailbox(mailboxId: string): Promise<boolean> {
		const normalizedId = normalizeMailboxId(mailboxId);

		const existing = await this.db
			.select({ id: mailboxes.id })
			.from(mailboxes)
			.where(eq(mailboxes.id, normalizedId))
			.limit(1);

		if (!existing.length) return false;

		await this.db.delete(mailboxes).where(eq(mailboxes.id, normalizedId));
		return true;
	}

	/**
	 * Retrieve settings for a mailbox.
	 */
	async getMailboxSettings(mailboxId: string): Promise<Record<string, unknown> | null> {
		const normalizedId = normalizeMailboxId(mailboxId);

		const settingsRow = await this.db
			.select({ settingsJson: mailboxSettings.settingsJson })
			.from(mailboxSettings)
			.where(eq(mailboxSettings.mailboxId, normalizedId))
			.limit(1);

		if (!settingsRow.length) return null;
		return settingsRow[0].settingsJson as Record<string, unknown>;
	}

	/**
	 * Update settings for an existing mailbox.
	 */
	async updateMailboxSettings(
		mailboxId: string,
		settings: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const normalizedId = normalizeMailboxId(mailboxId);

		const existing = await this.db
			.select({ id: mailboxes.id })
			.from(mailboxes)
			.where(eq(mailboxes.id, normalizedId))
			.limit(1);

		if (!existing.length) {
			throw new MailboxNotFoundError(mailboxId);
		}

		MailboxSettingsSchema.parse(settings);

		const now = new Date();

		// Upsert settings in case it didn't exist
		const existingSettings = await this.db
			.select({ mailboxId: mailboxSettings.mailboxId })
			.from(mailboxSettings)
			.where(eq(mailboxSettings.mailboxId, normalizedId))
			.limit(1);

		if (existingSettings.length) {
			await this.db
				.update(mailboxSettings)
				.set({
					settingsJson: settings,
					updatedAt: now,
				})
				.where(eq(mailboxSettings.mailboxId, normalizedId));
		} else {
			await this.db.insert(mailboxSettings).values({
				mailboxId: normalizedId,
				settingsJson: settings,
				updatedAt: now,
			});
		}

		await this.db
			.update(mailboxes)
			.set({ updatedAt: now })
			.where(eq(mailboxes.id, normalizedId));

		return settings;
	}
}
