export type EmailTemplate = 'password_reset' | 'email_verification' | 'writing_invite';

export type EmailInput = {
  to: string;
  template: EmailTemplate;
  vars: Record<string, string>;
};

export type EmailResult = {
  delivered: boolean;
  providerMessageId?: string;
};

/**
 * Dev adapter. Logs the message outside production and never claims delivery.
 * EMAIL_DELIVER_IN_DEV is reserved for a future transport. Until that transport
 * exists, this function returns delivered: false.
 */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (process.env.NODE_ENV !== 'production') {
    const lines = Object.entries(input.vars)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    console.log(
      `[email] recorded, not delivered\nto: ${input.to}\ntemplate: ${input.template}\n${lines}`
    );
  }
  return { delivered: false };
}
