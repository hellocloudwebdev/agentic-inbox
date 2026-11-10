import { describe, expect, it } from "vitest";
import {
  getRecipientSummary,
  getSenderIdentity,
  parseAddressList,
} from "../app/lib/email-identity";

describe("email identity display", () => {
  it("uses the display name and address from the stored From header", () => {
    const rawHeaders = JSON.stringify([
      { key: "from", value: "Joseph Brown <joseph@example.com>" },
    ]);

    expect(getSenderIdentity("joseph@example.com", rawHeaders)).toEqual({
      name: "Joseph Brown",
      email: "joseph@example.com",
    });
  });

  it("falls back to a readable name from the email local part", () => {
    expect(getSenderIdentity("jane.doe@example.com")).toEqual({
      name: "Jane Doe",
      email: "jane.doe@example.com",
    });
  });

  it("keeps commas inside quoted display names while parsing recipient lists", () => {
    expect(
      parseAddressList(
        '"Doe, Jane" <jane@example.com>, "Smith, Bob" <bob@example.com>',
      ),
    ).toEqual([
      { name: "Doe, Jane", email: "jane@example.com" },
      { name: "Smith, Bob", email: "bob@example.com" },
    ]);
  });

  it("formats To and Cc display names from stored message headers", () => {
    const rawHeaders = JSON.stringify([
      { key: "to", value: "Aman Ansari <aman@example.com>" },
      { key: "cc", value: "Lewis Hamilton <lewis@example.com>" },
    ]);

    expect(
      getRecipientSummary("aman@example.com", rawHeaders, "lewis@example.com"),
    ).toEqual(["To: Aman Ansari", "Cc: Lewis Hamilton"]);
  });

  it("uses the configured mailbox name for the account's own sender address", () => {
    const rawHeaders = JSON.stringify([
      { key: "from", value: "mail <mail@neerajsingh.me>" },
    ]);

    expect(
      getSenderIdentity("mail@neerajsingh.me", rawHeaders, {
        email: "mail@neerajsingh.me",
        name: "Neeraj Singh",
      }),
    ).toEqual({
      name: "Neeraj Singh",
      email: "mail@neerajsingh.me",
    });
  });

  it("uses the configured mailbox name for the account's own recipient address", () => {
    const rawHeaders = JSON.stringify([
      { key: "to", value: "Mail <mail@neerajsingh.me>" },
    ]);

    expect(
      getRecipientSummary(
        "mail@neerajsingh.me",
        rawHeaders,
        null,
        { email: "mail@neerajsingh.me", name: "Neeraj Singh" },
      ),
    ).toEqual(["To: Neeraj Singh"]);
  });

  it("handles malformed headers without failing", () => {
    expect(getSenderIdentity("support@example.com", "{bad json}")).toEqual({
      name: "Support",
      email: "support@example.com",
    });
  });
});
