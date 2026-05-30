'use strict';

const crypto = require('crypto');
const Parser = require('rss-parser');

const FEED_TIMEOUT_MS = 6000;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    'User-Agent': 'ALT-Intel-Digest/1.0 (daily newsletter)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
  customFields: { item: ['content:encoded', 'media:content'] },
});

// ─────────────────────────────────────────────────────────────────────────────
// FEED REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
const FEEDS = [
  // ── Direct RSS ───────────────────────────────────────────────────────────
  { url: 'https://altassets.net/feed',                              source: 'AltAssets',           sector: 'PE',    paywall: false },
  { url: 'https://www.privateequitywire.co.uk/feed/',              source: 'PE Wire',             sector: 'PE',    paywall: false },
  { url: 'https://therealdeal.com/feed/',                           source: 'The Real Deal',       sector: 'RE',    paywall: false },
  { url: 'https://www.commercialobserver.com/feed/',               source: 'Commercial Observer', sector: 'RE',    paywall: false },
  { url: 'https://renewablesnow.com/news/rss/',                    source: 'Renewables Now',      sector: 'Infra', paywall: false },
  { url: 'https://opalesque.com/rss.xml',                          source: 'Opalesque',           sector: 'Hedge', paywall: false },
  { url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', source: 'WSJ Markets',   sector: 'Macro', paywall: true  },

  // ── Google News keyword searches ─────────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=%22private+equity%22+%22buyout%22+OR+%22fundraising%22+OR+%22lbo%22&hl=en-US&gl=US&ceid=US:en',                                         source: 'Google News', sector: 'PE',    paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22private+credit%22+OR+%22direct+lending%22&hl=en-US&gl=US&ceid=US:en',                                                                source: 'Google News', sector: 'Credit', paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22infrastructure+fund%22+OR+%22energy+transition%22+investment&hl=en-US&gl=US&ceid=US:en',                                             source: 'Google News', sector: 'Infra', paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22real+estate%22+%22private+equity%22+OR+%22commercial+real+estate%22+fund&hl=en-US&gl=US&ceid=US:en',                                 source: 'Google News', sector: 'RE',    paywall: false },
  { url: 'https://news.google.com/rss/search?q=site:bloomberg.com+%22private+equity%22+OR+%22private+credit%22+OR+%22private+markets%22&hl=en-US&gl=US&ceid=US:en',                   source: 'Google News', sector: 'PE',    paywall: true  },
  { url: 'https://news.google.com/rss/search?q=site:reuters.com+%22private+equity%22+OR+%22private+credit%22+OR+%22hedge+fund%22&hl=en-US&gl=US&ceid=US:en',                          source: 'Google News', sector: 'Macro', paywall: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED DAILY SLOTS
// Every digest must contain one article per required slot before any filler.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_SLOTS = [
  { key: 'PE',     label: 'Private Equity / Buyout / Growth Equity / Secondaries', sectors: ['PE'] },
  { key: 'Credit', label: 'Private Credit / Direct Lending',                       sectors: ['Credit'] },
  { key: 'Infra',  label: 'Infrastructure / Energy Transition / Real Assets',      sectors: ['Infra'] },
];

// Macro articles are only included as fillers when they touch one of these
// private-markets-relevant themes. Generic macro news is excluded.
const MACRO_RELEVANCE_RE = /interest rate|rate cut|rate hike|rate environment|monetary policy|federal reserve|\bfed\b|\becb\b|central bank|credit spread|high.yield|loan market|leveraged loan|borrowing cost|financing cost|cost of debt|\bm&a\b|deal activity|deal flow|merger|acquisition|\bipo\b|initial public offering|\bexit\b|ipo window|lp allocation|limited partner|pension fund|endowment|sovereign wealth|dry powder|private equity|private credit|private market|leveraged buyout/i;

// Articles scoring below this threshold in a required slot are logged as low
// confidence (debug only — never surfaced to email readers).
const LOW_CONFIDENCE_THRESHOLD = 35;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function stripHtml(str = '') {
  return str.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Google News RSS appends " - Source Name" to every title. Split it off.
function splitGoogleTitle(rawTitle, feedSource) {
  if (!rawTitle) return { title: '', source: feedSource };
  const idx = rawTitle.lastIndexOf(' - ');
  if (idx > 0) {
    const suffix = rawTitle.slice(idx + 3).trim();
    const head = rawTitle.slice(0, idx).trim();
    if (suffix.length > 0 && suffix.length < 50 && head.length > 10) {
      return { title: head, source: suffix };
    }
  }
  return { title: rawTitle, source: feedSource };
}

// Stable short hash of a normalized title — used as the Redis dedup key so the
// same story discovered via two different feeds counts as one story.
function titleHash(title) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 20);
}

function formatAge(date) {
  if (!date) return null;
  const h = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function detectSector(title, summary, defaultSector) {
  const t = `${title} ${summary || ''}`.toLowerCase();
  if (/(private credit|direct lending|private debt|unitranche|mezzanine|leveraged loan|bdc|distressed debt)/i.test(t)) return 'Credit';
  if (/\bcredit\b.*(spread|fund|facility|lending|loan)/i.test(t)) return 'Credit';
  if (/(infrastructure|infra fund|digital infrastructure|data cent(er|re)|renewable(s)?|energy transition|clean energy|solar farm|wind farm|battery storage|power grid|toll road|airport|seaport|pipeline|lng terminal|fiber network|cell tower)/i.test(t)) return 'Infra';
  if (/(stonepeak|macquarie infra|\bgip\b|ifm investors)/i.test(t)) return 'Infra';
  if (/(real estate|commercial property|\brepe\b|multifamily|office (building|market|space|tower)|logistics park|warehouse|build.to.rent|student housing|senior housing|self.storage|cap rate|\bnoi\b)/i.test(t)) return 'RE';
  if (/\breit\b/i.test(t)) return 'RE';
  if (/(hedge fund|long.short|multi.strategy|global macro|quant fund|managed futures|activist investor|short seller|event.driven)/i.test(t)) return 'Hedge';
  if (/(interest rate|federal reserve|\bfed\b|inflation|gdp|central bank|ecb|monetary|pension fund|sovereign wealth)/i.test(t)) return 'Macro';
  // PE bucket includes buyouts, growth, VC, and secondaries / GP-led deals
  if (/(private equity|buyout|lbo|take.private|growth equity|venture capital|gp stake|secondaries|secondary fund|gp.led|continuation vehicle)/i.test(t)) return 'PE';
  return defaultSector;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY SCORE  (0–100)
// NOTE: raw feed articles carry `.title`; shaped articles carry `.headline`.
// Both are handled here so scoreArticle works correctly at all call sites.
// ─────────────────────────────────────────────────────────────────────────────
const TIER1 = ['Bloomberg', 'Financial Times', 'WSJ', 'Reuters', 'CNBC', 'Axios', 'Institutional Investor'];
const TIER2 = ['AltAssets', 'PE Wire', 'The Real Deal', 'Commercial Observer', 'Opalesque', 'Renewables Now'];

function scoreArticle({ headline = '', title = '', summary = '', source, paywall, pubDate }) {
  const hl = headline || title;
  const fullText = `${hl} ${summary}`.toLowerCase();
  const titleText = hl.toLowerCase();
  let score = 25;

  if (TIER1.some(s => source.includes(s))) score += 15;
  else if (TIER2.some(s => source.includes(s))) score += 10;

  score += paywall ? -5 : 10;

  const fundKw = ['fundraise', 'fundraising', 'raised', 'raising', 'closes', 'closed', 'first close', 'final close', 'hard cap', 'targets', 'launches fund', 'new fund', 'gp-led', 'dry powder', 'commitment'];
  if (fundKw.some(kw => fullText.includes(kw))) score += 20;
  if (fundKw.some(kw => titleText.includes(kw))) score += 10;

  const dealKw = ['interest rate', 'federal reserve', 'rate cut', 'inflation', 'distressed', 'restructuring', 'lbo', 'take-private', 'buyout', 'acquisition', 'merger', 'ipo', 'exit', 'dividend recap'];
  if (dealKw.some(kw => fullText.includes(kw))) score += 15;
  if (dealKw.some(kw => titleText.includes(kw))) score += 10;

  if (pubDate) {
    const ageH = (Date.now() - pubDate.getTime()) / 3_600_000;
    if (ageH < 12) score += 25;
    else if (ageH < 24) score += 15;
    else if (ageH < 48) score += 5;
  }

  const noiseKw = ['celebrity', 'luxury brand', 'toy', 'watchmaker', 'retail chain', 'hasbro', 'mattel', 'movie', 'fashion'];
  if (noiseKw.some(kw => fullText.includes(kw))) score -= 40;

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// WHY IT MATTERS
// ─────────────────────────────────────────────────────────────────────────────
function whyItMatters({ headline = '', summary = '', sector }) {
  const t = `${headline} ${summary}`.toLowerCase();
  if (/(software|saas|tech valuation|tech downturn)/i.test(t)) return 'Tech sector impact — affects PE portfolios weighted toward SaaS and software buyouts.';
  if (/(ai|artificial intelligence|openai|anthropic)/i.test(t)) return 'AI disruption — requires GPs to evaluate structural impacts on portfolios; opens new infra/VC opportunities.';
  if (/(interest rate|fed|inflation|rate cut|monetary policy)/i.test(t)) return 'Macro headwind/tailwind — directly influences cost of debt, valuations, and exit environments across all private markets.';
  if (/(first close|final close|fundraise|raised|hard cap)/i.test(t)) return 'LP allocation signal — indicates strategy appetite and vintage momentum; watch for competing vehicles.';
  if (/(lbo|take.private|buyout|acquisition|merger)/i.test(t)) return 'Deal activity — relevant for comparable valuations, sector momentum, and debt-market depth.';
  if (/(secondar|gp.led|continuation|gp stake)/i.test(t)) return 'Liquidity signal — reflects GP sentiment on portfolio valuations and secondary market appetite.';
  if (/(nav loan|direct lending|private credit|unitranche)/i.test(t)) return 'Credit market signal — impacts cost of capital, deal structuring capacity, and leverage multiples.';
  if (/(distressed|restructuring|bankruptcy|default)/i.test(t)) return 'Distress signal — watch for portfolio-company implications and credit fund opportunity set.';
  if (/(ipo|exit|sale|secondary)/i.test(t)) return 'Exit activity — key indicator of distribution timing and GP carry realization.';
  if (sector === 'Infra') return 'Infrastructure deployment — energy transition and digital infra remain top LP priority themes this cycle.';
  if (sector === 'RE') return 'Real estate repricing — cap rate movements directly affect RE fund NAVs and optimal exit timing.';
  if (sector === 'Credit') return 'Credit dynamics — directly affects direct lending fund returns, deal flow, and competitive intensity.';
  if (sector === 'Hedge') return 'Hedge fund positioning — relevant for liquid alts allocators monitoring strategy-level flows.';
  return 'Private markets intelligence — relevant for LP allocators and fund managers.';
}

// ─────────────────────────────────────────────────────────────────────────────
// MACRO RELEVANCE GATE
// Macro articles must touch one of these PE-relevant themes to be included
// as a filler story. Generic macro / economic noise is excluded.
// ─────────────────────────────────────────────────────────────────────────────
function isMacroQualified(article) {
  const t = `${article.title} ${article.summary}`.toLowerCase();
  return MACRO_RELEVANCE_RE.test(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT-BASED SELECTION
// Guarantees required category coverage before filling by score.
// ─────────────────────────────────────────────────────────────────────────────
function selectBySlots(scored, count, debug) {
  const selected = [];
  const usedIdx = new Set();

  // ── Step 1: Fill required slots ──────────────────────────────────────────
  for (const slot of REQUIRED_SLOTS) {
    if (selected.length >= count) break;

    const idx = scored.findIndex((a, i) => !usedIdx.has(i) && slot.sectors.includes(a.sector));

    if (idx === -1) {
      debug.slots[slot.key] = { headline: null, confidence: 'missing' };
      console.warn(`[digest:slot] ${slot.key.padEnd(8)} MISSING — no articles available for: ${slot.label}`);
    } else {
      const a = scored[idx];
      usedIdx.add(idx);
      selected.push(a);

      const confidence = a.score >= LOW_CONFIDENCE_THRESHOLD ? 'strong' : 'low';
      debug.slots[slot.key] = { headline: a.title, source: a.source, score: a.score, confidence };

      const flag = confidence === 'low' ? ' ⚠ LOW CONFIDENCE' : '';
      console.log(`[digest:slot] ${slot.key.padEnd(8)} → "${a.title.slice(0, 72)}" (${a.source}, score:${a.score})${flag}`);
    }
  }

  // ── Step 2: Fill remaining slots by score ────────────────────────────────
  for (let i = 0; i < scored.length && selected.length < count; i++) {
    if (usedIdx.has(i)) continue;
    const a = scored[i];

    if (a.sector === 'Macro' && !isMacroQualified(a)) {
      debug.rejected.push({
        headline: a.title,
        source: a.source,
        score: a.score,
        reason: 'Macro: not relevant to rates / financing / M&A / exits / IPO / credit spreads / LP allocation',
      });
      console.log(`[digest:rej]  ${'MACRO'.padEnd(8)} — "${a.title.slice(0, 72)}" (${a.source}, score:${a.score})`);
      continue;
    }

    usedIdx.add(i);
    selected.push(a);
    debug.fillers.push({ headline: a.title, source: a.source, sector: a.sector, score: a.score });
    console.log(`[digest:fill] ${a.sector.padEnd(8)} → "${a.title.slice(0, 72)}" (${a.source}, score:${a.score})`);
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE FEED FETCHER
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).map(item => {
      const rawTitle = (item.title || '').trim();
      const { title, source } =
        feed.source === 'Google News'
          ? splitGoogleTitle(rawTitle, feed.source)
          : { title: rawTitle, source: feed.source };

      const rawBody = stripHtml(
        item.contentSnippet || item['content:encoded'] || item.content || item.summary || '',
      );
      const summary = rawBody.length > 220 ? rawBody.slice(0, 220) + '…' : rawBody;

      const pubDate = (() => {
        const d = new Date(item.pubDate || item.isoDate || '');
        return isFinite(d.getTime()) ? d : null;
      })();

      const url = (item.link || item.guid || '').trim();
      const sector = detectSector(title, rawBody, feed.sector);

      return { title, summary, url, source, sector, paywall: feed.paywall, pubDate };
    });
  } catch (err) {
    console.warn(`[news-fetcher] feed error (${feed.source}): ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIS DEDUPLICATION  (sorted set, score = Unix timestamp ms)
// ─────────────────────────────────────────────────────────────────────────────
const SEEN_KEY = 'digest:seen';
const SEEN_TTL_DAYS = 7;

async function filterSeen(redis, articles) {
  if (!articles.length) return articles;
  const hashes = articles.map(a => titleHash(a.title));
  try {
    const pipeline = redis.pipeline();
    hashes.forEach(h => pipeline.zscore(SEEN_KEY, h));
    const scores = await pipeline.exec();
    return articles.filter((_, i) => scores[i] === null);
  } catch (err) {
    console.error('[news-fetcher] dedup check failed, skipping:', err.message);
    return articles;
  }
}

async function markSeen(redis, articles) {
  if (!articles.length) return;
  const now = Date.now();
  const cutoff = now - SEEN_TTL_DAYS * 24 * 3_600_000;
  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(SEEN_KEY, 0, cutoff);
    articles.forEach(a => pipeline.zadd(SEEN_KEY, { score: now, member: titleHash(a.headline || a.title) }));
    await pipeline.exec();
  } catch (err) {
    console.error('[news-fetcher] markSeen failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// Returns { articles, debug } where articles are ready for buildDigestHtml().
// ─────────────────────────────────────────────────────────────────────────────
async function fetchTopArticles(redis, count = 5) {
  // 1. Fetch all feeds in parallel; tolerate individual failures
  const feedResults = await Promise.allSettled(FEEDS.map(fetchFeed));
  const feedSummary = feedResults.map((r, i) => ({
    source: FEEDS[i].source,
    count: r.status === 'fulfilled' ? r.value.length : 0,
    error: r.status === 'rejected' ? r.reason.message : undefined,
  }));
  console.log('[news-fetcher] feeds:', JSON.stringify(feedSummary));

  let pool = feedResults.flatMap(r => (r.status === 'fulfilled' ? r.value : []));

  // 2. In-memory dedup: same URL OR same normalized title
  const seenUrls = new Set();
  const seenTitles = new Set();
  pool = pool.filter(a => {
    const h = titleHash(a.title);
    if ((a.url && seenUrls.has(a.url)) || seenTitles.has(h)) return false;
    if (a.url) seenUrls.add(a.url);
    seenTitles.add(h);
    return true;
  });

  // 3. Freshness: prefer last 48 h; expand if pool is thin
  const now = Date.now();
  const H48 = 48 * 3_600_000;
  const H7D = 7 * 24 * 3_600_000;
  let fresh = pool.filter(a => a.pubDate && now - a.pubDate.getTime() <= H48);
  if (fresh.length < count * 2) fresh = pool.filter(a => a.pubDate && now - a.pubDate.getTime() <= H7D);
  if (fresh.length < count)     fresh = pool;

  // 4. Cross-day dedup via Redis
  const unseen = await filterSeen(redis, fresh);
  const candidates = unseen.length >= count ? unseen : fresh;
  console.log(`[news-fetcher] pool:${pool.length} fresh:${fresh.length} unseen:${unseen.length} candidates:${candidates.length}`);

  // 5. Score all candidates
  const scored = candidates
    .map(a => ({ ...a, score: scoreArticle(a) }))
    .sort((a, b) => b.score - a.score);

  // 6. Slot-based selection
  const debug = { slots: {}, fillers: [], rejected: [] };
  const selected = selectBySlots(scored, count, debug);

  // 7. Shape for buildDigestHtml
  const articles = selected.map(a => ({
    sector: a.sector,
    headline: a.title,
    summary: a.summary,
    whyItMatters: whyItMatters({ headline: a.title, summary: a.summary, sector: a.sector }),
    source: a.source,
    url: a.url,
    pubDate: a.pubDate,
    pubDateLabel: formatAge(a.pubDate),
    score: a.score,
  }));

  return { articles, debug };
}

module.exports = { fetchTopArticles, markSeen };
