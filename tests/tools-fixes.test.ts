import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for MCP tool-layer fixes:
 * - mark_email_read / move_email no longer report success on missing emails
 * - update_draft updates in place and keeps a stable draft ID
 * - list/search payloads no longer include raw_headers
 * - the draft verifier is time-bounded and draft saving survives verifier outages
 */

// ── Mocks (factories may only reference `mock*` variables) ────────────

const mockStub = {
	getEmail: vi.fn(),
	getEmails: vi.fn(),
	searchEmails: vi.fn(),
	createEmail: vi.fn(),
	updateEmail: vi.fn(),
	deleteEmail: vi.fn(),
	moveEmail: vi.fn(),
};

vi.mock("../workers/lib/email-helpers", () => ({
	getMailboxStub: () => mockStub,
	getFullEmail: vi.fn(),
	getFullThread: vi.fn(),
	listMailboxes: vi.fn(async () => []),
	generateMessageId: vi.fn(() => ({ messageId: "m1", outgoingMessageId: "<m1@test>" })),
	buildReferencesChain: vi.fn(() => ({ originalMsgId: "<orig>", references: [], threadId: "t1" })),
	buildThreadingHeaders: vi.fn(() => ({})),
	buildQuotedReplyBlock: vi.fn(() => ""),
	textToHtml: (text: string) => `<p>${text}</p>`,
	stripHtmlToText: (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
}));

vi.mock("../workers/lib/llm/run", () => ({
	generateForRole: vi.fn(),
}));

vi.mock("../workers/email-sender", () => ({
	sendEmail: vi.fn(),
	SmtpDeliveryError: class SmtpDeliveryError extends Error {},
}));

const { generateForRole } = await import("../workers/lib/llm/run");
const mockGenerateForRole = vi.mocked(generateForRole);

const {
	toolDraftReply,
	toolListEmails,
	toolMarkEmailRead,
	toolMoveEmail,
	toolSearchEmails,
	toolUpdateDraft,
} = await import("../workers/lib/tools");
const { verifyDraft, verifyDraftDetailed } = await import("../workers/lib/ai");

const env = {} as never;
const mailboxId = "mail@example.com";

beforeEach(() => {
	vi.clearAllMocks();
});

// ── mark_email_read: no more silent no-ops ────────────────────────────

describe("toolMarkEmailRead", () => {
	it("reports success when the DO returns the updated email", async () => {
		mockStub.updateEmail.mockResolvedValue({ id: "e1", read: true });
		await expect(toolMarkEmailRead(env, mailboxId, "e1", true)).resolves.toEqual({
			status: "updated",
			emailId: "e1",
			read: true,
		});
	});

	it("returns an error instead of fake success when the email does not exist", async () => {
		mockStub.updateEmail.mockResolvedValue(null);
		await expect(toolMarkEmailRead(env, mailboxId, "missing", true)).resolves.toEqual({
			error: "Email not found",
			emailId: "missing",
		});
	});
});

// ── move_email: no more silent no-ops ─────────────────────────────────

describe("toolMoveEmail", () => {
	it("moves an existing email", async () => {
		mockStub.getEmail.mockResolvedValue({ id: "e1", folder_id: "inbox" });
		mockStub.moveEmail.mockResolvedValue(true);
		await expect(toolMoveEmail(env, mailboxId, "e1", "archive")).resolves.toEqual({
			status: "moved",
			emailId: "e1",
			folder: "archive",
		});
	});

	it("errors with 'Email not found' when the email does not exist (was silent success)", async () => {
		mockStub.getEmail.mockResolvedValue(null);
		await expect(toolMoveEmail(env, mailboxId, "missing", "archive")).resolves.toEqual({
			error: "Email not found",
			emailId: "missing",
		});
		expect(mockStub.moveEmail).not.toHaveBeenCalled();
	});

	it("errors when the target folder is missing", async () => {
		mockStub.getEmail.mockResolvedValue({ id: "e1" });
		mockStub.moveEmail.mockResolvedValue(false);
		await expect(toolMoveEmail(env, mailboxId, "e1", "nope")).resolves.toEqual({
			error: "Failed to move email",
			emailId: "e1",
			folderId: "nope",
		});
	});
});

// ── update_draft: stable ID, in-place update ──────────────────────────

describe("toolUpdateDraft", () => {
	const draft = {
		id: "d1",
		subject: "Old subject",
		recipient: "a@b.com",
		body: "<p>old body text that is long enough to verify</p>",
		thread_id: "t1",
	};

	it("updates in place and keeps the draft ID", async () => {
		mockStub.getEmail.mockResolvedValue(draft);
		mockStub.updateEmail.mockResolvedValue({ ...draft, subject: "New subject" });
		mockGenerateForRole.mockResolvedValue({
			text: "new body text that is long enough to verify",
		} as never);

		const result = await toolUpdateDraft(env, mailboxId, {
			draftId: "d1",
			subject: "New subject",
			bodyHtml: "<p>new body text that is long enough to verify</p>",
		});

		expect(result).toMatchObject({ status: "draft_updated", draftId: "d1" });
		expect(mockStub.updateEmail).toHaveBeenCalledWith("d1", {
			subject: "New subject",
			body: expect.any(String),
			recipient: "a@b.com",
		});
		expect(mockStub.deleteEmail).not.toHaveBeenCalled();
		expect(mockStub.createEmail).not.toHaveBeenCalled();
	});

	it("errors when the draft does not exist", async () => {
		mockStub.getEmail.mockResolvedValue(null);
		await expect(
			toolUpdateDraft(env, mailboxId, { draftId: "missing", subject: "x" }),
		).resolves.toEqual({ error: "Draft not found" });
	});
});

// ── list/search payloads: raw_headers stripped ────────────────────────

describe("list and search payload trimming", () => {
	it("strips raw_headers from list_emails results", async () => {
		mockStub.getEmails.mockResolvedValue([
			{ id: "e1", subject: "S", raw_headers: '[{"key":"arc","value":"huge..."}]' },
			{ id: "e2", subject: "S2", raw_headers: null },
		]);
		const result = (await toolListEmails(env, mailboxId, {
			folder: "inbox",
			limit: 10,
			page: 1,
		})) as Array<Record<string, unknown>>;
		expect(result).toEqual([
			{ id: "e1", subject: "S" },
			{ id: "e2", subject: "S2" },
		]);
	});

	it("strips raw_headers from search_emails results", async () => {
		mockStub.searchEmails.mockResolvedValue([
			{ id: "e1", subject: "Hit", raw_headers: "huge" },
		]);
		const result = (await toolSearchEmails(env, mailboxId, { query: "hit" })) as Array<
			Record<string, unknown>
		>;
		expect(result).toEqual([{ id: "e1", subject: "Hit" }]);
	});
});

// ── verifier: bounded latency and resilient draft saving ──────────────

describe("verifyDraft timeout and fallback", () => {
	const longBody = "This reply body is definitely longer than twenty characters.";

	it("falls back to the original body when the verifier hangs past the timeout", async () => {
		mockGenerateForRole.mockReturnValue(new Promise(() => {}));
		const result = await verifyDraftDetailed(env, longBody, {
			timeoutMs: 20,
			fallbackToOriginalOnFailure: true,
		});
		expect(result).toEqual({ body: longBody, verified: false });
	}, 10_000);

	it("returns empty under the same hang when strict (send path)", async () => {
		mockGenerateForRole.mockReturnValue(new Promise(() => {}));
		await expect(verifyDraft(env, longBody, { timeoutMs: 20 })).resolves.toBe("");
	}, 10_000);

	it("reports verified:false, not just a changed body, when the model errors", async () => {
		mockGenerateForRole.mockRejectedValue(new Error("model down"));
		const result = await verifyDraftDetailed(env, longBody, {
			fallbackToOriginalOnFailure: true,
		});
		expect(result).toEqual({ body: longBody, verified: false });
	});

	it("keeps the original body and verified:true when the verifier finds nothing to change", async () => {
		mockGenerateForRole.mockResolvedValue({ text: longBody } as never);
		const result = await verifyDraftDetailed(env, longBody, {});
		expect(result).toEqual({ body: longBody, verified: true });
	});
});

describe("toolDraftReply verifier resilience", () => {
	const replyBody = "Please find the report attached. Let me know if anything is unclear.";

	it("still saves the draft when verification fails, with a warning", async () => {
		mockGenerateForRole.mockRejectedValue(new Error("verifier down"));
		mockStub.getEmail.mockResolvedValue({
			id: "orig",
			thread_id: "t1",
			date: "2026-01-01",
			sender: "x@y.com",
			body: "<p>hi</p>",
		});

		const result = await toolDraftReply(env, mailboxId, {
			originalEmailId: "orig",
			to: "someone@example.com",
			subject: "Re: Hello",
			body: replyBody,
			isPlainText: false,
			runVerifyDraft: true,
		});

		expect(result).toMatchObject({ status: "draft_saved", draftId: expect.any(String) });
		expect((result as { warning?: string }).warning).toContain("unverified");
		expect(mockStub.createEmail).toHaveBeenCalledTimes(1);
	});

	it("skips verification entirely when runVerifyDraft is false", async () => {
		mockStub.getEmail.mockResolvedValue({
			id: "orig",
			thread_id: "t1",
			date: "2026-01-01",
			sender: "x@y.com",
			body: "<p>hi</p>",
		});

		const result = await toolDraftReply(env, mailboxId, {
			originalEmailId: "orig",
			to: "someone@example.com",
			subject: "Re: Hello",
			body: replyBody,
			isPlainText: false,
			runVerifyDraft: false,
		});

		expect(result).toMatchObject({ status: "draft_saved" });
		expect(mockGenerateForRole).not.toHaveBeenCalled();
	});
});
