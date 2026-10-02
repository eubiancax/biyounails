const { clearSession } = require('./_auth');
module.exports = (req, res) => { clearSession(res); res.status(200).json({ ok: true }); };
