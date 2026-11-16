import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createEmailMcpServer } from "../workers/mcp/stateless-server";
import type { Env } from "../workers/types";

const endpoint = "https://agentic-inbox.hellocloudwebdev.workers.dev/mcp";
const keyId = "00000000-0000-4000-8000-000000000001";

describe("stateless MCP Streamable HTTP handler", () => {
	it("connects the official SDK v1.32.2 client and lists tools without an MCP session", async () => {
		const env = {} as Env;
		const handler = createMcpHandler(
			({ requestInfo }) => {
				if (!requestInfo) throw new Error("MCP request context is missing the HTTP request.");
				return createEmailMcpServer(env, requestInfo);
			},
			{ legacy: "stateless" },
		);

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
			const serverVersion = client.getServerVersion();
			expect(serverVersion?.name).toBe("agentic-inbox");

			const listed = await client.listTools();
			const names = listed.tools.map((tool) => tool.name);
			expect(names).toContain("list_mailboxes");
			expect(names).toContain("search_emails");
			expect(names).toContain("send_email");
			expect(names).toHaveLength(13);
		} finally {
			await client.close();
		}
	});
});
