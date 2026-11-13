import { describe, expect, it } from "vitest";
import { getEmailAutomationSettings } from "../workers/lib/email-automation";

describe("email automation permissions", () => {
  it("fails closed when settings are missing", () => {
    expect(getEmailAutomationSettings(undefined)).toEqual({
      autoReplyOnIncoming: false,
      allowChatSendNewEmails: false,
      allowChatSendReplies: false,
      allowMcpSendNewEmails: false,
      allowMcpSendReplies: false,
    });
  });

  it("keeps automatic, chat, and MCP permissions independent", () => {
    expect(getEmailAutomationSettings({ aiEmail: {
      autoReplyOnIncoming: true,
      allowChatSendNewEmails: true,
      allowChatSendReplies: false,
      allowMcpSendNewEmails: false,
      allowMcpSendReplies: true,
    } })).toEqual({
      autoReplyOnIncoming: true,
      allowChatSendNewEmails: true,
      allowChatSendReplies: false,
      allowMcpSendNewEmails: false,
      allowMcpSendReplies: true,
    });
  });

  it("migrates legacy combined switches to both matching actions", () => {
    expect(getEmailAutomationSettings({ aiEmail: {
      allowChatSend: true,
      allowMcpSend: true,
    } })).toEqual({
      autoReplyOnIncoming: false,
      allowChatSendNewEmails: true,
      allowChatSendReplies: true,
      allowMcpSendNewEmails: true,
      allowMcpSendReplies: true,
    });
  });

  it("does not treat truthy non-booleans as permission grants", () => {
    expect(getEmailAutomationSettings({ aiEmail: {
      autoReplyOnIncoming: "yes",
      allowChatSendNewEmails: 1,
      allowChatSendReplies: false,
      allowMcpSendNewEmails: true,
      allowMcpSendReplies: "true",
    } })).toEqual({
      autoReplyOnIncoming: false,
      allowChatSendNewEmails: false,
      allowChatSendReplies: false,
      allowMcpSendNewEmails: true,
      allowMcpSendReplies: false,
    });
  });
});
