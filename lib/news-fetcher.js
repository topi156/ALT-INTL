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
  { url: 'https://altassets.net/feed',                                   source: 'AltAssets',           sector: 'PE',    paywall: false },
  { url: 'https://www.privateequitywire.co.uk/feed/',                   source: 'PE Wire',             sector: 'PE',    paywall: false },
  { url: 'https://www.commercialobserver.com/feed/',                    source: 'Commercial Observer', sector: 'RE',    paywall: false },
  { url: 'https://news.google.com/rss/search?q=site:rechargenews.com&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Infra', paywall: false }, // Recharge News via GNews (direct RSS redirects infinitely)
  { url: 'https://opalesque.com/rss.xml',                               source: 'Opalesque',           sector: 'Hedge', paywall: false },
  { url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', source: 'WSJ Markets',         sector: 'Macro', paywall: true  },

  // ── Google News — core strategy coverage ─────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=%22private+equity%22+%22buyout%22+OR+%22fundraising%22+OR+%22lbo%22&hl=en-US&gl=US&ceid=US:en',                                                   source: 'Google News', sector: 'PE',     paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22private+credit%22+OR+%22direct+lending%22&hl=en-US&gl=US&ceid=US:en',                                                                         source: 'Google News', sector: 'Credit', paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22infrastructure+fund%22+OR+%22energy+transition%22+investment&hl=en-US&gl=US&ceid=US:en',                                                      source: 'Google News', sector: 'Infra',  paywall: false },
  { url: 'https://news.google.com/rss/search?q=%22real+estate%22+%22private+equity%22+OR+%22commercial+real+estate%22+fund&hl=en-US&gl=US&ceid=US:en',                                          source: 'Google News', sector: 'RE',     paywall: false },
  { url: 'https://news.google.com/rss/search?q=site:bloomberg.com+%22private+equity%22+OR+%22private+credit%22+OR+%22private+markets%22&hl=en-US&gl=US&ceid=US:en',                            source: 'Google News', sector: 'PE',     paywall: true  },
  { url: 'https://news.google.com/rss/search?q=site:reuters.com+%22private+equity%22+OR+%22private+credit%22+OR+%22hedge+fund%22&hl=en-US&gl=US&ceid=US:en',                                   source: 'Google News', sector: 'Macro',  paywall: false },

  // ── Google News — thematic gap fills ─────────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=%22secondary+fund%22+OR+%22gp-led%22+OR+%22continuation+vehicle%22+%22private+equity%22&hl=en-US&gl=US&ceid=US:en',                             source: 'Google News', sector: 'PE',     paywall: false }, // Secondaries / GP-led
  { url: 'https://news.google.com/rss/search?q=%22gp+stake%22+OR+%22gp+stakes%22+OR+%22minority+interest%22+%22alternative+asset%22&hl=en-US&gl=US&ceid=US:en',                                source: 'Google News', sector: 'PE',     paywall: false }, // GP Stakes
  { url: 'https://news.google.com/rss/search?q=site:infrastructureinvestor.com&hl=en-US&gl=US&ceid=US:en',                                                                                      source: 'Google News', sector: 'Infra',  paywall: false }, // Infrastructure Investor
  { url: 'https://news.google.com/rss/search?q=site:pionline.com+%22private+equity%22+OR+%22private+credit%22+OR+%22alternatives%22&hl=en-US&gl=US&ceid=US:en',                                source: 'Google News', sector: 'PE',     paywall: false }, // Pensions & Investments
  { url: 'https://news.google.com/rss/search?q=%22committed+to%22+%22private+equity%22+OR+%22private+credit%22+%22pension%22+OR+%22endowment%22+OR+%22sovereign%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'PE',     paywall: false }, // LP commitments
  { url: 'https://news.google.com/rss/search?q=site:therealdeal.com+%22private+equity%22+OR+%22real+estate+fund%22+OR+%22commercial+real+estate%22&hl=en-US&gl=US&ceid=US:en',                 source: 'Google News', sector: 'RE',     paywall: false }, // The Real Deal (direct RSS broken)

  // ── Google News — content-type gap fills ─────────────────────────────────
  { url: 'https://news.google.com/rss/search?q=%22ARCC%22+OR+%22OBDC%22+OR+%22BCRED%22+OR+%22BDC%22+%22private+credit%22+OR+%22direct+lending%22&hl=en-US&gl=US&ceid=US:en',                                                                   source: 'Google News', sector: 'Credit', paywall: false }, // BDC / Business Development Companies
  { url: 'https://news.google.com/rss/search?q=%22private+credit%22+%22default%22+OR+%22distressed%22+OR+%22amend-and-extend%22+OR+%22redemption%22+OR+%22covenant%22&hl=en-US&gl=US&ceid=US:en',                                                source: 'Google News', sector: 'Credit', paywall: false }, // Credit defaults / distress / redemptions
  { url: 'https://news.google.com/rss/search?q=%22evergreen+fund%22+OR+%22non-traded+BDC%22+OR+%22interval+fund%22+OR+%22NAV+facility%22+%22private+credit%22&hl=en-US&gl=US&ceid=US:en',                                                        source: 'Google News', sector: 'Credit', paywall: false }, // Evergreen / NAV financing
  { url: 'https://news.google.com/rss/search?q=%22growth+equity%22+OR+%22venture+capital%22+fund+%22raises%22+OR+%22closes%22+OR+%22funding+round%22&hl=en-US&gl=US&ceid=US:en',                                                                 source: 'Google News', sector: 'PE',     paywall: false }, // VC / Growth equity rounds
  { url: 'https://news.google.com/rss/search?q=%22backed+IPO%22+OR+%22PE-backed%22+OR+%22sponsor-backed%22+%22goes+public%22+OR+%22IPO%22+%22private+equity%22+OR+%22venture%22&hl=en-US&gl=US&ceid=US:en',                                     source: 'Google News', sector: 'PE',     paywall: false }, // PE / VC-backed IPOs
  { url: 'https://news.google.com/rss/search?q=%22private+equity%22+%22exit%22+OR+%22trade+sale%22+OR+%22strategic+sale%22+OR+%22divests%22+%22portfolio+company%22&hl=en-US&gl=US&ceid=US:en',                                                 source: 'Google News', sector: 'PE',     paywall: false }, // PE portfolio exits
  { url: 'https://news.google.com/rss/search?q=%22co-investment%22+OR+%22co-invest%22+%22private+equity%22+OR+%22infrastructure%22+OR+%22private+credit%22&hl=en-US&gl=US&ceid=US:en',                                                          source: 'Google News', sector: 'PE',     paywall: false }, // Co-investments
  { url: 'https://news.google.com/rss/search?q=%22Ares+Capital%22+OR+%22ARCC%22+OR+%22Blue+Owl+Capital+Corporation%22+OR+%22OBDC%22+OR+%22Owl+Rock%22+OR+%22Golub+Capital+BDC%22+OR+%22BCRED%22+OR+%22Blackstone+Private+Credit+Fund%22+OR+%22Apollo+Debt+Solutions%22+OR+%22Sixth+Street%22+%22BDC%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Credit', paywall: false }, // Listed / non-traded BDC companies
  { url: 'https://news.google.com/rss/search?q=%22private+credit%22+%22redemptions%22+OR+%22evergreen+fund%22+%22redemptions%22+OR+%22interval+fund%22+%22liquidity%22+OR+%22non-traded+BDC%22+%22redemptions%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Credit', paywall: false }, // Evergreen liquidity / redemptions
  { url: 'https://news.google.com/rss/search?q=%22direct+lending%22+OR+%22unitranche%22+OR+%22asset-based+finance%22+OR+%22asset+based+finance%22+OR+%22NAV+financing%22+OR+%22NAV+loan%22+%22private+credit%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Credit', paywall: false }, // Direct lending / NAV / ABF
  { url: 'https://news.google.com/rss/search?q=%22private+credit%22+%22spread+compression%22+OR+%22default+rates%22+OR+%22amend-and-extend%22+OR+%22distressed+credit%22+OR+%22credit+workout%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Credit', paywall: false }, // Credit trends / defaults
  { url: 'https://news.google.com/rss/search?q=%22data+center%22+%22infrastructure%22+investment+OR+%22digital+infrastructure%22+fund+OR+%22grid+storage%22+investment+OR+%22project+finance%22+infrastructure&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Infra', paywall: false }, // Digital infra / project finance
  { url: 'https://news.google.com/rss/search?q=%22infrastructure%22+acquisition+OR+%22midstream%22+acquisition+OR+%22utilities%22+acquisition+OR+%22transport+infrastructure%22+investment+OR+%22renewable+portfolio%22+sale&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'Infra', paywall: false }, // Infra transactions
  { url: 'https://news.google.com/rss/search?q=%22growth+equity%22+round+OR+%22late-stage%22+financing+OR+%22pre-IPO%22+financing+OR+%22AI+startup%22+%22funding+round%22+OR+%22venture-backed%22+raises&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'PE', paywall: false }, // VC / Growth rounds
  { url: 'https://news.google.com/rss/search?q=%22private+equity%22+%22new+investment%22+OR+%22portfolio+company%22+acquisition+OR+%22sponsor-to-sponsor%22+OR+%22co-investment%22+deal&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'PE', paywall: false }, // PE new investments / co-invest
  { url: 'https://news.google.com/rss/search?q=%22PE-backed%22+IPO+OR+%22VC-backed%22+IPO+OR+%22sponsor-backed%22+IPO+OR+%22strategic+sale%22+%22private+equity%22+OR+%22exit+process%22+%22private+equity%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'PE', paywall: false }, // IPOs / exits
  { url: 'https://news.google.com/rss/search?q=%22real+estate+private+equity%22+transaction+OR+%22CRE+distress%22+OR+%22real+estate+fund%22+close+OR+%22industrial+logistics%22+real+estate+OR+%22data+center+real+estate%22+acquisition&hl=en-US&gl=US&ceid=US:en', source: 'Google News', sector: 'RE', paywall: false }, // REPE / CRE distress
];

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED DAILY SLOTS
// Mix: Credit → Infra → PE/Growth → Liquidity/Exit → Macro-or-Best-Idea (filler)
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_SLOT_RE = /\b(private credit|direct lending|private debt|business development company|\bbdc\b|\barcc\b|\bobdc\b|\bbcred\b|ares capital|blue owl|owl rock|golub capital|blackstone private credit|apollo debt solutions|sixth street.*(credit|specialty lending|bdc)|unitranche|nav financing|nav loan|asset.based finance|asset based finance|redemption|default|distressed credit|spread compression|amend.and.extend|credit workout)\b/i;
const INFRA_SLOT_RE = /\b(infrastructure.*(fund|close|raise|acqui|invest|transaction|deal|project|asset|portfolio|financing|debt)|digital infrastructure|data cent(er|re).*(fund|acqui|invest|project|portfolio|debt|financing)|project finance|grid storage|battery storage|renewable portfolio|renewables?.*(project|portfolio|investment|sale)|offshore wind|wind project|solar project|energy transition.*(fund|investment|project|portfolio)|midstream|utilities|utility|transport infrastructure|electricity unit|power grid)\b/i;
const PE_SLOT_RE = /\b(private equity|buyout|lbo|take.private|sponsor.to.sponsor|portfolio company|co.invest|co-invest|growth equity|venture capital|vc.backed|venture.backed|funding round|series [a-e]\b|late.stage|pre.ipo|new investment|fund.*close|first close|final close|hard cap|raised|raises)\b/i;

// 4th slot: any sector qualifies, but article must be a liquidity/exit/secondary event
const LIQUIDITY_SLOT_RE = /\b(pe.backed ipo|vc.backed ipo|venture.backed ipo|sponsor.backed.*ipo|backed.*(ipo|initial public offering)|initial public offering.*(private equity|venture|sponsor|backed)|ipo window|exit environment|market debut.*(private equity|venture|sponsor|backed))\b|\b(exit|exits?|trade sale|strategic sale|portfolio.*sell|portfolio.*sale|stake sale|minority stake sale|divest|divestiture|secondary.*sale|exit.*transaction|exit.*process)\b|\b(secondar|gp.led|continuation vehicle|continuation fund|lp.led|secondary.*transaction)\b|\b(gp stake|gp stakes|minority.*stake.*acqui|asset manager.*acqui|wealth manager.*acqui|manager.*merger|acqui.*gp stake)\b|\b(tender offer|sell.down)\b/i;

const REQUIRED_SLOTS = [
  { key: 'Credit',    label: 'Private Credit / BDC / Direct Lending / Distress / Evergreen', sectors: ['Credit'], requires: CREDIT_SLOT_RE                                },
  { key: 'Infra',     label: 'Infrastructure Fund / Transaction / Digital Infra / Energy',   sectors: ['Infra'],  requires: INFRA_SLOT_RE                                 },
  { key: 'PE',        label: 'PE / Buyout / Growth Equity / VC / Co-invest',                 sectors: ['PE'],     requires: PE_SLOT_RE                                    },
  { key: 'Liquidity', label: 'IPO / Exit / Secondaries / GP Stakes / Continuation',          sectors: ['PE','Credit','Infra','RE','Hedge','Macro'], requires: LIQUIDITY_SLOT_RE },
  // Slot 5 = Macro-or-Best-Idea: the filler loop picks the best remaining article;
  // qualified macro competes on score with any sector story.
];

// Macro articles are only included as fillers when relevant to PE/alts themes.
const MACRO_RELEVANCE_RE = /interest rate|rate cut|rate hike|rate environment|monetary policy|federal reserve|\bfed\b|\becb\b|central bank|credit spread|high.yield|loan market|leveraged loan|borrowing cost|financing cost|cost of debt|default rate|distress ratio|bdc performance|private credit redemption|evergreen fund flow|buyout financing|financing conditions|\bm&a\b|deal activity|deal flow|merger|acquisition|\bipo\b|initial public offering|\bexit\b|ipo window|exit environment|dry powder|private equity|private credit|private market|leveraged buyout|lp liquidity|fundraising cycle|capital call/i;

// Significant LP events that ARE IC-meeting-worthy: strategic allocation shifts,
// industry-wide signals, exceptional scale ($5B+), or first/anchor/cornerstone.
// Articles matching this are NEVER filtered even if they look like LP commit stories.
const SIGNIFICANT_LP_RE = /(increas|decreas|reduc|cuts?\b|exits?\b|overhaul|restructur|raises?\b|boosts?\b).{0,60}(allocation|target|weighting|exposure|strategy|policy)|\b(multiple|several|widespread|sector.wide|industry.wide).{0,60}(pension|endowment|commit|allocat|reduc|increas)|\$\s*(?:[5-9](?:\.\d+)?|[1-9]\d+(?:\.\d+)?)\s*(?:billion|bn|b)\b|\b(cornerstone|anchor investor|inaugural|first\s+institutional|co.invest|co-invest)|\b(materially|significantly|dramatically|substantially).{0,50}(increas|decreas|reduc|exit|allocat)/i;

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
  if (/(private credit|direct lending|private debt|unitranche|mezzanine|leveraged loan|\bbdc\b|distressed debt|business development company|\barcc\b|\bobdc\b|\bbcred\b|ares capital corporation|ares capital|owl rock|blue owl credit|golub.*bdc|blackstone private credit|apollo debt solutions|sixth street.*credit|evergreen.*credit|non.traded bdc|interval fund|nav facility|nav loan|nav financing|asset.based finance|asset based finance|amend.and.extend|spread compression|default rate|credit workout)/i.test(t)) return 'Credit';
  if (/\bcredit\b.*(spread|fund|facility|lending|loan|default|redemption|distress|workout)/i.test(t)) return 'Credit';
  if (/(infrastructure|infra fund|digital infrastructure|data cent(er|re)|renewable(s)?|energy transition|clean energy|solar farm|wind farm|battery storage|grid storage|power grid|project finance|toll road|airport|seaport|transport infrastructure|pipeline|lng terminal|midstream|utilities|utility|fiber network|cell tower|renewable portfolio)/i.test(t)) return 'Infra';
  if (/(stonepeak|macquarie infra|\bgip\b|ifm investors)/i.test(t)) return 'Infra';
  if (/(real estate|commercial property|\bcre\b|\brepe\b|cre distress|multifamily|office (building|market|space|tower)|logistics park|industrial logistics|warehouse|data center real estate|hotel|resort|build.to.rent|student housing|senior housing|self.storage|cap rate|\bnoi\b)/i.test(t)) return 'RE';
  if (/\breit\b/i.test(t)) return 'RE';
  if (/(hedge fund|long.short|multi.strategy|global macro|quant fund|managed futures|activist investor|short seller|event.driven)/i.test(t)) return 'Hedge';
  if (/(interest rate|federal reserve|\bfed\b|inflation|gdp|central bank|ecb|monetary|pension fund|sovereign wealth)/i.test(t)) return 'Macro';
  // PE bucket includes buyouts, growth, VC, and secondaries / GP-led deals
  if (/(private equity|buyout|lbo|take.private|growth equity|venture capital|vc.backed|venture.backed|funding round|late.stage financing|pre.ipo financing|co.invest|co-invest|sponsor.to.sponsor|gp stake|secondaries|secondary fund|gp.led|continuation vehicle)/i.test(t)) return 'PE';
  return defaultSector;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY SCORE  (0–100)
// NOTE: raw feed articles carry `.title`; shaped articles carry `.headline`.
// Both are handled here so scoreArticle works correctly at all call sites.
// ─────────────────────────────────────────────────────────────────────────────
const TIER1 = ['Bloomberg', 'Financial Times', 'WSJ', 'Reuters', 'CNBC', 'Pensions & Investments'];
const TIER2 = ['AltAssets', 'PE Wire', 'The Real Deal', 'Commercial Observer', 'Opalesque', 'Recharge News', 'Infrastructure Investor'];

function hasPrivateMarketSignal(text) {
  return /(private equity|buyout|lbo|sponsor|portfolio company|growth equity|venture capital|vc.backed|venture.backed|\b[a-z0-9&.-]+-backed\b|spacex|anthropic|openai|stripe|databricks|private credit|direct lending|bdc|business development company|infrastructure|real estate fund|real estate private equity|\brepe\b|secondar|gp.led|lp.led|continuation vehicle|gp stake|co.invest|co-invest|nav financing|asset.based finance|unitranche|distressed credit|fund close|hard cap|first close|final close|ipo window|exit environment)/i.test(text);
}

function isHardExcluded({ headline = '', title = '', summary = '', sector = '' }) {
  const hl = headline || title;
  const t = `${hl} ${summary}`.toLowerCase();
  const privateSignal = hasPrivateMarketSignal(t);

  if (/(bitcoin|cryptocurrency|crypto currency|blockchain|nft\b|defi\b|stablecoin|web3\b|token offering)/i.test(t) && !privateSignal) return true;
  if (/(election|campaign|parliament|congress|senate|white house|prime minister|president|minister\b|officials?|geopolitic|war\b|missile|air base|military|defense|tariff|trade war|sanction)/i.test(t) && !privateSignal) return true;
  if (/(police|shooting|murder|homicide|arrest|charged with|injured|killed|mass shooting|crime scene)/i.test(t) && !privateSignal) return true;
  if (/(s&p 500|nasdaq|dow jones|stock market|\bstocks\b|stocks? to buy|\betfs?\b|sell in may|shares (rose|rise|fell|fall)|quarterly earnings|analyst rating|price target|dividend yield)/i.test(t) && !privateSignal) return true;
  if (/\b(ipo|initial public offering|public offering|market debut|goes public)\b/i.test(t) && !privateSignal) return true;
  if (/(college merger|university merger|school district|campus protest)/i.test(t) && !privateSignal) return true;
  if (/(celebrity|movie|fashion week|watchmaker|toy maker|retail chain|consumer spending|holiday shopping)/i.test(t) && !privateSignal) return true;
  if (sector === 'Macro' && !MACRO_RELEVANCE_RE.test(t)) return true;

  return false;
}

function scoreArticle({ headline = '', title = '', summary = '', source, paywall, pubDate, sector = '' }) {
  // Routine LP commitment announcements are not IC-meeting-worthy; exclude immediately.
  if (isRoutineLPCommitment({ headline, title, summary })) return 0;
  if (isHardExcluded({ headline, title, summary, sector })) return 0;

  const hl = headline || title;
  const fullText = `${hl} ${summary}`.toLowerCase();
  const titleText = hl.toLowerCase();
  let score = 25;

  const sourceName = source || '';
  if (TIER1.some(s => sourceName.includes(s))) score += 15;
  else if (TIER2.some(s => sourceName.includes(s))) score += 10;

  score += paywall ? -5 : 10;

  // Fund-event keywords — high-signal private markets events (+20 text, +10 title)
  const fundKw = [
    'fundraise', 'fundraising', 'raised', 'raising', 'closes', 'closed',
    'first close', 'final close', 'hard cap', 'above hard cap', 'above target',
    'oversubscribed', 'launches fund', 'new fund',
    'gp-led', 'lp-led', 'dry powder', 'cornerstone',
    'secondaries', 'secondary fund', 'continuation vehicle', 'continuation fund',
    'gp stake', 'gp stakes',
  ];
  if (fundKw.some(kw => fullText.includes(kw))) score += 20;
  if (fundKw.some(kw => titleText.includes(kw))) score += 10;

  // Deal-event keywords (+15 text, +10 title)
  const dealKw = [
    'interest rate', 'federal reserve', 'rate cut', 'inflation', 'distressed',
    'restructuring', 'lbo', 'take-private', 'buyout', 'acquisition', 'merger',
    'ipo', 'exit', 'dividend recap',
  ];
  if (dealKw.some(kw => fullText.includes(kw))) score += 15;
  if (dealKw.some(kw => titleText.includes(kw))) score += 10;

  // High-value private markets events — premium signal, extra bonus (+30 text, +15 title)
  const highValueKw = [
    // GP economics & liquidity
    'gp-led secondary', 'lp-led secondary', 'gp led secondary', 'lp led secondary',
    'minority stake acquisition', 'gp interest acquisition',
    // Asset manager consolidation
    'asset manager acquisition', 'acquires asset manager', 'asset management acquisition',
    'wealth manager acquisition', 'alternative manager acquisition', 'asset management merger',
    // Credit structures
    'nav facility', 'nav financing', 'nav loan', 'net asset value loan',
    'unitranche', 'unitranche financing', 'unitranche facility',
    'direct lending deal', 'bilateral facility', 'asset-based finance', 'asset based finance',
    'spread compression', 'amend-and-extend', 'credit workout',
    // Exits & realizations
    'sponsor-to-sponsor', 'secondary buyout', 'pe-backed ipo', 'sponsor-backed ipo',
    'pe backed ipo', 'portfolio company exit', 'portfolio exit',
    // Regulatory — always IC-meeting-worthy
    'private fund rule', 'private markets regulation', 'private equity regulation',
    'alternative investment regulation', 'sec private fund', 'aifmd',
  ];
  if (highValueKw.some(kw => fullText.includes(kw))) score += 30;
  if (highValueKw.some(kw => titleText.includes(kw))) score += 15;

  if (pubDate) {
    const ageH = (Date.now() - pubDate.getTime()) / 3_600_000;
    if (ageH < 12) score += 25;
    else if (ageH < 24) score += 15;
    else if (ageH < 48) score += 5;
  }

  // BDC-specific content — always IC-meeting-worthy regardless of tier
  const bdcKw = ['bdc', 'business development company', 'arcc', 'ares capital', 'obdc', 'blue owl credit', 'owl rock', 'golub bdc', 'bcred', 'blackstone private credit', 'apollo debt', 'sixth street specialty lending', 'non-traded bdc', 'interval fund', 'nav facility', 'nav loan', 'nav financing', 'evergreen credit', 'evergreen fund'];
  if (bdcKw.some(kw => fullText.includes(kw))) score += 20;
  if (bdcKw.some(kw => titleText.includes(kw))) score += 10;

  const creditTrendKw = ['default rate', 'distress ratio', 'spread compression', 'amend-and-extend', 'redemption', 'redemptions', 'liquidity gate', 'fund gate', 'covenant waiver', 'payment-in-kind', ' pik ', 'private credit market', 'direct lending market'];
  if (creditTrendKw.some(kw => fullText.includes(kw))) score += 18;
  if (creditTrendKw.some(kw => titleText.includes(kw))) score += 8;

  const infraEventKw = ['infrastructure acquisition', 'digital infrastructure', 'data center', 'energy transition', 'renewable portfolio', 'project finance', 'grid storage', 'battery storage', 'transport infrastructure', 'midstream', 'utilities', 'utility acquisition'];
  if (sector === 'Infra' && infraEventKw.some(kw => fullText.includes(kw))) score += 12;
  if (sector === 'Infra' && infraEventKw.some(kw => titleText.includes(kw))) score += 8;

  const vcGrowthKw = ['growth equity round', 'growth round', 'funding round', 'series a', 'series b', 'series c', 'series d', 'series e', 'late-stage financing', 'pre-ipo financing', 'venture-backed', 'vc-backed', 'ai startup'];
  if (vcGrowthKw.some(kw => fullText.includes(kw))) score += 10;
  if (vcGrowthKw.some(kw => titleText.includes(kw))) score += 8;

  const liquidityKw = ['pe-backed ipo', 'vc-backed ipo', 'sponsor-backed ipo', 'exit process', 'strategic sale', 'trade sale', 'divestiture', 'tender offer', 'continuation vehicle', 'gp-led', 'lp-led', 'gp stake', 'asset manager acquisition', 'asset management merger'];
  if (liquidityKw.some(kw => fullText.includes(kw))) score += 15;
  if (liquidityKw.some(kw => titleText.includes(kw))) score += 10;

  const reEventKw = ['cre distress', 'real estate private equity', 'real estate fund', 'industrial logistics', 'data center real estate', 'office distress', 'platform acquisition'];
  if (sector === 'RE' && reEventKw.some(kw => fullText.includes(kw))) score += 10;
  if (sector === 'RE' && reEventKw.some(kw => titleText.includes(kw))) score += 6;

  // Generic PE fundraising market-trend articles (meta-analysis, not actual fund events)
  // penalised to make room for BDC, exits, IPOs, and credit deal stories.
  // Only fires when the TITLE is about a trend; fund-close articles are not affected
  // because their titles contain "closes", "hard cap", "oversubscribed" etc.
  const isFundraisingMeta = /\b(fundraising|fundraise|fund.raising).{0,60}\b(falls?|slips?|declines?|drops?|rises?|grows?|pace|slump|slowest|fastest|outlook|landscape|survey|report|trends?|environment|overall|market|activity|record)\b/i.test(titleText);
  if (isFundraisingMeta) score -= 30;

  // Consumer noise
  const noiseKw = ['celebrity', 'luxury brand', 'toy', 'watchmaker', 'retail chain', 'hasbro', 'mattel', 'movie', 'fashion'];
  if (noiseKw.some(kw => fullText.includes(kw))) score -= 40;

  // Crypto/blockchain noise — penalise unless in a legitimate private markets context
  const cryptoKw = ['bitcoin', 'cryptocurrency', 'blockchain', 'nft ', 'defi ', 'stablecoin', 'web3 ', 'crypto asset'];
  if (cryptoKw.some(kw => fullText.includes(kw))) score -= 30;

  // Macro articles fill filler slot only; mild penalty so sector stories win ties.
  if (sector === 'Macro') score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// WHY IT MATTERS
// ─────────────────────────────────────────────────────────────────────────────
function whyItMatters({ headline = '', summary = '', sector }) {
  const t = `${headline} ${summary}`.toLowerCase();
  // BDC & evergreen credit
  if (/(bdc|business development company|\barcc\b|\bobdc\b|\bbcred\b|ares capital|owl rock|golub bdc|sixth street specialty lending|non.traded bdc|interval fund)/i.test(t)) return 'BDC signal — watch spread compression, dividend coverage, and NAV stability as bellwethers for direct lending market health.';
  if (/(evergreen fund|non.traded bdc|interval fund|nav facility|nav loan|open.ended fund|semi.liquid)/i.test(t)) return 'Evergreen/non-traded vehicle — LP demand indicator; watch for redemption queues, gating, and secondary market discounts.';
  if (/\b(default|defaulted|amend.and.extend|covenant waiver|payment.in.kind|\bpik\b|credit workout|restructur|distressed)\b.{0,50}\b(private credit|direct lending|credit fund|bdc|loan|debt)\b/i.test(t)) return 'Credit distress signal — impacts direct lending return profiles; watch for loss rates, PIK acceleration, and portfolio ripple effects.';
  if (/(redemption|redemptions|fund.*gate|gate.*fund|investor.*liquidity|liquidity.*constrain|withdrawal.*suspend)/i.test(t)) return 'Redemption / liquidity signal — stress indicator for evergreen and non-traded vehicle structures; watch for contagion across similar vehicles.';
  // Fund closes & raises
  if (/(first close|final close|hard cap)/i.test(t)) return 'Fund lifecycle event — LP allocation signal; watch for momentum effects on competing vehicles in the same strategy.';
  // Secondaries & liquidity
  if (/(gp.led|continuation vehicle|continuation fund)/i.test(t)) return 'GP-led secondary — key liquidity mechanism; reflects GP conviction on asset value and LP appetite for structured liquidity.';
  if (/(lp.led secondary|secondary transaction|secondaries transaction)/i.test(t)) return 'LP-led secondary — pricing signal for the strategy; indicates LP portfolio pressure or rebalancing at scale.';
  // GP economics
  if (/(gp stake|gp stakes|gp interest|minority.*stake.*acqui)/i.test(t)) return 'GP stakes transaction — shapes GP economics, succession planning, and long-term alignment for the fund complex.';
  // Asset manager M&A
  if (/(asset manager.*acqui|acqui.*asset manager|wealth manager.*acqui|alternative.*manager.*acqui|manager.*merger)/i.test(t)) return 'Asset manager consolidation — reshapes distribution, fund shelf, and competitive landscape across strategies.';
  // Credit structures
  if (/(nav facility|nav financing|nav loan|net asset value.*loan)/i.test(t)) return 'NAV financing — growing tool for GP liquidity management; watch for systemic leverage implications across the portfolio.';
  if (/(asset.based finance|asset based finance|abf\b)/i.test(t)) return 'Asset-based finance signal - shows where private credit managers are moving for collateralized yield and non-sponsored deployment.';
  if (/(spread compression|default rate|distress ratio|amend.and.extend|covenant waiver|\bpik\b)/i.test(t)) return 'Credit cycle signal - watch pricing pressure, loss emergence, and documentation quality across direct lending portfolios.';
  if (/(unitranche|direct lending deal|bilateral facility)/i.test(t)) return 'Private credit transaction — direct indicator of deal market activity, leverage capacity, and pricing in the middle market.';
  // Infrastructure and real assets
  if (/(data cent(er|re)|digital infrastructure|fiber network|cell tower)/i.test(t)) return 'Digital infrastructure deployment - AI and cloud demand continue to drive private-market capital formation and power needs.';
  if (/(project finance|grid storage|battery storage|renewable portfolio|energy transition|midstream|utilities|transport infrastructure)/i.test(t)) return 'Infrastructure transaction signal - relevant for real-asset valuations, contracted cash flows, and project finance appetite.';
  // Exits & realizations
  if (/(sponsor.to.sponsor|secondary buyout)/i.test(t)) return 'Sponsor-to-sponsor deal — benchmark for sector valuations and confidence in the current exit environment.';
  if (/(pe.backed ipo|sponsor.backed ipo|pe backed ipo)/i.test(t)) return 'PE-backed IPO — DPI generation event and bellwether for whether public markets are open to sponsor exits.';
  if (/(vc.backed ipo|venture.backed ipo|pre.ipo financing|late.stage financing|funding round|series [a-e])/i.test(t)) return 'Growth / VC liquidity signal - indicates private-company financing appetite and potential reopening of the exit pipeline.';
  // Regulatory
  if (/(private fund rule|private markets regulation|private equity regulation|sec private fund|aifmd)/i.test(t)) return 'Regulatory development — directly impacts GP compliance, fund structure, reporting, and distribution economics.';
  // Deals & macro
  if (/(software|saas|tech valuation|tech downturn)/i.test(t)) return 'Tech sector impact — affects PE portfolios weighted toward SaaS and software buyouts.';
  if (/(ai|artificial intelligence|openai|anthropic)/i.test(t)) return 'AI disruption — requires GPs to evaluate structural portfolio impacts and opens new infra/VC opportunities.';
  if (/(interest rate|fed|inflation|rate cut|monetary policy)/i.test(t)) return 'Macro headwind/tailwind — directly influences cost of debt, valuations, and exit windows across all private markets.';
  if (/(fundraise|raised|hard cap)/i.test(t)) return 'Fundraising — LP allocation signal; indicates strategy appetite and vintage momentum.';
  if (/(lbo|take.private|buyout|acquisition|merger)/i.test(t)) return 'Deal activity — relevant for comparable valuations, sector momentum, and debt-market depth.';
  if (/(nav loan|direct lending|private credit|unitranche)/i.test(t)) return 'Credit market signal — impacts cost of capital, deal structuring capacity, and leverage multiples.';
  if (/(distressed|restructuring|bankruptcy|default)/i.test(t)) return 'Distress signal — watch for portfolio-company implications and credit fund opportunity set.';
  if (/(ipo|exit|sale)/i.test(t)) return 'Exit activity — key indicator of distribution timing, DPI realization, and GP carry.';
  if (sector === 'Infra') return 'Infrastructure deployment — energy transition and digital infra remain top LP priority themes this cycle.';
  if (sector === 'RE') return 'Real estate repricing — cap rate movements directly affect RE fund NAVs and optimal exit timing.';
  if (sector === 'Credit') return 'Credit dynamics — directly affects direct lending fund returns, deal flow, and competitive intensity.';
  if (sector === 'Hedge') return 'Hedge fund positioning — relevant for liquid alts allocators monitoring strategy-level flows.';
  return 'Private markets intelligence — relevant for LP allocators and fund managers.';
}

// ─────────────────────────────────────────────────────────────────────────────
// MACRO RELEVANCE GATE
// ─────────────────────────────────────────────────────────────────────────────
function isMacroQualified(article) {
  const t = `${article.title} ${article.summary}`.toLowerCase();
  return MACRO_RELEVANCE_RE.test(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// LP COMMITMENT FILTER
// Routine LP commitment announcements (pension committed $X to Fund Y, endowment
// earmarked $X for manager Z) are NOT IC-meeting-worthy and are excluded from
// both the digest and website. Significant events — strategic allocation shifts,
// industry-wide signals, $5B+ single commitments, or first/cornerstone — pass.
// ─────────────────────────────────────────────────────────────────────────────
function isRoutineLPCommitment({ headline = '', title = '', summary = '' }) {
  const t = `${headline || title} ${summary}`;

  // Always allow significant LP events regardless of other patterns
  if (SIGNIFICANT_LP_RE.test(t)) return false;

  // Detect LP institution noun — covers common US public fund naming conventions
  const hasLP = /\b(pension fund|pension plan|endowment fund|retirement system|retirement fund|retirement board|public retirement|public pension|state retirement|municipal retirement|municipal pension|county retirement|county employees|state board\b|state investment board|board of trustees|investment board|teachers.*retirement|firefighter.*retirement|police.*retirement|police.{1,5}fire|fire.{1,5}police|public employee.*retirement|workers.*retirement|PERS\b|STRS\b|\bERS\b|\bTRS\b)\b/i.test(t);
  if (!hasLP) return false;

  // Detect a dollar commitment amount
  const hasDollar = /\$[\d,]+(?:\.\d+)?\s*(?:million|billion|mn|bn)\b/i.test(t);
  if (!hasDollar) return false;

  // Detect commitment action verb
  const hasAction = /\b(commit[stted]+|earmarks?|earmarked|invests?\b|invested\b|allocates?|allocated\b|approv[eo][sd]\b|selects?\b|designated?\b|pledges?|pledged\b|makes?\s+(?:a\s+)?(?:\$|commitment|investment)|awarded?\b)\b/i.test(t);
  return hasAction;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT-BASED SELECTION
// Guarantees required category coverage before filling by score.
// ─────────────────────────────────────────────────────────────────────────────
function selectBySlots(scored, count, debug) {
  const selected = [];
  const usedIdx  = new Set();

  // ── Step 1: Fill required slots ──────────────────────────────────────────
  for (const slot of REQUIRED_SLOTS) {
    if (selected.length >= count) break;

    const idx = scored.findIndex((a, i) => {
      if (usedIdx.has(i)) return false;
      if ((a.score || 0) <= 0) return false;
      if (!slot.sectors.includes(a.sector)) return false;
      if (slot.requires && !slot.requires.test(`${a.title} ${a.summary}`)) return false;
      if (isRoutineLPCommitment(a)) return false; // never fill required slots with admin announcements
      if (isHardExcluded(a)) return false;
      return true;
    });

    if (idx === -1) {
      debug.slots[slot.key] = { headline: null, confidence: 'missing' };
      console.warn(`[digest:slot] ${slot.key.padEnd(12)} MISSING — no articles for: ${slot.label}`);
    } else {
      const a = scored[idx];
      usedIdx.add(idx);
      selected.push(a);

      const confidence = a.score >= LOW_CONFIDENCE_THRESHOLD ? 'strong' : 'low';
      debug.slots[slot.key] = { headline: a.title, source: a.source, score: a.score, confidence };

      const flag = confidence === 'low' ? ' ⚠ LOW CONFIDENCE' : '';
      console.log(`[digest:slot] ${slot.key.padEnd(12)} → "${a.title.slice(0, 68)}" (${a.source}, score:${a.score})${flag}`);
    }
  }

  // ── Step 2: Highest-conviction filler ────────────────────────────────────
  for (let i = 0; i < scored.length && selected.length < count; i++) {
    if (usedIdx.has(i)) continue;
    const a = scored[i];
    if ((a.score || 0) <= 0) continue;

    if (isRoutineLPCommitment(a)) {
      debug.rejected.push({ headline: a.title, source: a.source, score: a.score, reason: 'Routine LP commitment — not IC-meeting-worthy' });
      console.log(`[digest:rej]  ${'LP-COMMIT'.padEnd(12)} — "${a.title.slice(0, 68)}" (${a.source}, score:${a.score})`);
      continue;
    }

    if (isHardExcluded(a)) {
      debug.rejected.push({ headline: a.title, source: a.source, score: a.score, reason: 'Hard exclude: noise or non-private-market macro' });
      continue;
    }

    if (a.sector === 'Macro' && !isMacroQualified(a)) {
      debug.rejected.push({ headline: a.title, source: a.source, score: a.score, reason: 'Macro: not relevant to rates / financing / M&A / exits / IPO / spreads' });
      console.log(`[digest:rej]  ${'MACRO'.padEnd(12)} — "${a.title.slice(0, 68)}" (${a.source}, score:${a.score})`);
      continue;
    }

    usedIdx.add(i);
    selected.push(a);
    debug.fillers.push({ headline: a.title, source: a.source, sector: a.sector, score: a.score });
    console.log(`[digest:fill] ${a.sector.padEnd(12)} → "${a.title.slice(0, 68)}" (${a.source}, score:${a.score})`);
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

Object.defineProperty(module.exports, '__testHooks', {
  enumerable: false,
  value: {
    FEEDS,
    REQUIRED_SLOTS,
    fetchFeed,
    titleHash,
    scoreArticle,
    selectBySlots,
    isRoutineLPCommitment,
    isMacroQualified,
    isHardExcluded,
  },
});
