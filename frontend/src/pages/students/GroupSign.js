import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SelectableList from '../../components/widgets/SelectableList';
import FiltersPanel from '../../components/filters/FiltersPanel';
import { useAuth } from '../../context/AuthProvider';
import { useSchools } from '../../context/SchoolsContext';
import { useFilters } from '../../context/FiltersContext';
import { useData } from '../../context/DataContext';

export default function GroupSign() {
  const [selected, setSelected] = useState([]);
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { students: allStudents, loading: dataLoading, fetchData } = useData();
  const loading = dataLoading;
  const navigate = useNavigate();

  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(id => typeof id === 'number' ? id : Number(id)).filter(Boolean);
      }
      return (schools || []).map(s => s.id).filter(Boolean);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  useEffect(() => {
    if (schoolIds.length > 0) fetchData(schoolIds);
  }, [schoolIds.join(',')]);

  const students = useMemo(() => {
    if (!allStudents) return [];
    let filtered = [...allStudents];
    if (schoolIds.length > 0 && !schoolIds.includes(-1)) {
      filtered = filtered.filter(s => schoolIds.includes(s.school_id));
    }
    if (Array.isArray(filters.grade) && filters.grade.length > 0) {
      filtered = filtered.filter(s => filters.grade.includes(s.grade));
    }
    if (Array.isArray(filters.category) && filters.category.length > 0) {
      filtered = filtered.filter(s => filters.category.includes(s.category));
    }
    // Ensure each student has a `school` object and friendly fields for the list
    const mapped = (filtered || []).map(s => {
      const sc = s.school || (schools || []).find(x => Number(x.id) === Number(s.school_id)) || null;
      const full_name = s.full_name || `${s.first_name || s.name || ''} ${s.last_name || ''}`.trim();
      return { ...s, school: sc, full_name };
    });
    return mapped;
  }, [allStudents, schoolIds, filters.grade, filters.category]);

  const handleProceed = () => {
    navigate('/dashboard/students/group-sign/perform', { state: { selected } });
  };

  return (
    <div className="page-content">
      <h1>Group Sign — Students</h1>
      <p>Select one or more students, then click "Proceed" to perform sign in/out.</p>
      <FiltersPanel
        user={user}
        schools={schools}
        filters={filters}
        setFilters={setFilters}
        resource="students"
      />
      {loading && <p>Loading students…</p>}
      {!loading && (
        <>
          <SelectableList
            items={students}
            checkbox={true}
            value={selected}
            onChange={(v) => setSelected(v)}
            maxSelect={5}
            resource="students"
            bucketName="student-uploads"
            folderName="students"
          />

          <div style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleProceed}
              disabled={!selected || selected.length === 0}
            >
              Proceed ({selected ? selected.length : 0})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
