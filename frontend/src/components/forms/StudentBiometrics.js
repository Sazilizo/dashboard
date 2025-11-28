import React, { useCallback, useState } from 'react';
import BiometricsSignIn from './BiometricsSignIn.clean';

export default function StudentBiometrics(props) {
  const {
    studentId = null,
    schoolId = null,
    sessionNote = null,
    academicSessionId = null,
    onCompleted = null,
    onCancel = null,
    bucketName = 'student-uploads',
    folderName = 'faces',
    ...rest
  } = props;

  // Local UI state: control showing the biometric panel and signed-in participants
  const [showBiometrics, setShowBiometrics] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);

  const openBiometrics = (mode = 'signin') => {
    try { console.log('[StudentBiometrics] openBiometrics', mode); } catch (e) {}
    setShowBiometrics(true);
  };

  const handleCompleted = useCallback(async (data) => {
    // data: array of { id, status, message, timestamp }
    try {
      if (!data) return onCompleted && onCompleted(null);
      const rows = Array.isArray(data) ? data : [data];
      const mapped = rows.map((r) => {
        const sid = String(r.id || studentId || '');
        return {
          studentId: sid,
          type: operation || 'signin',
          timestamp: r.timestamp || new Date().toISOString(),
          status: r.status || 'failed',
          message: r.message || null,
        };
      });
      // forward to parent to handle DB writes
      if (onCompleted) onCompleted(mapped);
      // For session (continuous) mode keep the biometric UI open so multiple
      // students can be captured without unmounting the camera (avoids flicker).
      if (operation === 'session') {
        // keep showing biometric panel; parent controls when to stop via endSession
      } else {
        // single-shot flows close the biometric UI
        setShowBiometrics(false);
        setStopReq(c => c + 1);
      }
      return mapped;
    } catch (err) {
      if (onCompleted) onCompleted({ error: err?.message || String(err) });
      return { error: err?.message || String(err) };
    }
  }, [onCompleted, studentId, operation]);

  // UI: if an academicSessionId is provided, expose Record Session / End Session buttons
  // otherwise expose Sign In / Sign Out buttons (single or group)
  const [operation, setOperation] = useState(null);
  const [startReq, setStartReq] = useState(0);
  const [stopReq, setStopReq] = useState(0);

  const startSession = () => {
    setOperation('session');
    setShowBiometrics(true);
    setStartReq(c => c + 1);
  };
  const endSession = () => {
    setStopReq(c => c + 1);
    setOperation(null);
    setShowBiometrics(false);
  };

  const startSignOp = (op) => {
    setOperation(op);
    // start continuous so multiple students can be captured in a flow
    setShowBiometrics(true);
    setStartReq(c => c + 1);
  };
  const cancelOp = () => {
    setStopReq(c => c + 1);
    setOperation(null);
    setShowBiometrics(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative', zIndex: 9999, pointerEvents: 'auto' }}>
        {academicSessionId ? (
          <>
            <button className="btn btn-primary" onClick={() => { console.log('[StudentBiometrics] Record Session clicked'); startSession(); }}>Record Session</button>
            <button className="btn btn-secondary" onClick={() => { console.log('[StudentBiometrics] End Session clicked'); endSession(); }}>End Session</button>
            <button className="btn btn-link" onClick={() => { console.log('[StudentBiometrics] Cancel clicked'); cancelOp(); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => { console.log('[StudentBiometrics] Sign In clicked'); startSignOp('signin'); }}>Sign In</button>
            <button className="btn btn-secondary" onClick={() => { console.log('[StudentBiometrics] Sign Out clicked'); startSignOp('signout'); }}>Sign Out</button>
            <button className="btn btn-link" onClick={() => { console.log('[StudentBiometrics] Cancel clicked'); cancelOp(); }}>Cancel</button>
          </>
        )}
      </div>

      {showBiometrics && (
        <BiometricsSignIn
          entityType="student"
          bucketName={bucketName}
          folderName={folderName}
          studentId={studentId}
          schoolId={schoolId}
          academicSessionId={academicSessionId}
          forceOperation={operation === 'session' ? null : operation}
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
