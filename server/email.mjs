import nodemailer from 'nodemailer';

export function smtpConfiguration(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT);
  const user = env.SMTP_USER?.trim();
  const password = host === 'smtp.gmail.com' ? env.SMTP_PASSWORD?.replace(/\s/g, '') : env.SMTP_PASSWORD;
  const from = env.EMAIL_FROM?.trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host) || ![465, 587].includes(port) ||
      !user || /[\r\n]/.test(user) || !password || !from || /[\r\n]/.test(from)) {
    throw new Error('SMTP configuration incomplete');
  }
  return { emailFrom: from, smtp: { host, port, user, password } };
}

export function smtpOptions(config) {
  return {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: true,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: config.smtp.host },
    auth: { user: config.smtp.user, pass: config.smtp.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true
  };
}

export function createMailer(config, createTransport = nodemailer.createTransport) {
  const transport = createTransport(smtpOptions(config));
  return async message => {
    try {
      const result = await transport.sendMail({
        from: config.emailFrom,
        to: [{ address: message.to }],
        subject: message.subject,
        text: message.text
      });
      if (result.rejected?.length || result.accepted?.length !== 1) throw new Error('Recipient rejected');
    } catch {
      // SMTP errors may contain message contents, recipients or authentication data.
      // Do not return, log, or attach the provider error to this sanitized error.
      const error = new Error('Email delivery failed. Please try again later.');
      error.code = 'EMAIL_DELIVERY_FAILED';
      throw error;
    }
  };
}

export async function sendEmail(config, message) {
  await createMailer(config)(message);
}
