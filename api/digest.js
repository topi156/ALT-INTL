const redis = require('../lib/redis');
const { sendEmail } = require('../lib/email');
const { getSampleNewsItems, buildDigestHtml } = require('../lib/digest-template');

module.exports = async function handler(req, res) {
  // Authorization: Vercel cron sets x-vercel-cron header automatically.
  // For manual triggers, pass: Authorization: Bearer <CRON_SECRET>
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const cronSecret = process.env.CRON_SECRET;
  const hasSecret =
    cronSecret &&
    req.headers['authorization'] === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Test mode: send only to one address, not to all subscribers.
  // Override: pass ?test=1&email=you@example.com in the URL.
  const isTestOverride = req.query.test === '1';
  const testMode = process.env.TEST_MODE !== 'false' || isTestOverride;
  const testEmail = (req.query.email || process.env.TEST_EMAIL || '').toLowerCase();

  if (testMode && !testEmail) {
    return res.status(400).json({
      error: 'TEST_MODE is active but TEST_EMAIL is not set. Set it in .env or pass ?test=1&email=you@example.com',
    });
  }

  // Resolve recipient list
  let recipients = [];
  if (testMode) {
    recipients = [{ email: testEmail, token: 'test-token' }];
  } else {
    const all = await redis.hgetall('subscribers');
    if (!all || Object.keys(all).length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No subscribers yet.' });
    }
    recipients = Object.values(all).map(v =>
      typeof v === 'string' ? JSON.parse(v) : v,
    );
  }

  // Build digest content
  // ── REPLACE getSampleNewsItems() WITH REAL FEED CALL WHEN READY ──
  const date = new Date();
  const newsItems = getSampleNewsItems(date);
  const siteUrl = process.env.SITE_URL || '';
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  let sent = 0;
  const errors = [];

  for (const subscriber of recipients) {
    const unsubscribeUrl =
      subscriber.token === 'test-token'
        ? `${siteUrl}/api/unsubscribe?token=test-token`
        : `${siteUrl}/api/unsubscribe?token=${subscriber.token}`;

    const html = buildDigestHtml({ date, items: newsItems, unsubscribeUrl, siteUrl });

    try {
      await sendEmail({
        to: subscriber.email,
        subject: `ALT·Intel Morning Briefing — ${dateLabel}`,
        html,
      });
      sent++;
    } catch (err) {
      errors.push({ email: subscriber.email, error: err.message });
      console.error(`Failed to send to ${subscriber.email}:`, err.message);
    }
  }

  return res.status(200).json({
    ok: true,
    testMode,
    sent,
    failed: errors.length,
    total: recipients.length,
    ...(errors.length > 0 && { errors }),
  });
};
