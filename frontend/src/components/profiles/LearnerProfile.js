import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import { onlineApi } from "../../api/client";
import SpecsRadarChart from "../charts/SpecsRadarGraph";
import AttendanceBarChart from "../charts/AttendanceBarChart";
import Photos from "./Photos";
import LearnerAttendance from "./LearnerAttendance";
import BiometricsSignIn from "../forms/BiometricsSignIn";
import Card from "../widgets/Card";
import ProfileInfoCard from "../widgets/ProfileInfoCard";
import StatsDashboard from "../StatsDashboard";
import { useAuth } from "../../context/AuthProvider";
import BirthdayConfetti from "../widgets/BirthdayConfetti";
import { isBirthday } from "../../utils/birthdayUtils";
import Loader from "../widgets/Loader";
import "../../styles/Profile.css"
// import InfoCount from "../widgets/infoCount";

const LearnerProfile = () => {
  const { id } = useParams();
  const { user } = useAuth();
  // const { isOnline } = useOnlineStatus();
  const [student, setStudent] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendanceMode, setAttendanceMode] = useState(null);
  const [toggleSessionList, setToggleSessionList] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);
  const [progressReport, setProgressReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // --- Build chart config dynamically ---
  const statsCharts = useMemo(() => {
    if (!student) return [];

    // Specs chart
    const specsDataChart = {
      title: "Performance Overview",
      Component: SpecsRadarChart,
      props: { student, user, className: "specs-radar-grid" },
    };

    // Attendance chart
    const attendanceDataChart = {
      title: "Attendance Overview",
      Component: AttendanceBarChart,
      props: { student, className: "Attendance-overview-graph" },
    };

    return [specsDataChart, attendanceDataChart];
  }, [student, user]);

  // --- Generate Progress Report (on-demand) ---
  const computeProgressReport = (s) => {
    const studentData = s || {};

    if (!studentData || !(studentData.completed_academic_sessions?.length > 0)) {
      return {
        summary: "No sessions completed yet. Start recording sessions to see progress!",
        strengths: [],
        improvements: [],
        overall: "pending",
      };
    }

    // Calculate average specs
    const allSpecs = (studentData.completed_academic_sessions || [])
      .map((sess) => sess.specs)
      .filter(Boolean);

    if (!allSpecs.length) {
      return {
        summary: "Sessions recorded but no performance data available yet.",
        strengths: [],
        improvements: [],
        overall: "pending",
      };
    }

    // Aggregate all spec values
    const specSums = {};
    const specCounts = {};

    allSpecs.forEach((specs) => {
      Object.entries(specs || {}).forEach(([key, value]) => {
        if (typeof value === "number" && !Number.isNaN(value)) {
          specSums[key] = (specSums[key] || 0) + value;
          specCounts[key] = (specCounts[key] || 0) + 1;
        }
      });
    });

    // Calculate averages per-spec
    const specAverages = {};
    Object.keys(specSums).forEach((key) => {
      specAverages[key] = specSums[key] / specCounts[key];
    });

    // Detect scale and normalize to 0-10 if necessary (some data may be 0-100)
    const maxAvg = Math.max(...Object.values(specAverages), 0);
    const scaleFactor = maxAvg > 10 ? 10 / maxAvg : 1; // if maxAvg is 80, factor = 0.125 -> scales to ~10

    const normalizedAverages = {};
    Object.entries(specAverages).forEach(([k, v]) => {
      normalizedAverages[k] = +(v * scaleFactor).toFixed(2);
    });

    // Determine strengths (>= 7) and areas for improvement (<= 5) on normalized scale
    const strengths = Object.entries(normalizedAverages)
      .filter(([_, avg]) => avg >= 7)
      .map(([key]) => key.replace(/_/g, " "))
      .slice(0, 3);

    const improvements = Object.entries(normalizedAverages)
      .filter(([_, avg]) => avg <= 5)
      .map(([key]) => key.replace(/_/g, " "))
      .slice(0, 3);

    const overallAverageRaw =
      Object.keys(normalizedAverages).length > 0
        ? Object.values(normalizedAverages).reduce((a, b) => a + b, 0) / Object.keys(normalizedAverages).length
        : 0;

    // Attendance percentage: compute unique attended sessions and cap at 100%
    const totalSessions = Math.max(1, studentData.academic_sessions?.length ?? 0);
    const attendedSet = new Set(
      (studentData.attendance_records || [])
        .map((r) => r?.session_id ?? r?.academic_session_id ?? r?.session ?? r?.date ?? null)
        .filter(Boolean)
    );
    let attendanceRate = totalSessions === 0 ? 0 : Math.round((attendedSet.size / totalSessions) * 100);
    if (!isFinite(attendanceRate) || attendanceRate < 0) attendanceRate = 0;
    attendanceRate = Math.min(100, attendanceRate);

    // Generate summary
    let summary = "";
    if (overallAverageRaw >= 7) {
      summary = `${studentData.full_name ?? (studentData.name + ' ' + (studentData.last_name || ''))} is performing excellently with an average score of ${overallAverageRaw.toFixed(1)}/10. `;
    } else if (overallAverageRaw >= 5) {
      summary = `${studentData.full_name ?? (studentData.name + ' ' + (studentData.last_name || ''))} is showing good progress with an average score of ${overallAverageRaw.toFixed(1)}/10. `;
    } else {
      summary = `${studentData.full_name ?? (studentData.name + ' ' + (studentData.last_name || ''))} is developing with an average score of ${overallAverageRaw.toFixed(1)}/10 and would benefit from additional support. `;
    }

    summary += `Attendance is at ${attendanceRate}% across ${studentData.academic_sessions?.length ?? 0} sessions.`;

    return {
      summary,
      strengths,
      improvements,
      overall: overallAverageRaw >= 7 ? "excellent" : overallAverageRaw >= 5 ? "good" : "developing",
      attendanceRate,
      normalizedAverages,
    };
  };

  const handleGenerateReport = () => {
    setGeneratingReport(true);
    try {
      const rpt = computeProgressReport(student);
      setProgressReport(rpt);
      return rpt;
    } finally {
      setGeneratingReport(false);
    }
  };

  // Modal state for printable report
  const [showReportModal, setShowReportModal] = useState(false);

  const openReportModal = async () => {
    // regenerate fresh report
    const rpt = handleGenerateReport();
    // ensure progressReport is set (handleGenerateReport sets it synchronously)
    setShowReportModal(true);
    return rpt;
  };

  const closeReportModal = () => setShowReportModal(false);

  const handlePrintReport = () => {
    // Open printable window with report markup
    const content = document.getElementById('learner-report-content');
    if (!content) return window.print();
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return window.print();
    const doc = win.document.open();
    const html = `
      <html>
        <head>
          <title>Student Progress Report</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; margin: 20px; color: #222 }
            .report-container { width: 100%; max-width: 900px; margin: 0 auto }
            .report-header { display:flex; align-items:center; gap:16px }
            .avatar { width:96px; height:96px; object-fit:cover; border-radius:8px; background:#eee }
            .badge { display:inline-block; padding:6px 10px; border-radius:6px; background:#eee; margin-left:8px }
            .section { margin-top:16px }
          </style>
        </head>
        <body>
          <div class="report-container">${content.innerHTML}</div>
        </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
    // wait a tick for assets to load then print
    setTimeout(() => { win.focus(); win.print(); }, 300);
  };

  // Reports are generated only when the user requests them via the Generate Report button.

  useEffect(() => {
    const fetchStudent = async () => {
      try {
        // Candidate SELECT variants (try them in order)
        const variantA = `
          *,
          school:school_id(*),
          tutor:tutor_id(id, name, last_name, photo, role_id),
          academic_sessions:academic_session_participants(student_id, *),
          attendance_records:attendance_records(student_id, *),
          assessments:assessments(student_id, *),
          pe_sessions:pe_sessions(student_id, *),
          completed_academic_sessions: academic_session_participants(
            id,
            student_id,
            specs,
            score,
            session_id,
            academic_session:session_id (
              session_name,
              date
            )
          ),
          meal_distributions:meal_distributions(
            student_id,
            *,
            meal:meal_id(name, type, ingredients)
          )
        `;

        // Variant using explicit workers table alias for tutor and academic_sessions table name
        const variantB = `
          *,
          school:school_id(*),
          tutor:workers!tutor_id(id, name, last_name, photo, role_id),
          academic_sessions:academic_sessions(student_id, *),
          attendance_records:attendance_records(student_id, *),
          assessments:assessments(student_id, *),
          pe_sessions:pe_sessions(student_id, *),
          completed_academic_sessions: academic_session_participants(
            id,
            student_id,
            specs,
            score,
            session_id,
            academic_session:session_id (
              session_name,
              date
            )
          ),
          meal_distributions:meal_distributions(
            student_id,
            *,
            meal:meal_id(name, type, ingredients)
          )
        `;

        // Variant using simpler academic_sessions alias (older schema variant)
        const variantC = `
          *,
          school:school_id(*),
          tutor:tutor_id(id, name, last_name, photo, role_id),
          academic_sessions:academic_sessions(student_id, *),
          attendance_records:attendance_records(student_id, *),
          assessments:assessments(student_id, *),
          pe_sessions:pe_sessions(student_id, *),
          completed_academic_sessions: academic_session_participants(
            id,
            student_id,
            specs,
            score,
            session_id,
            academic_session:session_id (
              session_name,
              date
            )
          ),
          meal_distributions:meal_distributions(
            student_id,
            *,
            meal:meal_id(name, type, ingredients)
          )
        `;

        const variants = [variantA, variantB, variantC];

        let data = null;
        let error = null;
        let usedVariant = null;

        // Try each variant online-first when possible, then offline if needed
        for (const v of variants) {
          // try online first if available
          if (typeof navigator !== 'undefined' && navigator.onLine && typeof onlineApi !== 'undefined') {
            try {
              const r = await onlineApi.from('students').select(v).eq('id', id).single();
              if (!r?.error && r?.data) {
                data = r.data;
                usedVariant = 'online';
                console.log('LearnerProfile: online variant succeeded');
                break;
              }
            } catch (e) {
              console.warn('LearnerProfile: online variant failed, trying next variant', e?.message || e);
            }
          }

          // try offline-capable client (may return cached result)
          try {
            const r2 = await api.from('students').select(v).eq('id', id).single();
            if (!r2?.error && r2?.data) {
              data = r2.data;
              usedVariant = 'offline';
              console.log('LearnerProfile: offline variant succeeded', { fromCache: r2?.fromCache });
              break;
            }
          } catch (e) {
            console.warn('LearnerProfile: offline variant failed, trying next variant', e?.message || e);
          }
        }

        if (!data) {
          // As a last-resort fallback, fetch the base student row and then fetch relations separately.
          console.warn('LearnerProfile: no variant returned data — falling back to separate queries');
          // Try to fetch base student
          let base = null;
          
          // Try online first
          try {
            if (typeof navigator !== 'undefined' && navigator.onLine && typeof onlineApi !== 'undefined') {
              const r = await onlineApi.from('students').select('*').eq('id', id).single();
              if (!r?.error && r?.data) base = r.data;
            }
          } catch (e) {
            console.warn('LearnerProfile: online base fetch failed', e?.message || e);
          }
          
          // Try offline API if online failed
          if (!base) {
            try {
              const r2 = await api.from('students').select('*').eq('id', id).single();
              if (!r2?.error && r2?.data) base = r2.data;
            } catch (e) {
              console.warn('LearnerProfile: offline API fetch failed', e?.message || e);
            }
          }
          
          // Last resort: check IndexedDB cache directly
          if (!base) {
            try {
              const { getTable } = await import('../../utils/tableCache');
              const cachedStudents = await getTable('students');
              base = cachedStudents?.find(s => s.id === parseInt(id));
              if (base) {
                console.log('LearnerProfile: Found student in IndexedDB cache');
              }
            } catch (e) {
              console.warn('LearnerProfile: IndexedDB cache lookup failed', e?.message || e);
            }
          }

          if (!base) throw new Error('No student base row returned');

          // Now fetch relations individually (online-first)
          const fetchEither = async (table, select = '*', filterField = 'student_id') => {
            // return array or null
            if (typeof navigator !== 'undefined' && navigator.onLine && typeof onlineApi !== 'undefined') {
              try {
                const r = await onlineApi.from(table).select(select).eq(filterField, id);
                if (!r?.error && r?.data) return r.data;
              } catch (e) { console.warn('LearnerProfile: online relation fetch failed', table, e?.message || e); }
            }
            try {
              const r2 = await api.from(table).select(select).eq(filterField, id);
              if (!r2?.error && r2?.data) return r2.data;
            } catch (e) { 
              console.warn('LearnerProfile: offline relation fetch failed', table, e?.message || e);
            }
            
            // Last resort: try to get from IndexedDB cache
            try {
              const { getTable } = await import('../../utils/tableCache');
              const cached = await getTable(table);
              const filtered = (cached || []).filter(item => item[filterField] === parseInt(id));
              if (filtered.length > 0) {
                console.log(`LearnerProfile: Found ${filtered.length} ${table} records in cache`);
                return filtered;
              }
            } catch (e) {
              console.warn(`LearnerProfile: cache lookup failed for ${table}`, e?.message || e);
            }
            
            return [];
          };

          // tutor is a worker referenced by tutor_id on student
          let tutorObj = null;
          if (base?.tutor_id) {
            if (typeof navigator !== 'undefined' && navigator.onLine && typeof onlineApi !== 'undefined') {
              try {
                const r = await onlineApi.from('workers').select('id, name, last_name, photo, role_id').eq('id', base.tutor_id).single();
                if (!r?.error && r?.data) tutorObj = r.data;
              } catch (e) { console.warn('LearnerProfile: online tutor fetch failed', e?.message || e); }
            }
            if (!tutorObj) {
              try {
                const r2 = await api.from('workers').select('id, name, last_name, photo, role_id').eq('id', base.tutor_id).single();
                if (!r2?.error && r2?.data) tutorObj = r2.data;
              } catch (e) { console.warn('LearnerProfile: offline tutor API fetch failed', e?.message || e); }
            }
            
            // Last resort: check cache
            if (!tutorObj) {
              try {
                const { getTable } = await import('../../utils/tableCache');
                const cachedWorkers = await getTable('workers');
                tutorObj = cachedWorkers?.find(w => w.id === base.tutor_id);
                if (tutorObj) {
                  console.log('LearnerProfile: Found tutor in cache');
                }
              } catch (e) {
                console.warn('LearnerProfile: tutor cache lookup failed', e?.message || e);
              }
            }
          }

          const [attendance_records, assessments, pe_sessions, meal_distributions] = await Promise.all([
            fetchEither('attendance_records', '*', 'student_id'),
            fetchEither('assessments', '*', 'student_id'),
            fetchEither('pe_sessions', '*', 'student_id'),
            fetchEither('meal_distributions', '*, meal:meal_id(name, type, ingredients)', 'student_id'),
          ]);

          // completed participants with nested academic_session info
          let completed = [];
          try {
            if (typeof navigator !== 'undefined' && navigator.onLine && typeof onlineApi !== 'undefined') {
              const r = await onlineApi.from('academic_session_participants').select('id, student_id, specs, score, session_id, academic_session:session_id(session_name, date)').eq('student_id', id);
              if (!r?.error && r?.data) completed = r.data;
            }
          } catch (e) { console.warn('LearnerProfile: online completed fetch failed', e?.message || e); }
          if (!completed || completed.length === 0) {
            try {
              const r2 = await api.from('academic_session_participants').select('id, student_id, specs, score, session_id, academic_session:session_id(session_name, date)').eq('student_id', id);
              if (!r2?.error && r2?.data) completed = r2.data;
            } catch (e) { console.warn('LearnerProfile: offline completed fetch failed', e?.message || e); }
          }

          // derive academic_sessions from completed if needed
          let academicSessions = base.academic_sessions ?? [];
          if ((!academicSessions || academicSessions.length === 0) && Array.isArray(completed) && completed.length > 0) {
            academicSessions = completed.map((p) => {
              const sess = p?.academic_session ?? null;
              if (!sess) return null;
              return {
                id: sess.id ?? p.session_id ?? null,
                session_name: sess.session_name ?? null,
                date: sess.date ?? null,
                specs: p.specs ?? null,
              };
            }).filter(Boolean);
          }

          const flattened = {
            ...base,
            tutor: tutorObj ?? base.tutor ?? null,
            attendance_records: attendance_records ?? [],
            assessments: assessments ?? [],
            pe_sessions: pe_sessions ?? [],
            meal_distributions: meal_distributions ?? [],
            academic_sessions: academicSessions,
            completed_academic_sessions: (completed ?? []).map((p) => ({
              ...p,
              session_name: p?.academic_session?.session_name ?? null,
              date: p?.academic_session?.date ?? null,
            })),
          };

          setStudent(flattened);
          if (flattened.tutor) setTutor(flattened.tutor);
          // finished fallback
          return;
        }

        // If academic_sessions missing, try to derive from completed_academic_sessions
        let academicSessions = data.academic_sessions ?? [];
        const completed = data.completed_academic_sessions ?? [];
        if ((!academicSessions || academicSessions.length === 0) && Array.isArray(completed) && completed.length > 0) {
          academicSessions = completed
            .map((p) => {
              const sess = p?.academic_session ?? null;
              if (!sess) return null;
              return {
                id: sess.id ?? p.session_id ?? null,
                session_name: sess.session_name ?? null,
                date: sess.date ?? null,
                // include participant-level specs so charts can access them if needed
                specs: p.specs ?? null,
              };
            })
            .filter(Boolean);
        }

        // Flatten academic_session participant fields as before
        const flattened = {
          ...(data || {}),
          academic_sessions: academicSessions,
          completed_academic_sessions: (completed ?? []).map((p) => ({
            ...p,
            session_name: p?.academic_session?.session_name ?? null,
            date: p?.academic_session?.date ?? null,
          })),
        };

        setStudent(flattened);
        if (flattened.tutor) setTutor(flattened.tutor);
      } catch (err) {
        setError(err.message || err);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchStudent();
  }, [id]);
    

  useEffect(() => {
    document.title = student ? `${student.full_name} - Profile` : "Learner Profile";
  }, [student]);

  useEffect(()=>{
    console.log("Student: ", student)
  })

  if (loading) return <Loader variant="pulse" size="xlarge" text="Loading student profile..." fullScreen />;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!student) return <p>Student not found</p>;

  return (
    <>
      {/* Birthday Celebration - 5 second animation */}
      {isBirthday(student?.date_of_birth) && (
        <BirthdayConfetti duration={5000} persistent={false} />
      )}

      <div className="profile-learner-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={() => window.history.back()}>
          Back to Students
        </button>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          Print Profile
        </button>

        {/* Generate report button - opens printable modal */}
        <button className="btn btn-info" onClick={() => openReportModal()}>
          Generate Report
        </button>
      </div>

      <div className="student-edit-section">
        <Link to={`/dashboard/sessions/create/single/${id}`} className="btn btn-primary">
          Record Session
        </Link>
        <Link to={`/dashboard/sessions/mark/${id}`} className="btn btn-primary">
          Mark Session
        </Link>
        <Link to={`/dashboard/meals/distribute/${id}`} className="btn btn-secondary">
          Distribute Meal
        </Link>
        <Link to={`/dashboard/students/update/${id}`} className="btn btn-secondary">
          Edit Profile
        </Link>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("calendar")}>
          Calendar Attendance
        </button>
        <button className="btn btn-success mb-2" onClick={() => setAttendanceMode("biometrics")}>
          Biometric Attendance
        </button>
      </div>

      <div className="grid-layout">
        <div className="profile-wrapper">
          {/* Tutor Info Card */}
          {tutor && (
            <Card className="tutor-card">
              <Link to={`/dashboard/workers/${tutor.id}`} className="tutor-link">
                <div className="tutor-info">
                  <div className="tutor-avatar">
                    {tutor.photo ? (
                      <img src={tutor.photo} alt={`${tutor.name} ${tutor.last_name}`} />
                    ) : (
                      <div className="tutor-avatar-placeholder">
                        {tutor.name?.[0]}{tutor.last_name?.[0]}
                      </div>
                    )}
                  </div>
                  <div className="tutor-details">
                    <p className="tutor-label">Assigned Tutor</p>
                    <p className="tutor-name">{tutor.name} {tutor.last_name}</p>
                  </div>
                </div>
              </Link>
            </Card>
          )}

          <Card className="profile-details-card-wrapper">
            <ProfileInfoCard data={student} bucketName="student-uploads" folderName="students" />
          </Card>

          {/* Progress report is available via the Generate Report button in the header; nothing rendered inline. */}
          <Card className="profile-details-count-card">
            <div className="info-count-card">
              {/* {icon && <div className="info-count-icon">{icon}</div>} */}
              <div className="info-count-details">
                <p className="info-count-label">Academic Sessions</p>
                <p className="info-count-number">{student.academic_sessions?.length || 0}</p>
              </div>
            </div>
            <div className="info-count-card">
                <div className="info-count-details">
                  <p className="info-count-label">Meals Received</p>
                  <p className="info-count-number">{student.meal_distributions?.length || 0}</p>
                </div>
            </div>
            <div className="info-count-card">
              <div className="info-count-details">
                <p className="info-count-label">Days Attended</p>
                <p className="info-count-number">{student.attendance_records?.length || 0}</p>
              </div>
            </div>
            <div className="info-count-card">
              <div className="info-count-details">
                <p className="info-count-label">Average Score</p>
                <p className="info-count-number">
                  {(() => {
                    const completedSessions = student.completed_academic_sessions || [];
                    const scores = completedSessions
                      .map(s => s.score)
                      .filter(score => typeof score === 'number' && !isNaN(score));
                    
                    if (scores.length === 0) return '—';
                    
                    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                    return avgScore.toFixed(1);
                  })()}
                </p>
              </div>
            </div>
            <div className="info-count-card">
              <div className="info-count-details">
                <p className="info-count-label">Average Specs</p>
                <p className="info-count-number">
                  {(() => {
                    const completedSessions = student.completed_academic_sessions || [];
                    const allSpecs = completedSessions
                      .map(s => s.specs)
                      .filter(specs => specs && typeof specs === 'object');
                    
                    if (allSpecs.length === 0) return '—';
                    
                    // Calculate average across all specs
                    const specSums = {};
                    const specCounts = {};
                    
                    allSpecs.forEach(specs => {
                      Object.entries(specs).forEach(([key, value]) => {
                        if (typeof value === 'number' && !isNaN(value)) {
                          specSums[key] = (specSums[key] || 0) + value;
                          specCounts[key] = (specCounts[key] || 0) + 1;
                        }
                      });
                    });
                    
                    const specAverages = Object.keys(specSums).map(key => 
                      specSums[key] / specCounts[key]
                    );
                    
                    if (specAverages.length === 0) return '—';
                    
                    const overallAvg = specAverages.reduce((sum, avg) => sum + avg, 0) / specAverages.length;
                    
                    // Normalize to 0-10 scale if values are larger
                    const maxAvg = Math.max(...specAverages);
                    const normalizedAvg = maxAvg > 10 ? (overallAvg * 10 / maxAvg) : overallAvg;
                    
                    return `${normalizedAvg.toFixed(1)}/10`;
                  })()}
                </p>
              </div>
            </div>
            <div className="info-count-card">
              <div className="info-count-details">
                <p className="info-count-label">Total Sessions</p>
                <p className="info-count-number">
                  {(student.completed_academic_sessions?.length || 0)}
                </p>
              </div>
            </div>
            {/* <InfoCount label="Sessions Attended" count={student.academic_sessions?.length || 0} />
            <InfoCount label="PE Sessions" count={student.pe_sessions?.length || 0} />
            <InfoCount label="Assessments Taken" count={student.assessments?.length || 0} />
            <InfoCount label="Meals Received" count={student.meal_distributions?.length || 0} /> */}
          </Card>

          {/* Printable / downloadable modal - hidden unless opened; full report shown only here */}
          {showReportModal && (
            <div className="modal-overlay" style={{ zIndex: 2000 }}>
              <div className="modal-content report-modal-content">
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="overlay-close btn btn-secondary" onClick={closeReportModal}>✖</button>
                </div>
                <div id="learner-report-content" className="report-content-wrapper">
                  <div className="progress-report-card">
                    <div className="progress-header report-header">
                      <h3 className="progress-report-title">Progress Report</h3>
                    </div>
                    <div className="progress-report-content">
                      <div className="report-top" >
                        <div className="report-avatar">
                          <Photos bucketName="student-uploads" folderName="students" id={student.id} photoCount={1} restrictToProfileFolder={true} />
                        </div>
                        <div className="report-header-info">
                          <h4 className="report-name">{student.full_name ?? `${student.name ?? ''} ${student.last_name ?? ''}`}</h4>
                          <div className="report-meta">
                            <span className="report-item">{student.category ?? '—'}</span>
                            <span className="report-sep">•</span>
                            <span className="report-item">Grade: {student.grade ?? '—'}</span>
                            <span className="report-sep">•</span>
                            <span className="report-item">Age: {student.age ?? '—'}</span>
                          </div>
                          <p className="report-school">{student.school_name ?? student.school?.name ?? '—'}</p>
                        </div>
                      </div>

                      <div>
                        <p className="progress-summary">{progressReport?.summary ?? '—'}</p>
                      </div>

                      <div className="progress-section strengths-section">
                        <h4>💪 Strengths</h4>
                        {Array.isArray(progressReport?.strengths) && progressReport.strengths.filter(Boolean).length > 0 ? (
                          <ul>
                            {progressReport.strengths.filter(Boolean).map((s, i) => (
                              <li key={i} className="strength-item">{s}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>—</p>
                        )}
                      </div>

                      <div className="progress-section improvements-section">
                        <h4>🎯 Focus Areas</h4>
                        {Array.isArray(progressReport?.improvements) && progressReport.improvements.filter(Boolean).length > 0 ? (
                          <ul>
                            {progressReport.improvements.filter(Boolean).map((s, i) => (
                              <li key={i} className="improvement-item">{s}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>—</p>
                        )}
                      </div>

                      {/* Show badge only when we have a concrete overall value (not 'pending') */}
                      {progressReport?.overall && progressReport.overall !== 'pending' && (
                        <div className="progress-badge">
                          <span className={`badge badge-${progressReport.overall}`}>
                            {String(progressReport.overall).toUpperCase()}
                          </span>
                        </div>
                      )}

                      <div className="section details-section">
                        <h4>Details</h4>
                        <p>Sessions: {student.academic_sessions?.length ?? 0}</p>
                        <p>Days attended (unique): {progressReport?.attendanceRate ? `${progressReport.attendanceRate}%` : '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 12 }}>
                  <button className="btn btn-primary" onClick={handlePrintReport}>Print / Download PDF</button>
                </div>
              </div>
            </div>
          )}

        </div>

        {attendanceMode && (
          <div className="overlay">
            <div className="overlay-content">
              <button className="overlay-close" onClick={() => setAttendanceMode(null)}>
                ✖
              </button>
              {attendanceMode === "calendar" ? (
                <LearnerAttendance id={id} school_id={student.school_id} restrictToMonth={true} />
              ) : (
                <BiometricsSignIn
                  studentId={id}
                  schoolId={student.school_id}
                  bucketName="student-uploads"
                  folderName="students"
                />
              )}
            </div>
          </div>
        )}

        <div className="grid-item list-items student-sessions-list">
          {((student?.academic_sessions?.length ?? 0) > 0 || (student?.pe_sessions?.length ?? 0) > 0) && (
            <button className="btn primary-btn" onClick={()=>setToggleSessionList(!toggleSessionList)}>
              {!toggleSessionList ? "show sessions": "close sessions"}
            </button>
          )}
          {toggleSessionList && (
              <ul className="app-list">
                {student.academic_sessions?.map((s) => {
                  // Calculate date color based on days difference
                  const getDateColor = (dateString) => {
                    if (!dateString) return 'gray';
                    const sessionDate = new Date(dateString);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    sessionDate.setHours(0, 0, 0, 0);
                    
                    const diffTime = sessionDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays >= 2) return '#22c55e'; // green - 2+ days in future
                    if (diffDays === 1 || diffDays === 0) return '#f59e0b'; // orange - today or tomorrow
                    if (diffDays === -1 || diffDays === -2) return '#f59e0b'; // orange - 1-2 days past
                    return '#ef4444'; // red - 3+ days past
                  };

                  // Find the completed session data to get score and specs
                  const completedSession = student.completed_academic_sessions?.find(
                    cs => cs.session_id === s.id
                  );

                  // Calculate average spec score for this session
                  const getSpecAverage = (specs) => {
                    if (!specs || typeof specs !== 'object') return null;
                    const values = Object.values(specs).filter(v => typeof v === 'number' && !isNaN(v));
                    if (values.length === 0) return null;
                    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
                    const maxVal = Math.max(...values);
                    return maxVal > 10 ? (avg * 10 / maxVal) : avg;
                  };

                  const specAvg = completedSession?.specs ? getSpecAverage(completedSession.specs) : null;

                  return (
                    <li key={s.id}>
                      <Link to={`/dashboard/students/${s.id}`}>
                        <div className="app-profile-photo"></div>
                        <div className="app-list-item-details">
                          <p>
                            <strong>{s.session_name}</strong>
                          </p>
                          {s.date && (
                            <p className="session-date" style={{ color: getDateColor(s.date), fontWeight: 600, margin: '0.25rem 0' }}>
                              {new Date(s.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </p>
                          )}
                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                            {completedSession?.score != null && (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                padding: '2px 8px', 
                                background: '#dcfce7', 
                                borderRadius: '4px',
                                color: '#166534',
                                fontWeight: 600
                              }}>
                                Score: {completedSession.score}
                              </span>
                            )}
                            {specAvg != null && (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                padding: '2px 8px', 
                                background: '#dbeafe', 
                                borderRadius: '4px',
                                color: '#1e40af',
                                fontWeight: 600
                              }}>
                                Specs: {specAvg.toFixed(1)}/10
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {student.pe_sessions?.map((s) => {
                  // Same date color logic for PE sessions
                  const getDateColor = (dateString) => {
                    if (!dateString) return 'gray';
                    const sessionDate = new Date(dateString);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    sessionDate.setHours(0, 0, 0, 0);
                    
                    const diffTime = sessionDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays >= 2) return '#22c55e'; // green - 2+ days in future
                    if (diffDays === 1 || diffDays === 0) return '#f59e0b'; // orange - today or tomorrow
                    if (diffDays === -1 || diffDays === -2) return '#f59e0b'; // orange - 1-2 days past
                    return '#ef4444'; // red - 3+ days past
                  };

                  return (
                    <li key={`pe-${s.id}`}>
                      <Link to={`/dashboard/students/${s.id}`}>
                        <div className="app-profile-photo"></div>
                        <div className="app-list-item-details">
                          <p>
                            <strong>{s.session_name}</strong>
                            <span className="session-badge" style={{ padding: "2px 8px", marginLeft: "8px", background: "#e0f2fe", borderRadius: "4px", fontSize: "0.75rem" }}>PE</span>
                          </p>
                          {s.date && (
                            <p className="session-date" style={{ color: getDateColor(s.date), fontWeight: 600 }}>
                              {new Date(s.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
          )}
        </div>

        {/* Use reusable StatsDashboard */}
        <div className="grid-item stats-container profile-stats mt-6">
          <StatsDashboard charts={statsCharts} loading={loading} layout="2col" />
        </div>
      </div>
    </>
  );
};

export default LearnerProfile;
