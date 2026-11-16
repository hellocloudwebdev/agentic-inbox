import { describe, expect, it } from "vitest";
import { handleEmailMcpRequest } from "../workers/mcp/stateless-handler";
import type { Env } from "../workers/types";

const endpoint = "https://agentic-inbox.hellocloudwebdev.workers.dev/mcp";
const keyId = "00000000-0000-4000-8000-000000000001";

const executionContext = {
	waitUntil(promise: Promise<unknown>) {
		void promise.catch(() => undefined);
	},
	passThroughOnException() {},
} as unknown as ExecutionContext;

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
	it("answers initialize and tools/list without creating an MCP session", async () => {
		const env = {} as Env;
		const initialize = await handleEmailMcpRequest(
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
			env,
			executionContext,
		);

		expect(initialize.status).toBe(200);
		expect(initialize.headers.get("mcp-session-id")).toBeNull();
		const initializeBody = await initialize.text();
		expect(initializeBody).toContain("agentic-inbox");
		expect(initializeBody).toContain("2025-06-18");

		const tools = await handleEmailMcpRequest(
			mcpRequest({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: {},
			}, "2025-06-18"),
			env,
			executionContext,
		);

		expect(tools.status).toBe(200);
		expect(tools.headers.get("mcp-session-id")).toBeNull();
		const toolsBody = await tools.text();
		expect(toolsBody).toContain("list_mailboxes");
		expect(toolsBody).toContain("search_emails");
		expect(toolsBody).toContain("send_email");
	});
});
