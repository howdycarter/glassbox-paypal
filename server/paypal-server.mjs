// Glass-Box Checkout — credential-holding server (zero dependencies).
//
// Holds the PayPal Sandbox client id/secret server-side, creates and captures
// Sandbox orders via the Orders v2 REST API, reports credential presence to
// the UI (GET /api/health), and serves the built app from dist/.
//
// Without credentials it still runs: /api/health reports
// paypalConfigured:false and the UI falls back to its disclosed mock
// transport. No secret is ever sent to the browser.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Minimal .env loader (KEY=VALUE lines), no dependency.
try {
  const envText = await readFile(join(root, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env — fine, mock mode */
}

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? '';
const API_BASE = process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com';
const PORT = Number(process.env.PORT ?? 8787);
const configured = Boolean(CLIENT_ID && CLIENT_SECRET);

async function accessToken() {
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function createOrder({ amount, currency, description }) {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          description,
          amount: { currency_code: currency ?? 'USD', value: amount },
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `PayPal create order failed: ${res.status}`);
  return data;
}

async function captureOrder(id) {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/v2/checkout/orders/${id}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `PayPal capture failed: ${res.status}`);
  return data;
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/health') {
    return json(res, 200, { ok: true, paypalConfigured: configured, apiBase: API_BASE });
  }

  if (url.pathname === '/api/orders' && req.method === 'POST') {
    if (!configured) return json(res, 501, { error: 'NO_CREDENTIALS: PayPal sandbox credentials are not configured on the server.' });
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.amount) return json(res, 400, { error: 'amount is required' });
        const order = await createOrder(parsed);
        return json(res, 201, { id: order.id, status: order.status });
      } catch (e) {
        return json(res, 502, { error: String(e.message ?? e) });
      }
    });
    return;
  }

  const captureMatch = url.pathname.match(/^\/api\/orders\/([A-Z0-9-]+)\/capture$/);
  if (captureMatch && req.method === 'POST') {
    if (!configured) return json(res, 501, { error: 'NO_CREDENTIALS' });
    try {
      const out = await captureOrder(captureMatch[1]);
      return json(res, 200, { id: out.id, status: out.status });
    } catch (e) {
      return json(res, 502, { error: String(e.message ?? e) });
    }
  }

  // Static: serve dist/ with SPA fallback.
  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = await readFile(join(root, 'dist', rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    try {
      const index = await readFile(join(root, 'dist', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not built yet — run: npm run build');
    }
  }
});

server.listen(PORT, () => {
  console.log(`glassbox-paypal server on :${PORT} — PayPal sandbox ${configured ? 'CONFIGURED (live transport)' : 'not configured (mock transport)'}`);
});
