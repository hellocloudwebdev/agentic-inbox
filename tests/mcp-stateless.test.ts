import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createEmailMcpServer } from "../workers/mcp/stateless-server";
import type { Env } from "../workers/types";

const endpoint = "https://agentic-inbox.hellocloudwebdev.workers.dev/mcp";
const keyId = "00000000-0000-4000-8000-000000000001";

function mcpRequest(body: unknown, protocolVersion?: string): Request {
	const headers = new Headers({
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
		"x-agentic-inbox-mcp-key-id": keyId,
	});
	if (protocolVersion) headers.set("mcp-protocol-version", protocolVersion);
	return new Request(endpoint, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("stateless MCP Streamable HTTP handler", () => {
	it("answers initialize, initialized notification, and tools/list without an MCP session", async () => {
		const env = {} as Env;
		const handler = createMcpHandler(
			({ requestInfo }) => {
				if (!requestInfo) throw new Error("MCP request context is missing the HTTP request.");
				return createEmailMcpServer(env, requestInfo);
			},
			{ legacy: "stateless" },
		);

		const initialize = await handler.fetch(
			mcpRequest({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "stateless-regression-test", version: "1.0.0" },
				},
			}),
		);

		expect(initialize.status).toBe(200);
		expect(initialize.headers.get("mcp-session-id")).toBeNull();
		const initializeBody = await initialize.text();
		expect(initializeBody).toContain("agentic-inbox");
		expect(initializeBody).toContain("2025-06-18");

		const initialized = await handler.fetch(
			mcpRequest({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			}, "2025-06-18"),
		);
		expect(initialized.status).toBe(202);

		const tools = await handler.fetch(
			mcpRequest({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			}, "2025-06-18"),
		);

		expect(tools.status).toBe(200);
		expect(tools.headers.get("mcp-session-id")).toBeNull();
		const toolsBody = await tools.text();
		expect(toolsBody).toContain("list_mailboxes");
		expect(toolsBody).toContain("search_emails");
		expect(toolsBody).toContain("send_email");
	});
});
