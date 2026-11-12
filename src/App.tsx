import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { scenario, RELIABILITY_BASELINE } from './data/scenario';
import { recommend, scoreRun } from './lib/engine';
import { detectTransport, type PayPalTransport } from './lib/transports';
import type { DecisionRecord, LogEntry, OperatorAction } from './types';
import { Button } from './components/arc/button/button';
import SegmentedControl from './components/arc/segmented-control/segmented-control';
import { Badge } from './components/arc/badge/badge';
import { AnimatedCounter } from './components/arc/animated-counter/animated-counter';
import { Progress } from './components/arc/progress/progress';
import { Input } from './components/arc/input/input';
import { Gauge } from './components/arc/gauge/gauge';
import { MetricCard } from './components/arc/metric-card/metric-card';
import { Timeline, type TimelineEvent } from './components/arc/timeline/timeline';

type Mode = 'glass' | 'black';

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

const CONFIDENCE_BANDS = [
  { from: 0, tone: 'danger', label: 'Low confidence' },
  { from: 50, tone: 'warning', label: 'Contested' },
  { from: 75, tone: 'accent', label: 'High confidence' },
] as const;

export default function App() {
  const [mode, setMode] = useState<Mode>('glass');
  const [idx, setIdx] = useState(0);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [log, setLog] = useState<LogEntry[]>([
    { t: now(), kind: 'system', text: 'Session started. Scenario: POISONED CHECKOUT (5 proposals, synthetic data).' },
  ]);
  const stamps = useRef<number[]>([Date.now()]);
  const [tick, setTick] = useState(() => Date.now());
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
    const id = window.setInterval(() => setTick(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void detectTransport().then((t) => {
      setTransport(t);
      stamps.current.push(Date.now());
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
      stamps.current.push(Date.now());
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
    stamps.current.push(Date.now());
    if (executionNote) stamps.current.push(Date.now());
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
    stamps.current = [Date.now()];
    setLog([{ t: now(), kind: 'system', text: 'Session reset.' }]);
  }

  const events: TimelineEvent[] = log.map((e, i) => ({
    id: `log-${i}`,
    at: stamps.current[i] ?? stamps.current[stamps.current.length - 1] ?? Date.now(),
    title: e.text,
    tone: e.kind === 'execution' ? 'success' : 'neutral',
  }));

  const liveBadge = transport ? (
    transport.mode === 'live' ? (
      <Badge tone="success" dot pill>
        PAYPAL SANDBOX: LIVE
      </Badge>
    ) : (
      <Badge tone="warning" dot pill>
        TRANSPORT: MOCK (no credentials)
      </Badge>
    )
  ) : (
    <Badge tone="neutral" pill>
      Transport: …
    </Badge>
  );

  return (
    <div className="app">
      <div className="masthead">
        <div className="masthead-inner">
          <div className="wordmark">
            <span className="wordmark-name">Glass-Box Checkout</span>
            <span className="wordmark-sub">
              Appropriate-reliance measurement for AI payment agents. PayPal Sandbox · Newton &amp; Carter LLC
            </span>
          </div>
          <div className="masthead-controls">
            <SegmentedControl
              label="Display mode"
              options={[
                { value: 'glass', label: 'Glass-Box' },
                { value: 'black', label: 'Black-Box' },
              ]}
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
            />
            {liveBadge}
            <Button variant="secondary" size="sm" onClick={reset}>
              Reset run
            </Button>
          </div>
        </div>
      </div>

      <div className="scenario-strip">
        <div>
          <h1>POISONED CHECKOUT</h1>
          <p className="scenario-note">
            Five agent-proposed payments. The recommender is right 80% of the time. The question is whether you can
            tell which time it isn’t.
          </p>
        </div>
        <div className="run-progress">
          <span className="run-progress-label">
            {done ? 'Run complete' : `Decision ${Math.min(idx + 1, scenario.length)} of ${scenario.length}`}
          </span>
          <Progress value={records.length} max={scenario.length} label="Decisions completed" />
        </div>
      </div>

      <div className="console">
        <aside className="rail">
          <section className="rail-block">
            <h2>Run queue</h2>
            <ol className="queue">
              {scenario.map((p, i) => {
                const r = records.find((x) => x.dpId === p.id);
                const state = r ? 'done' : i === idx ? 'current' : 'waiting';
                return (
                  <li key={p.id} className={`queue-row ${state}`}>
                    <span className="queue-status" aria-hidden="true">
                      {r ? (
                        r.correct ? (
                          <Check size={13} strokeWidth={2.5} />
                        ) : (
                          <X size={13} strokeWidth={2.5} />
                        )
                      ) : (
                        <span className="queue-num">{i + 1}</span>
                      )}
                    </span>
                    <span className="queue-text">
                      <span className="queue-id">{p.id}</span>
                      <span className="queue-title">{p.title}</span>
                    </span>
                    {state === 'current' && (
                      <Badge tone="info" size="sm">
                        Reviewing
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="rail-block">
            <h2>The agent</h2>
            <div className="agent-stat">
              <span className="agent-stat-num">
                <AnimatedCounter value={Math.round(RELIABILITY_BASELINE * 100)} suffix="%" />
              </span>
              <span className="agent-stat-label">Measured reliability across ground-truthed runs</span>
            </div>
            <p className="rail-note">
              A deterministic rules engine. Its arithmetic is the exhibit: every driver is printed next to the call it
              produced, and every decision is written to the forensic log.
            </p>
          </section>
        </aside>

        <main className="stage">
          {!done && dp && rec ? (
            <section className="stage-card">
              <div className="stage-head">
                <h2>
                  {dp.id} — {dp.title}
                </h2>
                <p className="brief">{dp.brief}</p>
              </div>

              <dl className="ledger">
                <div>
                  <dt>Payee</dt>
                  <dd>{dp.proposal.payeeName}</dd>
                </div>
                <div>
                  <dt>Item</dt>
                  <dd>
                    {dp.proposal.item} × {dp.proposal.quantity}
                  </dd>
                </div>
                <div className="ledger-total">
                  <dt>Total</dt>
                  <dd>${dp.proposal.total.toFixed(2)} USD</dd>
                </div>
              </dl>

              <div className="verdict">
                <div className="verdict-main">
                  <span className="verdict-label">Agent recommends</span>
                  <span className={`verdict-action ${rec.action}`}>{rec.action}</span>
                  <p className="verdict-note">
                    {mode === 'glass'
                      ? 'Every driver behind this call is on the record below.'
                      : 'A bare recommendation and a confidence number. Nothing else is shown.'}
                  </p>
                </div>
                <div className="verdict-gauge">
                  <Gauge
                    value={rec.confidence}
                    label="Agent confidence"
                    detail="of 100"
                    thresholds={[...CONFIDENCE_BANDS]}
                  />
                </div>
              </div>

              {mode === 'glass' ? (
                <div className="evidence">
                  {dp.contradictions.length > 0 && (
                    <div className="alert-panel">
                      <strong>Contradictions on record</strong>
                      <ul>
                        {dp.contradictions.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="evidence-grid">
                    <div>
                      <h3>Why this call</h3>
                      <table className="drivers">
                        <tbody>
                          {rec.drivers.map((d) => (
                            <tr key={d.label}>
                              <td className="d-label">{d.label}</td>
                              <td className="d-points">
                                <Badge tone={d.points > 0 ? 'success' : d.points < 0 ? 'danger' : 'neutral'} size="sm">
                                  {d.points > 0 ? `+${d.points}` : d.points}
                                </Badge>
                              </td>
                              <td className="note">{d.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="rule-note">{rec.ruleNote}</p>
                    </div>

                    <div>
                      <h3>Provenance</h3>
                      <div className="prov-list">
                        {dp.provenance.map((p) => (
                          <div key={p.label} className="prov-row">
                            <span className="prov-label">{p.label}</span>
                            <span className="prov-value">
                              {p.source} ·{' '}
                              {p.ageMinutes >= 60
                                ? `${(p.ageMinutes / 60).toFixed(1)}h old`
                                : `${p.ageMinutes}m old`}
                              {p.flags.map((f) => (
                                <span key={f} className="flag-text">
                                  {f}
                                </span>
                              ))}
                            </span>
                          </div>
                        ))}
                        <div className="prov-row">
                          <span className="prov-label">Payee of record</span>
                          <span className="prov-value">
                            Verified storefront name: “{dp.proposal.payeeVerifiedName}”
                            {dp.proposal.payeeVerifiedName !== dp.proposal.payeeName && (
                              <Badge tone="danger" size="sm" className="flag">
                                Instruction names “{dp.proposal.payeeName}” — MISMATCH
                              </Badge>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="withheld">
                  <strong>Evidence withheld</strong>
                  <p>
                    Black-Box mode shows the recommendation and the confidence number only, the industry default. No
                    drivers, no provenance, no contradiction flags.
                  </p>
                </div>
              )}

              <div className="actions">
                <span className="btn-navy">
                  <Button variant="primary" size="lg" disabled={busy} onClick={() => void act('ACCEPT')}>
                    Accept recommendation
                  </Button>
                </span>
                <div className="reason-field">
                  <Input
                    label="Override reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Override reason (recorded in the forensic log)"
                  />
                </div>
                <Button variant="secondary" size="lg" disabled={busy} onClick={() => void act('OVERRIDE')}>
                  Override
                </Button>
              </div>
            </section>
          ) : debrief ? (
            <section className="stage-card debrief">
              <div className="stage-head">
                <h2>Debrief — scored against ground truth</h2>
                <p className="brief">
                  Transport this run:{' '}
                  {transport?.mode === 'live'
                    ? 'PayPal Sandbox (live orders).'
                    : 'MOCK. Executions were simulated and are labeled as such in the log; no PayPal orders exist.'}
                </p>
              </div>

              <div className={`trap-verdict ${debrief.errorRecovery ? 'caught' : 'missed'}`}>
                <strong>The DP-3 diversion trap: {debrief.errorRecovery ? 'CAUGHT' : 'MISSED'}</strong>
                <span>
                  {debrief.errorRecovery
                    ? 'The operator read the provenance, saw the payee mismatch, and stopped the diverted payment.'
                    : 'The diverted payment went through. The catch was only available on the Glass-Box surface.'}
                </span>
              </div>

              <div className="metrics-grid">
                <MetricCard
                  label="Appropriate reliance"
                  value={Math.round(debrief.appropriateReliance * 100)}
                  suffix="%"
                  context="Right calls accepted, wrong calls overridden. The headline score."
                />
                <MetricCard
                  label="Over-reliance"
                  value={Math.round(debrief.overReliance * 100)}
                  suffix="%"
                  context="Wrong recommendations the operator accepted."
                />
                <MetricCard
                  label="Under-reliance"
                  value={Math.round(debrief.underReliance * 100)}
                  suffix="%"
                  context="Right recommendations the operator overrode."
                />
                <MetricCard
                  label="Reliance share"
                  value={Math.round(debrief.relianceShare * 100)}
                  suffix="%"
                  context={`Recommendations accepted. The agent was actually right ${Math.round(
                    debrief.systemReliability * 100,
                  )}% of the time.`}
                />
                <MetricCard
                  label="Average decision latency"
                  value={Math.round(debrief.avgLatencyMs / 1000)}
                  suffix="s"
                  context="Time from the recommendation appearing to the decision."
                />
              </div>

              <h3>Ground truth, point by point</h3>
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
            </section>
          ) : null}
        </main>

        <aside className="rail">
          <section className="rail-block log-block">
            <h2>Forensic log</h2>
            <Timeline
              events={events}
              now={tick}
              label="Forensic log"
              timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
              maxHeight={520}
              scrollToNew={false}
            />
          </section>
        </aside>
      </div>

      <footer className="foot">
        Synthetic scenario data; no real payment is proposed or executed outside the PayPal Sandbox. The recommender
        is a deterministic rules engine — its arithmetic is the exhibit. Prototype by Newton &amp; Carter LLC; no prior
        PayPal work is claimed.
      </footer>
    </div>
  );
}
