import React, { useCallback, useState } from 'react';
import BiometricsSignIn from './BiometricsSignIn';
import useOfflineTable from '../../hooks/useOfflineTable';
import api from '../../api/client';

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

  const { addRow, updateRow } = useOfflineTable('attendance_records');

  const handleCompleted = useCallback(async (data) => {
    // data: { studentId, type: 'signin'|'signout', timestamp, note }
    try {
      if (!data) return onCompleted && onCompleted(null);
      const rows = Array.isArray(data) ? data : [data];
      const results = [];

      for (const r of rows) {
        const sid = r.studentId || studentId || null;
        const ts = r.timestamp || new Date().toISOString();
        if (!sid) {
          results.push({ error: 'missing_student_id', input: r });
          continue;
        }

        const payload = {
          student_id: Number(sid),
          school_id: schoolId || r.schoolId || null,
          date: (ts || new Date().toISOString()).slice(0,10),
          status: 'present',
          note: r.note || sessionNote || null,
          created_at: ts,
        };

        if (r.type === 'signin') {
          try {
            const added = await addRow(payload);
            results.push({ type: 'signin', result: added });
          } catch (err) {
            try {
              const { data: inserted, error } = await api.from('attendance_records').insert(payload).select().maybeSingle();
              if (error) throw error;
              results.push({ type: 'signin', result: inserted });
            } catch (err2) {
              results.push({ type: 'signin', error: err2?.message || String(err2) });
            }
          }
        } else if (r.type === 'signout') {
          // Try to find open record on server and update, else insert sign_out_time only
          const signOutTime = ts;
          try {
            const { data: openRows, error: qerr } = await api.from('attendance_records')
              .select('id, sign_in_time')
              .eq('student_id', Number(sid))
              .eq('date', payload.date)
              .order('id', { ascending: false });

            if (!qerr && Array.isArray(openRows) && openRows.length) {
              const open = openRows.find(x => !x.sign_out_time) || openRows[0];
              if (open && !open.sign_out_time) {
                const { data: upd, error: uerr } = await api.from('attendance_records').update({ sign_out_time: signOutTime }).eq('id', open.id).select().maybeSingle();
                if (uerr) throw uerr;
                results.push({ type: 'signout', result: upd });
                continue;
              }
            }

            // No open record: insert sign_out-only record
            const payload2 = { ...payload, sign_out_time: signOutTime };
            const { data: inserted, error: ierr } = await api.from('attendance_records').insert(payload2).select().maybeSingle();
            if (ierr) throw ierr;
            results.push({ type: 'signout', result: inserted });
          } catch (err) {
            // fallback to offline insert
            try {
              const payload3 = { ...payload, sign_out_time: signOutTime };
              const added = await addRow(payload3);
              results.push({ type: 'signout', result: added });
            } catch (err2) {
              results.push({ type: 'signout', error: err2?.message || String(err2) });
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
  }, [addRow, api, onCompleted, schoolId, studentId]);

  // UI: if an academicSessionId is provided, expose Record Session / End Session buttons
  // otherwise expose Sign In / Sign Out buttons (single or group)
  const [operation, setOperation] = useState(null);
  const [startReq, setStartReq] = useState(0);
  const [stopReq, setStopReq] = useState(0);

  const startSession = () => {
    setOperation('session');
    setStartReq(c => c + 1);
  };
  const endSession = () => {
    setStopReq(c => c + 1);
    setOperation(null);
  };

  const startSignOp = (op) => {
    setOperation(op);
    // start continuous so multiple students can be captured in a flow
    setStartReq(c => c + 1);
  };
  const cancelOp = () => {
    setStopReq(c => c + 1);
    setOperation(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {academicSessionId ? (
          <>
            <button className="btn btn-primary" onClick={startSession}>Record Session</button>
            <button className="btn btn-secondary" onClick={endSession}>End Session</button>
            <button className="btn btn-link" onClick={cancelOp}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => startSignOp('signin')}>Sign In</button>
            <button className="btn btn-secondary" onClick={() => startSignOp('signout')}>Sign Out</button>
            <button className="btn btn-link" onClick={cancelOp}>Cancel</button>
          </>
        )}
      </div>

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
        onCompleted={handleCompleted}
        onCancel={onCancel}
        {...rest}
      />
    </div>
  );
}
