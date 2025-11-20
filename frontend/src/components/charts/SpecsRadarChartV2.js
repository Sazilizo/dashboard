import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Dot,
} from 'recharts';

// New, robust radar chart with built-in filters and clear rendering
export default function SpecsRadarChartV2({ student, user, className = '' , height = 360 }) {
  const role = user?.profile?.roles?.name?.toLowerCase?.() || '';

  // Canonicalize sessions similar to previous logic
  const allSessions = useMemo(() => {
    if (!student) return [];
    // map session_id -> term from the student's academic_sessions list (if available)
    const sessionTermMap = {};
    try {
      const known = student.academic_sessions || student.academic_session_participants?.map(p => p.academic_session) || [];
      (known || []).forEach((s) => {
        if (s && (s.id || s.session_id)) {
          const key = String(s.id || s.session_id);
          sessionTermMap[key] = s.term || s.term_name || s.term;
        }
      });
    } catch (e) {
      // ignore
    }
    const academicRaw = student.academic_session_participants || student.academic_sessions || student.completed_academic_sessions || [];
    const peRaw = student.pe_session_participants || student.pe_sessions || student.pe_participants || [];

    const extract = (entry, session_type) => {
      // find specs/date in a few plausible places
      const specs = entry?.specs || entry?.participant?.specs || entry?.session_participant?.specs || entry?.academic_session?.specs || entry?.session?.specs || entry?.pe_session?.specs || null;
      const date = entry?.date || entry?.participant?.date || entry?.academic_session?.date || entry?.session?.date || entry?.pe_session?.date || null;
      // Prefer explicit term on the entry, else try to resolve via linked academic_session by id
      let term = entry?.term || entry?.academic_session?.term || entry?.session?.term || entry?.pe_session?.term || null;
      if (!term) {
        const sid = entry?.session_id || entry?.academic_session_id || entry?.sessionId || entry?.academic_session?.id || null;
        if (sid) {
          term = sessionTermMap[String(sid)] || term;
        }
      }
      return { ...entry, specs: specs || null, date, term, session_type };
    };

    const academic = (academicRaw || []).map((e) => extract(e, 'academic'));
    const pe = (peRaw || []).map((e) => extract(e, 'pe'));

    if (role === 'admin' || role === 'superuser') return [...academic, ...pe];
    if (role === 'head tutor') return academic;
    if (role === 'head coach') return pe;
    return [...academic, ...pe];
  }, [student, role]);

  // derive years/options
  const filterOptions = useMemo(() => {
    const years = new Set();
    const monthsByYear = {};
    const termsByYear = {};
    allSessions.forEach((s) => {
      const d = s?.date ? new Date(s.date) : null;
      if (!d || isNaN(d.getTime())) return;
      const y = d.getFullYear();
      years.add(y);
      const month = d.toLocaleString('default', { month: 'long' });
      monthsByYear[y] = monthsByYear[y] || new Set();
      monthsByYear[y].add(month);
      if (s.term) {
        termsByYear[y] = termsByYear[y] || new Set();
        termsByYear[y].add(s.term);
      }
    });
    return {
      years: [...years].sort(),
      monthsByYear: Object.fromEntries(Object.entries(monthsByYear).map(([y, set]) => [y, [...set]])),
      termsByYear: Object.fromEntries(Object.entries(termsByYear).map(([y, set]) => [y, [...set]])),
    };
  }, [allSessions]);

  const [sessionType, setSessionType] = useState('all');
  const [selectedYear, setSelectedYear] = useState(filterOptions.years[0] || '');
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState([]);

  useEffect(() => {
    if (!selectedYear && filterOptions.years.length) setSelectedYear(filterOptions.years[0]);
  }, [filterOptions.years]);

  // filter sessions
  const sessions = useMemo(() => {
    let arr = allSessions || [];
    if (sessionType !== 'all') arr = arr.filter((s) => s.session_type === sessionType);
    if (selectedYear) arr = arr.filter((s) => {
      const d = s?.date ? new Date(s.date) : null;
      return d && d.getFullYear() === Number(selectedYear);
    });
    if (selectedTerms.length) arr = arr.filter((s) => selectedTerms.includes(s.term));
    if (selectedMonths.length) arr = arr.filter((s) => {
      const d = s?.date ? new Date(s.date) : null;
      const m = d ? d.toLocaleString('default', { month: 'long' }) : null;
      return m && selectedMonths.includes(m);
    });
    return arr;
  }, [allSessions, sessionType, selectedYear, selectedMonths, selectedTerms]);

  // aggregate specs into radar data
  const aggregatedData = useMemo(() => {
    const totals = {};
    const counts = {};
    sessions.forEach((s) => {
      const specs = s?.specs || {};
      if (!specs || typeof specs !== 'object') return;
      Object.entries(specs).forEach(([k, v]) => {
        // ignore undefined/invalid subject keys
        const key = (k || '').toString().trim();
        if (!key || key.toLowerCase() === 'undefined') return;
        const num = typeof v === 'number' && !Number.isNaN(v) ? v : parseFloat(v) || 0;
        totals[key] = (totals[key] || 0) + num;
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const out = Object.keys(totals).map((k) => ({ subject: k, A: Math.round((totals[k] / (counts[k] || 1)) * 100) / 100 }));
    return out;
  }, [sessions]);

  // compute max
  const maxVal = aggregatedData.length > 0 ? Math.max(10, ...aggregatedData.map((d) => Number(d.A) || 0)) : 10;

  // chart height and outer radius
  const containerHeight = height;
  const outerRadius = Math.max(80, Math.min(140, Math.round(containerHeight * 0.4)));

  // tooltip formatter
  const tooltipFormatter = (value, name) => [value, 'Specs'];

  return (
    <div className={`specs-radar-v2 ${className}`} style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12 }}>Session Type</label>
          <br />
          <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} style={{ minWidth: 100 }}>
            <option value="all">All</option>
            <option value="academic">Academic</option>
            <option value="pe">PE</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12 }}>Year</label>
          <br />
          <select value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonths([]); setSelectedTerms([]); }} style={{ minWidth: 120 }}>
            <option value="">-- All --</option>
            {filterOptions.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 12 }}>Months</label>
          <br />
          <MonthsDropdown
            options={filterOptions.monthsByYear[selectedYear] || []}
            value={selectedMonths}
            onChange={(arr) => setSelectedMonths(arr)}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 12 }}>Terms</label>
          <br />
          <TermsDropdown
            options={filterOptions.termsByYear[selectedYear] || []}
            value={selectedTerms}
            onChange={(arr) => setSelectedTerms(arr)}
          />
        </div>
      </div>

      <div style={{ width: '100%', height: containerHeight, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={aggregatedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <PolarGrid stroke="#e9e9e9" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} tickFormatter={(t) => (typeof t === 'string' && t.length > 14 ? t.slice(0, 14) + '…' : t)} />
            <PolarRadiusAxis angle={30} domain={[0, maxVal]} tickFormatter={(v) => String(v)} />
            <Radar name="Specs" dataKey="A" stroke="#2b6cb0" fill="#60a5fa" fillOpacity={0.8} strokeWidth={2} dot={{ r: 4 }} />
            <Tooltip formatter={tooltipFormatter} />
            <Legend verticalAlign="bottom" />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Development debug - shows aggregatedData when in non-production */}
      {process.env.NODE_ENV !== 'production' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <strong>Debug:</strong>
          <div>Sessions loaded: {allSessions.length}</div>
          <div>Filtered subjects: {aggregatedData.length}</div>
        </div>
      )}
    </div>
  );
}

// Small reusable months dropdown with checkboxes
function MonthsDropdown({ options = [], value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (opt) => {
    const next = Array.isArray(value) ? [...value] : [];
    const idx = next.indexOf(opt);
    if (idx >= 0) next.splice(idx, 1);
    else next.push(opt);
    onChange(next);
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 140 }}>
      <button
        onClick={() => setOpen((s) => !s)}
        style={{ minWidth: 140, padding: '6px 10px', textAlign: 'left', cursor: 'pointer' }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {Array.isArray(value) && value.length > 0 ? value.join(', ') : 'Select months'}
        <span style={{ float: 'right', opacity: 0.7 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          style={{
            position: 'absolute',
            top: '40px',
            left: 0,
            width: 260,
            maxHeight: 220,
            overflow: 'auto',
            background: 'white',
            border: '1px solid #e6e6e6',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 8,
            zIndex: 2000,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Months</strong>
            <button onClick={clearAll} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1976d2' }}>
              Clear
            </button>
          </div>
          {options.length === 0 && <div style={{ color: '#666', padding: 8 }}>No months available</div>}
          {options.map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(m)}
                onChange={() => toggle(m)}
              />
              <span style={{ fontSize: 13 }}>{m}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Terms dropdown (checkbox list) — similar to MonthsDropdown
function TermsDropdown({ options = [], value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (opt) => {
    const next = Array.isArray(value) ? [...value] : [];
    const idx = next.indexOf(opt);
    if (idx >= 0) next.splice(idx, 1);
    else next.push(opt);
    onChange(next);
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 120 }}>
      <button
        onClick={() => setOpen((s) => !s)}
        style={{ minWidth: 120, padding: '6px 10px', textAlign: 'left', cursor: 'pointer' }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {Array.isArray(value) && value.length > 0 ? value.join(', ') : 'Select terms'}
        <span style={{ float: 'right', opacity: 0.7 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          style={{
            position: 'absolute',
            top: '40px',
            left: 0,
            width: 220,
            maxHeight: 220,
            overflow: 'auto',
            background: 'white',
            border: '1px solid #e6e6e6',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 8,
            zIndex: 2000,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Terms</strong>
            <button onClick={clearAll} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1976d2' }}>
              Clear
            </button>
          </div>
          {options.length === 0 && <div style={{ color: '#666', padding: 8 }}>No terms available</div>}
          {options.map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(t)}
                onChange={() => toggle(t)}
              />
              <span style={{ fontSize: 13 }}>{t}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
