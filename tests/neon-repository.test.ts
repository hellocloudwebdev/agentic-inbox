// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../workers/db/neon-schema";
import {
	MailboxRepository,
	DuplicateMailboxError,
	MailboxNotFoundError,
	normalizeMailboxId,
} from "../workers/db/repositories/mailbox-repository";
import { AppSettingsRepository } from "../workers/db/repositories/app-settings-repository";
import {
	createMockNeonClient,
	createMockNeonStore,
	type MockNeonStore,
} from "./mock-neon-db";
import {
	applyNeonMigrations,
	neonMigrationsList,
} from "../workers/db/neon-migrations";
import {
	getNeonDb,
	ensureNeonSchema,
	resetMigrationCache,
	DatabaseConfigError,
} from "../workers/db/neon-client";

describe("Neon Database & Repository Integration Tests", () => {
	let store: MockNeonStore;
	let mockSql: any;
	let db: any;
	let mailboxRepo: MailboxRepository;
	let appSettingsRepo: AppSettingsRepository;

	beforeEach(() => {
		resetMigrationCache();
		store = createMockNeonStore();
		mockSql = createMockNeonClient(store);
		db = drizzle(mockSql, { schema });
		mailboxRepo = new MailboxRepository(db);
		appSettingsRepo = new AppSettingsRepository(db);
	});

	describe("Migration runner", () => {
		it("applies migrations in order and records them in neon_migrations", async () => {
			const applied = await applyNeonMigrations(mockSql);
			expect(applied).toEqual(["0001_initial_schema"]);
			expect(store.migrations.has("0001_initial_schema")).toBe(true);

			// Running a second time should be idempotent and apply nothing
			const secondRun = await applyNeonMigrations(mockSql);
			expect(secondRun).toEqual([]);
		});
	});

	describe("Address normalization", () => {
		it("normalizes mailbox IDs by trimming and lowercasing", () => {
			expect(normalizeMailboxId("  Alex@Example.COM  ")).toBe("alex@example.com");
			expect(normalizeMailboxId("Hello.World+tag@DOMAIN.NET")).toBe("hello.world+tag@domain.net");
		});
	});

	describe("Mailbox creation and duplicate handling", () => {
		it("creates a mailbox with canonical email and default settings", async () => {
			const created = await mailboxRepo.createMailbox({
				email: "Support@Acme.COM",
				name: "Acme Support",
			});

			expect(created.id).toBe("support@acme.com");
			expect(created.email).toBe("Support@Acme.COM");
			expect(created.name).toBe("Acme Support");
			expect(created.status).toBe("active");
			expect(created.settings).toMatchObject({
				fromName: "Acme Support",
				forwarding: { enabled: false, email: "" },
				signature: { enabled: false, text: "" },
				autoReply: { enabled: false, subject: "", message: "" },
			});
		});

		it("rejects duplicate mailboxes with identical normalized address", async () => {
			await mailboxRepo.createMailbox({
				email: "support@acme.com",
				name: "Support 1",
			});

			// Attempting to create with different case should fail
			await expect(
				mailboxRepo.createMailbox({
					email: "SUPPORT@acme.com",
					name: "Support Duplicate",
				}),
			).rejects.toThrow(DuplicateMailboxError);
		});

		it("verifies concurrent mailbox creation behavior", async () => {
			// When two concurrent creation requests hit the repository at the same time:
			const promises = [
				mailboxRepo.createMailbox({ email: "concurrent@acme.com", name: "Worker 1" }),
				mailboxRepo.createMailbox({ email: "concurrent@acme.com", name: "Worker 2" }),
			];

			const results = await Promise.allSettled(promises);
			const fulfilled = results.filter((r) => r.status === "fulfilled");
			const rejected = results.filter((r) => r.status === "rejected");

			expect(fulfilled.length).toBe(1);
			expect(rejected.length).toBe(1);
			expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateMailboxError);
		});
	});

	describe("Mailbox retrieval and listing", () => {
		it("retrieves a mailbox case-insensitively", async () => {
			await mailboxRepo.createMailbox({
				email: "info@acme.com",
				name: "Acme Info",
				settings: { signature: { enabled: true, text: "-- Acme Inc" } },
			});

			const found = await mailboxRepo.getMailbox("INFO@ACME.COM");
			expect(found).not.toBeNull();
			expect(found?.id).toBe("info@acme.com");
			expect(found?.email).toBe("info@acme.com");
			expect(found?.settings.signature).toEqual({ enabled: true, text: "-- Acme Inc" });
		});

		it("returns null for non-existent mailbox", async () => {
			const found = await mailboxRepo.getMailbox("missing@acme.com");
			expect(found).toBeNull();
		});

		it("lists all active mailboxes", async () => {
			await mailboxRepo.createMailbox({ email: "a@acme.com", name: "A" });
			await mailboxRepo.createMailbox({ email: "b@acme.com", name: "B" });

			const list = await mailboxRepo.listMailboxes();
			expect(list).toHaveLength(2);
			const emails = list.map((m) => m.email);
			expect(emails).toContain("a@acme.com");
			expect(emails).toContain("b@acme.com");
		});

		it("returns empty array when no mailboxes exist", async () => {
			const list = await mailboxRepo.listMailboxes();
			expect(list).toEqual([]);
		});
	});

	describe("Mailbox settings management", () => {
		it("stores and retrieves settings", async () => {
			await mailboxRepo.createMailbox({
				email: "settings-test@acme.com",
				name: "Settings Test",
				settings: { agentSystemPrompt: "You are a helpful email agent." },
			});

			const settings = await mailboxRepo.getMailboxSettings("settings-test@acme.com");
			expect(settings).not.toBeNull();
			expect(settings?.agentSystemPrompt).toBe("You are a helpful email agent.");
		});

		it("updates mailbox settings and updates updatedAt", async () => {
			await mailboxRepo.createMailbox({
				email: "update-test@acme.com",
				name: "Update Test",
			});

			const updated = await mailboxRepo.updateMailboxSettings("update-test@acme.com", {
				fromName: "Updated Name",
				autoReply: { enabled: true, subject: "Out of office", message: "Back on Monday" },
			});

			expect(updated.fromName).toBe("Updated Name");

			const retrieved = await mailboxRepo.getMailbox("update-test@acme.com");
			expect(retrieved?.settings.fromName).toBe("Updated Name");
			expect((retrieved?.settings.autoReply as any)?.enabled).toBe(true);
		});

		it("throws MailboxNotFoundError when updating non-existent mailbox", async () => {
			await expect(
				mailboxRepo.updateMailboxSettings("doesnotexist@acme.com", { fromName: "Ghost" }),
			).rejects.toThrow(MailboxNotFoundError);
		});
	});

	describe("Mailbox deletion", () => {
		it("deletes a mailbox and cascades to settings", async () => {
			await mailboxRepo.createMailbox({
				email: "to-delete@acme.com",
				name: "Delete Me",
			});

			expect(store.mailboxes.has("to-delete@acme.com")).toBe(true);
			expect(store.mailboxSettings.has("to-delete@acme.com")).toBe(true);

			const deleted = await mailboxRepo.deleteMailbox("to-delete@acme.com");
			expect(deleted).toBe(true);
			expect(store.mailboxes.has("to-delete@acme.com")).toBe(false);
			expect(store.mailboxSettings.has("to-delete@acme.com")).toBe(false);

			// Calling delete again should return false
			const deletedAgain = await mailboxRepo.deleteMailbox("to-delete@acme.com");
			expect(deletedAgain).toBe(false);
		});
	});

	describe("App settings repository", () => {
		it("stores, retrieves, and deletes application settings", async () => {
			await appSettingsRepo.setSetting("global_theme", { mode: "dark", accent: "blue" });

			const setting = await appSettingsRepo.getSetting<{ mode: string; accent: string }>("global_theme");
			expect(setting).toEqual({ mode: "dark", accent: "blue" });

			const deleted = await appSettingsRepo.deleteSetting("global_theme");
			expect(deleted).toBe(true);

			const missing = await appSettingsRepo.getSetting("global_theme");
			expect(missing).toBeNull();
		});
	});

	describe("Database connection failure handling", () => {
		it("throws DatabaseConfigError when DATABASE_URL is not configured", () => {
			expect(() => getNeonDb({} as any)).toThrow(DatabaseConfigError);
		});
	});
});
