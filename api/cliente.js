// Público: devolve SÓ a página de quem tem o link (token). Não expõe outros clientes nem observações internas.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (cmd) => fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd) }).then((x) => x.json());
const pick = (p) => ({ nome: p.nome, status: p.status, entrega: p.entrega, dataPedido: p.dataPedido, dataEnvio: p.dataEnvio, entregaForma: p.entregaForma, frete: p.frete, freteServico: p.freteServico, juros: p.juros, valor: p.valor, pgto: p.pgto, ideias: p.ideias, refs: p.refs || [], entregues: p.entregues || [], ent: { pago: !!(p.ent && p.ent.pago) }, fim: { pago: !!(p.fim && p.fim.pago) } });

module.exports = async (req, res) => {
  const t = String((req.query || {}).t || '');
  let c = null;
  if (/^[a-f0-9]{32}$/.test(t) && URL_ && TOKEN) {
    const r = await redis(['GET', 'clientes']);
    const lista = r.result ? JSON.parse(r.result) : [];
    c = lista.find((x) => x.token === t && x.acesso !== false);
  }
  if (!c) { await new Promise((r) => setTimeout(r, 600)); return res.status(404).json({ error: 'link inválido' }); }
  res.setHeader('Cache-Control', 'no-store');
  const pedidos = Array.isArray(c.pedidos) ? c.pedidos : [];

  // avaliações desta cliente (se o banco falhar, a página continua funcionando sem elas)
  let avs = [];
  try {
    const r = await redis(['GET', 'avaliacoes']);
    avs = (r.result ? JSON.parse(r.result) : []).filter((a) => a.token === t);
  } catch (e) {}

  res.status(200).json({
    nome: c.nome,
    medidas: c.medidas || '',
    medidasDedos: c.medidasDedos || null,
    pedidos: pedidos.map((p, i) => {
      const o = pick(p);
      o.pid = String(p.id != null ? p.id : i);
      const a = avs.find((x) => x.pid === o.pid);
      o.avaliacao = a ? { nota: a.nota, texto: a.texto, foto: a.foto || null, status: a.status, autoriza: !!a.autoriza } : null;
      return o;
    }),
  });
};
