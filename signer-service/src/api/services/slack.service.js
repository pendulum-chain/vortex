// Store last message timestamps with their message signatures
const messageHistory = new Map();
// 6 hours in milliseconds
const cooldownPeriod = 6 * 60 * 60 * 1000;

class SlackNotifier {
  constructor() {
    if (process.env.SLACK_WEB_HOOK_TOKEN) {
      this.webhookUrl = `https://hooks.slack.com/services/${process.env.SLACK_WEB_HOOK_TOKEN}`;
    } else {
      throw new Error('SLACK_WEB_HOOK_TOKEN is not defined');
    }
  }

  generateMessageSignature(message) {
    // Create a unique signature for the message
    return JSON.stringify(message);
  }

  isMessageAllowed(signature) {
    const now = Date.now();
    const lastSent = messageHistory.get(signature);

    if (!lastSent) return true;

    return now - lastSent >= cooldownPeriod;
  }

  async sendMessage(message) {
    const signature = this.generateMessageSignature(message);

    if (!this.isMessageAllowed(signature)) {
      // Message is still in cooldown period, skip sending
      return;
    }

    const payload = JSON.stringify(message);

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Failed to send message. Status: ${response.status}`);
    }

    // Update the timestamp for this message
    messageHistory.set(signature, Date.now());
  }
}

exports.SlackNotifier = SlackNotifier;
