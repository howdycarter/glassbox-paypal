import type { PaymentProposal } from '../types';

// PayPal execution transports, behind one interface, on an honesty ladder
// (the pattern the Glass-Box Meta build uses for its model advisor):
//
// - live: a real PayPal Sandbox order is created through the local credential
//   server (server/paypal-server.mjs), which holds the sandbox client id and
//   secret. The browser never sees the secret.
// - mock: no credentials configured. Orders are simulated locally and LABELED
//   as mock everywhere they appear — in the UI badge, the forensic log, and
//   the debrief. A mock order id is never presented as a PayPal order id.
//
// Detection is by /api/health: the server reports whether sandbox credentials
// are configured; the UI falls back to mock and discloses why.

export interface OrderResult {
  mode: 'live' | 'mock';
  orderId: string;
  status: string;
}

export interface PayPalTransport {
  readonly mode: 'live' | 'mock';
  createOrder(proposal: PaymentProposal): Promise<OrderResult>;
}

export class MockTransport implements PayPalTransport {
  readonly mode = 'mock' as const;

  async createOrder(proposal: PaymentProposal): Promise<OrderResult> {
    // Deterministic id from proposal contents, so runs are repeatable.
    const seed = `${proposal.payeeName}|${proposal.total.toFixed(2)}|${proposal.item}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return { mode: 'mock', orderId: `MOCK-${h.toString(16).toUpperCase().padStart(8, '0')}`, status: 'SIMULATED' };
  }
}

export class LiveTransport implements PayPalTransport {
  readonly mode = 'live' as const;

  async createOrder(proposal: PaymentProposal): Promise<OrderResult> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: proposal.total.toFixed(2),
        currency: proposal.currency,
        description: `${proposal.item} — ${proposal.payeeName}`,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `PayPal server returned ${res.status}`);
    }
    const data = (await res.json()) as { id: string; status: string };
    return { mode: 'live', orderId: data.id, status: data.status };
  }
}

/** Ask the local server whether real sandbox credentials are configured. */
export async function detectTransport(): Promise<PayPalTransport> {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = (await res.json()) as { paypalConfigured?: boolean };
      if (data.paypalConfigured) return new LiveTransport();
    }
  } catch {
    // No server reachable — mock mode, disclosed in the UI.
  }
  return new MockTransport();
}
