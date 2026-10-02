// Diagnóstico temporário: mostra só sim/não, nunca os valores. Apague depois de testar.
module.exports = (req, res) => {
  res.status(200).json({
    senha: !!process.env.ADMIN_PASSWORD,
    segredo: !!process.env.SESSION_SECRET,
    banco_url: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    banco_token: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
  });
};
