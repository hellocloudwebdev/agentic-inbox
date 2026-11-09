// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { eq } from "drizzle-orm";
import type { NeonDb } from "../neon-client";
import { appSettings } from "../neon-schema";

export class AppSettingsRepository {
	constructor(private db: NeonDb) {}

	async getSetting<T = unknown>(key: string): Promise<T | null> {
		const row = await this.db
			.select({ valueJson: appSettings.valueJson })
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);

		if (!row.length) return null;
		return row[0].valueJson as T;
	}

	async setSetting<T = unknown>(key: string, value: T): Promise<void> {
		const now = new Date();
		const existing = await this.db
			.select({ key: appSettings.key })
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);

		if (existing.length) {
			await this.db
				.update(appSettings)
				.set({
					valueJson: value,
					updatedAt: now,
				})
				.where(eq(appSettings.key, key));
		} else {
			await this.db.insert(appSettings).values({
				key,
				valueJson: value,
				updatedAt: now,
			});
		}
	}

	async deleteSetting(key: string): Promise<boolean> {
		const existing = await this.db
			.select({ key: appSettings.key })
			.from(appSettings)
			.where(eq(appSettings.key, key))
			.limit(1);

		if (!existing.length) return false;

		await this.db.delete(appSettings).where(eq(appSettings.key, key));
		return true;
	}
}
