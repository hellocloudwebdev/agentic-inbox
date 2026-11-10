import { readFile, writeFile } from "node:fs/promises";

const configPath = "build/server/wrangler.json";
const raw = await readFile(configPath, "utf8");
const config = JSON.parse(raw);

const durableBindings = config.durable_objects?.bindings ?? [];
const requiredBindings = ["MAILBOX", "EMAIL_AGENT", "EMAIL_MCP"];
const availableBindings = new Set(durableBindings.map((binding) => binding.name));
const missingBindings = requiredBindings.filter((name) => !availableBindings.has(name));

if (missingBindings.length > 0) {
	throw new Error(
		"Cannot prepare Worker Preview: generated config is missing Durable Object bindings: " +
		missingBindings.join(", "),
	);
}

if (!config.ai?.binding) {
	throw new Error("Cannot prepare Worker Preview: generated config is missing the AI binding.");
}

// The project builds with an older Wrangler version that does not recognize
// the Preview config key. Add isolated Preview settings after the app build.
// Wrangler 4.135+ consumes this generated config for Preview deployment.
config.previews = {
	vars: {
		DOMAINS: "preview.invalid",
		EMAIL_ADDRESSES: [],
		ZOHO_SMTP_HOST: "smtp.zoho.in",
		ZOHO_SMTP_PORT: "587",
		ZOHO_SMTP_USERNAME: "mail@neerajsingh.me",
	},
	ai: config.ai,
	durable_objects: {
		bindings: durableBindings,
	},
};

// Do not copy production secrets (DATABASE_URL, POLICY_AUD, TEAM_DOMAIN,
// ZOHO_SMTP_PASSWORD) into Preview configuration. Previews get isolated DO
// namespaces automatically; runtime secrets must be configured separately.
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log("Prepared isolated Worker Preview config with safe vars and Durable Object bindings.");
