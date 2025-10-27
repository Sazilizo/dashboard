import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useSchools } from "../../context/SchoolsContext";
import { useFilters } from "../../context/FiltersContext";
import FiltersPanel from "../filters/FiltersPanel";
import StudentStats from "./StudentStats";
import SkeletonList from "../widgets/SkeletonList";
import ListItems from "../widgets/ListItems";
import SortDropdown from "../widgets/SortDropdown";
import Pagination from "../widgets/Pagination";
import QueuedList from "../widgets/QueuedList";
import useOfflineTable from "../../hooks/useOfflineTable";
import api from "../../api/client";
import "../../styles/main.css";

// 🧠 Simple in-memory image cache
const imageCache = new Map();
function getCachedUrl(id) {
  return imageCache.get(id);
}
function setCachedUrl(id, url) {
  imageCache.set(id, url);
}

const gradeOptions = [
  "R1", "R2", "R3",
  ...Array.from({ length: 7 }, (_, i) => {
    const grade = i + 1;
    return ["A", "B", "C", "D"].map((s) => `${grade}${s}`);
  }).flat(),
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
  const [photoMap, setPhotoMap] = useState({});

  // Determine allowed school IDs based on role
  const schoolIds = useMemo(() => {
    const roleName = user?.profile?.roles?.name;
    if (["superuser", "admin", "hr", "viewer"].includes(roleName)) {
      if (Array.isArray(filters.school_id) && filters.school_id.length > 0) {
        return filters.school_id.map(Number);
      }
      return schools.map((s) => s.id).filter(Boolean);
    }
    return user?.profile?.school_id ? [user.profile.school_id] : [];
  }, [user?.profile?.roles?.name, user?.profile?.school_id, schools, filters.school_id]);

  // Stable filters object for offline queries
  const normalizedFilters = useMemo(() => {
    const f = { school_id: schoolIds };
    if (Array.isArray(filters.grade) && filters.grade.length > 0)
      f.grade = filters.grade;
    if (Array.isArray(filters.category) && filters.category.length > 0)
      f.category = filters.category;
    return f;
  }, [schoolIds, filters.grade, filters.category]);

  // Offline-first data hook
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
    loadMore,
  } = useOfflineTable(
    "students",
    normalizedFilters,
    `*, school:schools(name)`,
    20, // page size
    sortBy,
    sortOrder
  );

  // 🖼️ Batch fetch student profile images
  useEffect(() => {
    if (!students || students.length === 0) return;

    const bucketName = "student-uploads";
    const folderName = "students";

    const loadPhotos = async () => {
      const idList = students.map((s) => s.id);
      const cached = {};
      const missing = [];

      idList.forEach((id) => {
        const cachedUrl = getCachedUrl(id);
        if (cachedUrl) cached[id] = cachedUrl;
        else missing.push(id);
      });

      // If all cached, just update state
      if (missing.length === 0) {
        setPhotoMap(cached);
        return;
      }

      try {
        // Batch fetch file lists from Supabase
        const listPromises = missing.map((id) =>
          api.storage.from(bucketName).list(`${folderName}/${id}/profile-pictures`)
        );
        const results = await Promise.all(listPromises);

        const map = {};
        for (let i = 0; i < results.length; i++) {
          const { data, error: listError } = results[i];
          const id = missing[i];
          if (listError || !data || data.length === 0) continue;

          // Find the first image-like file
          const file = data.find((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
          if (!file) continue;

          const filePath = `${folderName}/${id}/profile-pictures/${file.name}`;
          const { data: signed, error: signedErr } = await api.storage
            .from(bucketName)
            .createSignedUrl(filePath, 600);

          if (!signedErr && signed?.signedUrl) {
            map[id] = signed.signedUrl;
            setCachedUrl(id, signed.signedUrl);
          }
        }

        setPhotoMap((prev) => ({ ...prev, ...cached, ...map }));
      } catch (err) {
        console.error("Error loading photos:", err);
      }
    };

    // Debounce a bit to avoid rapid refetches on fast filter changes
    const timeout = setTimeout(loadPhotos, 150);
    return () => clearTimeout(timeout);
  }, [students]);

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
              showDeletedOption={["admin", "hr", "superviser"].includes(
                user?.profile?.roles?.name
              )}
            />
          </div>
        </div>

        <div
          className={`grid-layout split-container ${
            showList ? "expanded" : "collapsed"
          }`}
        >
          <div
            className={`list-items grid-item app-list-panel ${
              showList ? "show" : "hide"
            }`}
          >
            <Link to="/dashboard/students/create" className="btn btn-primary">
              Create student
            </Link>

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
                {isOnline
                  ? "Online"
                  : "Offline (changes will sync when online)"}
              </span>
            </div>

            {loading && <SkeletonList count={10} />}
            {!loading && error && (
              <div style={{ color: "red" }}>{error.message || error}</div>
            )}

            {!loading && !error && (
              <>
                <ListItems
                  students={students}
                  onDelete={deleteRow}
                  onUpdate={updateRow}
                  photoMap={photoMap}
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
            {students.length > 0 && (
              <StudentStats students={students} loading={loading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
