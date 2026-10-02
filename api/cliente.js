// Público: devolve SÓ a página de quem tem o link (token). Não expõe outros clientes nem observações internas.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async (req, res) => {
  const t = String((req.query || {}).t || '');
  let c = null;
  if (/^[a-f0-9]{32}$/.test(t) && URL_ && TOKEN) {
    const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(['GET', 'clientes']) }).then((x) => x.json());
    const lista = r.result ? JSON.parse(r.result) : [];
    c = lista.find((x) => x.token === t && x.acesso !== false);
  }
  if (!c) { await new Promise((r) => setTimeout(r, 600)); return res.status(404).json({ error: 'link inválido' }); }
  res.setHeader('Cache-Control', 'no-store');
  const { nome, status, entrega, itens, frete, pix, pagos, ideias, links } = c;
  res.status(200).json({ nome, status, entrega, itens, frete, pix, pagos, ideias, links });
};
