// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE NEWS ITEMS
// Replace getSampleNewsItems() with a real news feed / API call.
// Each item must have: { sector, headline, summary, whyItMatters, source, url }
// The date parameter is passed for future date-aware fetching.
// ─────────────────────────────────────────────────────────────────────────────
function getSampleNewsItems(date) {
  // TODO: replace with real PE/alts news API (e.g. PitchBook API, Refinitiv,
  //       Google News RSS fetch, or your own curated feed)
  return [
    {
      sector: 'PE',
      headline: 'Carlyle Group Targets $22B for Flagship Buyout Fund VIII',
      summary:
        'Carlyle Group has officially launched fundraising for its eighth flagship North American buyout vehicle, setting a hard cap of $22 billion against a target of $17 billion. The firm has already secured anchor commitments from several large U.S. pension systems.',
      whyItMatters:
        'LP allocation signal — flagship fundraise timing reflects GP confidence in deal flow and exit environment across the buyout market.',
      source: 'PitchBook',
      url: 'https://pitchbook.com',
    },
    {
      sector: 'Credit',
      headline: 'Ares Management Closes $34B Direct Lending Fund — Largest Ever',
      summary:
        'Ares Management has closed its direct lending flagship at $34 billion, shattering the previous record and reflecting sustained LP appetite for floating-rate private credit strategies despite tightening spreads in the middle market.',
      whyItMatters:
        'Private credit supply signal — record close reflects continued LP shift from liquid credit to direct lending; watch for spread compression in deals.',
      source: 'Bloomberg',
      url: 'https://bloomberg.com',
    },
    {
      sector: 'Infra',
      headline: 'Macquarie Acquires 2GW Operating Solar Portfolio from Pattern Energy',
      summary:
        'Macquarie Asset Management has agreed to acquire a 2GW operating solar portfolio in a deal valued at approximately $3.8 billion, one of the largest single-asset clean energy transactions of the year.',
      whyItMatters:
        'Energy transition deployment — large operating solar deals reflect infrastructure GPs\' preference for de-risked, yield-generating contracted cash flows.',
      source: 'Infrastructure Investor',
      url: 'https://infrastructureinvestor.com',
    },
    {
      sector: 'RE',
      headline: 'U.S. Office Cap Rates Hit Post-GFC Highs as Distress Deepens',
      summary:
        'Office property cap rates in gateway U.S. markets have breached 7% for the first time since 2010, with transaction volumes down 60% year-over-year and several major lenders accelerating loan sales to clear exposure.',
      whyItMatters:
        'RE repricing signal — cap rate expansion compresses NAVs for office-heavy funds and opens distressed entry points for opportunistic vehicles.',
      source: 'The Real Deal',
      url: 'https://therealdeal.com',
    },
    {
      sector: 'Macro',
      headline: 'Fed Minutes Reveal Deep Divisions Over Pace of Rate Cuts',
      summary:
        'Minutes from the latest FOMC meeting showed significant disagreement among officials about the appropriate pace of easing, with several members arguing that services inflation remains too elevated to justify near-term cuts.',
      whyItMatters:
        'Macro headwind — rate uncertainty directly impacts PE deal structuring, LBO leverage capacity, and exit multiples across all private markets strategies.',
      source: 'Reuters',
      url: 'https://reuters.com',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL HTML BUILDER
// Uses table-based layout + inline CSS for broad email client compatibility.
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  PE: '#c4381a',
  Credit: '#1a4a8a',
  Infra: '#2a6a3a',
  RE: '#7a3a1a',
  Hedge: '#4a1a7a',
  Macro: '#1a5a6a',
};

function buildDigestHtml({ date, items, unsubscribeUrl, siteUrl }) {
  const dateStr = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const itemsHtml = items.map((item, idx) => {
    const color = SECTOR_COLORS[item.sector] || '#4a4540';
    return `
      <tr>
        <td style="padding:0 0 28px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-bottom:10px;">
                <span style="font-family:Courier,monospace; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.12em; color:${color}; border-left:3px solid ${color}; padding:2px 8px;">${item.sector}</span>
                <span style="font-family:Courier,monospace; font-size:10px; color:#8a8278; text-transform:uppercase; letter-spacing:0.1em; margin-left:10px;">${item.source}</span>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;">
                <a href="${item.url}" style="font-family:Georgia,Times New Roman,serif; font-size:19px; font-weight:bold; color:#1a1612; text-decoration:none; line-height:1.3; display:block;">${item.headline}</a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:10px;">
                <p style="font-family:Georgia,Times New Roman,serif; font-size:14px; color:#4a4540; line-height:1.7; margin:0;">${item.summary}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 12px; border-left:3px solid ${color}; background:#f9f7f2;">
                <p style="font-family:Courier,monospace; font-size:9px; text-transform:uppercase; letter-spacing:0.1em; color:${color}; font-weight:bold; margin:0 0 3px 0;">Why it matters</p>
                <p style="font-family:Georgia,Times New Roman,serif; font-size:13px; color:#8a8278; line-height:1.55; margin:0;">${item.whyItMatters}</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
            <tr><td style="border-top:1px solid #d8d2c4; height:1px;"></td></tr>
          </table>
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ALT·Intel Morning Briefing — ${dateStr}</title>
</head>
<body style="margin:0; padding:0; background:#f5f2eb;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f2eb;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background:#ffffff; border:1px solid #d8d2c4;">

        <!-- MASTHEAD -->
        <tr>
          <td style="background:#1a1612; padding:24px 32px; border-bottom:3px double #4a4540;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div style="font-family:Georgia,Times New Roman,serif; font-size:30px; font-weight:900; letter-spacing:-0.02em; color:#f5f2eb; line-height:1;">ALT<span style="color:#c4381a;">·</span>INTEL</div>
                  <div style="font-family:Courier,monospace; font-size:9px; text-transform:uppercase; letter-spacing:0.2em; color:rgba(245,242,235,0.45); margin-top:5px;">Private Markets Intelligence</div>
                </td>
                <td align="right" valign="top">
                  <div style="font-family:Courier,monospace; font-size:9px; text-transform:uppercase; letter-spacing:0.12em; color:rgba(245,242,235,0.35);">Morning Briefing</div>
                  <div style="font-family:Georgia,Times New Roman,serif; font-size:12px; font-style:italic; color:rgba(245,242,235,0.55); margin-top:4px;">${dateStr}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- INTRO -->
        <tr>
          <td style="padding:22px 32px 18px; border-bottom:1px solid #d8d2c4;">
            <p style="font-family:Georgia,Times New Roman,serif; font-size:15px; color:#4a4540; line-height:1.7; margin:0; font-style:italic;">Good morning. Here are the five most important stories in private markets today, curated and contextualized for LP allocators and fund managers.</p>
          </td>
        </tr>

        <!-- STORIES -->
        <tr>
          <td style="padding:28px 32px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${itemsHtml}
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f5f2eb; padding:22px 32px; border-top:2px solid #1a1612;">
            <p style="font-family:Courier,monospace; font-size:9px; color:#8a8278; text-transform:uppercase; letter-spacing:0.1em; margin:0; line-height:1.8;">
              <strong style="color:#1a1612;">ALT·INTEL</strong> — Private Markets Intelligence<br>
              Delivered daily at 7:00 AM<br><br>
              <a href="${unsubscribeUrl}" style="color:#c4381a; text-decoration:underline;">Unsubscribe</a>
              &nbsp;·&nbsp;
              <a href="${siteUrl || ''}" style="color:#8a8278; text-decoration:none;">Visit Site</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

module.exports = { getSampleNewsItems, buildDigestHtml };
