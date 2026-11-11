import { verifyToken } from "@clerk/backend";
import type { Env } from "../types";

export interface AuthenticatedClerkUser {
  id: string;
  email: string;
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return undefined;

  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const key = segment.slice(0, separator).trim();
    if (key !== name) continue;
    const value = segment.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Verify a Clerk session from the same-origin __session cookie or an
 * Authorization bearer token. The primaryEmail claim must be configured in
 * Clerk's Sessions -> Customize session token dashboard.
 */
export async function authenticateClerkRequest(
  request: Request,
  env: Env,
): Promise<AuthenticatedClerkUser | null> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || getCookie(request, "__session");
  if (!token || !env.CLERK_JWT_KEY || !env.CLERK_ALLOWED_EMAIL) return null;

  try {
    const origin = new URL(request.url).origin;
    const payload = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: [origin],
    });

    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";

    if (
      !payload.sub ||
      payload.email_verified !== true ||
      !email ||
      email !== env.CLERK_ALLOWED_EMAIL.trim().toLowerCase()
    ) {
      return null;
    }

    return { id: payload.sub, email };
  } catch {
    // Missing, expired, incorrectly signed, or unauthorized-party tokens fail closed.
    return null;
  }
}
