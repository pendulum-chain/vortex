// 6 hours in milliseconds
const COOLDOWN_PERIOD_MS = 6 * 60 * 60 * 1000;

function generateMessageSignature(message: SlackMessage): string {
  return JSON.stringify(message);
}

export interface SlackMessage {
  text: string;
  [key: string]: unknown;
}

export class SlackNotifier {
  private readonly webhookUrl: string;

  private readonly messageHistory: Map<string, number>;

  constructor() {
    const token = process.env.SLACK_WEB_HOOK_TOKEN;
    if (!token) {
      throw new Error("SLACK_WEB_HOOK_TOKEN is not defined");
    }
    this.webhookUrl = `https://hooks.slack.com/services/${token}`;
    this.messageHistory = new Map();
  }

  public async sendMessage(message: SlackMessage): Promise<void> {
    const slackUserId = process.env.SLACK_USER_ID;

    const messageWithUserTag = {
      ...message,
      text: slackUserId ? `<@${slackUserId}> ${message.text}` : message.text
    };

    const signature = generateMessageSignature(messageWithUserTag);

    if (!this.isMessageAllowed(signature)) {
      // Message is still in cooldown period, skip sending
      return;
    }

    const response = await fetch(this.webhookUrl, {
      body: JSON.stringify(message),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Failed to send message. Status: ${response.status}`);
    }

    // Update the timestamp for this message
    this.messageHistory.set(signature, Date.now());
  }

  private isMessageAllowed(signature: string): boolean {
    const now = Date.now();
    const lastSent = this.messageHistory.get(signature);

    if (!lastSent) return true;

    return now - lastSent >= COOLDOWN_PERIOD_MS;
  }
}
