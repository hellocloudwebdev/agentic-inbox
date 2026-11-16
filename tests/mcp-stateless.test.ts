import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";

const endpoint = "https://agentic-inbox.hellocloudwebdev.workers.dev/mcp";
const keyId = "00000000-0000-4000-8000-000000000001";

function createRegressionServer() {
	const server = new McpServer({ name: "agentic-inbox", version: "1.0.0" });
	server.registerTool("list_mailboxes", { description: "List mailboxes", inputSchema: {} }, async () => ({
		content: [{ type: "text", text: "[]" }],
	}));
	server.registerTool("search_emails", { description: "Search emails", inputSchema: {} }, async () => ({
		content: [{ type: "text", text: "[]" }],
	}));
	server.registerTool("send_email", { description: "Send email", inputSchema: {} }, async () => ({
		content: [{ type: "text", text: "{\\"status\\":\\"sent\\"}" }],
	}));
	return server;
}

describe("stateless MCP Streamable HTTP handler", () => {
	it("connects the official SDK v1.32.2 client and lists tools without an MCP session", async () => {
		const handler = createMcpHandler(() => createRegressionServer(), { legacy: "stateless" });
		const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
			requestInit: {
				headers: {
					"x-agentic-inbox-mcp-key-id": keyId,
				},
			},
			fetch: async (input, init) => {
				const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
				return handler.fetch(request);
			},
		});
		const client = new Client(
			{ name: "agentic-inbox-stateless-regression", version: "1.0.0" },
			{ capabilities: {} },
		);

		try {
			await client.connect(transport);
			expect(client.getServerVersion()?.name).toBe("agentic-inbox");
			const listed = await client.listTools();
			const names = listed.tools.map((tool) => tool.name);
			expect(names).toEqual(expect.arrayContaining(["list_mailboxes", "search_emails", "send_email"]));
			expect(names).toHaveLength(3);
		} finally {
			await client.close();
		}
	});
});
