import React, { useState, useMemo, useEffect } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend
} from "recharts";

// Utility to extract year/month
const formatDateParts = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d)) return {};
  return {
    year: d.getFullYear(),
    month: d.toLocaleString("default", { month: "long" }), // e.g. "August"
  };
};

const SpecsRadarChart = ({ sessions }) => {
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState([]);

  // Build filter options dynamically
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
      months: Object.fromEntries(Object.entries(monthsByYear).map(([y, set]) => [y, [...set]])),
      terms: Object.fromEntries(Object.entries(termsByYear).map(([y, set]) => [y, [...set]])),
    };
  }, [sessions]);

  // Initialize defaults (first available year + all terms for that year)
  useEffect(() => {
    if (filterOptions.years.length > 0 && !selectedYear) {
      const firstYear = filterOptions.years[0];
      setSelectedYear(firstYear);
      setSelectedTerms(filterOptions.terms[firstYear] || []);
      setSelectedMonths([]); // default no months checked
    }
  }, [filterOptions, selectedYear]);

  // Aggregate filtered specs
  const aggregatedData = useMemo(() => {
    if (!sessions || sessions.length === 0 || !selectedYear) return [];

    const filtered = sessions.filter((s) => {
      const { year, month } = formatDateParts(s.date);
      if (year !== parseInt(selectedYear)) return false;

      // filter by terms (if any selected)
      if (selectedTerms.length > 0 && !selectedTerms.includes(s.term)) return false;

      // filter by months (if any selected)
      if (selectedMonths.length > 0 && (!month || !selectedMonths.includes(month))) return false;

      return true;
    });

    const totals = {};
    const counts = {};

    filtered.forEach((session) => {
      if (!session.specs) return;
      Object.entries(session.specs).forEach(([key, value]) => {
        // 🚨 skip invalid/undefined fields
        if (!key || key === "undefined") return;

        if (value !== undefined && value !== null) {
          totals[key] = (totals[key] || 0) + value;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    });

    const result = Object.keys(totals).map((key) => ({
      subject: key,
      A: Math.round(totals[key] / counts[key]),
    }));

    return result;
  }, [sessions, selectedYear, selectedMonths, selectedTerms]);

  // Reset if no valid specs found
  useEffect(() => {
    if (aggregatedData.length === 0 && filterOptions.years.length > 0) {
      const fallbackYear = filterOptions.years[0];
      setSelectedYear(fallbackYear);
      setSelectedTerms(filterOptions.terms[fallbackYear] || []);
      setSelectedMonths([]);
    }
  }, [aggregatedData, filterOptions]);

  return (
    <div className="p-4 bg-white rounded-2xl shadow-md">
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
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Term checkboxes */}
      {selectedYear && filterOptions.terms[selectedYear] && (
        <div className="mb-4">
          <p className="font-semibold mb-1">Terms:</p>
          {filterOptions.terms[selectedYear].map((term) => (
            <label key={term} className="mr-4">
              <input
                type="checkbox"
                checked={selectedTerms.includes(term)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTerms([...selectedTerms, term]);
                  } else {
                    setSelectedTerms(selectedTerms.filter((t) => t !== term));
                  }
                }}
              />{" "}
              {term}
            </label>
          ))}
        </div>
      )}

      {/* Month checkboxes */}
      {selectedYear && filterOptions.months[selectedYear] && (
        <div className="mb-4">
          <p className="font-semibold mb-1">Months:</p>
          {filterOptions.months[selectedYear].map((month) => (
            <label key={month} className="mr-4">
              <input
                type="checkbox"
                checked={selectedMonths.includes(month)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMonths([...selectedMonths, month]);
                  } else {
                    setSelectedMonths(selectedMonths.filter((m) => m !== month));
                  }
                }}
              />{" "}
              {month}
            </label>
          ))}
        </div>
      )}

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
