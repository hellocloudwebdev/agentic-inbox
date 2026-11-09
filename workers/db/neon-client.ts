// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./neon-schema";
import { applyNeonMigrations } from "./neon-migrations";

export class DatabaseConfigError extends Error {
	constructor(message = "DATABASE_URL environment variable is not configured. Please set the DATABASE_URL secret.") {
		super(message);
		this.name = "DatabaseConfigError";
	}
}

export class DatabaseConnectionError extends Error {
	constructor(message: string, public override cause?: unknown) {
		super(message);
		this.name = "DatabaseConnectionError";
	}
}

export type NeonDb = NeonHttpDatabase<typeof schema>;

// In-memory flag per Worker instance to avoid checking migrations on every request
let migrationsChecked = false;

/**
 * Extract DATABASE_URL from an Env object or string, validating presence.
 */
export function resolveDatabaseUrl(envOrUrl: string | { DATABASE_URL?: string }): string {
	const url = typeof envOrUrl === "string" ? envOrUrl : envOrUrl?.DATABASE_URL;
	if (!url || typeof url !== "string" || !url.trim()) {
		throw new DatabaseConfigError();
	}
	return url.trim();
}

/**
 * Create a Neon SQL query client.
 */
export function createNeonClient(databaseUrl: string): NeonQueryFunction<any, any> {
	return neon(databaseUrl);
}

/**
 * Get a Drizzle ORM client connected to Neon via HTTP driver.
 */
export function getNeonDb(databaseUrlOrEnv: string | { DATABASE_URL?: string }, customSql?: NeonQueryFunction<any, any>): NeonDb {
	if (customSql) {
		return drizzle(customSql, { schema });
	}
	const databaseUrl = resolveDatabaseUrl(databaseUrlOrEnv);
	try {
		const sql = neon(databaseUrl);
		return drizzle(sql, { schema });
	} catch (err) {
		throw new DatabaseConnectionError("Failed to initialize Neon database connection", err);
	}
}

/**
 * Ensure database schema and migrations have been applied.
 * Caches the result in the Worker instance to avoid redundant HTTP calls.
 */
export async function ensureNeonSchema(
	databaseUrlOrEnv: string | { DATABASE_URL?: string },
	customSql?: NeonQueryFunction<any, any>,
	force = false,
): Promise<string[]> {
	if (migrationsChecked && !force && !customSql) {
		return [];
	}

	const sqlClient = customSql || createNeonClient(resolveDatabaseUrl(databaseUrlOrEnv));
	try {
		const applied = await applyNeonMigrations(sqlClient);
		if (!customSql) {
			migrationsChecked = true;
		}
		return applied;
	} catch (err) {
		throw new DatabaseConnectionError("Failed to apply Neon database migrations", err);
	}
}

/**
 * Reset migration check cache (useful in tests).
 */
export function resetMigrationCache(): void {
	migrationsChecked = false;
}
