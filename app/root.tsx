// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Empty,
	LinkProvider,
	Loader,
	Toasty,
	TooltipProvider,
} from "@cloudflare/kumo";
import { WarningIcon } from "@phosphor-icons/react";
import { ClerkProvider, useAuth } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { forwardRef, useState } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Navigate,
	Outlet,
	Link as RouterLink,
	useLocation,
	useLoaderData,
	Scripts,
	ScrollRestoration,
} from "react-router";
import { ApiError } from "~/services/api";
import type { Route } from "./+types/root";
import "./index.css";

export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware()];

export function loader(args: Route.LoaderArgs) {
	return rootAuthLoader(args, ({ context }) => ({
		clerkPublishableKey: context.cloudflare.env.CLERK_PUBLISHABLE_KEY || "",
	}));
}

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				refetchOnWindowFocus: false,
				retry: (failureCount, error) => {
					// Don't retry 4xx errors (not found, unauthorized, etc.)
					if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
						return false;
					}
					return failureCount < 2;
				},
			},
		},
		mutationCache: new MutationCache({
			onError: (error) => {
				// Global fallback for mutations that don't handle errors themselves.
				// Consumers using mutateAsync + try/catch handle their own errors.
				console.error("Mutation failed:", error);
			},
		}),
	});
}

// Lazy singleton for the browser — avoids module-scope instantiation that
// leaks cache across SSR requests.
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
	if (typeof window === "undefined") {
		// SSR: always create a fresh client per request to prevent cross-user cache leaks
		return makeQueryClient();
	}
	// Browser: reuse the same client across navigations
	if (!browserQueryClient) browserQueryClient = makeQueryClient();
	return browserQueryClient;
}

function AuthenticatedOutlet() {
	const { isLoaded, isSignedIn } = useAuth();
	const location = useLocation();
	const isSignInRoute = location.pathname === "/sign-in" || location.pathname.startsWith("/sign-in/");

	if (isSignInRoute) return <Outlet />;
	if (!isLoaded) {
		return <div className="flex min-h-screen items-center justify-center"><Loader size="lg" /></div>;
	}
	if (!isSignedIn) {
		const returnTo = location.pathname + location.search;
		return <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`} replace />;
	}
	return <Outlet />;
}

const KumoLink = forwardRef<
	HTMLAnchorElement,
	React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }
>(function KumoLink({ href, ...props }, ref) {
	if (href && !href.startsWith("http")) {
		return (
			<RouterLink to={href} ref={ref} {...(props as Record<string, unknown>)} />
		);
	}
	return <a href={href} ref={ref} {...props} />;
});

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
					rel="stylesheet"
				/>
				<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
				<link
					rel="icon"
					type="image/x-icon"
					href="/favicon.ico"
					sizes="48x48 32x32 16x16"
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
				<title>Agentic Inbox</title>
				<Meta />
				<Links />
			</head>
			<body className="bg-kumo-recessed text-kumo-default antialiased">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export function HydrateFallback() {
	return (
		<div className="flex items-center justify-center h-screen">
			<Loader size="lg" />
		</div>
	);
}

export default function App({ loaderData }: Route.ComponentProps) {
	const [queryClient] = useState(getQueryClient);
	const { clerkPublishableKey } = loaderData;

	if (!clerkPublishableKey) {
		return (
			<div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
				<h1 className="text-xl font-semibold">Authentication is not configured</h1>
				<p className="text-sm text-kumo-subtle">Set CLERK_PUBLISHABLE_KEY in your Cloudflare Worker environment to enable Google sign-in.</p>
			</div>
		);
	}

	return (
		<ClerkProvider publishableKey={clerkPublishableKey} loaderData={loaderData}>
			<QueryClientProvider client={queryClient}>
				<LinkProvider component={KumoLink}>
					<TooltipProvider>
						<Toasty><AuthenticatedOutlet /></Toasty>
					</TooltipProvider>
				</LinkProvider>
			</QueryClientProvider>
		</ClerkProvider>
	);
}

export function ErrorBoundary({ error }: { error: unknown }) {
	// Keep production diagnostics in the Worker logs without exposing internals to visitors.
	console.error("Agentic Inbox root route error:", error);
	let title = "Something went wrong";
	let description = "An unexpected error occurred. Please try again.";
	let status: number | null = null;

	if (isRouteErrorResponse(error)) {
		status = error.status;
		if (error.status === 404) {
			title = "Page not found";
			description =
				"The page you're looking for doesn't exist or has been moved.";
		} else {
			title = `Error ${error.status}`;
			description = error.statusText || description;
		}
	} else if (error instanceof Error && import.meta.env.DEV) {
		description = error.message;
	}

	return (
		<div className="flex items-center justify-center min-h-screen p-8">
			<Empty
				icon={<WarningIcon size={48} className="text-kumo-inactive" />}
				title={status === 404 ? "404 — Page not found" : title}
				description={description}
				contents={
					<Button
						variant="primary"
						onClick={() => {
							window.location.href = "/";
						}}
					>
						Go Home
					</Button>
				}
			/>
		</div>
	);
}
