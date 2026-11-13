export interface EmailAutomationSettings {
  autoReplyOnIncoming: boolean;
  allowChatSend: boolean;
  allowMcpSend: boolean;
}
export const DEFAULT_EMAIL_AUTOMATION_SETTINGS: EmailAutomationSettings = {
  autoReplyOnIncoming: false,
  allowChatSend: false,
  allowMcpSend: false,
};
export function getEmailAutomationSettings(value: unknown): EmailAutomationSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_EMAIL_AUTOMATION_SETTINGS };
  const aiEmail = (value as { aiEmail?: Partial<EmailAutomationSettings> }).aiEmail ?? {};
  return {
    autoReplyOnIncoming: aiEmail.autoReplyOnIncoming === true,
    allowChatSend: aiEmail.allowChatSend === true,
    allowMcpSend: aiEmail.allowMcpSend === true,
  };
}
