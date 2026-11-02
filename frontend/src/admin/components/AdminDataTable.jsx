import { useEffect, useMemo, useState } from "react";

export default function AdminDataTable({
  columns = [],
  data = [],
  loading = false,
  error = "",
  onRetry = null,
  search = "",
  onSearchChange = null,
  searchPlaceholder = "Search records...",
  page = 1,
  pageSize = 10,
  total = null,
  onPageChange = null,
  sortKey = "",
  sortDirection = "asc",
  onSort = null,
  emptyTitle = "No records found",
  emptyDescription = "There are no entries matching your current criteria.",
  toolbarActions = null,
  onRowClick = null,
  keyField = "id",
}) {
  const [internalSearch, setInternalSearch] = useState(search);
  const [internalPage, setInternalPage] = useState(page);
  const [internalSortKey, setInternalSortKey] = useState(sortKey);
  const [internalSortDir, setInternalSortDir] = useState(sortDirection);

  // Sync props to internal state
  useEffect(() => {
    setInternalSearch(search);
  }, [search]);

  useEffect(() => {
    setInternalPage(page);
  }, [page]);

  useEffect(() => {
    if (sortKey) setInternalSortKey(sortKey);
    if (sortDirection) setInternalSortDir(sortDirection);
  }, [sortKey, sortDirection]);

  // Debounced search trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      if (onSearchChange && internalSearch !== search) {
        onSearchChange(internalSearch);
      }
    }, 280);
    return () => clearTimeout(handler);
  }, [internalSearch, onSearchChange, search]);

  const handleSort = (colKey) => {
    if (onSort) {
      onSort(colKey);
      return;
    }
    if (internalSortKey === colKey) {
      setInternalSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setInternalSortKey(colKey);
      setInternalSortDir("asc");
    }
  };

  // Client-side fallback sorting if no server sort
  const sortedData = useMemo(() => {
    if (onSort || !internalSortKey) return data;
    return [...data].sort((a, b) => {
      const valA = a[internalSortKey];
      const valB = b[internalSortKey];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === "number" && typeof valB === "number") {
        return internalSortDir === "asc" ? valA - valB : valB - valA;
      }
      return internalSortDir === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [data, internalSortKey, internalSortDir, onSort]);

  // Client-side fallback pagination
  const effectiveTotal = total != null ? total : sortedData.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const currentPage = onPageChange ? page : internalPage;

  const paginatedData = useMemo(() => {
    if (onPageChange || total != null) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, onPageChange, total, currentPage, pageSize]);

  const changePage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalPage(newPage);
    }
  };

  return (
    <div className="admin-data-table-container">
      {/* Table Toolbar */}
      {(onSearchChange || searchPlaceholder || toolbarActions) && (
        <div className="admin-table-toolbar">
          {onSearchChange !== false && (
            <div className="admin-table-search">
              <i className="bi bi-search" aria-hidden="true" />
              <input
                type="search"
                value={internalSearch}
                onChange={(e) => {
                  setInternalSearch(e.target.value);
                  if (!onPageChange) setInternalPage(1);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
              {internalSearch && (
                <button
                  type="button"
                  className="admin-search-clear"
                  onClick={() => {
                    setInternalSearch("");
                    if (onSearchChange) onSearchChange("");
                  }}
                  aria-label="Clear search"
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          )}
          {toolbarActions && <div className="admin-table-actions">{toolbarActions}</div>}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="admin-table-error" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
          {onRetry && (
            <button type="button" className="admin-retry-btn" onClick={onRetry}>
              <i className="bi bi-arrow-clockwise" /> Retry
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = (onSort ? sortKey : internalSortKey) === col.key;
                const currentDir = onSort ? sortDirection : internalSortDir;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align || "left" }}
                    className={col.sortable ? "sortable-th" : ""}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    aria-sort={isSorted ? (currentDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <div className="th-content" style={{ justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start" }}>
                      <span>{col.label}</span>
                      {col.sortable && (
                        <span className={`sort-icon ${isSorted ? "active" : ""}`}>
                          {isSorted ? (
                            currentDir === "asc" ? (
                              <i className="bi bi-arrow-up" />
                            ) : (
                              <i className="bi bi-arrow-down" />
                            )
                          ) : (
                            <i className="bi bi-arrow-down-up opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: Math.min(pageSize, 6) }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} className="admin-skeleton-row">
                  {columns.map((col) => (
                    <td key={col.key}>
                      <div className="admin-skeleton-shimmer" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="admin-empty-cell">
                  <div className="admin-empty-state">
                    <div className="admin-empty-icon">
                      <i className="bi bi-inbox" />
                    </div>
                    <h4>{emptyTitle}</h4>
                    <p>{emptyDescription}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => {
                const rowKey = row[keyField] || row.id || rowIdx;
                return (
                  <tr
                    key={rowKey}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? "clickable-row" : ""}
                  >
                    {columns.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || "left" }}>
                        {col.render ? col.render(row) : (row[col.key] != null ? String(row[col.key]) : "—")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!loading && effectiveTotal > 0 && (
        <div className="admin-pagination-bar">
          <div className="admin-pagination-info">
            Showing <b>{Math.min(effectiveTotal, (currentPage - 1) * pageSize + 1)}</b> to{" "}
            <b>{Math.min(effectiveTotal, currentPage * pageSize)}</b> of <b>{effectiveTotal}</b> records
          </div>

          <div className="admin-pagination-controls">
            <button
              type="button"
              className="admin-page-btn"
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
              aria-label="Previous page"
            >
              <i className="bi bi-chevron-left" /> Prev
            </button>

            <span className="admin-page-indicator">
              Page <b>{currentPage}</b> of <b>{totalPages}</b>
            </span>

            <button
              type="button"
              className="admin-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(currentPage + 1)}
              aria-label="Next page"
            >
              Next <i className="bi bi-chevron-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

