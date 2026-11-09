// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { NeonQueryFunction } from "@neondatabase/serverless";

export interface MockNeonStore {
	mailboxes: Map<string, {
		id: string;
		email: string;
		name: string;
		status: string;
		created_at: Date;
		updated_at: Date;
	}>;
	mailboxSettings: Map<string, {
		mailbox_id: string;
		settings_json: any;
		updated_at: Date;
	}>;
	appSettings: Map<string, {
		key: string;
		value_json: any;
		updated_at: Date;
	}>;
	migrations: Set<string>;
}

export function createMockNeonStore(): MockNeonStore {
	return {
		mailboxes: new Map(),
		mailboxSettings: new Map(),
		appSettings: new Map(),
		migrations: new Set(),
	};
}

export function createMockNeonClient(store: MockNeonStore = createMockNeonStore()): NeonQueryFunction<any, any> & { store: MockNeonStore } {
	const fn: any = async (queryOrStrings: any, ...values: any[]) => {
		let query = "";
		let params: any[] = [];

		if (Array.isArray(queryOrStrings) && "raw" in queryOrStrings) {
			// Tagged template string: sql`SELECT ...`
			query = queryOrStrings.reduce((acc, str, i) => {
				return acc + str + (i < values.length ? `$${i + 1}` : "");
			}, "");
			params = values;
		} else if (typeof queryOrStrings === "string") {
			query = queryOrStrings;
			params = values[0] || [];
		}

		const lower = query.toLowerCase();

		// --- MIGRATIONS ---
		if (lower.includes("create table if not exists neon_migrations") ||
			lower.includes("create table if not exists mailboxes") ||
			lower.includes("create table if not exists mailbox_settings") ||
			lower.includes("create table if not exists app_settings") ||
			lower.includes("create index if not exists")) {
			return [];
		}

		if (lower.includes("select name from neon_migrations")) {
			return Array.from(store.migrations).map((name) => ({ name }));
		}

		if (lower.includes("insert into neon_migrations")) {
			const name = params[0] || values[0];
			store.migrations.add(name);
			return [];
		}

		// --- MAILBOXES ---
		if (lower.includes('insert into "mailboxes"')) {
			// params: [id, email, name, status, created_at, updated_at]
			const [id, email, name, status, createdAt, updatedAt] = params;
			if (store.mailboxes.has(id)) {
				const err: any = new Error(`duplicate key value violates unique constraint "mailboxes_pkey"`);
				err.code = "23505";
				throw err;
			}
			store.mailboxes.set(id, {
				id,
				email,
				name: name ?? "",
				status: status ?? "active",
				created_at: createdAt ? new Date(createdAt) : new Date(),
				updated_at: updatedAt ? new Date(updatedAt) : new Date(),
			});
			return { rows: [], rowCount: 1 };
		}

		if (lower.includes('insert into "mailbox_settings"')) {
			// params: [mailbox_id, settings_json, updated_at]
			const [mailboxId, settingsJson, updatedAt] = params;
			store.mailboxSettings.set(mailboxId, {
				mailbox_id: mailboxId,
				settings_json: typeof settingsJson === "string" ? JSON.parse(settingsJson) : settingsJson,
				updated_at: updatedAt ? new Date(updatedAt) : new Date(),
			});
			return { rows: [], rowCount: 1 };
		}

		if (lower.includes('select') && lower.includes('"mailboxes"')) {
			let list = Array.from(store.mailboxes.values());

			// Where filter on id
			if (lower.includes('"mailboxes"."id" = $')) {
				const idParam = params[0];
				list = list.filter((m) => m.id === idParam);
			} else if (lower.includes('"mailboxes"."status" = $')) {
				const statusParam = params[0];
				list = list.filter((m) => m.status === statusParam);
			}

				// Check if selecting only id
				if (lower.includes('select "id" from') || lower.includes('select "mailboxes"."id" from')) {
					return {
						rows: list.map((m) => [m.id]),
						rowCount: list.length,
						fields: [{ name: "id" }],
					};
				}

				return {
					rows: list.map((m) => [
						m.id,
						m.email,
						m.name,
						m.status,
						m.created_at,
						m.updated_at,
					]),
					rowCount: list.length,
					fields: [
						{ name: "id" },
						{ name: "email" },
						{ name: "name" },
						{ name: "status" },
						{ name: "created_at" },
						{ name: "updated_at" },
					],
				};
			}

			if (lower.includes('select') && lower.includes('"mailbox_settings"')) {
				let list = Array.from(store.mailboxSettings.values());

				if (lower.includes('"mailbox_settings"."mailbox_id" = $')) {
					const mailboxIdParam = params[0];
					list = list.filter((s) => s.mailbox_id === mailboxIdParam);
				}

				if (lower.includes('select "settings_json" from') || lower.includes('select "mailbox_settings"."settings_json"')) {
					return {
						rows: list.map((s) => [s.settings_json]),
						rowCount: list.length,
						fields: [{ name: "settings_json" }],
					};
				}

				if (lower.includes('select "mailbox_id" from') || lower.includes('select "mailbox_settings"."mailbox_id"')) {
					return {
						rows: list.map((s) => [s.mailbox_id]),
						rowCount: list.length,
						fields: [{ name: "mailbox_id" }],
					};
				}

					return {
						rows: list.map((s) => [
							s.mailbox_id,
							s.settings_json,
							s.updated_at,
						]),
						rowCount: list.length,
						fields: [
							{ name: "mailbox_id" },
							{ name: "settings_json" },
							{ name: "updated_at" },
						],
					};
				}

		if (lower.includes('update "mailbox_settings"')) {
			// params: [settings_json, updated_at, mailbox_id]
			const [settingsJson, updatedAt, mailboxId] = params;
			if (store.mailboxSettings.has(mailboxId)) {
				const prev = store.mailboxSettings.get(mailboxId)!;
				store.mailboxSettings.set(mailboxId, {
					...prev,
					settings_json: typeof settingsJson === "string" ? JSON.parse(settingsJson) : settingsJson,
					updated_at: updatedAt ? new Date(updatedAt) : new Date(),
				});
			}
			return { rows: [], rowCount: 1 };
		}

		if (lower.includes('update "mailboxes"')) {
			// params: [updated_at, mailbox_id]
			const [updatedAt, mailboxId] = params;
			if (store.mailboxes.has(mailboxId)) {
				const prev = store.mailboxes.get(mailboxId)!;
				store.mailboxes.set(mailboxId, {
					...prev,
					updated_at: updatedAt ? new Date(updatedAt) : new Date(),
				});
			}
			return { rows: [], rowCount: 1 };
		}

		if (lower.includes('delete from "mailboxes"')) {
			const idParam = params[0];
			store.mailboxes.delete(idParam);
			store.mailboxSettings.delete(idParam); // CASCADE
			return { rows: [], rowCount: 1 };
		}

		// --- APP SETTINGS ---
		if (lower.includes('insert into "app_settings"')) {
			const [key, valueJson, updatedAt] = params;
			store.appSettings.set(key, {
				key,
				value_json: typeof valueJson === "string" ? JSON.parse(valueJson) : valueJson,
				updated_at: updatedAt ? new Date(updatedAt) : new Date(),
			});
			return { rows: [], rowCount: 1 };
		}

		if (lower.includes('update "app_settings"')) {
			const [valueJson, updatedAt, key] = params;
			if (store.appSettings.has(key)) {
				store.appSettings.set(key, {
					key,
					value_json: typeof valueJson === "string" ? JSON.parse(valueJson) : valueJson,
					updated_at: updatedAt ? new Date(updatedAt) : new Date(),
				});
			}
			return { rows: [], rowCount: 1 };
		}

			if (lower.includes('select') && lower.includes('"app_settings"')) {
				let list = Array.from(store.appSettings.values());
				if (lower.includes('"app_settings"."key" = $')) {
					const keyParam = params[0];
					list = list.filter((s) => s.key === keyParam);
				}
				if (lower.includes('select "key" from') || lower.includes('select "app_settings"."key" from')) {
					return {
						rows: list.map((s) => [s.key]),
						rowCount: list.length,
						fields: [{ name: "key" }],
					};
				}
				if (lower.includes('select "value_json" from') || lower.includes('select "app_settings"."value_json" from')) {
					return {
						rows: list.map((s) => [s.value_json]),
						rowCount: list.length,
						fields: [{ name: "value_json" }],
					};
				}
				return {
					rows: list.map((s) => [s.key, s.value_json, s.updated_at]),
					rowCount: list.length,
					fields: [{ name: "key" }, { name: "value_json" }, { name: "updated_at" }],
				};
			}

		if (lower.includes('delete from "app_settings"')) {
			const keyParam = params[0];
			store.appSettings.delete(keyParam);
			return { rows: [], rowCount: 1 };
		}

		return { rows: [], rowCount: 0, fields: [] };
	};

	fn.store = store;
	return fn;
}
