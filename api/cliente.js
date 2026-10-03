// Público: devolve SÓ a página de quem tem o link (token). Não expõe outros clientes nem observações internas.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const pick = (p) => ({ nome: p.nome, status: p.status, entrega: p.entrega, entregaForma: p.entregaForma, frete: p.frete, freteServico: p.freteServico, juros: p.juros, valor: p.valor, pgto: p.pgto, ideias: p.ideias, refs: p.refs || [], entregues: p.entregues || [], ent: { pago: !!(p.ent && p.ent.pago) }, fim: { pago: !!(p.fim && p.fim.pago) } });

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
  const pedidos = Array.isArray(c.pedidos) ? c.pedidos : [];
  res.status(200).json({ nome: c.nome, medidas: c.medidas || '', pedidos: pedidos.map(pick) });
};
