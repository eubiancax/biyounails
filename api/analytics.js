// Busca os dados do Google Analytics (GA4) usando uma conta de serviço.
// As credenciais nunca ficam expostas ao navegador: essa função roda
// só no servidor (Vercel Serverless Function).
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

function getClient() {
  const credentials = {
    client_email: process.env.GA_CLIENT_EMAIL,
    private_key: (process.env.GA_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
  return new BetaAnalyticsDataClient({ credentials });
}

function simplify(resp) {
  return (resp[0].rows || []).map((r) => ({
    dims: r.dimensionValues.map((d) => d.value),
    metrics: r.metricValues.map((m) => m.value),
  }));
}

// traduz termos comuns do GA4 para português
function traduzir(str) {
  var map = {
    'mobile': 'celular',
    'desktop': 'computador',
    'tablet': 'tablet',
    'Direct': 'direto',
    'Organic Search': 'busca orgânica',
    'Organic Social': 'rede social',
    'Referral': 'referência',
    'Paid Search': 'busca paga',
    'Email': 'e-mail',
    'Unassigned': 'não identificado',
    '(not set)': '(não identificado)',
    '(not provided)': '(não identificado)',
  };
  if (!str) return '(não identificado)';
  // "State of Sao Paulo" → "São Paulo"
  if (str.startsWith('State of ')) return str.replace('State of ', '').replace('Sao Paulo', 'São Paulo');
  return map[str] || str;
}

module.exports = async (req, res) => {
  try {
    const propertyId = process.env.GA_PROPERTY_ID;
    if (!propertyId || !process.env.GA_CLIENT_EMAIL || !process.env.GA_PRIVATE_KEY) {
      res.status(500).json({ error: 'Variáveis de ambiente do Analytics não configuradas na Vercel.' });
      return;
    }

    const client = getClient();
    const property = `properties/${propertyId}`;
    const dateRanges = [{ startDate: '28daysAgo', endDate: 'today' }];

    const [regionResp, sectionResp, instaResp, sourceResp, deviceResp, suggestResp] = await Promise.all([
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'region' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 15,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'customEvent:section_id' }, { name: 'customEvent:engagement_time_sec' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { value: 'section_engagement' } },
        },
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'customEvent:link_location' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { value: 'instagram_click' } },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: 'customEvent:song_name' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { value: 'music_suggestion' } },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 20,
      }),
    ]);

    // agrega o tempo por seção: soma(segundos * contagem) / contagem = média
    const sectionAgg = {};
    for (const row of simplify(sectionResp)) {
      const [sectionId, secStr] = row.dims;
      const count = Number(row.metrics[0] || 0);
      const seconds = Number(secStr || 0);
      if (!sectionAgg[sectionId]) sectionAgg[sectionId] = { totalSeconds: 0, count: 0 };
      sectionAgg[sectionId].totalSeconds += seconds * count;
      sectionAgg[sectionId].count += count;
    }
    const sectionData = Object.entries(sectionAgg)
      .map(([sectionId, v]) => ({
        section_id: sectionId,
        avg_seconds: v.count ? Math.round(v.totalSeconds / v.count) : 0,
        views: v.count,
      }))
      .sort((a, b) => b.avg_seconds - a.avg_seconds);

    res.setHeader('Cache-Control', 's-maxage=1800');
    res.status(200).json({
      region: simplify(regionResp).map((r) => ({ region: traduzir(r.dims[0]) || '(não identificado)', users: Number(r.metrics[0]) })),
      section: sectionData,
      instagram: simplify(instaResp).map((r) => ({ location: r.dims[0] || '(sem rótulo)', clicks: Number(r.metrics[0]) })),
      source: simplify(sourceResp).map((r) => ({ channel: traduzir(r.dims[0]) || '(direto)', users: Number(r.metrics[0]) })),
      device: simplify(deviceResp).map((r) => ({ device: traduzir(r.dims[0]), users: Number(r.metrics[0]) })),
      suggestions: simplify(suggestResp).map((r) => ({ song: r.dims[0] || '(sem nome)', count: Number(r.metrics[0]) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
