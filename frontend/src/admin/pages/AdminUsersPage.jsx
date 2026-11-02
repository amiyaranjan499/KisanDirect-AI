import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import { listAdminConsumers, listAdminFarmers, updateAdminUserStatus } from "../../services/adminApi";

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Drawer detail state
  const [selectedUser, setSelectedUser] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Status toggle confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [userToToggle, setUserToToggle] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [consumers, farmers] = await Promise.all([listAdminConsumers(), listAdminFarmers()]);
      const merged = [
        ...consumers.map((u) => ({
          ...u,
          id: u.user_id || u.id,
          role: "CONSUMER",
          statusText: u.is_active ? "Active" : "Inactive",
        })),
        ...farmers.map((u) => ({
          ...u,
          id: u.user_id || u.id,
          role: "FARMER",
          statusText: u.is_active ? "Active" : "Inactive",
        })),
      ];
      setUsers(merged);
    } catch (err) {
      setError(err.message || "Failed to load platform users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        `${u.name || ""} ${u.email || ""} ${u.phone || ""} ${u.id || ""}`.toLowerCase().includes(q);
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" || (statusFilter === "ACTIVE" ? u.is_active : !u.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const handleOpenToggle = (user, e) => {
    if (e) e.stopPropagation();
    setUserToToggle(user);
    setToggleError("");
    setConfirmModalOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!userToToggle) return;
    setToggleLoading(true);
    setToggleError("");
    try {
      await updateAdminUserStatus(userToToggle.id, { is_active: !userToToggle.is_active });
      setConfirmModalOpen(false);
      setUserToToggle(null);
      await loadUsers();
    } catch (err) {
      setToggleError(err.message || "Unable to update account status.");
    } finally {
      setToggleLoading(false);
    }
  };

  const handleViewUser = (user, e) => {
    if (e) e.stopPropagation();
    setSelectedUser(user);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "id",
      label: "User ID",
      width: "120px",
      render: (u) => (
        <span className="font-monospace text-muted" title={u.id}>
          {String(u.id).slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      key: "name",
      label: "Name / Email",
      sortable: true,
      render: (u) => (
        <div className="admin-entity-cell">
          <span className="admin-avatar-mini">
            {(u.name || u.email || "U").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{u.name || "Unnamed"}</strong>
            <div className="text-muted small">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      width: "120px",
      render: (u) => (
        <span className={`admin-badge admin-badge-${u.role.toLowerCase()}`}>
          {u.role}
        </span>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (u) => u.phone || "—",
    },
    {
      key: "created_at",
      label: "Joined",
      sortable: true,
      width: "130px",
      render: (u) => formatDate(u.created_at),
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      width: "110px",
      render: (u) => (
        <span className={`admin-badge admin-badge-${u.is_active ? "active" : "inactive"}`}>
          {u.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "180px",
      align: "right",
      render: (u) => (
        <div className="d-flex align-items-center justify-content-end gap-2">
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => handleViewUser(u, e)}
          >
            <i className="bi bi-eye" /> View
          </button>
          <button
            type="button"
            className={`admin-table-action-btn ${u.is_active ? "text-danger" : "text-success"}`}
            onClick={(e) => handleOpenToggle(u, e)}
          >
            <i className={`bi ${u.is_active ? "bi-person-x" : "bi-person-check"}`} />
            {u.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  const roleTabs = [
    { key: "ALL", label: "All Roles", count: users.length },
    { key: "CONSUMER", label: "Consumers", count: users.filter((u) => u.role === "CONSUMER").length },
    { key: "FARMER", label: "Farmers", count: users.filter((u) => u.role === "FARMER").length },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Status" },
    { key: "ACTIVE", label: "Active" },
    { key: "INACTIVE", label: "Inactive" },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">User Directory</span>
          <h1>User Management</h1>
          <p>Supervise registered platform accounts, roles, access statuses, and activity history.</p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={loadUsers}
            disabled={loading}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs Rows */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <AdminFilterTabs tabs={roleTabs} activeTab={roleFilter} onChange={setRoleFilter} />
        <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />
      </div>

      {/* Data Table */}
      <AdminDataTable
        columns={columns}
        data={filteredUsers}
        loading={loading}
        error={error}
        onRetry={loadUsers}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, phone, or ID..."
        pageSize={12}
        emptyTitle="No users found"
        emptyDescription="No platform accounts match your current filter criteria."
        onRowClick={handleViewUser}
      />

      {/* User Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedUser?.name || "User Details"}
        subtitle={selectedUser?.email}
        badge={
          selectedUser && (
            <span
              className={`admin-badge admin-badge-${
                selectedUser.is_active ? "active" : "inactive"
              }`}
            >
              {selectedUser.is_active ? "Active" : "Inactive"}
            </span>
          )
        }
        footer={
          selectedUser && (
            <>
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setDrawerOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className={selectedUser.is_active ? "admin-btn-danger" : "admin-btn-primary"}
                onClick={() => {
                  setDrawerOpen(false);
                  handleOpenToggle(selectedUser);
                }}
              >
                {selectedUser.is_active ? "Deactivate Account" : "Activate Account"}
              </button>
            </>
          )
        }
      >
        {selectedUser && (
          <>
            <section className="admin-detail-section">
              <h4>Account Identity</h4>
              <dl className="admin-detail-list">
                <dt>User ID</dt>
                <dd className="font-monospace">{selectedUser.id}</dd>
                <dt>Role</dt>
                <dd>
                  <span className={`admin-badge admin-badge-${selectedUser.role.toLowerCase()}`}>
                    {selectedUser.role}
                  </span>
                </dd>
                <dt>Full Name</dt>
                <dd>{selectedUser.name || "Not provided"}</dd>
                <dt>Email</dt>
                <dd>{selectedUser.email}</dd>
                <dt>Phone</dt>
                <dd>{selectedUser.phone || "Not specified"}</dd>
                <dt>Address</dt>
                <dd>{selectedUser.address || "No address on file"}</dd>
                <dt>Joined On</dt>
                <dd>{formatDate(selectedUser.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Activity Metrics</h4>
              <dl className="admin-detail-list">
                {selectedUser.role === "CONSUMER" ? (
                  <>
                    <dt>Orders Placed</dt>
                    <dd>{selectedUser.order_count ?? 0}</dd>
                    <dt>Total Spend</dt>
                    <dd>{money(selectedUser.total_spend ?? 0)}</dd>
                    <dt>Reviews Submitted</dt>
                    <dd>{selectedUser.review_count ?? 0}</dd>
                  </>
                ) : (
                  <>
                    <dt>Listings Created</dt>
                    <dd>{selectedUser.listing_count ?? 0}</dd>
                    <dt>Active Listings</dt>
                    <dd>{selectedUser.active_listing_count ?? 0}</dd>
                    <dt>Orders Fulfilled</dt>
                    <dd>{selectedUser.order_count ?? 0}</dd>
                    <dt>Gross Farm Sales</dt>
                    <dd>{money(selectedUser.total_sales ?? 0)}</dd>
                  </>
                )}
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>

      {/* Status Toggle Confirm Modal */}
      <AdminConfirmDialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmToggle}
        title={userToToggle?.is_active ? "Deactivate User Account" : "Activate User Account"}
        message={`Are you sure you want to ${
          userToToggle?.is_active ? "deactivate" : "activate"
        } account access for ${userToToggle?.name || userToToggle?.email}?`}
        confirmLabel={userToToggle?.is_active ? "Deactivate" : "Activate"}
        confirmVariant={userToToggle?.is_active ? "danger" : "primary"}
        requireReason={false}
        loading={toggleLoading}
        error={toggleError}
      />
    </div>
  );
}
