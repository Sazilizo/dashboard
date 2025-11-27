import React, { useCallback, useState } from 'react';
import BiometricsSignIn from './BiometricsSignIn';
import useOfflineTable from '../../hooks/useOfflineTable';
import api from '../../api/client';
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

  const { addRow, updateRow, rows: workerRows = [] } = useOfflineTable('worker_attendance_records');

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
    setStartReq((c) => c + 1);
  };

  const stopOp = () => {
    setStopReq((c) => c + 1);
    setOperation(null);
  };

  // internal wrapper to capture completion and stop recording automatically
  const handleInternalCompleted = async (res) => {
    // stop recording when completed (for single-shot flows)
    setStopReq((c) => c + 1);
    setOperation(null);
    // propagate to external handler
    try { if (onCompleted) onCompleted(res); } catch (e) { /* ignore */ }
  };

  const handleCompleted = useCallback(async (data) => {
    // Expect data to be { workerId, type: 'signin'|'signout', timestamp, attendanceId?, note }
    try {
      if (!data) return onCompleted && onCompleted(null);
      const rows = Array.isArray(data) ? data : [data];
      const results = [];

      for (const r of rows) {
        const wid = r.workerId || workerId || null;
        const ts = r.timestamp || new Date().toISOString();
        if (!wid) {
          results.push({ error: 'missing_worker_id', input: r });
          continue;
        }

        // Try to resolve a profile that references this worker (profiles.worker_id)
        let profileId = null;
        try {
          const { data: profileRow, error: profileErr } = await api.from('profiles').select('id').eq('worker_id', Number(wid)).maybeSingle();
          if (!profileErr && profileRow && profileRow.id) profileId = profileRow.id;
        } catch (e) {
          // ignore lookup failures; we'll proceed without a linked profile
        }

        // Determine recorded_by: prefer explicit userId (uuid) or current auth user (auth uid)
        // If we found a profile linked to this worker, prefer that profile id for linking
        const recordedBy = profileId || r.recorded_by || user?.id || user?.profile?.auth_uid || null;

        if (r.type === 'signin') {
          // Call RPC to create signin row
          try {
            const params = {
              p_worker_id: Number(wid),
              p_operation: 'signin',
              p_timestamp: ts,
              p_attendance_id: null,
              p_recorded_by: recordedBy,
              p_profile_id: profileId || null,
              p_note: r.note || null,
              p_sign_in_time: null,
            };
            const { data: rpcData, error: rpcErr } = await api.rpc('rpc_record_worker_attendance', params);
            if (rpcErr) throw rpcErr;
            results.push({ type: 'signin', result: rpcData });
            try {
              const pid = rpcData?.id || null;
              setParticipants((p) => [...p, { workerId: wid, displayName: null, signInTime: ts, attendanceId: pid }]);
            } catch (e) {}
            continue;
          } catch (rpcError) {
            // fallback to offline insertion
            try {
              const payload = {
                worker_id: Number(wid),
                profile_id: profileId || null,
                recorded_by: recordedBy,
                date: ts.slice(0,10),
                sign_in_time: ts,
                created_at: ts,
                description: r.note || null,
              };
              const added = await addRow(payload);
              results.push({ type: 'signin', result: added });
              try {
                const pid = added?.id || added?.tempId || null;
                setParticipants((p) => [...p, { workerId: wid, displayName: null, signInTime: ts, attendanceId: pid }]);
              } catch (e) {}
              continue;
            } catch (err2) {
              results.push({ type: 'signin', error: err2?.message || String(err2) });
              continue;
            }
          }
        } else if (r.type === 'signout') {
          try {
            const params = {
              p_worker_id: Number(wid),
              p_operation: 'signout',
              p_timestamp: ts,
              p_attendance_id: r.attendanceId || null,
              p_recorded_by: recordedBy,
              p_profile_id: profileId || null,
              p_note: r.note || null,
              p_sign_in_time: r.sign_in_time || null,
            };
            const { data: rpcData, error: rpcErr } = await api.rpc('rpc_record_worker_attendance', params);
            if (rpcErr) throw rpcErr;
            results.push({ type: 'signout', result: rpcData });
            continue;
          } catch (rpcError) {
            // fallback: try updating via API directly, then offline
            try {
              if (r.attendanceId) {
                const { data: upd, error: upderr } = await api.from('worker_attendance_records').update({ sign_out_time: ts }).eq('id', r.attendanceId).select().maybeSingle();
                if (upderr) throw upderr;
                results.push({ type: 'signout', result: upd });
                try { setParticipants((p) => p.filter(x => Number(x.workerId) !== Number(wid))); } catch (e) {}
                continue;
              }

              // try to find open record server-side
              const { data: openRows, error: qerr } = await api.from('worker_attendance_records')
                .select('id, sign_in_time')
                .eq('worker_id', Number(wid))
                .is('sign_out_time', null)
                .order('id', { ascending: false })
                .limit(1);
              if (!qerr && Array.isArray(openRows) && openRows.length) {
                const open = openRows[0];
                const { data: upd, error: uerr } = await api.from('worker_attendance_records').update({ sign_out_time: ts }).eq('id', open.id).select().maybeSingle();
                if (uerr) throw uerr;
                results.push({ type: 'signout', result: upd });
                try { setParticipants((p) => p.filter(x => Number(x.workerId) !== Number(wid))); } catch (e) {}
                continue;
              }

              // final fallback: offline insert sign_out-only
              const payload2 = {
                worker_id: Number(wid),
                profile_id: profileId || null,
                recorded_by: recordedBy,
                date: ts.slice(0,10),
                sign_in_time: r.sign_in_time || null,
                sign_out_time: ts,
                created_at: ts,
                description: r.note || null,
              };
              const added = await addRow(payload2);
              results.push({ type: 'signout', result: added });
              try { setParticipants((p) => p.filter(x => Number(x.workerId) !== Number(wid))); } catch (e) {}
              continue;
            } catch (err2) {
              results.push({ type: 'signout', error: err2?.message || String(err2) });
              continue;
            }
          }
        } else {
          results.push({ error: 'unsupported_type', input: r });
        }
      }

      if (onCompleted) onCompleted(results);
      // notify internal handler to stop recording / reset UI
      try { await handleInternalCompleted(results); } catch (e) { /* ignore */ }
      return results;
    } catch (err) {
      if (onCompleted) onCompleted({ error: err?.message || String(err) });
      return { error: err?.message || String(err) };
    }
  }, [addRow, updateRow, api, onCompleted, user, userId, workerId]);

  // UI rendered at bottom: Sign In / Sign Out controls and the hidden BiometricsSignIn
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => startOp('signin')}>Sign In</button>
        <button className="btn btn-secondary" onClick={() => startOp('signout')}>Sign Out</button>
        <button className="btn btn-link" onClick={() => stopOp()}>Cancel</button>
      </div>
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
        onCompleted={handleCompleted}
        onCancel={onCancel}
        {...rest}
      />
    </div>
  );
}
