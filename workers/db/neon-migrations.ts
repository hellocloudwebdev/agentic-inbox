// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { NeonQueryFunction } from "@neondatabase/serverless";

export interface NeonMigration {
	name: string;
	run: (sql: NeonQueryFunction<any, any>) => Promise<void>;
}

export const neonMigrationsList: NeonMigration[] = [
	{
		name: "0001_initial_schema",
		run: async (sql: NeonQueryFunction<any, any>) => {
			await sql`
				CREATE TABLE IF NOT EXISTS mailboxes (
					id TEXT PRIMARY KEY,
					email TEXT NOT NULL,
					name TEXT NOT NULL DEFAULT '',
					status TEXT NOT NULL DEFAULT 'active',
					created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS mailbox_settings (
					mailbox_id TEXT PRIMARY KEY REFERENCES mailboxes(id) ON DELETE CASCADE,
					settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
					updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS app_settings (
					key TEXT PRIMARY KEY,
					value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
					updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
				)
			`;
			await sql`CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON mailboxes(status)`;
			await sql`CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(email)`;
		},
	},
];

/**
 * Apply pending Neon PostgreSQL migrations using the Neon HTTP client.
 */
export async function applyNeonMigrations(sql: NeonQueryFunction<any, any>): Promise<string[]> {
	// Ensure migration tracking table exists
	await sql`
		CREATE TABLE IF NOT EXISTS neon_migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
		)
	`;

	const appliedRowsResult: any = await sql`SELECT name FROM neon_migrations`;
	const appliedRows: any[] = Array.isArray(appliedRowsResult)
		? appliedRowsResult
		: appliedRowsResult?.rows ?? [];
	const appliedSet = new Set(appliedRows.map((r: any) => r.name));

	const newlyApplied: string[] = [];

	for (const migration of neonMigrationsList) {
		if (appliedSet.has(migration.name)) continue;

		await migration.run(sql);

		await sql`INSERT INTO neon_migrations (name) VALUES (${migration.name})`;
		newlyApplied.push(migration.name);
	}

	return newlyApplied;
}
