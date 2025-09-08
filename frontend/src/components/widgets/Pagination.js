import React, { useRef, useCallback } from "react";
import SkeletonList from "./SkeletonList";

export default function Pagination({ page, hasMore, loadMore, loading }) {
  const observer = useRef();

  const lastItemRef = useCallback(
    (node) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore, loadMore]
  );

  return (
    <div className="pagination-container">
      {hasMore && !loading && (
        <button className="app-btn app-btn-secondary" onClick={loadMore}>
          Load More
        </button>
      )}
      {loading && <SkeletonList count={5} />}
    </div>
  );
}
