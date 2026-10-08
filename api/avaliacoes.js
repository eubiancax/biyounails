// Avaliações com foto. Tudo numa função só (o plano grátis da Vercel limita o número de funções).
//  GET  /api/avaliacoes                  -> público: só as aprovadas (e autorizadas pela cliente)
//  GET  /api/avaliacoes?img=ID[&t=TOKEN] -> foto: pública se aprovada; da dona pelo link secreto; sua se estiver logada
//  GET  /api/avaliacoes?todas=1          -> só você (logada): todas, para moderar
//  POST { t, pid, nota, texto, autoriza, foto } -> a cliente envia/edita a avaliação do próprio pedido
//  POST { acao: 'aprovar'|'recusar'|'apagar', id } -> só você (logada)
const crypto = require('crypto');
const { isAuthed } = require('./_auth');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (cmd) => fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmd) }).then((r) => r.json());

// leitura "estrita": se o banco falhar, dá erro em vez de devolver lista vazia (evita apagar dados sem querer)
async function ler(chave) {
  const r = await redis(['GET', chave]);
  if (!r || r.error) throw new Error('banco indisponível');
  return r.result ? JSON.parse(r.result) : [];
}
async function gravar(chave, valor) {
  const r = await redis(['SET', chave, JSON.stringify(valor)]);
  if (!r || r.error) throw new Error('o banco não salvou');
}

async function enviarFoto(req, res, id, t) {
  if (!/^[a-f0-9]{24}$/.test(id)) return res.status(404).end();
  let ok = isAuthed(req);
  if (!ok) {
    const l = await ler('avaliacoes');
    ok = l.some((a) => a.foto === id && ((a.status === 'aprovada' && a.autoriza) || (/^[a-f0-9]{32}$/.test(t) && a.token === t)));
  }
  if (!ok) return res.status(404).end();
  const { result } = await redis(['GET', 'img:' + id]);
  const m = result && result.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.status(200).send(Buffer.from(m[1], 'base64'));
}

const porData = (a, b) => String(b.data || '').localeCompare(String(a.data || ''));

module.exports = async (req, res) => {
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'banco de dados não configurado na Vercel' });
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      if (q.img) return await enviarFoto(req, res, String(q.img), String(q.t || ''));
      if (q.todas) {
        if (!isAuthed(req)) return res.status(401).json({ error: 'faça login no painel' });
        const l = await ler('avaliacoes');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(l.map(({ token, ...a }) => a).sort(porData));
      }
      const l = (await ler('avaliacoes')).filter((a) => a.status === 'aprovada' && a.autoriza);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return res.status(200).json(l.sort(porData).map((a) => ({ id: a.id, nome: a.nome, nota: a.nota, texto: a.texto, foto: a.foto || null, data: a.data })));
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // ---- ações suas (logada) ----
      if (b.acao) {
        if (!isAuthed(req)) return res.status(401).json({ error: 'faça login no painel' });
        const l = await ler('avaliacoes');
        const i = l.findIndex((a) => a.id === String(b.id || ''));
        if (i < 0) return res.status(404).json({ error: 'avaliação não encontrada' });
        if (b.acao === 'aprovar') l[i].status = 'aprovada';
        else if (b.acao === 'recusar') l[i].status = 'recusada';
        else if (b.acao === 'apagar') {
          if (l[i].foto) await redis(['DEL', 'img:' + l[i].foto]);
          l.splice(i, 1);
        } else return res.status(400).json({ error: 'ação inválida' });
        await gravar('avaliacoes', l);
        return res.status(200).json({ ok: true });
      }

      // ---- envio pela cliente (link secreto) ----
      const t = String(b.t || '');
      const clientes = /^[a-f0-9]{32}$/.test(t) ? await ler('clientes') : [];
      const c = clientes.find((x) => x.token === t && x.acesso !== false);
      if (!c) { await new Promise((r) => setTimeout(r, 600)); return res.status(404).json({ error: 'link inválido' }); }

      const pid = String(b.pid || '');
      const pedidos = Array.isArray(c.pedidos) ? c.pedidos : [];
      const k = pedidos.findIndex((p, n) => String(p.id != null ? p.id : n) === pid);
      if (k < 0) return res.status(404).json({ error: 'pedido não encontrado' });
      if (pedidos[k].status !== 'enviado' && pedidos[k].status !== 'finalizado') return res.status(400).json({ error: 'dá para avaliar depois que o pedido for enviado' });

      const nota = parseInt(b.nota, 10);
      if (!(nota >= 1 && nota <= 5)) return res.status(400).json({ error: 'escolha de 1 a 5 estrelas' });
      const texto = String(b.texto || '').trim().slice(0, 600);
      const autoriza = !!b.autoriza;

      let fotoNova = null;
      if (b.foto) {
        const d = String(b.foto);
        if (!d.startsWith('data:image/jpeg;base64,')) return res.status(400).json({ error: 'formato de foto inválido' });
        if (d.length > 900000) return res.status(400).json({ error: 'foto grande demais' });
        fotoNova = crypto.randomBytes(12).toString('hex');
        const r = await redis(['SET', 'img:' + fotoNova, d]);
        if (!r || r.error) return res.status(502).json({ error: 'o banco recusou a foto' });
      }

      const l = await ler('avaliacoes');
      let a = l.find((x) => x.token === t && x.pid === pid);
      if (a && a.status === 'aprovada') return res.status(409).json({ error: 'essa avaliação já foi aprovada e está no site' });
      if (!a) { a = { id: crypto.randomBytes(12).toString('hex'), token: t, pid }; l.push(a); }
      if (fotoNova) { if (a.foto) await redis(['DEL', 'img:' + a.foto]); a.foto = fotoNova; }
      Object.assign(a, {
        cliente: String(c.nome || ''),
        nome: String(c.nome || '').trim().split(/\s+/)[0] || 'cliente', // só o primeiro nome aparece no site
        pedido: String(pedidos[k].nome || ''),
        nota, texto, autoriza,
        status: 'pendente',
        data: new Date().toISOString(),
      });
      await gravar('avaliacoes', l);
      return res.status(200).json({ ok: true, status: 'pendente' });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: 'erro no servidor: ' + e.message });
  }
};
