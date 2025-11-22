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
  const { workers: allWorkers, loading: dataLoading, fetchData } = useData();
  const loading = dataLoading;
  const navigate = useNavigate();

  // Determine school IDs like WorkerList so filters work consistently
  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(id => typeof id === 'number' ? id : Number(id)).filter(Boolean);
      }
      return (schools || []).map((s) => s.id).filter(Boolean);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  useEffect(() => {
    if (schoolIds.length > 0) fetchData(schoolIds);
  }, [schoolIds.join(',')]);

  const workers = useMemo(() => {
    if (!allWorkers) return [];
    let filtered = [...allWorkers];
    if (schoolIds.length > 0 && !schoolIds.includes(-1)) {
      filtered = filtered.filter(w => schoolIds.includes(w.school_id));
    }
    if (Array.isArray(filters.group_by) && filters.group_by.length > 0) {
      filtered = filtered.filter(w => {
        const roleName = w.roles?.name?.toLowerCase() || '';
        return filters.group_by.some(g => roleName.includes(g.toLowerCase()));
      });
    }
    if (Array.isArray(filters.deleted) && filters.deleted.length > 0) {
      filtered = filtered.filter(w => filters.deleted.includes(w.deleted));
    }
    // Ensure each worker has a `school` object and friendly name/role for the list
    const mapped = (filtered || []).map(w => {
      const s = w.school || (schools || []).find(x => Number(x.id) === Number(w.school_id)) || null;
      const full_name = w.full_name || `${w.name || ''} ${w.last_name || ''}`.trim();
      const category = w.category || (w.roles && w.roles.name) || (w.role_name || null);
      return { ...w, school: s, full_name, category };
    });
    return mapped;
  }, [allWorkers, schoolIds, filters.group_by, filters.deleted]);

  const handleProceed = () => {
    // Navigate to perform page carrying selected ids in state
    navigate('/dashboard/workers/group-sign/perform', { state: { selected } });
  };

  return (
    <div className="page-content">
      <h1>Group Sign — Workers</h1>
      <p>Select one or more workers, then click "Proceed" to perform sign in/out.</p>
      <FiltersPanel
        user={user}
        schools={schools}
        filters={filters}
        setFilters={setFilters}
        resource="workers"
      />
      {loading && <p>Loading workers…</p>}
      {!loading && (
        <>
          <SelectableList
            items={workers}
            checkbox={true}
            value={selected}
            onChange={(v) => setSelected(v)}
            resource="workers"
            bucketName="worker-uploads"
            folderName="workers"
            maxSelect={5}
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
