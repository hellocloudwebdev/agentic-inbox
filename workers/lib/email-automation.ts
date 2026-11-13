export interface EmailAutomationSettings {
  autoReplyOnIncoming: boolean;
  allowChatSendNewEmails: boolean;
  allowChatSendReplies: boolean;
  allowMcpSendNewEmails: boolean;
  allowMcpSendReplies: boolean;
}
export const DEFAULT_EMAIL_AUTOMATION_SETTINGS: EmailAutomationSettings = {
  autoReplyOnIncoming: false,
  allowChatSendNewEmails: false,
  allowChatSendReplies: false,
  allowMcpSendNewEmails: false,
  allowMcpSendReplies: false,
};
export function getEmailAutomationSettings(value: unknown): EmailAutomationSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_EMAIL_AUTOMATION_SETTINGS };
  const aiEmail = (value as { aiEmail?: Record<string, unknown> }).aiEmail ?? {};
  // Preserve the old combined switches for existing installations during migration.
  const legacyChat = aiEmail.allowChatSend === true;
  const legacyMcp = aiEmail.allowMcpSend === true;
  return {
    autoReplyOnIncoming: aiEmail.autoReplyOnIncoming === true,
    allowChatSendNewEmails: aiEmail.allowChatSendNewEmails === true || legacyChat,
    allowChatSendReplies: aiEmail.allowChatSendReplies === true || legacyChat,
    allowMcpSendNewEmails: aiEmail.allowMcpSendNewEmails === true || legacyMcp,
    allowMcpSendReplies: aiEmail.allowMcpSendReplies === true || legacyMcp,
  };
}
