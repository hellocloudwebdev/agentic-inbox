import { describe, it, expect } from "vitest";
import { resolveDatabaseUrl, DatabaseConfigError } from "../workers/db/neon-client";

describe("resolveDatabaseUrl", () => {
	it("resolves valid string url", () => {
		const url = "postgresql://user:pass@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
		expect(resolveDatabaseUrl(url)).toBe(url);
	});

	it("resolves url from env object", () => {
		const env = { DATABASE_URL: "postgresql://user:pass@ep-cool-123.us-east-2.aws.neon.tech/neondb" };
		expect(resolveDatabaseUrl(env)).toBe(env.DATABASE_URL);
	});

	it("throws DatabaseConfigError when url is missing or empty", () => {
		expect(() => resolveDatabaseUrl("")).toThrow(DatabaseConfigError);
		expect(() => resolveDatabaseUrl({} as any)).toThrow(DatabaseConfigError);
		expect(() => resolveDatabaseUrl({ DATABASE_URL: "   " })).toThrow(DatabaseConfigError);
	});
});
