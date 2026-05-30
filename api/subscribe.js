const crypto = require('crypto');
const redis = require('../lib/redis');
const { sendEmail } = require('../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const addr = email.toLowerCase().trim();

  // Rate limiting: 5 attempts per IP per hour
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const rateKey = `rate_limit:subscribe:${ip}`;
  const attempts = await redis.incr(rateKey);
  if (attempts === 1) await redis.expire(rateKey, 3600);
  if (attempts > 5) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Duplicate check — always return ok:true to avoid email enumeration
  const existing = await redis.hget('subscribers', addr);
  if (existing) {
    return res.status(200).json({ ok: true });
  }

  // Persist subscriber
  const token = crypto.randomBytes(32).toString('hex');
  const subscriber = { email: addr, token, subscribedAt: new Date().toISOString() };
  await redis.hset('subscribers', { [addr]: subscriber });
  await redis.set(`unsubscribe_token:${token}`, addr, { ex: 365 * 24 * 3600 });

  // Welcome email (skipped in test mode unless address matches TEST_EMAIL)
  const testMode = process.env.TEST_MODE !== 'false';
  const testEmail = (process.env.TEST_EMAIL || '').toLowerCase();
  if (!testMode || addr === testEmail) {
    const siteUrl = process.env.SITE_URL || '';
    const unsubscribeUrl = `${siteUrl}/api/unsubscribe?token=${token}`;
    await sendEmail({
      to: addr,
      subject: "You're subscribed to ALT·Intel",
      html: `
        <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 32px;background:#fff;">
          <div style="font-size:26px;font-weight:900;color:#1a1612;margin-bottom:8px;">ALT<span style="color:#c4381a;">·</span>INTEL</div>
          <h1 style="font-size:20px;color:#1a1612;font-weight:700;margin:0 0 16px;">You're subscribed.</h1>
          <p style="color:#4a4540;line-height:1.7;margin:0 0 16px;">Your first <em>ALT·Intel Morning Briefing</em> will arrive tomorrow at 7:00 AM — five curated private markets stories, contextualized for allocators.</p>
          <p style="font-family:Courier,monospace;font-size:11px;color:#8a8278;text-transform:uppercase;letter-spacing:0.1em;">
            <a href="${unsubscribeUrl}" style="color:#c4381a;text-decoration:underline;">Unsubscribe</a> anytime.
          </p>
        </div>
      `,
    }).catch(err => console.error('Welcome email failed:', err));
  }

  return res.status(200).json({ ok: true });
};
