// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * In-memory SQLite-compatible mock storage for MailboxDO testing.
 */
export interface MockDORecords {
	folders: Map<string, { id: string; name: string; is_deletable: number }>;
	emails: Map<string, any>;
	attachments: Map<string, any>;
	attachmentChunks: Map<string, { attachment_id: string; chunk_index: number; data: Uint8Array; created_at: number }>;
	migrations: Set<string>;
}

export function createMockDOStorage() {
	const records: MockDORecords = {
		folders: new Map([
			["inbox", { id: "inbox", name: "Inbox", is_deletable: 0 }],
			["sent", { id: "sent", name: "Sent", is_deletable: 0 }],
			["trash", { id: "trash", name: "Trash", is_deletable: 0 }],
			["archive", { id: "archive", name: "Archive", is_deletable: 0 }],
			["spam", { id: "spam", name: "Spam", is_deletable: 0 }],
			["draft", { id: "draft", name: "Drafts", is_deletable: 0 }],
		]),
		emails: new Map(),
		attachments: new Map(),
		attachmentChunks: new Map(),
		migrations: new Set(),
	};

	let inTransaction = false;

	const sql = {
		exec: (query: string, ...params: any[]): any[] & { toArray: () => any[] } => {
			const lower = query.toLowerCase().trim();

			// Migrations table
			if (lower.startsWith("create table if not exists d1_migrations")) {
				return Object.assign([], { toArray: () => [] });
			}
			if (lower.includes("select 1 from d1_migrations where name =")) {
				const name = params[0];
				const exists = records.migrations.has(name);
				const res = exists ? [{ 1: 1 }] : [];
				return Object.assign(res, { toArray: () => res });
			}
			if (lower.includes("insert into d1_migrations")) {
				const match = query.match(/values \('([^']+)'\)/i);
				if (match) records.migrations.add(match[1]);
				return Object.assign([], { toArray: () => [] });
			}

			// Migration statements (CREATE / ALTER / INDEX)
			if (
				lower.startsWith("create table") ||
				lower.startsWith("alter table") ||
				lower.startsWith("create index") ||
				lower.startsWith("insert into folders")
			) {
				return Object.assign([], { toArray: () => [] });
			}

			// Attachment chunks operations
			if (lower.startsWith("insert into attachment_chunks")) {
				// (attachment_id, chunk_index, data, created_at)
				const [attachment_id, chunk_index, data] = params;
				const key = `${attachment_id}:${chunk_index}`;
				records.attachmentChunks.set(key, {
					attachment_id,
					chunk_index,
					data: data instanceof Uint8Array ? data : new Uint8Array(data),
					created_at: Math.floor(Date.now() / 1000),
				});
				return Object.assign([], { toArray: () => [] });
			}

			if (lower.includes("from attachment_chunks where attachment_id = ? and chunk_index = ?")) {
				const [attId, chunkIdx] = params;
				const item = records.attachmentChunks.get(`${attId}:${chunkIdx}`);
				const res = item ? [{ data: item.data }] : [];
				return Object.assign(res, { toArray: () => res });
			}

			if (lower.includes("from attachment_chunks where attachment_id = ? order by chunk_index asc")) {
				const [attId] = params;
				const list = Array.from(records.attachmentChunks.values())
					.filter((c) => c.attachment_id === attId)
					.sort((a, b) => a.chunk_index - b.chunk_index)
					.map((c) => ({ chunk_index: c.chunk_index, data: c.data }));
				return Object.assign(list, { toArray: () => list });
			}

			if (lower.startsWith("delete from attachment_chunks where attachment_id = ?")) {
				const [attId] = params;
				for (const [k, v] of records.attachmentChunks.entries()) {
					if (v.attachment_id === attId) records.attachmentChunks.delete(k);
				}
				return Object.assign([], { toArray: () => [] });
			}

			if (lower.includes("delete from attachment_chunks where attachment_id in (select id from attachments where email_id = ?)")) {
				const [emailId] = params;
				for (const [attId, att] of records.attachments.entries()) {
					if (att.email_id === emailId) {
						for (const [k, v] of records.attachmentChunks.entries()) {
							if (v.attachment_id === attId) records.attachmentChunks.delete(k);
						}
					}
				}
				return Object.assign([], { toArray: () => [] });
			}

			// Rate limit queries
			if (lower.includes("select count(*) as cnt from emails where folder_id = ?1 and date >=")) {
				return Object.assign([{ cnt: 0 }], { toArray: () => [{ cnt: 0 }] });
			}

			return Object.assign([], { toArray: () => [] });
		},
	};

	const storage = {
		sql,
		transactionSync: <T>(closure: () => T): T => {
			inTransaction = true;
			try {
				return closure();
			} finally {
				inTransaction = false;
			}
		},
	};

	return { storage, records };
}
