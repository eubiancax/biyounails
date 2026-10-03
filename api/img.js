// Entrega a imagem só para você (logada) ou para a cliente dona do pedido (link secreto).
const { isAuthed } = require('./_auth');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (cmd) => fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd) }).then((r) => r.json());

module.exports = async (req, res) => {
  const id = String((req.query || {}).id || ''), t = String((req.query || {}).t || '');
  if (!/^[a-f0-9]{24}$/.test(id) || !URL_ || !TOKEN) return res.status(404).end();
  let ok = isAuthed(req);
  if (!ok && /^[a-f0-9]{32}$/.test(t)) {
    const r = await redis(['GET', 'clientes']);
    const c = (r.result ? JSON.parse(r.result) : []).find((x) => x.token === t && x.acesso !== false);
    ok = !!c && (c.pedidos || []).some((p) => (p.refs || []).includes(id) || (p.entregues || []).includes(id));
  }
  if (!ok) return res.status(404).end();
  const { result } = await redis(['GET', 'img:' + id]);
  const m = result && result.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.status(200).send(Buffer.from(m[1], 'base64'));
};
