import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import FiltersPanel from "../filters/FiltersPanel";
import { useFilters } from "../../context/FiltersContext";
import StudentStats from "./StudentStats";
import SkeletonList from "../widgets/SkeletonList";
import ListItems from "../widgets/ListItems";
import "../../styles/main.css";
import { Link } from "react-router-dom";
import useOfflineTable from "../../hooks/useOfflineTable";
import SortDropdown from "../widgets/SortDropdown"
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
  const [showList, setShowList] = useState(true);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("asc");


  // Determine school IDs based on role
  const schoolIds = useMemo(() => {
  const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      // If user has selected schools in filters, use those; else, show all
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(Number); // ensure numbers
      }
      return schools.map(s => s.id).filter(Boolean);
    }
    // Access to only their school
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  // Normalize filters for stable deps, only include non-empty filters
  const normalizedFilters = useMemo(() => {
    const f = { school_id: schoolIds };
    if (Array.isArray(filters.grade) && filters.grade.length > 0) f.grade = filters.grade;
    if (Array.isArray(filters.category) && filters.category.length > 0) f.category = filters.category;
    return f;
  }, [schoolIds, filters.grade, filters.category]);

  useEffect(()=>{
    console.log("Normalized Filters: ", normalizedFilters)
  },[normalizedFilters])

  // Use offline table hook for students
  const {
    rows: students,
    loading,
    error,
    addRow,
    updateRow,
    deleteRow,
    isOnline,
    page,
    hasMore,
    loadMore
  } = useOfflineTable(
    "students",
    normalizedFilters,
    `*, school:schools(name)`,
    20, //page size
    sortBy,
    sortOrder
  );

  console.log("Students:", students[0]);
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
            {loading && <SkeletonList count={10} />}
            {!loading && error && <div style={{ color: "red" }}>{error.message || error}</div>}
            {!loading && !error && (
              <>
                <ListItems
                  students={students}
                  onDelete={deleteRow}
                  onUpdate={updateRow}
                />
                <Pagination 
                  page={page}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  loading={loading}
                />
                <QueuedList table="students" />
              </>
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