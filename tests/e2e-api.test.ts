// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, beforeEach, vi } from "vitest";

// This suite exercises API and storage behavior in Node; isolate the Worker-only
// SMTP transport so Node does not try to load Cloudflare's cloudflare:sockets module.
vi.mock("@workermailer/smtp", () => ({
	WorkerMailer: {
		connect: vi.fn(async () => ({
			send: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined),
		})),
	},
}));
import { app } from "../workers/index";
import { createMockNeonClient, createMockNeonStore, type MockNeonStore } from "./mock-neon-db";
import { getNeonDb, ensureNeonSchema, resetMigrationCache } from "../workers/db/neon-client";
import { MailboxRepository } from "../workers/db/repositories/mailbox-repository";
import { prepareAttachments, attachmentStorage } from "../workers/lib/attachments";
import { Folders } from "../shared/folders";

describe("End-to-End API and Integration Workflows", () => {
	let store: MockNeonStore;
	let mockSql: any;
	let mockEnv: any;
	let mockMailboxDOStub: any;
	let emailsStore: Map<string, any>;
	let attachmentsStore: Map<string, any>;
	let chunksStore: Map<string, Uint8Array>;

	beforeEach(() => {
		resetMigrationCache();
		store = createMockNeonStore();
		mockSql = createMockNeonClient(store);
		emailsStore = new Map();
		attachmentsStore = new Map();
		chunksStore = new Map();

		mockMailboxDOStub = {
			getFolders: async () => [
				{ id: "inbox", name: "Inbox", unreadCount: 0 },
				{ id: "sent", name: "Sent", unreadCount: 0 },
				{ id: "trash", name: "Trash", unreadCount: 0 },
				{ id: "archive", name: "Archive", unreadCount: 0 },
				{ id: "spam", name: "Spam", unreadCount: 0 },
				{ id: "draft", name: "Drafts", unreadCount: 0 },
			],
			createEmail: async (folder: string, email: any, atts: any[] = []) => {
				emailsStore.set(email.id, { ...email, folder_id: folder });
				for (const att of atts) {
					attachmentsStore.set(att.id, { ...att, email_id: email.id });
					if (att.chunks) {
						for (let i = 0; i < att.chunks.length; i++) {
							chunksStore.set(`${att.id}:${i}`, att.chunks[i]);
						}
					}
				}
			},
			getEmail: async (id: string) => {
				const email = emailsStore.get(id);
				if (!email) return null;
				const atts = Array.from(attachmentsStore.values()).filter((a) => a.email_id === id);
				return { ...email, attachments: atts };
			},
			getEmails: async (opts: any = {}) => {
				let list = Array.from(emailsStore.values());
				if (opts.folder) list = list.filter((e) => e.folder_id === opts.folder);
				if (opts.thread_id) list = list.filter((e) => e.thread_id === opts.thread_id);
				return list;
			},
			getThreadEmails: async (threadId: string) => {
				const list = Array.from(emailsStore.values()).filter((e) => e.thread_id === threadId);
				return list.map((e) => {
					const atts = Array.from(attachmentsStore.values()).filter((a) => a.email_id === e.id);
					return { ...e, attachments: atts };
				});
			},
			countEmails: async (opts: any = {}) => {
				let list = Array.from(emailsStore.values());
				if (opts.folder) list = list.filter((e) => e.folder_id === opts.folder);
				return list.length;
			},
			getAttachment: async (id: string) => {
				return attachmentsStore.get(id) ?? null;
			},
			getAttachmentChunk: async (id: string, chunkIndex: number) => {
				return chunksStore.get(`${id}:${chunkIndex}`) ?? null;
			},
			getAttachmentContent: async (id: string) => {
				const att = attachmentsStore.get(id);
				if (!att) throw new Error("Attachment not found");
				const chunks: Uint8Array[] = [];
				let total = 0;
				for (let i = 0; i < (att.chunk_count || 1); i++) {
					const c = chunksStore.get(`${id}:${i}`);
					if (!c) throw new Error("Missing chunk");
					chunks.push(c);
					total += c.byteLength;
				}
				const out = new Uint8Array(total);
				let off = 0;
				for (const c of chunks) {
					out.set(c, off);
					off += c.byteLength;
				}
				return out;
			},
			deleteEmail: async (id: string) => {
				if (!emailsStore.has(id)) return null;
				emailsStore.delete(id);
				const deletedAtts: any[] = [];
				for (const [attId, att] of attachmentsStore.entries()) {
					if (att.email_id === id) {
						deletedAtts.push(att);
						for (let i = 0; i < (att.chunk_count || 1); i++) {
							chunksStore.delete(`${attId}:${i}`);
						}
						attachmentsStore.delete(attId);
					}
				}
				return deletedAtts;
			},
			checkSendRateLimit: async () => null,
			markThreadRead: async () => ({ markedRead: true }),
		};

		mockEnv = {
			DATABASE_URL: "postgresql://mock:mock@localhost/mockdb",
			DOMAINS: "example.com",
			EMAIL_ADDRESSES: [],
			POLICY_AUD: "test-aud",
			TEAM_DOMAIN: "https://test.cloudflareaccess.com",
			MAILBOX: {
				idFromName: (name: string) => ({ toString: () => name }),
				get: () => mockMailboxDOStub,
			},
			EMAIL: {
				send: async () => ({ messageId: "sent-msg-123" }),
			},
		};
	});

	it("completes full mailbox lifecycle: create on empty db, get, update settings, list, delete", async () => {
		// Initialize database schema
		await ensureNeonSchema(mockEnv, mockSql);
		const repo = new MailboxRepository(getNeonDb(mockEnv, mockSql));

		// 1. Create mailbox
		const created = await repo.createMailbox({
			email: "admin@example.com",
			name: "Administrator",
			settings: { agentSystemPrompt: "Be ultra concise." },
		});
		expect(created.id).toBe("admin@example.com");
		expect(created.name).toBe("Administrator");

		// 2. Get mailbox
		const fetched = await repo.getMailbox("admin@example.com");
		expect(fetched).not.toBeNull();
		expect(fetched?.settings.agentSystemPrompt).toBe("Be ultra concise.");

		// 3. Update settings
		const updatedSettings = await repo.updateMailboxSettings("admin@example.com", {
			fromName: "Admin User",
			signature: { enabled: true, text: "-- Admin Team" },
		});
		expect(updatedSettings.fromName).toBe("Admin User");

		// 4. List mailboxes
		const list = await repo.listMailboxes();
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe("admin@example.com");

		// 5. Delete mailbox
		const deleted = await repo.deleteMailbox("admin@example.com");
		expect(deleted).toBe(true);

		const remaining = await repo.listMailboxes();
		expect(remaining).toHaveLength(0);
	});

	it("stores and downloads attachment round-trip without R2", async () => {
		const emailId = "email-e2e-1";
		const binaryPayload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

		// Store email with attachment via MailboxDO
		const prepared = prepareAttachments(emailId, [
			{
				content: binaryPayload,
				filename: "report.pdf",
				type: "application/pdf",
				disposition: "attachment",
			},
		]);

		await mockMailboxDOStub.createEmail(
			Folders.INBOX,
			{
				id: emailId,
				subject: "Financial Report",
				sender: "cfo@example.com",
				recipient: "admin@example.com",
				date: new Date().toISOString(),
				body: "Please find report attached.",
			},
			prepared,
		);

		// Verify email and attachment stored
		const email = await mockMailboxDOStub.getEmail(emailId);
		expect(email).not.toBeNull();
		expect(email.attachments).toHaveLength(1);
		expect(email.attachments[0].filename).toBe("report.pdf");

		// Verify streaming attachment download
		const attId = email.attachments[0].id;
		const { metadata, stream } = await attachmentStorage.readStream(mockMailboxDOStub, attId);
		expect(metadata.filename).toBe("report.pdf");
		expect(metadata.size).toBe(binaryPayload.byteLength);

		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual(binaryPayload);
	});

	it("cleans up all attachment data when email is deleted", async () => {
		const emailId = "email-to-del";
		const prepared = prepareAttachments(emailId, [
			{ content: new Uint8Array([1, 2, 3]), filename: "a.png", type: "image/png" },
			{ content: new Uint8Array([4, 5, 6]), filename: "b.png", type: "image/png" },
		]);

		await mockMailboxDOStub.createEmail(
			Folders.INBOX,
			{ id: emailId, subject: "Test", sender: "s@e.com", recipient: "r@e.com", date: "", body: "" },
			prepared,
		);

		expect(attachmentsStore.size).toBe(2);
		expect(chunksStore.size).toBe(2);

		// Delete email
		await mockMailboxDOStub.deleteEmail(emailId);

		// Verify zero email, zero attachments, zero chunks
		expect(emailsStore.has(emailId)).toBe(false);
		expect(attachmentsStore.size).toBe(0);
		expect(chunksStore.size).toBe(0);
	});
});
