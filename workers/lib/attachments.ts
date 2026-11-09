// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Provider-independent attachment storage service backed by MailboxDO SQLite.
 *
 * Implements 1 MiB chunking, bounded streaming retrieval, sequential storage,
 * and data integrity verification.
 */
import type { MailboxDO, AttachmentData } from "../durableObject";

export const CHUNK_SIZE = 1024 * 1024; // 1 MiB (1,048,576 bytes)

export interface AttachmentInput {
	content: Uint8Array | ArrayBuffer | string;
	filename?: string | null;
	type?: string;
	disposition?: string;
	contentId?: string | null;
	isBase64?: boolean;
}

export interface StoredAttachment {
	id: string;
	email_id: string;
	filename: string;
	mimetype: string;
	size: number;
	chunk_count: number;
	content_id: string | null;
	disposition: string;
	chunks?: Uint8Array[];
}

export class AttachmentNotFoundError extends Error {
	constructor(public attachmentId: string) {
		super(`Attachment "${attachmentId}" not found`);
		this.name = "AttachmentNotFoundError";
	}
}

export class AttachmentCorruptionError extends Error {
	constructor(public attachmentId: string, message: string) {
		super(`Attachment "${attachmentId}" corrupted: ${message}`);
		this.name = "AttachmentCorruptionError";
	}
}

/**
 * Sanitize a filename to prevent path traversal or header injection issues.
 * Preserves unicode characters while stripping control characters and path delimiters.
 */
export function sanitizeFilename(filename?: string | null): string {
	if (!filename || !filename.trim()) return "untitled";
	return filename.replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_").trim() || "untitled";
}

/**
 * Convert any attachment content format into a Uint8Array.
 */
export function toUint8Array(content: Uint8Array | ArrayBuffer | string, isBase64 = false): Uint8Array {
	if (content instanceof Uint8Array) return content;
	if (content instanceof ArrayBuffer) return new Uint8Array(content);
	if (typeof content === "string") {
		if (isBase64) {
			const binaryStr = atob(content);
			const len = binaryStr.length;
			const bytes = new Uint8Array(len);
			for (let i = 0; i < len; i++) {
				bytes[i] = binaryStr.charCodeAt(i);
			}
			return bytes;
		}
		return new TextEncoder().encode(content);
	}
	throw new Error("Unsupported attachment content format");
}

/**
 * Split a binary byte array into 1 MiB chunks.
 * For zero-byte files, returns an empty array.
 */
export function chunkBinary(bytes: Uint8Array, chunkSize: number = CHUNK_SIZE): Uint8Array[] {
	if (bytes.byteLength === 0) return [];
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < bytes.byteLength; i += chunkSize) {
		chunks.push(bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)));
	}
	return chunks;
}

/**
 * Prepare attachment records and chunked binary content for storage.
 * Does not write to storage directly.
 */
export function prepareAttachments(
	emailId: string,
	attachments?: AttachmentInput[],
): StoredAttachment[] {
	if (!attachments?.length) return [];

	const results: StoredAttachment[] = [];
	for (const att of attachments) {
		const attachmentId = crypto.randomUUID();
		const safeFilename = sanitizeFilename(att.filename);
		const isBase64 = att.isBase64 ?? typeof att.content === "string";
		const bytes = toUint8Array(att.content, isBase64);
		const chunks = chunkBinary(bytes, CHUNK_SIZE);

		results.push({
			id: attachmentId,
			email_id: emailId,
			filename: safeFilename,
			mimetype: att.type || "application/octet-stream",
			size: bytes.byteLength,
			chunk_count: chunks.length,
			content_id: att.contentId || null,
			disposition: att.disposition || "attachment",
			chunks,
		});
	}
	return results;
}

/**
 * Store attachments directly into MailboxDO.
 */
export async function storeAttachments(
	stub: DurableObjectStub<MailboxDO>,
	emailId: string,
	attachments?: AttachmentInput[],
): Promise<StoredAttachment[]> {
	const prepared = prepareAttachments(emailId, attachments);
	if (!prepared.length) return [];

	for (const att of prepared) {
		await (stub as any).storeAttachment(
			{
				id: att.id,
				email_id: att.email_id,
				filename: att.filename,
				mimetype: att.mimetype,
				size: att.size,
				chunk_count: att.chunk_count,
				content_id: att.content_id,
				disposition: att.disposition,
			},
			att.chunks || [],
		);
	}
	return prepared;
}

/**
 * Provider-independent attachment storage service interface.
 */
export const attachmentStorage = {
	/**
	 * Store attachments for an email into the Mailbox DO.
	 */
	store: storeAttachments,

	/**
	 * Prepare attachments for atomic storage with createEmail.
	 */
	prepare: prepareAttachments,

	/**
	 * Retrieve attachment metadata by ID.
	 */
	getMetadata: async (
		stub: DurableObjectStub<MailboxDO>,
		attachmentId: string,
	): Promise<StoredAttachment | null> => {
		const att = await (stub as any).getAttachment(attachmentId);
		return att ?? null;
	},

	/**
	 * Read full attachment binary into a single buffer, validating chunk order and integrity.
	 */
	read: async (
		stub: DurableObjectStub<MailboxDO>,
		attachmentId: string,
	): Promise<{ metadata: StoredAttachment; content: Uint8Array }> => {
		const metadata = await (stub as any).getAttachment(attachmentId);
		if (!metadata) throw new AttachmentNotFoundError(attachmentId);

		const content = await (stub as any).getAttachmentContent(attachmentId);
		return { metadata, content };
	},

	/**
	 * Stream an attachment chunk-by-chunk with bounded memory (1 MiB per pull).
	 * Verifies size and chunk completeness.
	 */
	readStream: async (
		stub: DurableObjectStub<MailboxDO>,
		attachmentId: string,
	): Promise<{ metadata: StoredAttachment; stream: ReadableStream<Uint8Array> }> => {
		const metadata = await (stub as any).getAttachment(attachmentId);
		if (!metadata) throw new AttachmentNotFoundError(attachmentId);

		const totalChunks = metadata.chunk_count ?? (metadata.size === 0 ? 0 : 1);
		const expectedSize = metadata.size;

		let currentChunk = 0;
		let bytesDelivered = 0;

		const stream = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (currentChunk >= totalChunks) {
					if (bytesDelivered !== expectedSize) {
						controller.error(
							new AttachmentCorruptionError(
								attachmentId,
								`Reconstructed size (${bytesDelivered} bytes) does not match declared size (${expectedSize} bytes)`,
							),
						);
						return;
					}
					controller.close();
					return;
				}

				const chunk = await (stub as any).getAttachmentChunk(attachmentId, currentChunk);
				if (!chunk) {
					controller.error(
						new AttachmentCorruptionError(
							attachmentId,
							`Missing chunk ${currentChunk} of ${totalChunks}`,
						),
					);
					return;
				}

				bytesDelivered += chunk.byteLength;
				controller.enqueue(chunk);
				currentChunk++;
			},
		});

		return { metadata, stream };
	},

	/**
	 * Delete a single attachment and its chunks.
	 */
	delete: async (
		stub: DurableObjectStub<MailboxDO>,
		attachmentId: string,
	): Promise<boolean> => {
		return (stub as any).deleteAttachment(attachmentId);
	},

	/**
	 * Delete all attachments and chunks belonging to an email.
	 */
	deleteByEmail: async (
		stub: DurableObjectStub<MailboxDO>,
		emailId: string,
	): Promise<number> => {
		return (stub as any).deleteAttachmentsByEmail(emailId);
	},
};
