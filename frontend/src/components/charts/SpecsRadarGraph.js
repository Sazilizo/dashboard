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

const SpecsRadarChart = ({ student, user, className }) => {
  const role = user?.profile?.roles?.name?.toLowerCase();
  // normalize student object and extract specs/date robustly from participant records
  const allSessions = useMemo(() => {
    if (!student) return [];

    // helper to extract specs and date from various possible shapes
    const normalize = (entry) => {
      // try common locations for specs on participant records
      const specs = entry?.specs || entry?.participant?.specs || entry?.session_participant?.specs || entry?.academic_session?.specs || entry?.pe_session?.specs || null;

      // date may live on the participant entry or on a nested session object
      const date = entry?.date || entry?.participant?.date || entry?.academic_session?.date || entry?.session?.date || entry?.pe_session?.date || null;

      // bring other useful props through (term, etc.)
      const term = entry?.term || entry?.academic_session?.term || entry?.session?.term || entry?.pe_session?.term || null;

      return {
        ...entry,
        specs: specs || null,
        date,
        term,
      };
    };

    // Prefer the dedicated participant arrays. Fall back to older property names if needed.
    const academicSource = student.academic_session_participants || student.academic_sessions || student.completed_academic_sessions || [];
    const peSource = student.pe_session_participants || student.pe_sessions || student.pe_participants || [];

    const academic = (academicSource || []).map((s) => ({ ...normalize(s), session_type: "academic" }));
    const pe = (peSource || []).map((s) => ({ ...normalize(s), session_type: "pe" }));

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
      if (!session.specs) return;
      Object.entries(session.specs).forEach(([key, value]) => {
        if (!key || key === "undefined") return;
        if (value !== undefined && value !== null) {
          totals[key] = (totals[key] || 0) + value;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });

    return Object.keys(totals).map((key) => ({
      subject: key,
      A: Math.round(totals[key] / counts[key]),
    }));
  }, [sessions, selectedYear, selectedMonths, selectedTerms]);
  
  // compute max for radius to avoid overly small/large scale
  const maxVal = aggregatedData.length > 0 ? Math.max(100, ...aggregatedData.map((d) => d.A || 0)) : 100;

  return (
    <div className={`${className} p-4 bg-white rounded-2xl shadow-md`}>
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
        <div className="specs-radar w-full h-96">
          <div className="radar-wrapper" style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart outerRadius="70%" data={aggregatedData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} tickFormatter={(t) => (typeof t === 'string' && t.length > 14 ? t.slice(0, 14) + '…' : t)} />
                <PolarRadiusAxis angle={40} domain={[0, maxVal]} />
                <Radar name="Specs" dataKey="A" stroke="#6D28D9" fill="#7C3AED" fillOpacity={0.6} />
                <Legend verticalAlign="bottom" height={36} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">No specs data available</p>
      )}

    </div>
  );
};

export default SpecsRadarChart;