import { describe, expect, it } from "vitest";
import {
  getSenderAvatarBrand,
  getSenderAvatarSources,
} from "../app/lib/avatar-sources";

describe("sender avatar brand resolution", () => {
  it("returns stable fallback values for empty identity fields", () => {
    expect(getAvatarToneIndex("", "")).toBeGreaterThanOrEqual(0);
    expect(getAvatarToneIndex("", "")).toBeLessThan(5);
    expect(getSenderInitial("", "")).toBe("?");
  });\n  it("returns stable fallback values for empty identity fields", () => {\n    expect(getAvatarToneIndex("", "")).toBeGreaterThanOrEqual(0);\n    expect(getAvatarToneIndex("", "")).toBeLessThan(5);\n    expect(getSenderInitial("", "")).toBe("?");\n  });
  it("uses the local Zoho brand mark for Zoho Accounts sender domains", () => {
    expect(
      getSenderAvatarBrand("noreply@zohoaccounts.in"),
    ).toBe("zoho");
    expect(
      getSenderAvatarBrand("support@zoho.com"),
    ).toBe("zoho");
  });

  it("does not mistake a Gmail favicon for a person's profile photo", async () => {
    const sources = await getSenderAvatarSources(
      "neeraj.example@gmail.com",
      40,
    );

    expect(sources.some((source) => source.includes("google.com/s2/favicons"))).toBe(false);
    expect(sources.some((source) => source.includes("gravatar.com"))).toBe(true);
  });

  it("uses the actual sender domain for ordinary organization addresses", async () => {
    const sources = await getSenderAvatarSources("person@example.org", 40);

    expect(
      sources.some((source) => source.includes("domain=example.org")),
    ).toBe(true);
  });
});
