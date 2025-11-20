import React, { useState, useMemo, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

// Utility to extract year/month
const formatDateParts = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d)) return {};
  return {
    year: d.getFullYear(),
    month: d.toLocaleString("default", { month: "long" }),
  };
};

// Try a variety of locations to find specs and date on participant/session entries
const extractSpecsAndDate = (entry) => {
  if (!entry || typeof entry !== 'object') return { specs: null, date: null };

  // specs candidates in order of likelihood
  const specsCandidates = [
    entry.specs,
    entry.participant?.specs,
    entry.session_participant?.specs,
    entry.academic_session?.specs,
    entry.session?.specs,
    entry.pe_session?.specs,
  ];

  const dateCandidates = [
    entry.date,
    entry.participant?.date,
    entry.academic_session?.date,
    entry.session?.date,
    entry.pe_session?.date,
  ];

  const specs = specsCandidates.find((s) => s && typeof s === 'object') || null;
  const date = dateCandidates.find((d) => d) || null;

  return { specs, date };
};

const SpecsRadarChart = ({ student, user, className }) => {
  const role = user?.profile?.roles?.name?.toLowerCase();
  // normalize student object and extract specs/date robustly from participant records
  const allSessions = useMemo(() => {
    if (!student) return [];

    // Build canonical academic source array by preferring participant arrays
    const academicRaw = student.academic_session_participants || student.academic_sessions || student.completed_academic_sessions || [];
    const peRaw = student.pe_session_participants || student.pe_sessions || student.pe_participants || [];

    // Normalize entries so each has .specs and .date where possible
    const normalizeArray = (arr, session_type) => (arr || []).map((entry) => {
      const { specs, date } = extractSpecsAndDate(entry);
      const term = entry?.term || entry?.academic_session?.term || entry?.session?.term || entry?.pe_session?.term || null;
      return {
        ...entry,
        specs: specs || null,
        date,
        term,
        session_type,
      };
    });

    const academic = normalizeArray(academicRaw, 'academic');
    const pe = normalizeArray(peRaw, 'pe');

    if (role === "admin" || role === "superuser") return [...academic, ...pe];
    if (role === "head tutor") return academic;
    if (role === "head coach") return pe;
    return [];
  }, [student, role]);

  const [selectedSessionType, setSelectedSessionType] = useState("all");

  const sessions = useMemo(() => {
    if (selectedSessionType === "all") return allSessions;
    return allSessions.filter((s) => s.session_type === selectedSessionType);
  }, [allSessions, selectedSessionType]);

  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState([]);

  // Build filter options
  const filterOptions = useMemo(() => {
    if (!sessions) return { years: [], months: {}, terms: {} };

    const years = new Set();
    const monthsByYear = {};
    const termsByYear = {};

    sessions.forEach((s) => {
      if (!s.date) return;
      const { year, month } = formatDateParts(s.date);
      if (!year) return;

      years.add(year);

      if (!monthsByYear[year]) monthsByYear[year] = new Set();
      if (month) monthsByYear[year].add(month);

      if (s.term) {
        if (!termsByYear[year]) termsByYear[year] = new Set();
        termsByYear[year].add(s.term);
      }
    });

    return {
      years: [...years].sort(),
      months: Object.fromEntries(
        Object.entries(monthsByYear).map(([y, set]) => [y, [...set]])
      ),
      terms: Object.fromEntries(
        Object.entries(termsByYear).map(([y, set]) => [y, [...set]])
      ),
    };
  }, [sessions]);

  // Default year
  useEffect(() => {
    if (!selectedYear && filterOptions.years.length > 0) {
      const fallbackYear = filterOptions.years[0];
      // store year as string to match select option values
      setSelectedYear(String(fallbackYear));
      setSelectedTerms(filterOptions.terms[fallbackYear] || []);
      setSelectedMonths([]);
    }
  }, [filterOptions, selectedYear]);

  // Aggregate specs
  const aggregatedData = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];

    const filtered = sessions.filter((s) => {
      const { year, month } = formatDateParts(s.date);
      // If no year selected, include all years
      if (selectedYear && year !== parseInt(selectedYear)) return false;
      if (selectedTerms.length > 0 && !selectedTerms.includes(s.term)) return false;
      if (selectedMonths.length > 0 && (!month || !selectedMonths.includes(month))) return false;
      return true;
    });

    const totals = {};
    const counts = {};

    filtered.forEach((session) => {
      if (!session || !session.specs) return;
      Object.entries(session.specs).forEach(([key, value]) => {
        if (!key || key === "undefined") return;
        const numeric = typeof value === 'number' && !Number.isNaN(value) ? value : (parseFloat(value) || 0);
        totals[key] = (totals[key] || 0) + numeric;
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    return Object.keys(totals).map((key) => ({
      subject: key,
      A: Math.round((totals[key] / (counts[key] || 1)) * 100) / 100,
    }));
  }, [sessions, selectedYear, selectedMonths, selectedTerms]);

  // compute max for radius from the aggregated values (use data-driven max with a sensible minimum)
  const maxVal = aggregatedData.length > 0 ? Math.max(10, ...aggregatedData.map((d) => (typeof d.A === 'number' ? d.A : Number(d.A) || 0))) : 10;

  // Ensure outer radius in pixels based on container height so the radar polygon is visible
  const outerRadiusPx = Math.max(80, Math.min(140, Math.round(containerHeight * 0.4)));

  // Ensure the chart container has a sane pixel height so ResponsiveContainer can size itself.
  // Some build setups may not include utility classes like `h-96`, so fall back to 360px.
  const containerHeight = 360;

  return (
    <div className={`${className} p-4 bg-white rounded-2xl shadow-md`} style={{ width: '100%', position: 'relative' }}>
      {/* Admin filter */}
      <div className="specs-filters">

        {(role === 'admin' || role === 'superuser') && (
          <div>
            <label className="mr-2 font-semibold">Session Type:</label>
            <select
              value={selectedSessionType}
              onChange={(e) => setSelectedSessionType(e.target.value)}
            >
              <option value="all">All</option>
              <option value="academic">Academic</option>
              <option value="pe">PE</option>
            </select>
          </div>
        )}

        {/* Year selector */}
        <div>
          <label className="mr-2 font-semibold">Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => {
              const year = e.target.value;
              setSelectedYear(year);
              setSelectedTerms(filterOptions.terms[year] || []);
              setSelectedMonths([]);
            }}
          >
            <option value="">-- Select Year --</option>
            {filterOptions.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      {aggregatedData.length > 0 ? (
        <div className="specs-radar w-full" style={{ height: containerHeight, position: 'relative' }}>
          <div className="radar-wrapper" style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%" style={{ position: 'relative', zIndex: 2 }}>
              <RadarChart
                cx="50%"
                cy="50%"
                outerRadius={outerRadiusPx}
                data={aggregatedData}
                margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
              >
                <PolarGrid stroke="#e6e6e6" strokeWidth={1} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} tickFormatter={(t) => (typeof t === 'string' && t.length > 14 ? t.slice(0, 14) + '…' : t)} />
                <PolarRadiusAxis angle={40} domain={[0, maxVal]} tickFormatter={(v) => String(v)} />
                <Radar
                  name="Specs"
                  dataKey="A"
                  stroke="#3b1464"
                  fill="#7C3AED"
                  fillOpacity={0.85}
                  strokeWidth={3}
                  dot={{ r: 4, stroke: '#fff', strokeWidth: 1 }}
                />
                {/* Ensure the rendered SVG sits above surrounding elements */}
                <defs />
                <Legend verticalAlign="bottom" height={36} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">No specs data available</p>
      )}

      {/* Development diagnostics: show why the chart may be empty */}
      {process.env.NODE_ENV !== 'production' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <strong>Debug:</strong>
          <div>Sessions loaded: {sessions.length}</div>
          <div>Filtered subjects: {aggregatedData.length}</div>
          <div>Selected Year: {selectedYear || 'all'}</div>
          <div>Available Years: {filterOptions.years.join(', ') || 'none'}</div>
          {aggregatedData.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <em>Subjects & values:</em>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(aggregatedData, null, 2)}</pre>
            </div>
          )}
          {aggregatedData.length > 0 && !aggregatedData.some(d => typeof d.A === 'number' && d.A > 0) && (
            <div style={{ marginTop: 6, color: '#a00' }}>Note: specs entries exist but all values are zero or non-numeric.</div>
          )}
        </div>
      )}

    </div>
  );
};

export default SpecsRadarChart;