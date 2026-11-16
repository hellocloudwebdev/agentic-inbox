import { createMcpHandler } from "agents/mcp/server";
import type { Env } from "../types";
import { createEmailMcpServer } from "./stateless-server";

/**
 * Stateless Streamable HTTP entrypoint.
 *
 * The handler factory receives the exact authenticated request forwarded by
 * workers/app.ts. No protocol session or Durable Object is needed for tool
 * execution; each POST gets an isolated server and transport.
 */
export function handleEmailMcpRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	const handler = createMcpHandler(
		({ requestInfo }) => {
			if (!requestInfo) throw new Error("MCP request context is missing the HTTP request.");
			return createEmailMcpServer(env, requestInfo);
		},
		{
			route: "/mcp",
			legacy: "stateless",
			onerror(error) {
				console.error("Stateless MCP request failed:", error.message);
			},
		},
	);
	return handler(request, env, ctx);
}
