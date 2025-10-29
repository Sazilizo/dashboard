import React, { useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import { useData } from "../../context/DataContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import Loader from "../widgets/Loader";
import "../../styles/main.css"
import { Link } from "react-router-dom";
import WorkerStats from "./WorkerStats";
import Pagination from "../widgets/Pagination";
import SortDropdown from "../widgets/SortDropdown";
import QueuedList from "../widgets/QueuedList";
import WorkerListItems from "../widgets/WorkerListItems";

const groupByOptions =["cleaners", "tutors","coaches", "head coaches", "head tutors"]

export default function WorkerList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { workers: allWorkers, loading, isOnline, fetchData } = useData();
  const [showList, setShowList] = React.useState(true);
  const [sortBy, setSortBy] = React.useState("id");
  const [sortOrder, setSortOrder] = React.useState("asc");
  const [page, setPage] = React.useState(1);
  const pageSize = 50;

  const isAllSchoolRole = ["superuser", "admin", "hr", "viewer"].includes(user?.profile?.roles?.name);

  // Determine school IDs like StudentList so filters work consistently
  const schoolIds = React.useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(id => typeof id === 'number' ? id : Number(id)).filter(Boolean);
      }
      return schools.map((s) => s.id).filter(Boolean);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  // Fetch data when school IDs change (debounced by DataContext)
  useEffect(() => {
    console.log('[WorkerList] Fetching data for schools:', schoolIds);
    if (schoolIds.length > 0) {
      fetchData(schoolIds);
    }
  }, [schoolIds.join(',')]); // Use join to avoid array reference changes

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [schoolIds.join(','), filters.group_by, filters.deleted]);

  // Filter and sort workers in memory
  const workers = React.useMemo(() => {
    if (!allWorkers) return [];
    
    console.log('[WorkerList] Filtering workers:', {
      total: allWorkers.length,
      selectedSchools: schoolIds,
      filters: filters,
      isOnline
    });
    
    let filtered = [...allWorkers];
    
    // CRITICAL: Filter by selected schools first (skip if sentinel -1 present => All Schools)
    if (schoolIds.length > 0 && !schoolIds.includes(-1)) {
      filtered = filtered.filter(w => schoolIds.includes(w.school_id));
      console.log('[WorkerList] After school filter:', filtered.length);
    }
    
    // Apply group_by filter if exists
    if (Array.isArray(filters.group_by) && filters.group_by.length > 0) {
      filtered = filtered.filter(w => {
        const roleName = w.roles?.name?.toLowerCase() || '';
        return filters.group_by.some(g => roleName.includes(g.toLowerCase()));
      });
      console.log('[WorkerList] After group_by filter:', filtered.length);
    }
    
    // Apply deleted filter if exists
    if (Array.isArray(filters.deleted) && filters.deleted.length > 0) {
      filtered = filtered.filter(w => filters.deleted.includes(w.deleted));
      console.log('[WorkerList] After deleted filter:', filtered.length);
    }
    
    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    console.log('[WorkerList] Final filtered workers:', filtered.length);
    return filtered;
  }, [allWorkers, schoolIds, filters.group_by, filters.deleted, sortBy, sortOrder, isOnline]);

  // Paginate workers
  const paginatedWorkers = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return workers.slice(start, end);
  }, [workers, page, pageSize]);

  const totalPages = Math.ceil(workers.length / pageSize);
  const hasMore = page < totalPages;

  const sortOptions = [
    { value: "name", label: "Name" },
    { value: "id", label: "ID" },
  ];

  return (
    <div className="app-list-container">
      <div>
        <div className="app-list-header">
          <div className="app-list-filters">
            <FiltersPanel
              user={user}
              schools={schools}
              filters={filters}
              setFilters={setFilters}
              resource="workers"
              groupByOptions={groupByOptions}
              showDeletedOption={isAllSchoolRole}
            />
          </div>
        </div>

        <div className={`grid-layout split-container ${showList ? "expanded" : "collapsed"}`}>
          <div className={`list-items grid-item app-list-panel ${showList ? "show" : "hide"}`}>
            {isAllSchoolRole && (
              <Link to="/dashboard/workers/create" className="btn btn-primary">Create worker</Link>
            )}
            <SortDropdown
              options={sortOptions}
              value={sortBy}
              order={sortOrder}
              onChange={setSortBy}
              onOrderChange={setSortOrder}
            />
            <div style={{ marginBottom: 8 }}>
              <span>Status: </span>
              <span className={isOnline ? "text-green-600" : "text-yellow-600"}>
                {isOnline ? "Online" : "Offline (changes will sync when online)"}
              </span>
            </div>
            {loading && <Loader variant="pulse" size="large" text="Loading workers..." />}
            {!loading && workers && workers.length > 0 && (
              <>
                <WorkerListItems workers={paginatedWorkers} />
                <Pagination
                  page={page}
                  hasMore={hasMore}
                  loadMore={() => setPage(p => p + 1)}
                  loadLess={() => setPage(p => Math.max(1, p - 1))}
                  loading={loading}
                  totalItems={workers.length}
                  itemsPerPage={pageSize}
                />
              </>
            )}
            {!loading && (!workers || workers.length === 0) && (
              <p>No workers found.</p>
            )}
          </div>

          <div className="grid-item stats-container app-list-stats">
            {workers.length > 0 && <WorkerStats workers={workers} loading={loading} />}
          </div>
        </div>
      </div>
    </div>
  );
}
