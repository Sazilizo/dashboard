import React, { useEffect, useState } from "react";
import { fetchResource } from "../api/endpoints/fetchResource";

export default function StudentCheckboxDropdown({ filters, onChange, value = [], students: propStudents }) {
  const [students, setStudents] = useState(propStudents || []);
  const [selected, setSelected] = useState(value);

  useEffect(() => {
    if (propStudents?.length) {
      setStudents(propStudents);
    }
    //  else if (filters && Object.keys(filters).length > 0) {
    //   fetchResource("/students/list", filters).then((res) => {
    //     setStudents(res.students || []);
    //   });
    // }
  }, [filters, propStudents]);

  const toggleSelect = (id) => {
    const newSelected = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    setSelected(newSelected);
    onChange(newSelected);
  };

  return (
    <div className="border rounded p-2 max-h-64 overflow-y-auto">
        {propStudents.map((student) => (
          <label key={student.id} className="block text-sm mb-1">
            <input
              type="checkbox"
              value={student.id}
              checked={selected.includes(student.id)}
              onChange={() => toggleSelect(student.id)}
              className="mr-2"
            />
            {student.full_name || student.name || "students not avalilable"}
          </label>
        ))
      }
    </div>
  );
}
