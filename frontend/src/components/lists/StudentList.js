import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import { useData } from "../../context/DataContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";
import SkeletonList from "../widgets/SkeletonList";
import ListItems from "../widgets/ListItems";
import StudentStats from "./StudentStats";
import Loader from "../widgets/Loader";
import "../../styles/main.css";
import { Link } from "react-router-dom";
import SortDropdown from "../widgets/SortDropdown"
import SelectableList from "../widgets/SelectableList";
import useOfflineTable from "../../hooks/useOfflineTable";
import Pagination from "../widgets/Pagination";
import QueuedList from "../widgets/QueuedList";
const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map(s => `${grade}${s}`);
  }).flat()
];
const sortOptions = [
  { value: "full_name", label: "Name" },
  { value: "grade", label: "Grade" },
  { value: "id", label: "ID" },
];

export default function StudentList() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const { filters, setFilters } = useFilters();
  const { students: allStudents, loading, isOnline, fetchData } = useData();
  const [showList, setShowList] = useState(true);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const { addRow: addAttendanceRow } = useOfflineTable("attendance_records");

  // Determine school IDs based on role and filter selection
  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      // If user has selected schools in filters, use those
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(id => typeof id === 'number' ? id : Number(id)).filter(Boolean);
      }
      // Otherwise show all schools
      return schools.map(s => s.id).filter(Boolean);
    }
    
    // Single school role - only their school
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  // Fetch data when school IDs change (debounced by DataContext)
  useEffect(() => {
    console.log('[StudentList] Fetching data for schools:', schoolIds);
    if (schoolIds.length > 0) {
      fetchData(schoolIds);
    }
  }, [schoolIds.join(',')]); // Use join to avoid array reference changes

  // Debug what data we're getting
  useEffect(() => {
    console.log('[StudentList] allStudents from context:', allStudents?.length || 0);
  }, [allStudents]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [schoolIds.join(','), filters.grade, filters.category]);

  // Filter and sort students in memory
  const students = useMemo(() => {
    if (!allStudents) return [];
    
    console.log('[StudentList] Filtering students:', {
      total: allStudents.length,
      selectedSchools: schoolIds,
      filters
    });
    
    let filtered = [...allStudents];
    
    // CRITICAL: Filter by selected schools first (skip if sentinel -1 present => All Schools)
    if (schoolIds.length > 0 && !schoolIds.includes(-1)) {
      filtered = filtered.filter(s => schoolIds.includes(s.school_id));
      console.log('[StudentList] After school filter:', filtered.length);
    }
    
    // Apply grade filter
    if (Array.isArray(filters.grade) && filters.grade.length > 0) {
      filtered = filtered.filter(s => filters.grade.includes(s.grade));
      console.log('[StudentList] After grade filter:', filtered.length);
    }
    
    // Apply category filter
    if (Array.isArray(filters.category) && filters.category.length > 0) {
      filtered = filtered.filter(s => filters.category.includes(s.category));
      console.log('[StudentList] After category filter:', filtered.length);
    }
    
    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  }, [allStudents, schoolIds, filters.grade, filters.category, sortBy, sortOrder]);

  // Paginate students
  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return students.slice(start, end);
  }, [students, page, pageSize]);

  const totalPages = Math.ceil(students.length / pageSize);
  const hasMore = page < totalPages;

  console.log("Students:", students.length, "Page:", page, "Showing:", paginatedStudents.length);
  
  // Debug first student to see structure
  if (paginatedStudents.length > 0) {
    console.log('[StudentList] First student:', paginatedStudents[0]);
  }
  
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
              resource="students"
              gradeOptions={gradeOptions}
              showDeletedOption={["admin", "hr", "superviser"].includes(user?.profile?.roles?.name)}
            />
          </div>
        </div>

        <div className={`grid-layout split-container ${showList ? "expanded" : "collapsed"}`}>
          <div className={`list-items grid-item app-list-panel ${showList ? "show" : "hide"}`}>
            <Link to="/dashboard/students/create" className="btn btn-primary">Create student</Link>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <button
                className="btn btn-secondary"
                title="Group Sign In (max 5)"
                onClick={async () => {
                  const nowIso = new Date().toISOString();
                  const ids = selectedStudentIds.slice(0, 5);
                  for (const sid of ids) {
                    try {
                      await addAttendanceRow({
                        student_id: Number(sid),
                        date: nowIso.split('T')[0],
                        sign_in_time: nowIso,
                        note: 'group sign-in',
                      });
                    } catch (e) { /* ignore */ }
                  }
                  setSelectedStudentIds([]);
                }}
                disabled={selectedStudentIds.length === 0}
              >
                Group Sign In ({Math.min(selectedStudentIds.length, 5)}/5)
              </button>
              {selectedStudentIds.length > 5 && (
                <span style={{ color: '#dc2626', fontSize: 12 }}>Limit 5 selected</span>
              )}
            </div>
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
            {loading && <Loader variant="pulse" size="large" text="Loading students..." />}
            {!loading && students && students.length > 0 && (
              <>
                <SelectableList
                  students={paginatedStudents}
                  resource="students"
                  checkbox={true}
                  value={selectedStudentIds}
                  onChange={(ids) => {
                    // enforce max 5
                    const arr = Array.isArray(ids) ? ids.slice(0, 5) : [];
                    setSelectedStudentIds(arr);
                  }}
                />
                <Pagination
                  page={page}
                  hasMore={hasMore}
                  loadMore={() => setPage(p => p + 1)}
                  loadLess={() => setPage(p => Math.max(1, p - 1))}
                  loading={loading}
                  totalItems={students.length}
                  itemsPerPage={pageSize}
                />
              </>
            )}
            {!loading && (!students || students.length === 0) && (
              <p>No students found.</p>
            )}
          </div>

          <div className="grid-item stats-container app-list-stats">
            {students.length > 0 && <StudentStats students={students} loading={loading} />}
          </div>
        </div>
      </div>
    </div>
  );
}