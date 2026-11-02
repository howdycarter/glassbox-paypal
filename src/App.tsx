import { useEffect, useMemo, useRef, useState } from 'react';
import { scenario, RELIABILITY_BASELINE } from './data/scenario';
import { recommend, scoreRun } from './lib/engine';
import { detectTransport, type PayPalTransport } from './lib/transports';
import type { DecisionRecord, LogEntry, OperatorAction } from './types';

type Mode = 'glass' | 'black';

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export default function App() {
  const [mode, setMode] = useState<Mode>('glass');
  const [idx, setIdx] = useState(0);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [log, setLog] = useState<LogEntry[]>([
    { t: now(), kind: 'system', text: 'Session started. Scenario: POISONED CHECKOUT (5 proposals, synthetic data).' },
  ]);
  const [transport, setTransport] = useState<PayPalTransport | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const shownAt = useRef<number>(performance.now());

  const dp = scenario[idx];
  const done = idx >= scenario.length;
  const rec = useMemo(() => (dp ? recommend(dp) : null), [dp]);
  const debrief = useMemo(
    () => (done ? scoreRun(records, scenario) : null),
    [done, records],
  );

  useEffect(() => {
    void detectTransport().then((t) => {
      setTransport(t);
      setLog((l) => [
        ...l,
        {
          t: now(),
          kind: 'system',
          text:
            t.mode === 'live'
              ? 'PayPal transport: LIVE — sandbox credentials configured on the server; approvals create real Sandbox orders.'
              : 'PayPal transport: MOCK — no sandbox credentials configured; executions are simulated and labeled as such.',
        },
      ]);
    });
  }, []);

  useEffect(() => {
    shownAt.current = performance.now();
    if (dp && rec) {
      setLog((l) => [
        ...l,
        {
          t: now(),
          kind: 'recommendation',
          text: `${dp.id} — agent recommends ${rec.action} $${dp.proposal.total.toFixed(2)} to ${dp.proposal.payeeName} at ${rec.confidence}% confidence.`,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  async function act(action: OperatorAction) {
    if (!dp || !rec || busy) return;
    setBusy(true);
    const latencyMs = Math.round(performance.now() - shownAt.current);
    const operatorPays = (action === 'ACCEPT' && rec.action === 'PAY') || (action === 'OVERRIDE' && rec.action === 'BLOCK');
    let executionNote: string | undefined;

    if (operatorPays && transport) {
      try {
        const out = await transport.createOrder(dp.proposal);
        executionNote =
          out.mode === 'live'
            ? `PayPal Sandbox order ${out.orderId} created (${out.status}).`
            : `MOCK execution — simulated order ${out.orderId}. No PayPal order exists; credentials are not configured.`;
      } catch (e) {
        executionNote = `Execution failed: ${String((e as Error).message ?? e)}`;
      }
    } else {
      executionNote = operatorPays ? undefined : 'No payment executed.';
    }

    const correct =
      (action === 'ACCEPT' && dp.correctAction === 'ACCEPT') ||
      (action === 'OVERRIDE' && dp.correctAction === 'OVERRIDE');

    const record: DecisionRecord = {
      dpId: dp.id,
      recommendation: rec,
      operatorAction: action,
      overrideReason: action === 'OVERRIDE' ? reason.trim() || 'Operator override (no reason given)' : undefined,
      latencyMs,
      correct,
      executionNote,
    };
    setRecords((r) => [...r, record]);
    setLog((l) => [
      ...l,
      {
        t: now(),
        kind: 'operator',
        text: `${dp.id} — operator ${action === 'ACCEPT' ? 'ACCEPTED' : 'OVERRIDES'} (${(latencyMs / 1000).toFixed(1)}s)${record.overrideReason ? `: ${record.overrideReason}` : ''}.`,
      },
      ...(executionNote
        ? [{ t: now(), kind: 'execution' as const, text: `${dp.id} — ${executionNote}` }]
        : []),
    ]);
    setReason('');
    setBusy(false);
    setIdx((i) => i + 1);
  }

  function reset() {
    setIdx(0);
    setRecords([]);
    setReason('');
    setLog([{ t: now(), kind: 'system', text: 'Session reset.' }]);
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Glass-Box Checkout</h1>
          <p className="sub">
            Appropriate-reliance measurement for AI payment agents — PayPal Sandbox · Newton &amp; Carter LLC
          </p>
        </div>
        <div className="controls">
          <div className="toggle" role="group" aria-label="Display mode">
            <button className={mode === 'glass' ? 'on' : ''} onClick={() => setMode('glass')}>
              Glass-Box
            </button>
            <button className={mode === 'black' ? 'on' : ''} onClick={() => setMode('black')}>
              Black-Box
            </button>
          </div>
          <span className={`badge ${transport?.mode ?? 'mock'}`}>
            {transport
              ? transport.mode === 'live'
                ? 'PAYPAL SANDBOX: LIVE'
                : 'TRANSPORT: MOCK (no credentials)'
              : 'TRANSPORT: …'}
          </span>
          <button onClick={reset}>Reset run</button>
        </div>
      </header>

      <div className="layout">
        <aside className="rail">
          <h2>POISONED CHECKOUT</h2>
          <p className="railnote">
            Five agent-proposed payments. The recommender is right 80% of the time — the question is whether you can
            tell which time it isn’t.
          </p>
          <ol>
            {scenario.map((p, i) => {
              const r = records.find((x) => x.dpId === p.id);
              return (
                <li key={p.id} className={i === idx ? 'current' : r ? 'done' : ''}>
                  <span>{p.id}</span> {p.title}
                  {r ? <em>{r.correct ? ' ✓' : ' ✗'}</em> : null}
                </li>
              );
            })}
          </ol>
        </aside>

        <main>
          {!done && dp && rec ? (
            <section className="card">
              <h2>
                {dp.id} — {dp.title}
              </h2>
              <p>{dp.brief}</p>

              <div className="proposal">
                <div>
                  <strong>Payee</strong>
                  <span>{dp.proposal.payeeName}</span>
                </div>
                <div>
                  <strong>Item</strong>
                  <span>
                    {dp.proposal.item} × {dp.proposal.quantity}
                  </span>
                </div>
                <div>
                  <strong>Total</strong>
                  <span>${dp.proposal.total.toFixed(2)} USD</span>
                </div>
              </div>

              <div className="recommendation">
                <div className="rec-head">
                  <span className={`rec-action ${rec.action}`}>AGENT RECOMMENDS: {rec.action}</span>
                  <span className="conf">{rec.confidence}% confidence</span>
                </div>
                {mode === 'glass' ? (
                  <>
                    <table className="drivers">
                      <tbody>
                        {rec.drivers.map((d) => (
                          <tr key={d.label}>
                            <td>{d.label}</td>
                            <td className={d.points > 0 ? 'pos' : d.points < 0 ? 'neg' : ''}>
                              {d.points > 0 ? `+${d.points}` : d.points}
                            </td>
                            <td className="note">{d.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="rule">{rec.ruleNote}</p>

                    {dp.contradictions.length > 0 && (
                      <div className="contradictions">
                        <strong>Contradictions on record</strong>
                        <ul>
                          {dp.contradictions.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="provenance">
                      <strong>Provenance</strong>
                      {dp.provenance.map((p) => (
                        <div key={p.label} className="prov-row">
                          <span className="prov-label">{p.label}</span>
                          <span>
                            {p.source} · {p.ageMinutes >= 60 ? `${(p.ageMinutes / 60).toFixed(1)}h old` : `${p.ageMinutes}m old`}
                            {p.flags.map((f) => (
                              <span key={f} className="flag">
                                ⚠ {f}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                      <div className="prov-row">
                        <span className="prov-label">Payee of record</span>
                        <span>
                          Verified storefront name: “{dp.proposal.payeeVerifiedName}”
                          {dp.proposal.payeeVerifiedName !== dp.proposal.payeeName && (
                            <span className="flag">⚠ Instruction names “{dp.proposal.payeeName}” — MISMATCH</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="blacknote">
                    Black-Box mode: recommendation and confidence number only — the industry default. No drivers, no
                    provenance, no contradiction flags.
                  </p>
                )}
              </div>

              <div className="actions">
                <button className="accept" disabled={busy} onClick={() => void act('ACCEPT')}>
                  Accept recommendation
                </button>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Override reason (recorded in the forensic log)"
                />
                <button className="override" disabled={busy} onClick={() => void act('OVERRIDE')}>
                  Override
                </button>
              </div>
            </section>
          ) : debrief ? (
            <section className="card debrief">
              <h2>Debrief — scored against ground truth</h2>
              <div className="metrics">
                <div>
                  <span className="big">{(debrief.appropriateReliance * 100).toFixed(0)}%</span>
                  <label>Appropriate-reliance rate (headline)</label>
                </div>
                <div>
                  <span className="big">{(debrief.overReliance * 100).toFixed(0)}%</span>
                  <label>Over-reliance (accepted wrong recommendations)</label>
                </div>
                <div>
                  <span className="big">{(debrief.underReliance * 100).toFixed(0)}%</span>
                  <label>Under-reliance (overrode right recommendations)</label>
                </div>
                <div>
                  <span className="big">
                    {(debrief.relianceShare * 100).toFixed(0)}% vs {(RELIABILITY_BASELINE * 100).toFixed(0)}%
                  </span>
                  <label>Your reliance vs the agent’s actual reliability</label>
                </div>
                <div>
                  <span className="big">{debrief.errorRecovery ? 'CAUGHT' : 'MISSED'}</span>
                  <label>The DP-3 diversion trap</label>
                </div>
                <div>
                  <span className="big">{(debrief.avgLatencyMs / 1000).toFixed(1)}s</span>
                  <label>Average decision latency</label>
                </div>
              </div>
              <table className="truth">
                <thead>
                  <tr>
                    <th>Point</th>
                    <th>Agent</th>
                    <th>You</th>
                    <th>Ground truth</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.map((p) => {
                    const r = records.find((x) => x.dpId === p.id);
                    return (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>
                          {r?.recommendation.action} ({r?.recommendation.confidence}%)
                        </td>
                        <td>
                          {r?.operatorAction} {r?.correct ? '✓' : '✗'}
                        </td>
                        <td>{p.groundTruthNote}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="rule">
                Transport this run: {transport?.mode === 'live' ? 'PayPal Sandbox (live orders)' : 'MOCK — executions were simulated and are labeled as such in the log; no PayPal orders exist.'}
              </p>
            </section>
          ) : null}

          <section className="card log">
            <h2>Forensic log</h2>
            <ul>
              {log.map((e, i) => (
                <li key={i} className={e.kind}>
                  <span className="lt">{e.t}</span> {e.text}
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>

      <footer>
        Synthetic scenario data; no real payment is proposed or executed outside the PayPal Sandbox. The recommender
        is a deterministic rules engine — its arithmetic is the exhibit. Prototype by Newton &amp; Carter LLC; no prior
        PayPal work is claimed.
      </footer>
    </div>
  );
}
