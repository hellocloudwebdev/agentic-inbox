import { describe, expect, it } from "vitest";
import { getAllowedClerkUser } from "../workers/lib/clerk-auth";

describe("getAllowedClerkUser", () => {
  it("accepts the allowlisted verified Google identity case-insensitively", () => {
    expect(getAllowedClerkUser({
      sub: "user_123",
      email: "hellocloud.webdev@gmail.com",
      email_verified: true,
    }, "HelloCloud.WebDev@gmail.com")).toEqual({
      id: "user_123",
      email: "hellocloud.webdev@gmail.com",
    });
  });

  it("rejects an unverified allowlisted email", () => {
    expect(getAllowedClerkUser({
      sub: "user_123",
      email: "hellocloud.webdev@gmail.com",
      email_verified: false,
    }, "hellocloud.webdev@gmail.com")).toBeNull();
  });

  it("rejects another verified Google account", () => {
    expect(getAllowedClerkUser({
      sub: "user_456",
      email: "someone.else@gmail.com",
      email_verified: true,
    }, "hellocloud.webdev@gmail.com")).toBeNull();
  });

  it("rejects missing email and subject claims", () => {
    expect(getAllowedClerkUser({
      email_verified: true,
    }, "hellocloud.webdev@gmail.com")).toBeNull();
  });
});
