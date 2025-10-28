import React, { useRef, useCallback } from "react";
import SkeletonList from "./SkeletonList";

export default function Pagination({ page, hasMore, loadMore, loadLess, loading, totalItems, itemsPerPage }) {
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

  const currentStart = (page - 1) * itemsPerPage + 1;
  const currentEnd = Math.min(page * itemsPerPage, totalItems);
  const hasPrevious = page > 1;

  return (
    <div className="pagination-container">
      {totalItems > 0 && (
        <div className="pagination-info">
          Showing {currentStart}-{currentEnd} of {totalItems}
        </div>
      )}
      
      <div className="pagination-buttons">
        {hasPrevious && !loading && (
          <button className="btn btn-secondary load-less-btn" onClick={loadLess}>
            ← Load Less
          </button>
        )}
        
        {hasMore && !loading && (
          <button className="btn btn-primary load-more-btn" onClick={loadMore}>
            Load More →
          </button>
        )}
      </div>
      
      {loading && <SkeletonList count={5} />}
    </div>
  );
}
