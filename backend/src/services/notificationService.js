// Notification service — sends alerts via webhook (Slack, Teams, generic HTTP)
// Configurable per project via project settings

const NOTIFICATION_TYPES = {
  'scan.complete':    { label: 'Scan Complete', default: true },
  'approval.pending': { label: 'New Item in Approval Queue', default: true },
  'approval.sla_warning': { label: 'Approval SLA Expiring', default: true },
  'classification.gated': { label: 'GATED Classification Detected', default: true },
  'pii.detected':     { label: 'PII Detected in Asset', default: true },
  'itar.flagged':     { label: 'ITAR-Flagged Asset', default: true },
};

async function sendWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('Webhook notification failed:', e.message);
  }
}

// Send a Slack-formatted webhook
async function notifySlack(webhookUrl, title, message, color = '#3b82f6') {
  await sendWebhook(webhookUrl, {
    attachments: [{
      color,
      title: `CUDE: ${title}`,
      text: message,
      footer: 'CUDE Enterprise Platform',
      ts: Math.floor(Date.now() / 1000),
    }],
  });
}

// Send a Teams-formatted webhook
async function notifyTeams(webhookUrl, title, message, color = '0076D7') {
  await sendWebhook(webhookUrl, {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: color,
    summary: title,
    sections: [{
      activityTitle: `CUDE: ${title}`,
      activitySubtitle: new Date().toISOString(),
      text: message,
    }],
  });
}

// Generic notification dispatcher
async function notify(type, title, message, projectSettings = {}) {
  const webhookUrl = projectSettings.notification_webhook || process.env.NOTIFICATION_WEBHOOK;
  if (!webhookUrl) return;

  const webhookType = projectSettings.notification_type || process.env.NOTIFICATION_TYPE || 'slack';

  const colors = {
    'scan.complete': '#10b981',
    'approval.pending': '#f59e0b',
    'approval.sla_warning': '#ef4444',
    'classification.gated': '#ef4444',
    'pii.detected': '#f59e0b',
    'itar.flagged': '#ef4444',
  };

  if (webhookType === 'teams') {
    await notifyTeams(webhookUrl, title, message, (colors[type] || '#3b82f6').replace('#', ''));
  } else {
    await notifySlack(webhookUrl, title, message, colors[type] || '#3b82f6');
  }
}

module.exports = { notify, sendWebhook, notifySlack, notifyTeams, NOTIFICATION_TYPES };
