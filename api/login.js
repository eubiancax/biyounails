const crypto = require('crypto');
const { setSession } = require('./_auth');
const h = (s) => crypto.createHash('sha256').update(String(s)).digest();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const ok = process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET &&
    crypto.timingSafeEqual(h((req.body || {}).senha), h(process.env.ADMIN_PASSWORD));
  if (!ok) { await new Promise((r) => setTimeout(r, 800)); return res.status(401).json({ error: 'senha incorreta' }); }
  setSession(res);
  res.status(200).json({ ok: true });
};
