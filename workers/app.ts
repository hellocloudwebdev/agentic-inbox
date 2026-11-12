// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { authenticateClerkRequest } from "./lib/clerk-auth";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { EmailMCP } from "./mcp";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";

type ClerkWorkerGlobals = typeof globalThis & {
	CLERK_SECRET_KEY?: string;
	CLERK_PUBLISHABLE_KEY?: string;
};

const clerkWorkerGlobals = globalThis as ClerkWorkerGlobals;

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Main app that wraps the API and adds React Router fallback
const app = new Hono<{ Bindings: Env }>();

// Clerk replaces Cloudflare Access OTP as the application's authentication boundary.
// Keep the sign-in route and static assets public; protect every API, MCP, mailbox,
// and Agent WebSocket request with a verified Clerk session.
app.use("*", async (c, next) => {
	const pathname = new URL(c.req.url).pathname;
	const isPublicSignIn = pathname === "/sign-in" || pathname.startsWith("/sign-in/");
	const isPublicAsset =
		pathname.startsWith("/assets/") ||
		pathname.startsWith("/_build/") ||
		pathname.startsWith("/favicon") ||
		pathname === "/robots.txt" ||
		pathname === "/manifest.webmanifest";

	if (isPublicSignIn || isPublicAsset) return next();

	if (!c.env.CLERK_JWT_KEY || !c.env.CLERK_ALLOWED_EMAIL) {
		return c.text("Clerk authentication is not configured. Set CLERK_JWT_KEY and CLERK_ALLOWED_EMAIL.", 503);
	}

	const user = await authenticateClerkRequest(c.req.raw, c.env);
	if (!user) {
		const url = new URL(c.req.url);
		const isApiOrAgent =
			pathname.startsWith("/api/") ||
			pathname.startsWith("/agents/") ||
			pathname === "/mcp" ||
			pathname.startsWith("/mcp/") ||
			c.req.header("Upgrade")?.toLowerCase() === "websocket";

		if (isApiOrAgent) {
			return c.json({ error: "Unauthorized. Sign in with your authorized Google account." }, 401);
		}

		const redirectUrl = new URL("/sign-in", url.origin);
		redirectUrl.searchParams.set("redirect_url", url.pathname + url.search);
		return c.redirect(redirectUrl.toString(), 302);
	}

	return next();
});

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
app.all("/mcp", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});
app.all("/mcp/*", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	// React Router v7 middleware runs before loaders with a RouterContextProvider.
	// In this runtime the Cloudflare bindings are not reliably exposed on that
	// middleware context, so seed Clerk's documented globalThis env fallback.
	// These values are constant for this Worker environment, not user-specific.
	clerkWorkerGlobals.CLERK_SECRET_KEY = c.env.CLERK_SECRET_KEY;
	clerkWorkerGlobals.CLERK_PUBLISHABLE_KEY = c.env.CLERK_PUBLISHABLE_KEY;

	return requestHandler(c.req.raw, new RouterContextProvider());
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
