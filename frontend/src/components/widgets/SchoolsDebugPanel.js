import React, { useState, useEffect } from 'react';
import { useSchools } from '../context/SchoolsContext';
import { openDB } from 'idb';
import '../styles/DebugPanel.css';

export default function SchoolsDebugPanel() {
  const { schools, loading, error, refreshSchools, isOnline } = useSchools();
  const [cacheInfo, setCacheInfo] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const checkCache = async () => {
    try {
      const db = await openDB("GCU_Schools_offline", 2);
      const cachedSchools = await db.getAll("schools");
      setCacheInfo({
        count: cachedSchools.length,
        schools: cachedSchools.slice(0, 5).map(s => ({ id: s.id, name: s.name })),
      });
    } catch (err) {
      setCacheInfo({ error: err.message });
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkCache();
    }
  }, [isOpen, schools]);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          padding: '8px 16px',
          background: '#0077BE',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          zIndex: 9999,
          fontSize: 12,
        }}
      >
        🔍 Schools Debug
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>Schools Debug Panel</h3>
        <button onClick={() => setIsOpen(false)}>✖</button>
      </div>
      
      <div className="debug-content">
        <div className="debug-section">
          <h4>Context State</h4>
          <div className="debug-item">
            <span>Loading:</span> <strong>{loading ? 'Yes' : 'No'}</strong>
          </div>
          <div className="debug-item">
            <span>Online:</span> <strong>{isOnline ? 'Yes' : 'No'}</strong>
          </div>
          <div className="debug-item">
            <span>Schools Count:</span> <strong>{schools?.length || 0}</strong>
          </div>
          <div className="debug-item">
            <span>Error:</span> <strong style={{ color: 'red' }}>{error?.message || 'None'}</strong>
          </div>
        </div>

        <div className="debug-section">
          <h4>IndexedDB Cache</h4>
          {cacheInfo ? (
            <>
              <div className="debug-item">
                <span>Cached Count:</span> <strong>{cacheInfo.count || 0}</strong>
              </div>
              {cacheInfo.error && (
                <div className="debug-item" style={{ color: 'red' }}>
                  <span>Cache Error:</span> {cacheInfo.error}
                </div>
              )}
              {cacheInfo.schools && cacheInfo.schools.length > 0 && (
                <div className="debug-item">
                  <span>Sample Schools:</span>
                  <ul style={{ fontSize: 11, marginTop: 4 }}>
                    {cacheInfo.schools.map(s => (
                      <li key={s.id}>{s.id} - {s.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p>Loading cache info...</p>
          )}
          <button 
            onClick={checkCache}
            className="debug-button"
          >
            Refresh Cache Info
          </button>
        </div>

        <div className="debug-section">
          <h4>Schools List</h4>
          {schools && schools.length > 0 ? (
            <ul style={{ fontSize: 11, maxHeight: 200, overflow: 'auto' }}>
              {schools.map(s => (
                <li key={s.id}>{s.id} - {s.name}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: '#999' }}>No schools loaded</p>
          )}
        </div>

        <div className="debug-actions">
          <button 
            onClick={() => refreshSchools(true)}
            className="debug-button primary"
          >
            Force Refresh Schools
          </button>
        </div>
      </div>
    </div>
  );
}
