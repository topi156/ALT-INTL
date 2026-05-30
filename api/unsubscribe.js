const redis = require('../lib/redis');

module.exports = async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(page('Error', 'Invalid unsubscribe link.'));
  }

  const email = await redis.get(`unsubscribe_token:${token}`);
  if (!email) {
    return res.status(404).send(page('Already removed', 'This unsubscribe link is invalid or has already been used.'));
  }

  await redis.hdel('subscribers', email);
  await redis.del(`unsubscribe_token:${token}`);

  const siteUrl = process.env.SITE_URL || '/';
  return res.status(200).send(
    page(
      'Unsubscribed',
      `You have been successfully removed from ALT·Intel.<br>You will no longer receive morning briefings.<br><br>
       <a href="${siteUrl}" style="color:#c4381a;font-family:Courier,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Return to ALT·Intel →</a>`,
    ),
  );
};

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — ALT·Intel</title>
</head>
<body style="margin:0;background:#f5f2eb;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="max-width:480px;text-align:center;padding:48px 24px;">
    <div style="font-size:28px;font-weight:900;color:#1a1612;margin-bottom:24px;">ALT<span style="color:#c4381a;">·</span>INTEL</div>
    <h1 style="font-size:22px;color:#1a1612;margin-bottom:12px;">${title}</h1>
    <p style="color:#4a4540;line-height:1.7;">${body}</p>
  </div>
</body>
</html>`;
}
