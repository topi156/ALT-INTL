const redis = require('../lib/redis');
const { sendEmail } = require('../lib/email');
const { buildDigestHtml, getSampleNewsItems } = require('../lib/digest-template');
const { fetchTopArticles, markSeen } = require('../lib/news-fetcher');

module.exports = async function handler(req, res) {
  // Authorization: Vercel cron sets x-vercel-cron:1 automatically.
  // For manual triggers: Authorization: Bearer <CRON_SECRET>
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const cronSecret = process.env.CRON_SECRET;
  const hasSecret = cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Test mode: send only to one address, never all subscribers.
  // ?test=1&email=you@example.com — manual override
  const isTestOverride = req.query.test === '1';
  const testMode = process.env.TEST_MODE !== 'false' || isTestOverride;
  const testEmail = (req.query.email || process.env.TEST_EMAIL || '').toLowerCase();

  if (testMode && !testEmail) {
    return res.status(400).json({
      error: 'TEST_MODE is active but no email target. Set TEST_EMAIL in .env or pass ?test=1&email=you@example.com',
    });
  }

  // ?sample=1 — use hardcoded articles (template QA, no live feeds or Redis needed)
  const useSamples = req.query.sample === '1';

  // ── Recipients ───────────────────────────────────────────────────────────
  let recipients = [];
  if (testMode) {
    recipients = [{ email: testEmail, token: 'test-token' }];
  } else {
    const all = await redis.hgetall('subscribers');
    if (!all || Object.keys(all).length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No subscribers yet.' });
    }
    recipients = Object.values(all).map(v => (typeof v === 'string' ? JSON.parse(v) : v));
  }

  // ── Fetch news ───────────────────────────────────────────────────────────
  let newsItems;
  let digestDebug = null;

  if (useSamples) {
    newsItems = getSampleNewsItems();
  } else {
    const result = await fetchTopArticles(redis, 5);
    newsItems = result.articles;
    digestDebug = result.debug;

    if (!newsItems.length) {
      return res.status(200).json({
        ok: false,
        message: 'No fresh articles found from any feed. Digest not sent.',
        debug: digestDebug,
      });
    }
  }

  // ── Build and send ───────────────────────────────────────────────────────
  const date = new Date();
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
      console.error(`[digest] send failed → ${subscriber.email}:`, err.message);
    }
  }

  // Mark articles as seen so they don't repeat tomorrow
  if (!useSamples && sent > 0) {
    await markSeen(redis, newsItems);
  }

  // Show debug in response when in test mode or ?debug=1
  const showDebug = testMode || req.query.debug === '1';

  return res.status(200).json({
    ok: true,
    testMode,
    usedSamples: useSamples,
    sent,
    failed: errors.length,
    total: recipients.length,
    articles: newsItems.map(a => ({
      sector: a.sector,
      headline: a.headline,
      source: a.source,
      score: a.score,
      pubDateLabel: a.pubDateLabel,
    })),
    ...(showDebug && digestDebug && { debug: digestDebug }),
    ...(errors.length > 0 && { errors }),
  });
};
