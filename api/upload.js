// Privado (só você logada): guarda e apaga imagens de referência / entrega.
const crypto = require('crypto');
const { requireAuth } = require('./_auth');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (cmd) => fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd) }).then((r) => r.json());

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'banco de dados não configurado na Vercel' });
  try {
    if (req.method === 'POST') {
      const d = String((req.body && req.body.data) || '');
      if (!d.startsWith('data:image/jpeg;base64,')) return res.status(400).json({ error: 'o servidor não recebeu a imagem (formato inválido)' });
      if (d.length > 900000) return res.status(400).json({ error: 'imagem grande demais (' + Math.round(d.length / 1024) + ' KB)' });
      const id = crypto.randomBytes(12).toString('hex');
      const r = await redis(['SET', 'img:' + id, d]);
      if (!r || r.error) return res.status(502).json({ error: 'o banco recusou a imagem: ' + ((r && r.error) || 'sem resposta') });
      return res.status(200).json({ id });
    }
    if (req.method === 'DELETE') {
      const id = String((req.query || {}).id || '');
      if (/^[a-f0-9]{24}$/.test(id)) await redis(['DEL', 'img:' + id]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: 'erro no servidor: ' + e.message });
  }
};
