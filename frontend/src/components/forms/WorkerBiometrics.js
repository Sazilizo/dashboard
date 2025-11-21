import React, { useCallback } from 'react';
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
  const { user } = useAuth() || {};

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

        // Determine recorded_by: prefer explicit userId (uuid) or current auth user (auth uid)
        const recordedBy = r.recorded_by || user?.id || user?.profile?.auth_uid || null;

        if (r.type === 'signin') {
          // Call RPC to create signin row
          try {
            const params = {
              p_worker_id: Number(wid),
              p_operation: 'signin',
              p_timestamp: ts,
              p_attendance_id: null,
              p_recorded_by: recordedBy,
              p_note: r.note || null,
              p_sign_in_time: null,
            };
            const { data: rpcData, error: rpcErr } = await api.rpc('rpc_record_worker_attendance', params);
            if (rpcErr) throw rpcErr;
            results.push({ type: 'signin', result: rpcData });
            continue;
          } catch (rpcError) {
            // fallback to offline insertion
            try {
              const payload = {
                worker_id: Number(wid),
                recorded_by: recordedBy,
                date: ts.slice(0,10),
                sign_in_time: ts,
                created_at: ts,
                description: r.note || null,
              };
              const added = await addRow(payload);
              results.push({ type: 'signin', result: added });
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
                continue;
              }

              // final fallback: offline insert sign_out-only
              const payload2 = {
                worker_id: Number(wid),
                recorded_by: recordedBy,
                date: ts.slice(0,10),
                sign_in_time: r.sign_in_time || null,
                sign_out_time: ts,
                created_at: ts,
                description: r.note || null,
              };
              const added = await addRow(payload2);
              results.push({ type: 'signout', result: added });
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
      return results;
    } catch (err) {
      if (onCompleted) onCompleted({ error: err?.message || String(err) });
      return { error: err?.message || String(err) };
    }
  }, [addRow, updateRow, api, onCompleted, user, userId, workerId]);

  return (
    <BiometricsSignIn
      entityType="user"
      bucketName={bucketName}
      folderName={folderName}
      userId={userId}
      workerId={workerId}
      forceOperation={forceOperation}
      onCompleted={handleCompleted}
      onCancel={onCancel}
      {...rest}
    />
  );
}
