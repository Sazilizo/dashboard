import React, { useEffect, useState } from "react";
import api from "../../api/client";
import '../../styles/formStyles.css'

/**
 * Handles dynamic questionnaire structure:
 * - Fetches sections & questions from an external source table
 * - Renders inputs for answers with modern styling
 */
const JsonDynamicField = ({ value = {}, onChange, dynamicMeta, source, sessionId }) => {
  const [sections, setSections] = useState([]);

  useEffect(() => {
    if (!sessionId || !source) return;

    async function fetchStructure() {
      try {
        const selectCols =
          (dynamicMeta && dynamicMeta.mapping && dynamicMeta.mapping.section_title ? dynamicMeta.mapping.section_title : "section_title")
          + ", " + (dynamicMeta && dynamicMeta.mapping && dynamicMeta.mapping.questions ? dynamicMeta.mapping.questions : "questions");

        const { data, error } = await api
          .from(source)
          .select(selectCols)
          .eq("id", sessionId)
          .single();

        if (error) throw error;

        const sectionData = data && dynamicMeta && dynamicMeta.mapping && data[dynamicMeta.mapping.section_title]
          ? data[dynamicMeta.mapping.section_title]
          : data?.section_title || [];

        const questionsData = data && dynamicMeta && dynamicMeta.mapping && data[dynamicMeta.mapping.questions]
          ? data[dynamicMeta.mapping.questions]
          : data?.questions || [];

        // Map each section to its questions
        const structured = (Array.isArray(sectionData) ? sectionData : []).map((section, idx) => ({
          section,
          questions: Array.isArray(questionsData[idx]) ? questionsData[idx] : (questionsData[idx] ? [questionsData[idx]] : []),
        }));

        setSections(structured);
      } catch (err) {
        console.error("Failed to load dynamic form structure:", err);
      }
    }

    fetchStructure();
  }, [sessionId, source, dynamicMeta]);

  const handleAnswerChange = (section, question, answer) => {
    const updated = {
      ...value,
      [section]: { ...(value[section] || {}), [question]: answer },
    };
    onChange && onChange(updated);
  };

  return (
    <div className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
      {sections.map((s, si) => (
        <section key={si} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-slate-800">{s.section}</h3>
            <span className="text-sm text-slate-500">{(s.questions || []).length} question{(s.questions || []).length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-3">
            {s.questions.map((q, qi) => {
              const key = q.label || q.question || `q-${qi}`;
              const current = value?.[s.section]?.[key] || "";
              const isLong = (q.type && /long/i.test(q.type)) || (q.format && /long/i.test(q.format));
              return (
                <div key={qi} className="">
                  <label className="block text-sm font-medium text-slate-700 mb-2">{q.label || q.question}</label>
                  {isLong ? (
                    <textarea
                      className="w-full p-3 border border-gray-200 rounded-md"
                      value={current}
                      onChange={(e) => handleAnswerChange(s.section, key, e.target.value)}
                      placeholder="Write your answer here"
                      rows={4}
                    />
                  ) : (
                    <input
                      type="text"
                      className="w-full p-3 border border-gray-200 rounded-md"
                      value={current}
                      onChange={(e) => handleAnswerChange(s.section, key, e.target.value)}
                      placeholder="Enter answer"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default JsonDynamicField;

