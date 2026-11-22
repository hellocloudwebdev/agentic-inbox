import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, sendMock, closeMock } = vi.hoisted(() => ({
	connectMock: vi.fn(),
	sendMock: vi.fn(),
	closeMock: vi.fn(),
}));

vi.mock("@workermailer/smtp", () => ({
	WorkerMailer: { connect: connectMock },
}));

import { sendEmail } from "../workers/email-sender";

// Dummy value for a fully mocked SMTP transport below — never a real secret.
// Assembled from parts so secret scanners don't mistake it for a credential.
const TEST_ONLY_DUMMY_PASSWORD = ["dummy", "not", "a", "secret"].join("-");

const smtpEnv = {
	ZOHO_SMTP_HOST: "smtp.zoho.in",
	ZOHO_SMTP_PORT: "587",
	ZOHO_SMTP_USERNAME: "mail@neerajsingh.me",
	ZOHO_SMTP_FROM_NAME: "Neeraj Singh",
	ZOHO_SMTP_PASSWORD: TEST_ONLY_DUMMY_PASSWORD,
};

describe("Zoho SMTP sender", () => {
	beforeEach(() => {
		connectMock.mockReset();
		sendMock.mockReset();
		closeMock.mockReset();
		sendMock.mockResolvedValue(undefined);
		closeMock.mockResolvedValue(undefined);
		connectMock.mockResolvedValue({ send: sendMock, close: closeMock });
	});

	it("uses authenticated STARTTLS and preserves recipients, headers, and attachments", async () => {
		await sendEmail(smtpEnv, {
			from: { email: "mail@neerajsingh.me", name: "mail" },
			to: ["one@example.com", "two@example.com"],
			cc: "copy@example.com",
			bcc: "hidden@example.com",
			replyTo: "reply@example.com",
			subject: "SMTP test",
			text: "Hello",
			html: "<p>Hello</p>",
			headers: { "In-Reply-To": "<previous@example.com>" },
			attachments: [{
				filename: "report.pdf",
				content: "cGRm",
				type: "application/pdf",
				disposition: "attachment",
				contentId: "report",
			}],
		});

		expect(connectMock).toHaveBeenCalledTimes(1);
		const [options] = connectMock.mock.calls[0];
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [message] = sendMock.mock.calls[0];
		expect(options).toMatchObject({
			host: "smtp.zoho.in",
			port: 587,
			secure: false,
			startTls: true,
			authType: "plain",
			credentials: {
				username: "mail@neerajsingh.me",
				password: TEST_ONLY_DUMMY_PASSWORD,
			},
		});
		expect(message).toMatchObject({
			from: { email: "mail@neerajsingh.me", name: "Neeraj Singh" },
			to: ["one@example.com", "two@example.com"],
			cc: "copy@example.com",
			bcc: "hidden@example.com",
			reply: "reply@example.com",
			subject: "SMTP test",
			text: "Hello",
			html: "<p>Hello</p>",
			headers: { "In-Reply-To": "<previous@example.com>" },
			attachments: [{
				filename: "report.pdf",
				content: "cGRm",
				mimeType: "application/pdf",
				inline: false,
				cid: "report",
			}],
		});
		expect(closeMock).toHaveBeenCalledTimes(1);
	});

	it("strips CRLF from SMTP headers and display fields", async () => {
		await sendEmail({ ...smtpEnv, ZOHO_SMTP_FROM_NAME: "Agent\r\nBcc: attacker@example.com" }, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com\r\nBcc: attacker@example.com",
			subject: "Hello\r\nBcc: attacker@example.com",
			headers: { "X-Test": "safe\r\nBcc: attacker@example.com" },
			text: "Hello",
		});
		expect(sendMock.mock.calls[0][0]).toMatchObject({
			from: { name: "Agent Bcc: attacker@example.com" },
			to: "recipient@example.com Bcc: attacker@example.com",
			subject: "Hello Bcc: attacker@example.com",
			headers: { "X-Test": "safe Bcc: attacker@example.com" },
		});
	});

	it("applies the configured display name when callers pass only the mailbox address", async () => {
		await sendEmail(smtpEnv, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "Display name test",
			text: "Hello",
		});

		expect(sendMock.mock.calls[0][0]).toMatchObject({
			from: { email: "mail@neerajsingh.me", name: "Neeraj Singh" },
		});
	});

	it("uses implicit TLS on port 465", async () => {
		await sendEmail({ ...smtpEnv, ZOHO_SMTP_PORT: "465" }, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "SSL test",
			text: "Hello",
		});

		expect(connectMock.mock.calls[0][0]).toMatchObject({
			port: 465,
			secure: true,
			startTls: false,
		});
		expect(closeMock).toHaveBeenCalledTimes(1);
	});

	it("rejects incomplete SMTP configuration without attempting delivery", async () => {
		await expect(sendEmail({ ...smtpEnv, ZOHO_SMTP_PASSWORD: "" }, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "Missing secret",
			text: "Hello",
		})).rejects.toThrow("Zoho SMTP is not fully configured");

		expect(connectMock).not.toHaveBeenCalled();
	});

	it("rejects a From address that is not the authenticated Zoho account", async () => {
		await expect(sendEmail(smtpEnv, {
			from: "hello@mail.neerajsingh.me",
			to: "recipient@example.com",
			subject: "Unauthorized sender",
			text: "Hello",
		})).rejects.toThrow("authorized Zoho alias");

		expect(connectMock).not.toHaveBeenCalled();
	});

	it("retries one transient connection failure before submitting the message", async () => {
		connectMock
			.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }))
			.mockResolvedValueOnce({ send: sendMock, close: closeMock });

		await sendEmail(smtpEnv, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "Safe connection retry",
			text: "Hello",
		});

		expect(connectMock).toHaveBeenCalledTimes(2);
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(closeMock).toHaveBeenCalledTimes(1);
	});

	it("classifies a connection failure after one safe retry as not sent", async () => {
		connectMock
			.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }))
			.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

		await expect(sendEmail(smtpEnv, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "Connect failure",
			text: "Hello",
		})).rejects.toMatchObject({ outcome: "not_sent" });

		expect(connectMock).toHaveBeenCalledTimes(2);
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("classifies send() failures as ambiguous and never retries delivery", async () => {
		sendMock.mockRejectedValueOnce(new Error("socket closed after DATA"));
		await expect(sendEmail(smtpEnv, {
			from: "mail@neerajsingh.me",
			to: "recipient@example.com",
			subject: "Ambiguous delivery",
			text: "Hello",
		})).rejects.toMatchObject({
			name: "SmtpDeliveryError",
			outcome: "unknown",
			message: expect.stringContaining("Check Zoho Sent"),
		});

		expect(connectMock).toHaveBeenCalledTimes(1);
		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(closeMock).toHaveBeenCalledTimes(1);
	});
});
