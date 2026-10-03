// Privado (só você logada): cotação de frete pelo Melhor Envio e/ou SuperFrete.
const { requireAuth } = require('./_auth');
const n = (x) => Math.max(0, Number(x) || 0);
const email = () => process.env.CONTATO_EMAIL || process.env.MELHOR_ENVIO_EMAIL || '';

async function chamar(url, token, corpo) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'User-Agent': 'Biyou Nails (' + email() + ')' },
    body: JSON.stringify(corpo),
  });
  let j; try { j = await r.json(); } catch (e) { j = null; }
  if (!Array.isArray(j)) throw new Error((j && (j.message || j.error)) || 'recusou a consulta (HTTP ' + r.status + ') — confira o token');
  return j;
}
const lista = (j, fonte) => j.filter((x) => x && !x.error && !x.has_error && (x.custom_price || x.price))
  .map((x) => ({ fonte, id: x.id, nome: x.name, empresa: (x.company && x.company.name) || '', preco: Number(x.custom_price || x.price), prazo: x.custom_delivery_time || x.delivery_time }));

async function melhorEnvio(d) {
  const base = process.env.MELHOR_ENVIO_SANDBOX === '1' ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  return lista(await chamar(base + '/api/v2/me/shipment/calculate', process.env.MELHOR_ENVIO_TOKEN, {
    from: { postal_code: d.origem }, to: { postal_code: d.cep },
    package: { height: d.altura, width: d.largura, length: d.comprimento, weight: d.peso / 1000 },
    options: { insurance_value: d.valor, receipt: false, own_hand: false, collect: false },
  }), 'melhor envio');
}
async function superFrete(d) {
  const base = process.env.SUPERFRETE_SANDBOX === '1' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
  return lista(await chamar(base + '/api/v0/calculator', process.env.SUPERFRETE_TOKEN, {
    from: { postal_code: d.origem }, to: { postal_code: d.cep },
    services: process.env.SUPERFRETE_SERVICOS || '1,2,17',
    options: { own_hand: false, receipt: false, insurance_value: d.valor, use_insurance_value: false },
    package: { height: d.altura, width: d.largura, length: d.comprimento, weight: d.peso / 1000 },
  }), 'superfrete');
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  const d = { origem: String(process.env.ORIGEM_CEP || '').replace(/\D/g, ''), cep: String(b.cep || '').replace(/\D/g, ''),
    altura: n(b.altura), largura: n(b.largura), comprimento: n(b.comprimento), peso: Math.round(n(b.peso)), valor: n(b.valor) };
  const fontes = [];
  if (process.env.MELHOR_ENVIO_TOKEN) fontes.push(['melhor envio', melhorEnvio]);
  if (process.env.SUPERFRETE_TOKEN) fontes.push(['superfrete', superFrete]);
  if (!fontes.length || d.origem.length !== 8) return res.status(500).json({ error: 'faltam variáveis na Vercel: ORIGEM_CEP (CEP de onde você envia) e MELHOR_ENVIO_TOKEN e/ou SUPERFRETE_TOKEN' });
  if (!email()) return res.status(500).json({ error: 'falta a variável MELHOR_ENVIO_EMAIL (seu e-mail de contato) na Vercel' });
  if (d.cep.length !== 8 || !(d.altura > 0 && d.largura > 0 && d.comprimento > 0 && d.peso > 0)) return res.status(400).json({ error: 'CEP ou medidas inválidos' });
  const rs = await Promise.allSettled(fontes.map((f) => f[1](d)));
  const opcoes = [], avisos = [];
  rs.forEach((r, i) => { if (r.status === 'fulfilled') opcoes.push(...r.value); else avisos.push(fontes[i][0] + ': ' + r.reason.message); });
  if (!opcoes.length && avisos.length) return res.status(502).json({ error: avisos.join(' | ') });
  opcoes.sort((a, b) => a.preco - b.preco);
  res.status(200).json({ opcoes, avisos });
};
