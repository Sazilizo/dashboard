import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import WorkerBiometrics from '../../components/forms/WorkerBiometrics';

export default function GroupSignPerform() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const selected = (state && state.selected) || [];
  const [operation, setOperation] = useState(null); // 'signin' | 'signout'
  const [resultSummary, setResultSummary] = useState(null);

  const handleCompleted = (results) => {
    // Analyze results: count successes and failures
    const rows = Array.isArray(results) ? results : (results ? [results] : []);
    const successes = rows.filter(r => !r.error && !(r.type && r.error));
    const failures = rows.filter(r => r.error || (r.type && r.error));
    setResultSummary({ total: rows.length, successes: successes.length, failures: failures.map(f => f) });
  };

  const handleBackOrMore = (more) => {
    if (more) {
      // go back to selector so user can pick more
      navigate('/dashboard/workers/group-sign');
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="page-content">
      <h1>Perform Group Sign</h1>
      <p>Selected workers: {selected.length}</p>

      {!operation && !resultSummary && (
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() => setOperation('signin')}
            disabled={selected.length === 0}
            style={{ marginRight: 8 }}
          >
            Sign In
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setOperation('signout')}
            disabled={selected.length === 0}
          >
            Sign Out
          </button>
        </div>
      )}

      {operation && !resultSummary && (
        <div style={{ width: '80vw', maxWidth: 1200, margin: '0 auto' }}>
          <WorkerBiometrics
            forceOperation={operation}
            onCompleted={handleCompleted}
            hidePrimaryControls={true}
            continuous={true}
          />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setOperation(null)}>Cancel</button>
          </div>
        </div>
      )}

      {resultSummary && (
        <div style={{ marginTop: 16 }}>
          <h3>Results</h3>
          <p>Total processed: {resultSummary.total}</p>
          <p>Successful: {resultSummary.successes}</p>
          <p>Failed: {resultSummary.failures.length}</p>
          {resultSummary.failures.length > 0 && (
            <div>
              <p>Failures:</p>
              <ul>
                {resultSummary.failures.map((f, i) => (
                  <li key={i}>{JSON.stringify(f)}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => handleBackOrMore(true)} style={{ marginRight: 8 }}>Select more</button>
            <button className="btn btn-secondary" onClick={() => handleBackOrMore(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
