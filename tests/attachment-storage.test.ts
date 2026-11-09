// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, it, expect } from "vitest";
import {
	CHUNK_SIZE,
	chunkBinary,
	sanitizeFilename,
	toUint8Array,
	prepareAttachments,
	attachmentStorage,
	AttachmentNotFoundError,
	AttachmentCorruptionError,
} from "../workers/lib/attachments";

describe("Attachment Storage Service & Chunking", () => {
	describe("Binary chunking (1 MiB chunk size)", () => {
		it("handles zero-byte attachments (0 chunks)", () => {
			const zeroBytes = new Uint8Array(0);
			const chunks = chunkBinary(zeroBytes);
			expect(chunks).toHaveLength(0);
		});

		it("handles small attachments smaller than 1 MiB", () => {
			const small = new Uint8Array(512);
			for (let i = 0; i < 512; i++) small[i] = i % 256;
			const chunks = chunkBinary(small);
			expect(chunks).toHaveLength(1);
			expect(chunks[0].byteLength).toBe(512);
			expect(chunks[0]).toEqual(small);
		});

		it("handles attachment exactly one 1 MiB chunk", () => {
			const exact = new Uint8Array(CHUNK_SIZE);
			exact.fill(42);
			const chunks = chunkBinary(exact);
			expect(chunks).toHaveLength(1);
			expect(chunks[0].byteLength).toBe(CHUNK_SIZE);
			expect(Buffer.compare(Buffer.from(chunks[0]), Buffer.from(exact))).toBe(0);
		});

		it("handles attachment spanning multiple 1 MiB chunks (e.g. 2.5 MiB)", () => {
			const size = Math.floor(2.5 * CHUNK_SIZE); // 2,621,440 bytes
			const multi = new Uint8Array(size);
			for (let i = 0; i < size; i++) {
				multi[i] = (i * 7) % 256;
			}

			const chunks = chunkBinary(multi);
			expect(chunks).toHaveLength(3);
			expect(chunks[0].byteLength).toBe(CHUNK_SIZE);
			expect(chunks[1].byteLength).toBe(CHUNK_SIZE);
			expect(chunks[2].byteLength).toBe(size - 2 * CHUNK_SIZE);

			// Reconstruct and verify byte-for-byte integrity
			const reconstructed = new Uint8Array(size);
			let offset = 0;
			for (const c of chunks) {
				reconstructed.set(c, offset);
				offset += c.byteLength;
			}
			expect(Buffer.compare(Buffer.from(reconstructed), Buffer.from(multi))).toBe(0);
		});
	});

	describe("Filename sanitization & Unicode handling", () => {
		it("preserves unicode filenames and normal characters", () => {
			expect(sanitizeFilename("简历_2026.pdf")).toBe("简历_2026.pdf");
			expect(sanitizeFilename("résumé_final.docx")).toBe("résumé_final.docx");
			expect(sanitizeFilename("report (Q4) [final].pdf")).toBe("report (Q4) [final].pdf");
		});

		it("sanitizes path traversal and reserved filesystem characters", () => {
			expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
			expect(sanitizeFilename("foo/bar\\baz:quote*q?c<d>e|f.txt")).toBe("foo_bar_baz_quote_q_c_d_e_f.txt");
		});

		it("provides fallback for empty or whitespace-only filenames", () => {
			expect(sanitizeFilename("")).toBe("untitled");
			expect(sanitizeFilename("   ")).toBe("untitled");
			expect(sanitizeFilename(undefined)).toBe("untitled");
		});
	});

	describe("Binary format conversion & arbitrary byte values", () => {
		it("converts Uint8Array, ArrayBuffer, and string", () => {
			const u8 = new Uint8Array([1, 2, 3]);
			expect(toUint8Array(u8)).toBe(u8);

			const ab = new ArrayBuffer(4);
			const u8FromAb = toUint8Array(ab);
			expect(u8FromAb.byteLength).toBe(4);

			const text = "Hello world";
			const u8FromText = toUint8Array(text, false);
			expect(new TextDecoder().decode(u8FromText)).toBe(text);
		});

		it("correctly decodes base64 with all byte values from 0x00 to 0xFF", () => {
			const allBytes = new Uint8Array(256);
			for (let i = 0; i < 256; i++) allBytes[i] = i;

			let binaryString = "";
			for (let i = 0; i < 256; i++) binaryString += String.fromCharCode(i);
			const b64 = btoa(binaryString);

			const decoded = toUint8Array(b64, true);
			expect(decoded).toEqual(allBytes);
		});
	});

	describe("prepareAttachments metadata consistency", () => {
		it("returns empty array for empty input", () => {
			expect(prepareAttachments("email-1", [])).toEqual([]);
			expect(prepareAttachments("email-1", undefined)).toEqual([]);
		});

		it("creates consistent metadata, chunks, and content ID", () => {
			const content = "Sample document content";
			const result = prepareAttachments("email-123", [
				{
					content,
					filename: "doc.txt",
					type: "text/plain",
					disposition: "attachment",
					contentId: "<doc@acme.com>",
					isBase64: false,
				},
			]);

			expect(result).toHaveLength(1);
			const att = result[0];
			expect(att.email_id).toBe("email-123");
			expect(att.filename).toBe("doc.txt");
			expect(att.mimetype).toBe("text/plain");
			expect(att.content_id).toBe("<doc@acme.com>");
			expect(att.disposition).toBe("attachment");
			expect(att.size).toBe(new TextEncoder().encode(content).byteLength);
			expect(att.chunk_count).toBe(1);
			expect(att.chunks).toHaveLength(1);
		});
	});

	describe("attachmentStorage service operations via mock MailboxDO stub", () => {
		function createMockMailboxStub() {
			const attachmentsMap = new Map<string, any>();
			const chunksMap = new Map<string, Uint8Array>(); // key: `${attId}:${chunkIndex}`

			const stub: any = {
				getAttachment: async (id: string) => {
					return attachmentsMap.get(id) ?? null;
				},
				getAttachmentChunk: async (id: string, chunkIndex: number) => {
					return chunksMap.get(`${id}:${chunkIndex}`) ?? null;
				},
				getAttachmentContent: async (id: string) => {
					const meta = attachmentsMap.get(id);
					if (!meta) throw new Error(`Attachment not found: ${id}`);
					if (meta.size === 0) return new Uint8Array(0);

					const chunks: Uint8Array[] = [];
					let total = 0;
					for (let i = 0; i < meta.chunk_count; i++) {
						const chunk = chunksMap.get(`${id}:${i}`);
						if (!chunk) throw new Error(`Missing chunk ${i}`);
						chunks.push(chunk);
						total += chunk.byteLength;
					}
					if (total !== meta.size) throw new Error("Size mismatch");
					const out = new Uint8Array(total);
					let off = 0;
					for (const c of chunks) {
						out.set(c, off);
						off += c.byteLength;
					}
					return out;
				},
				storeAttachment: async (metadata: any, chunks: Uint8Array[]) => {
					let totalBytes = 0;
					for (const c of chunks) totalBytes += c.byteLength;
					if (totalBytes !== metadata.size) {
						throw new Error(`Size mismatch: expected ${metadata.size}, got ${totalBytes}`);
					}

					attachmentsMap.set(metadata.id, {
						...metadata,
						chunk_count: chunks.length,
					});

					for (let i = 0; i < chunks.length; i++) {
						chunksMap.set(`${metadata.id}:${i}`, chunks[i]);
					}
				},
				deleteAttachment: async (id: string) => {
					const meta = attachmentsMap.get(id);
					if (!meta) return false;
					for (let i = 0; i < (meta.chunk_count || 1); i++) {
						chunksMap.delete(`${id}:${i}`);
					}
					attachmentsMap.delete(id);
					return true;
				},
				deleteAttachmentsByEmail: async (emailId: string) => {
					let count = 0;
					for (const [id, meta] of attachmentsMap.entries()) {
						if (meta.email_id === emailId) {
							for (let i = 0; i < (meta.chunk_count || 1); i++) {
								chunksMap.delete(`${id}:${i}`);
							}
							attachmentsMap.delete(id);
							count++;
						}
					}
					return count;
				},
				_raw: { attachmentsMap, chunksMap },
			};

			return stub;
		}

		it("stores and reads small attachment", async () => {
			const stub = createMockMailboxStub();
			const data = new TextEncoder().encode("Hello world attachment");
			const stored = await attachmentStorage.store(stub, "email-1", [
				{
					content: data,
					filename: "hello.txt",
					type: "text/plain",
				},
			]);

			expect(stored).toHaveLength(1);
			const attId = stored[0].id;

			const meta = await attachmentStorage.getMetadata(stub, attId);
			expect(meta).not.toBeNull();
			expect(meta?.filename).toBe("hello.txt");
			expect(meta?.size).toBe(data.byteLength);

			const { content } = await attachmentStorage.read(stub, attId);
			expect(content).toEqual(data);
		});

		it("streams multi-chunk attachment chunk by chunk", async () => {
			const stub = createMockMailboxStub();
			const size = Math.floor(2.2 * CHUNK_SIZE);
			const multiBytes = new Uint8Array(size);
			for (let i = 0; i < size; i++) multiBytes[i] = i % 251;

			const stored = await attachmentStorage.store(stub, "email-2", [
				{
					content: multiBytes,
					filename: "large.bin",
					type: "application/octet-stream",
				},
			]);

			const attId = stored[0].id;
			expect(stored[0].chunk_count).toBe(3);

			const { stream, metadata } = await attachmentStorage.readStream(stub, attId);
			expect(metadata.size).toBe(size);

			// Read from ReadableStream
			const reader = stream.getReader();
			const receivedChunks: Uint8Array[] = [];
			let totalRead = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				receivedChunks.push(value);
				totalRead += value.byteLength;
			}

			expect(totalRead).toBe(size);
			expect(receivedChunks).toHaveLength(3);
			expect(receivedChunks[0].byteLength).toBe(CHUNK_SIZE);
			expect(receivedChunks[1].byteLength).toBe(CHUNK_SIZE);

			const reconstructed = new Uint8Array(size);
			let offset = 0;
			for (const c of receivedChunks) {
				reconstructed.set(c, offset);
				offset += c.byteLength;
			}
			expect(Buffer.compare(Buffer.from(reconstructed), Buffer.from(multiBytes))).toBe(0);
		});

		it("throws AttachmentCorruptionError when a chunk is missing in stream", async () => {
			const stub = createMockMailboxStub();
			const data = new Uint8Array(CHUNK_SIZE * 2);
			const stored = await attachmentStorage.store(stub, "email-3", [
				{ content: data, filename: "broken.bin", type: "application/octet-stream" },
			]);
			const attId = stored[0].id;

			// Delete chunk 1
			stub._raw.chunksMap.delete(`${attId}:1`);

			const { stream } = await attachmentStorage.readStream(stub, attId);
			const reader = stream.getReader();

			// First chunk should succeed
			const chunk0 = await reader.read();
			expect(chunk0.value?.byteLength).toBe(CHUNK_SIZE);

			// Second chunk should fail with AttachmentCorruptionError
			await expect(reader.read()).rejects.toThrow(AttachmentCorruptionError);
		});

		it("throws AttachmentNotFoundError when reading missing attachment", async () => {
			const stub = createMockMailboxStub();
			await expect(attachmentStorage.read(stub, "ghost-id")).rejects.toThrow(AttachmentNotFoundError);
			await expect(attachmentStorage.readStream(stub, "ghost-id")).rejects.toThrow(AttachmentNotFoundError);
		});

		it("deletes single attachment and its chunks", async () => {
			const stub = createMockMailboxStub();
			const data = new Uint8Array(100);
			const stored = await attachmentStorage.store(stub, "email-4", [
				{ content: data, filename: "file.txt", type: "text/plain" },
			]);
			const attId = stored[0].id;

			expect(stub._raw.attachmentsMap.has(attId)).toBe(true);
			expect(stub._raw.chunksMap.has(`${attId}:0`)).toBe(true);

			const deleted = await attachmentStorage.delete(stub, attId);
			expect(deleted).toBe(true);
			expect(stub._raw.attachmentsMap.has(attId)).toBe(false);
			expect(stub._raw.chunksMap.has(`${attId}:0`)).toBe(false);
		});

			it("fails write and rolls back when chunk size does not match declared size", async () => {
				const stub = createMockMailboxStub();
				await expect(
					stub.storeAttachment(
						{
							id: "bad-att",
							email_id: "email-err",
							filename: "bad.bin",
							mimetype: "application/octet-stream",
							size: 100, // declared 100
						},
						[new Uint8Array(50)], // provided only 50
					),
				).rejects.toThrow(/size mismatch/i);

				// Ensure no partial or corrupt metadata was stored
				expect(stub._raw.attachmentsMap.has("bad-att")).toBe(false);
				expect(stub._raw.chunksMap.has("bad-att:0")).toBe(false);
			});

			it("verifies no attachment data remains after email deletion", async () => {
				const stub = createMockMailboxStub();
				await attachmentStorage.store(stub, "email-del", [
					{ content: new Uint8Array(50), filename: "doc1.pdf", type: "application/pdf" },
					{ content: new Uint8Array(60), filename: "doc2.pdf", type: "application/pdf" },
				]);

				// Verify chunks are present
				expect(stub._raw.chunksMap.size).toBe(2);

				// Perform deletion by email
				const deletedCount = await attachmentStorage.deleteByEmail(stub, "email-del");
				expect(deletedCount).toBe(2);

				// Verify zero attachment metadata and zero chunks remain
				expect(stub._raw.attachmentsMap.size).toBe(0);
				expect(stub._raw.chunksMap.size).toBe(0);
			});
		});
	});
