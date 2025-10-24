import React, { useEffect, useState } from "react";
import api from "../../api/client";

/**
 * Handles dynamic questionnaire structure:
 * - Fetches sections & questions from academic_sessions
 * - Renders inputs for answers
 */
const JsonDynamicField = ({ value = {}, onChange, dynamicMeta, source, sessionId }) => {
  const [sections, setSections] = useState([]);

  useEffect(() => {
    if (!sessionId || !source) return;

    async function fetchStructure() {
      try {
        const { data, error } = await api
          .from(source)
          .select(dynamicMeta.mapping.section_title + ", " + dynamicMeta.mapping.questions)
          .eq("id", sessionId)
          .single();

        if (error) throw error;

        const sectionData = data[dynamicMeta.mapping.section_title] || [];
        const questionsData = data[dynamicMeta.mapping.questions] || [];

        // Map each section to its questions
        const structured = sectionData.map((section, idx) => ({
          section,
          questions: questionsData[idx] || [],
        }));

        setSections(structured);
      } catch (err) {
        console.error("Failed to load dynamic form structure:", err);
      }
    }

    fetchStructure();
  }, [sessionId, source]);

  const handleAnswerChange = (section, question, answer) => {
    const updated = {
      ...value,
      [section]: { ...(value[section] || {}), [question]: answer },
    };
    onChange(updated);
  };

  return (
    <div className="p-3 border rounded bg-gray-50">
      {sections.map((s, si) => (
        <div key={si} className="mb-4">
          <h3 className="font-semibold text-blue-700">{s.section}</h3>
          {s.questions.map((q, qi) => (
            <div key={qi} className="ml-4 mb-2">
              <label className="block text-sm mb-1">{q.label || q.question}</label>
              <input
                type="text"
                className="border p-2 rounded w-full"
                value={value?.[s.section]?.[q.label || q.question] || ""}
                onChange={(e) =>
                  handleAnswerChange(s.section, q.label || q.question, e.target.value)
                }
                placeholder="Enter answer"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default JsonDynamicField;
