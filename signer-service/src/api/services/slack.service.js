class SlackNotifier {
  constructor() {
    if (process.env.SLACK_WEB_HOOK_TOKEN) {
      this.webhookUrl = `https://hooks.slack.com/services/${process.env.SLACK_WEB_HOOK_TOKEN}`;
    } else {
      throw new Error('SLACK_WEB_HOOK_TOKEN is not defined');
    }
  }

  async sendMessage(message) {
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
  }
}

exports.SlackNotifier = SlackNotifier;
