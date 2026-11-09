// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { pgTable, text, timestamp, jsonb, serial, index } from "drizzle-orm/pg-core";

export const neonMigrations = pgTable("neon_migrations", {
	id: serial("id").primaryKey(),
	name: text("name").notNull().unique(),
	appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mailboxes = pgTable(
	"mailboxes",
	{
		id: text("id").primaryKey(), // normalized lowercase email address
		email: text("email").notNull(), // canonical email address
		name: text("name").notNull().default(""), // display name
		status: text("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("idx_mailboxes_status").on(table.status),
		index("idx_mailboxes_email").on(table.email),
	],
);

export const mailboxSettings = pgTable("mailbox_settings", {
	mailboxId: text("mailbox_id")
		.primaryKey()
		.references(() => mailboxes.id, { onDelete: "cascade" }),
	settingsJson: jsonb("settings_json").notNull().default({}),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
	key: text("key").primaryKey(),
	valueJson: jsonb("value_json").notNull().default({}),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
