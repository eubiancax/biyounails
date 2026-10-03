// Público: confere nome + código curto e devolve o link secreto da cliente.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
// minúsculas, sem acento, sem pontuação, espaços únicos
const limpa = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// aceita o nome completo, o primeiro nome ou os primeiros nomes (ex.: "kley" ou "kley silva")
const nomeOk = (digitado, nomeCliente) => {
  const d = limpa(digitado), n = limpa(nomeCliente);
  return d.length >= 2 && (d === n || n.startsWith(d + ' '));
};

module.exports = async (req, res) => {
  const b = req.body || {};
  const code = String(b.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let c = null;
  if (req.method === 'POST' && /^[A-Z2-9]{8}$/.test(code) && URL_ && TOKEN) {
    const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(['GET', 'clientes']) }).then((x) => x.json());
    c = (r.result ? JSON.parse(r.result) : []).find((x) => x.codigo === code && x.acesso !== false && nomeOk(b.nome, x.nome));
  }
  if (!c) { await new Promise((r) => setTimeout(r, 800)); return res.status(404).json({ error: 'nome ou código incorretos' }); }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ t: c.token });
};
