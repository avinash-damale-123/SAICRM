export async function sendEmail(config, message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.emailKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [message.to], subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Email delivery request failed');
}
