/**
 * Transactional email sending (password reset, email verification).
 *
 * Configure via server/.env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If SMTP is not configured (e.g. local dev), sendMail() logs the email to the
 * console instead of throwing, so registration/reset flows still work without
 * a mail server — just check the server logs for the link.
 */
const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends an email. Never throws — logs and returns { ok: false } on failure so
 * callers (e.g. forgot-password) can respond generically without leaking
 * whether the send actually succeeded.
 */
async function sendMail({ to, subject, html }) {
  if (!isConfigured()) {
    console.warn('[mailer] SMTP not configured — logging email instead of sending.');
    console.warn(`[mailer] To: ${to}\n[mailer] Subject: ${subject}\n[mailer] Body:\n${html}`);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await getTransporter().sendMail({ from, to, subject, html });
    return { ok: true };
  } catch (err) {
    console.error('[mailer] Failed to send email:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendMail, isConfigured };
