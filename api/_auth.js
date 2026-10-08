const crypto = require('crypto');
const COOKIE = 'biyou_session';
const IDLE_MS = 15 * 60 * 1000; // sai sozinho após 15 min sem uso
const sign = (v) => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(v).digest('hex');

function parseCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  return m ? m[1] : null;
}
function isAuthed(req) {
  if (!process.env.SESSION_SECRET) return false;
  const c = parseCookie(req);
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const ok = sign(exp);
  return sig.length === ok.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok));
}
function setSession(res) {
  const exp = String(Date.now() + IDLE_MS);
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${IDLE_MS / 1000}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}
// use no começo de qualquer rota privada: if (!requireAuth(req, res)) return;
// cada uso renova os 15 minutos
function requireAuth(req, res) {
  if (isAuthed(req)) { setSession(res); return true; }
  clearSession(res);
  res.status(401).json({ error: 'não autorizado' });
  return false;
}
module.exports = { isAuthed, requireAuth, setSession, clearSession, IDLE_MS };
