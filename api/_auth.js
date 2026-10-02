const crypto = require('crypto');
const COOKIE = 'biyou_session';
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
// use no começo de qualquer rota privada: if (!requireAuth(req, res)) return;
function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: 'não autorizado' });
  return false;
}
function setSession(res) {
  const exp = String(Date.now() + 7 * 24 * 3600 * 1000);
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}
module.exports = { isAuthed, requireAuth, setSession, clearSession };
