import React, { useState } from 'react';
import { CheckCircle, Copy, Info, ChevronDown, ChevronUp, XCircle, ShieldCheck, ShieldAlert } from 'lucide-react';

// Mock Data
const MOCK_DRIVERS = [
  { id: 'MS-84921', name: 'Robert Jenkins', score: 92, risk: 'LOW' },
  { id: 'MS-84922', name: 'Sarah Chen', score: 88, risk: 'LOW' },
  { id: 'MS-84923', name: 'Michael Vance', score: 65, risk: 'MEDIUM' },
  { id: 'MS-84924', name: 'David Torres', score: 42, risk: 'HIGH' },
];

function App() {
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runVerification = async (valid: boolean) => {
    setStatus('loading');
    setTxHash(null);
    setErrorMsg(null);
    try {
      const response = await fetch('http://localhost:4000/verify-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: 'MS-84921', safetyConditionsMet: valid })
      });
      const data = await response.json();
      if (data.success) {
        setTxHash(data.txHash);
        setStatus('success');
      } else {
        setErrorMsg(data.error);
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setStatus('error');
    }
  };

  const handleCopy = () => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>FleetShield Dashboard</h1>
      </header>

      <main>
        {/* Section 1: Fleet Overview */}
        <section className="section">
          <h2 className="section-title">Fleet Overview</h2>
          <div className="cards-grid">
            {MOCK_DRIVERS.map((driver) => (
              <div key={driver.id} className={`card ${driver.risk === 'HIGH' ? 'highlighted-for-verification' : ''}`}>
                <div className="driver-name">{driver.name}</div>
                {driver.risk === 'HIGH' && (
                  <div className="flagged-badge">
                    ⚠ Flagged for compliance check
                  </div>
                )}
                <div className="score-row">
                  <span>Safety Score: <span className="score-value">{driver.score}</span></span>
                  <span className={`risk-badge risk-${driver.risk}`}>
                    {driver.risk}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Midnight Verification Panel */}
        <section className="section">
          <h2 className="section-title">Midnight Privacy Verification</h2>
          <div className="verification-panel">
            
            <div className="action-row">
              <button 
                className="btn btn-primary"
                onClick={() => runVerification(true)}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? <div className="spinner" /> : <ShieldCheck size={18} />}
                {status === 'loading' ? 'Generating zero-knowledge proof...' : 'Run Verification (Valid)'}
              </button>
              
              <button 
                className="btn btn-secondary"
                onClick={() => runVerification(false)}
                disabled={status === 'loading'}
              >
                <ShieldAlert size={18} />
                Demo Invalid Case
              </button>
            </div>

            {status === 'success' && txHash && (
              <>
                <div className="panel-header">
                  <span className="status-badge">
                    <CheckCircle size={16} />
                    Verified via Zero-Knowledge Proof
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Trip ID: MS-84921
                  </span>
                </div>
                
                <p className="verification-desc">
                  Driver safety compliance confirmed without exposing underlying telemetry data.
                </p>

                <div className="hash-container">
                  <span className="hash-label">Transaction:</span>
                  <span className="hash-value">{txHash}</span>
                  <button 
                    className="copy-btn" 
                    onClick={handleCopy}
                    title="Copy to clipboard"
                  >
                    {copied ? <CheckCircle size={16} color="var(--color-green)" /> : <Copy size={16} />}
                  </button>
                </div>
              </>
            )}

            {status === 'error' && errorMsg && (
              <>
                <div className="panel-header">
                  <span className="status-badge error">
                    <XCircle size={16} />
                    Verification Rejected
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Trip ID: MS-84921
                  </span>
                </div>
                <div className="error-text">
                  <strong>Proof Generation Failed:</strong> {errorMsg}
                </div>
              </>
            )}

            <div className="how-it-works">
              <button 
                className="toggle-btn"
                onClick={() => setShowHowItWorks(!showHowItWorks)}
              >
                <Info size={16} />
                How this works
                {showHowItWorks ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {showHowItWorks && (
                <div className="toggle-content">
                  <div className="case-line">
                    <span>✅</span>
                    <span><strong>Valid compliance claim</strong> → proof generated, transaction confirmed</span>
                  </div>
                  <div className="case-line">
                    <span>✅</span>
                    <span><strong>Invalid compliance claim</strong> → rejected locally before reaching the network, no data exposed</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
