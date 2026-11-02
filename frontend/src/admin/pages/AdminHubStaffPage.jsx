import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import {
  listAdminHubStaff,
} from "../../services/adminApi";

export default function AdminHubStaffPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const staffRows = await listAdminHubStaff();
      setStaff(Array.isArray(staffRows) ? staffRows : []);
    } catch (err) {
      setError(err.message || "Failed to load hub staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group multiple assignments per user
  const groupedStaff = useMemo(() => {
    const grouped = new Map();
    staff.forEach((entry) => {
      if (!grouped.has(entry.user_id)) {
        grouped.set(entry.user_id, {
          user_id: entry.user_id,
          email: entry.email,
          display_name: entry.display_name,
          assignments: [],
        });
      }
      if (entry.hub_id) {
        grouped.get(entry.user_id).assignments.push({
          hub_id: entry.hub_id,
          hub_name: entry.hub_name,
        });
      }
    });
    return [...grouped.values()];
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedStaff.filter((s) => {
      return (
        !q ||
        `${s.display_name || ""} ${s.email || ""} ${s.user_id || ""}`.toLowerCase().includes(q)
      );
    });
  }, [groupedStaff, search]);


  const columns = [
    {
      key: "display_name",
      label: "Staff Member",
      sortable: true,
      render: (s) => (
        <div className="admin-entity-cell">
          <span className="admin-avatar-mini">
            {(s.display_name || s.email || "S").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{s.display_name}</strong>
            <div className="text-muted small">{s.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "assignments",
      label: "Assigned Kisan Hubs",
      render: (s) => (
        <div className="d-flex flex-wrap gap-2">
          {s.assignments.length === 0 ? (
            <span className="badge bg-light text-warning border">No Hub Assigned</span>
          ) : (
            s.assignments.map((a) => (
              <span
                key={a.hub_id}
                className="badge bg-light text-dark border d-inline-flex align-items-center gap-1"
              >
                <i className="bi bi-geo-alt-fill text-forest" />
                {a.hub_name}
              </span>
            ))
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Facility Workforce</span>
          <h1>Hub Staff Directory</h1>
          <p>Platform directory of warehouse personnel assigned to farmer-owned Kisan Hubs.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={refresh} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminDataTable
        columns={columns}
        data={filteredStaff}
        loading={loading}
        error={error}
        onRetry={refresh}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search hub staff by name, email, or user ID..."
        pageSize={12}
        emptyTitle="No hub staff members found"
        emptyDescription="No hub staff members currently active."
        keyField="user_id"
      />
    </div>
  );
}
