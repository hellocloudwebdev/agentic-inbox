import { describe, expect, it } from "vitest";
import { getEmailAutomationSettings } from "../workers/lib/email-automation";

describe("email automation permissions", () => {
  it("fails closed when settings are missing", () => {
    expect(getEmailAutomationSettings(undefined)).toEqual({
      autoReplyOnIncoming: false,
      allowChatSend: false,
      allowMcpSend: false,
    });
  });

  it("keeps automatic, chat, and MCP permissions independent", () => {
    expect(getEmailAutomationSettings({ aiEmail: {
      autoReplyOnIncoming: true,
      allowChatSend: false,
      allowMcpSend: true,
    } })).toEqual({
      autoReplyOnIncoming: true,
      allowChatSend: false,
      allowMcpSend: true,
    });
  });

  it("does not treat truthy non-booleans as permission grants", () => {
    expect(getEmailAutomationSettings({ aiEmail: {
      autoReplyOnIncoming: "yes",
      allowChatSend: 1,
      allowMcpSend: true,
    } })).toEqual({
      autoReplyOnIncoming: false,
      allowChatSend: false,
      allowMcpSend: true,
    });
  });
});
