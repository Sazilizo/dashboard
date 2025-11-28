import React, { useCallback, useState } from 'react';
import BiometricsSignIn from './BiometricsSignIn.clean';
import { useAuth } from '../../context/AuthProvider';

export default function WorkerBiometrics(props) {
  const {
    userId = null,
    workerId = null,
    onCompleted = null,
    onCancel = null,
    forceOperation = null,
    bucketName = 'worker-uploads',
    folderName = 'workers',
    ...rest
  } = props;

  // Local UI state for small control panel and participants list
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const { user } = useAuth() || {};

  // UI controls state (moved above handler so we can update UI from handler)
  const [operation, setOperation] = useState(null);
  const [startReq, setStartReq] = useState(0);
  const [stopReq, setStopReq] = useState(0);

  const startOp = (op) => {
    setOperation(op);
    // start continuous recording so multiple workers can be captured
    setShowBiometrics(true);
    setStartReq((c) => c + 1);
  };

  const stopOp = () => {
    setStopReq((c) => c + 1);
    setOperation(null);
    setShowBiometrics(false);
  };

  // internal wrapper to capture completion and stop recording automatically
  const handleInternalCompleted = async (res) => {
    // stop recording when completed (for single-shot flows)
    setStopReq((c) => c + 1);
    setOperation(null);
    setShowBiometrics(false);
    // propagate to external handler
    try { if (onCompleted) onCompleted(res); } catch (e) { /* ignore */ }
  };

  const handleCompleted = useCallback(async (data) => {
    // data: array of { id, status, message, timestamp }
    try {
      if (!data) return onCompleted && onCompleted(null);
      const rows = Array.isArray(data) ? data : [data];
      const mapped = rows.map((r) => {
        const wid = String(r.id || workerId || '');
        return {
          workerId: wid,
          type: operation || 'signin',
          timestamp: r.timestamp || new Date().toISOString(),
          status: r.status || 'failed',
          message: r.message || null,
        };
      });
      if (onCompleted) onCompleted(mapped);
      // Only auto-stop the biometric panel for single-shot flows.
      // If `operation` is set (user started a continuous flow via the UI),
      // keep the panel open so multiple workers can be captured without
      // unmounting the camera. If `forceOperation` is provided (parent
      // requested a forced single-shot), treat as single-shot and stop.
      if (forceOperation || !operation) {
        try { await handleInternalCompleted(mapped); } catch (e) {}
      } else {
        // continuous flow: keep showing biometric panel; parent will call stopOp
      }
      return mapped;
    } catch (err) {
      if (onCompleted) onCompleted({ error: err?.message || String(err) });
      return { error: err?.message || String(err) };
    }
  }, [onCompleted, workerId, operation]);

  // UI rendered at bottom: Sign In / Sign Out controls and the hidden BiometricsSignIn
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative', zIndex: 9999, pointerEvents: 'auto' }}>
        <button className="btn btn-primary" onClick={() => { console.log('[WorkerBiometrics] Sign In clicked'); startOp('signin'); }}>Sign In</button>
        <button className="btn btn-secondary" onClick={() => { console.log('[WorkerBiometrics] Sign Out clicked'); startOp('signout'); }}>Sign Out</button>
        <button className="btn btn-link" onClick={() => { console.log('[WorkerBiometrics] Cancel clicked'); stopOp(); }}>Cancel</button>
      </div>
      {showBiometrics && (
        <BiometricsSignIn
          entityType="user"
          bucketName={bucketName}
          folderName={folderName}
          userId={userId}
          workerId={workerId}
          forceOperation={operation}
          startRecordingRequest={startReq}
          stopRecordingRequest={stopReq}
          hidePrimaryControls={true}
          scrollIntoViewOnMount={true}
          onCompleted={handleCompleted}
          onCancel={onCancel}
          {...rest}
        />
      )}
    </div>
  );
}
