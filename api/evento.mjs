/**
 * Conversions API da Meta — endpoint first-party.
 *
 * O navegador dispara o evento pelo pixel e chama esta rota com o MESMO
 * event_id. A Meta recebe os dois caminhos e descarta a duplicata, entao o
 * lead so conta uma vez. Se um adblocker matar o pixel, este caminho entrega.
 *
 * Variaveis de ambiente (Vercel > Settings > Environment Variables):
 *   META_PIXEL_ID    1413176104254902
 *   META_CAPI_TOKEN  token gerado no Events Manager (escopado no pixel)
 */

const API_VERSION = 'v23.0';

// Evento que nao estiver aqui e recusado. O endpoint e publico: sem essa
// trava qualquer um poderia injetar conversao falsa e sujar a otimizacao.
const EVENTOS_PERMITIDOS = new Set(['Lead', 'ViewContent', 'PageView', 'Interesse']);

const ORIGENS_PERMITIDAS = [
  'https://www.quezada.com.br',
  'https://quezada.com.br',
];

/** Le um cookie do header cru — nao ha parser pronto no runtime Node da Vercel. */
function lerCookie(cookieHeader, nome) {
  if (!cookieHeader) return undefined;
  for (const parte of cookieHeader.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * O _fbc so existe como cookie depois que o pixel roda. Se o pixel foi
 * bloqueado — justamente o caso que a CAPI existe para cobrir — ele nao
 * existe, mas o fbclid ainda esta na URL. Aqui remontamos no formato oficial:
 * fb.<subdominios>.<timestamp>.<fbclid>
 */
function montarFbc(fbcCookie, urlOrigem) {
  if (fbcCookie) return fbcCookie;
  try {
    const fbclid = new URL(urlOrigem).searchParams.get('fbclid');
    if (fbclid) return `fb.1.${Date.now()}.${fbclid}`;
  } catch {}
  return undefined;
}

function ipDoCliente(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || undefined;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'metodo nao permitido' });

  const origem = req.headers.origin || req.headers.referer || '';
  if (!ORIGENS_PERMITIDAS.some((o) => origem.startsWith(o))) {
    return res.status(403).json({ erro: 'origem nao permitida' });
  }

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const TOKEN = process.env.META_CAPI_TOKEN;
  if (!PIXEL_ID || !TOKEN) {
    console.error('[capi] variaveis de ambiente ausentes');
    // 200 de proposito: um 500 aqui viraria erro visivel no console do site
    // do cliente sem beneficio nenhum. O alerta fica no log da Vercel.
    return res.status(200).json({ ok: false, motivo: 'nao configurado' });
  }

  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { event_name, event_id, event_source_url, custom_data } = corpo;

  if (!EVENTOS_PERMITIDOS.has(event_name)) {
    return res.status(400).json({ erro: 'evento nao permitido' });
  }
  if (!event_id) {
    // Sem event_id a Meta nao consegue deduplicar e o lead conta em dobro.
    return res.status(400).json({ erro: 'event_id obrigatorio' });
  }

  const cookies = req.headers.cookie;
  const url = event_source_url || origem;

  const evento = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    event_source_url: url,
    action_source: 'website',
    user_data: {
      client_ip_address: ipDoCliente(req),
      client_user_agent: req.headers['user-agent'],
      fbp: lerCookie(cookies, '_fbp'),
      fbc: montarFbc(lerCookie(cookies, '_fbc'), url),
    },
    custom_data: custom_data && typeof custom_data === 'object' ? custom_data : undefined,
  };

  // A Meta rejeita o payload inteiro se um campo vier undefined.
  for (const k of Object.keys(evento.user_data)) {
    if (evento.user_data[k] === undefined) delete evento.user_data[k];
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [evento],
        access_token: TOKEN,
        ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
      }),
    });

    const resposta = await r.json();
    if (!r.ok) {
      console.error('[capi] recusado pela Meta:', JSON.stringify(resposta));
      return res.status(200).json({ ok: false });
    }
    return res.status(200).json({ ok: true, recebidos: resposta.events_received });
  } catch (e) {
    console.error('[capi] falha na chamada:', e.message);
    // Nunca quebrar a navegacao do usuario por causa de tracking.
    return res.status(200).json({ ok: false });
  }
}
