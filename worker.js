// Schillerplatz 7 — Tracking Worker

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── POST /api/track — Event speichern ──
    if (url.pathname === '/api/track' && request.method === 'POST') {
      try {
        const data = await request.json();
        const key = `event:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const event = {
          type: data.type || 'pageview',
          page: data.page || '/',
          doc: data.doc || null,
          country: request.headers.get('CF-IPCountry') || '??',
          city: request.cf?.city || null,
          device: getDevice(request.headers.get('User-Agent') || ''),
          referrer: data.referrer || null,
          timestamp: new Date().toISOString(),
        };
        await env.STATS.put(key, JSON.stringify(event), {
          expirationTtl: 60 * 60 * 24 * 90, // 90 Tage
        });
        return new Response('ok', { headers: corsHeaders });
      } catch {
        return new Response('error', { status: 500, headers: corsHeaders });
      }
    }

    // ── GET /api/stats — Dashboard-Daten (Passwort geschützt) ──
    if (url.pathname === '/api/stats') {
      const auth = request.headers.get('Authorization');
      const password = env.ADMIN_PASSWORD || 'admin123';
      if (auth !== `Bearer ${password}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const list = await env.STATS.list({ limit: 1000 });
      const events = (
        await Promise.all(list.keys.map(k => env.STATS.get(k.name, 'json')))
      ).filter(Boolean);

      // Statistiken berechnen
      const now = new Date();
      const days30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const recent = events.filter(e => new Date(e.timestamp) > days30);

      const pageviews = recent.filter(e => e.type === 'pageview').length;
      const downloads = recent.filter(e => e.type === 'download');

      // Downloads nach Dokument
      const docCounts = {};
      downloads.forEach(e => {
        const name = e.doc || 'unbekannt';
        docCounts[name] = (docCounts[name] || 0) + 1;
      });

      // Länder
      const countries = {};
      recent.forEach(e => {
        countries[e.country] = (countries[e.country] || 0) + 1;
      });

      // Geräte
      const devices = {};
      recent.forEach(e => {
        devices[e.device] = (devices[e.device] || 0) + 1;
      });

      // Letzte 50 Events
      const latest = events
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50);

      return new Response(
        JSON.stringify({
          total: events.length,
          last30days: {
            pageviews,
            downloads: downloads.length,
            docCounts,
            countries,
            devices,
          },
          latest,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ── Alles andere → statische Assets ──
    return env.ASSETS.fetch(request);
  },
};

function getDevice(ua) {
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'Mobil';
  if (/Tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
}
