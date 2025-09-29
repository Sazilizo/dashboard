import React, { useState, useMemo, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
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

const SpecsRadarChart = ({ student, user }) => {
  const role = user?.profile?.roles?.name?.toLowerCase();

  console.log(student)
  //Merge participants and tag type
  const allSessions = useMemo(() => {
    if (!student) return [];

    const academic = (student.completed_academic_sessions || []).map((s) => ({
      ...s,
      session_type: "academic",
      date: s.date, 
    }));

    const pe = (student.pe_session_participants || []).map((s) => ({
      ...s,
      session_type: "pe",
      date: s.date, 
    }));

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
      setSelectedYear(fallbackYear);
      setSelectedTerms(filterOptions.terms[fallbackYear] || []);
      setSelectedMonths([]);
    }
  }, [filterOptions, selectedYear]);

  // Aggregate specs
  const aggregatedData = useMemo(() => {
    if (!sessions || sessions.length === 0 || !selectedYear) return [];

    const filtered = sessions.filter((s) => {
      const { year, month } = formatDateParts(s.date);
      if (year !== parseInt(selectedYear)) return false;
      if (selectedTerms.length > 0 && !selectedTerms.includes(s.term))
        return false;
      if (selectedMonths.length > 0 && (!month || !selectedMonths.includes(month)))
        return false;
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

  useEffect(()=>{
    console.log("Aggregated data:", aggregatedData && aggregatedData)
  },[aggregatedData])
  return (
    <div className="p-4 bg-white rounded-2xl shadow-md">
      {/* Admin filter */}
      {(role === "admin" || role === "superuser") && (
        <div className="mb-4">
          <label className="mr-2 font-semibold">Session Type:</label>
          <select
            value={selectedSessionType}
            onChange={(e) => setSelectedSessionType(e.target.value)}
            className="border px-2 py-1 rounded"
          >
            <option value="all">All</option>
            <option value="academic">Academic</option>
            <option value="pe">PE</option>
          </select>
        </div>
      )}

      {/* Year selector */}
      <div className="mb-4">
        <label className="mr-2 font-semibold">Year:</label>
        <select
          value={selectedYear}
          onChange={(e) => {
            const year = e.target.value;
            setSelectedYear(year);
            setSelectedTerms(filterOptions.terms[year] || []);
            setSelectedMonths([]);
          }}
          className="border px-2 py-1 rounded"
        >
          <option value="">-- Select Year --</option>
          {filterOptions.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Chart */}
      {aggregatedData.length > 0 ? (
        <RadarChart
          cx={250}
          cy={200}
          outerRadius={150}
          width={500}
          height={400}
          data={aggregatedData}
        >
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" />
          <PolarRadiusAxis angle={30} domain={[0, 100]} />
          <Radar
            name="Specs"
            dataKey="A"
            stroke="#8884d8"
            fill="#8884d8"
            fillOpacity={0.6}
          />
          <Legend />
          <Tooltip />
        </RadarChart>
      ) : (
        <p className="text-gray-500">No specs data available</p>
      )}
    </div>
  );
};

export default SpecsRadarChart;