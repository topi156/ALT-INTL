const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = `${process.env.FROM_NAME || 'ALT·Intel'} <${process.env.FROM_EMAIL || 'onboarding@resend.dev'}>`;

async function sendEmail({ to, subject, html }) {
  return resend.emails.send({ from: FROM, to, subject, html });
}

module.exports = { sendEmail };
