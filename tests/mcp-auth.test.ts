import { describe, expect, it } from "vitest";
import { isMailboxAuthorized, type McpApiPrincipal } from "../workers/lib/mcp-auth";

describe("MCP mailbox scopes", () => {
  const principal: McpApiPrincipal = {
    keyId: "00000000-0000-4000-8000-000000000001",
    mailboxIds: ["primary@example.com", "secondary@example.com"],
  };

  it("allows explicitly scoped mailboxes case-insensitively", () => {
    expect(isMailboxAuthorized(principal, " PRIMARY@example.com ")).toBe(true);
  });

  it("denies mailboxes outside the key scope", () => {
    expect(isMailboxAuthorized(principal, "other@example.com")).toBe(false);
  });

  it("denies an empty scope", () => {
    expect(isMailboxAuthorized({ keyId: principal.keyId, mailboxIds: [] }, "primary@example.com")).toBe(false);
  });
});
