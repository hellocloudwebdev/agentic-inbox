import { verifyToken } from "@clerk/backend";
import type { Env } from "../types";

export interface AuthenticatedClerkUser {
  id: string;
  email: string;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function getAllowedClerkUser(
  payload: Record<string, unknown>,
  allowedEmails: string,
): AuthenticatedClerkUser | null {
  const id = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const allowlist = allowedEmails.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);

  if (!id || payload.email_verified !== true || !email ||
      !allowlist.some((allowedEmail) => constantTimeEqual(email, allowedEmail))) {
    return null;
  }
  return { id, email };
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
 * Authorization bearer token. The signed email and email_verified claims must
 * be configured in Clerk's Sessions -> Customize session token dashboard.
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

    return getAllowedClerkUser(
      payload as unknown as Record<string, unknown>,
      env.CLERK_ALLOWED_EMAIL,
    );
  } catch {
    // Missing, expired, incorrectly signed, or unauthorized-party tokens fail closed.
    return null;
  }
}
