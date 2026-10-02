const { requireAuth } = require('./_auth');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (cmd) => fetch(URL_, {
  method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd),
}).then((r) => r.json());

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'banco não configurado' });
  if (req.method === 'GET') {
    const { result } = await redis(['GET', 'clientes']);
    return res.status(200).json(result ? JSON.parse(result) : []);
  }
  if (req.method === 'PUT') {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'formato inválido' });
    await redis(['SET', 'clientes', JSON.stringify(req.body)]);
    return res.status(200).json({ ok: true });
  }
  res.status(405).end();
};
