import { useEffect, useMemo, useState } from "react";
import { listAdminConsumers, listAdminFarmers, updateAdminUserStatus } from "../../services/adminApi";

const formatDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminUsersPage() {
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  const loadUsers = async () => {
    try {
      const [consumers, farmers] = await Promise.all([listAdminConsumers(), listAdminFarmers()]);
      const merged = [
        ...consumers.map((user) => ({ ...user, role: "CONSUMER", status: user.is_active ? "Active" : "Inactive" })),
        ...farmers.map((user) => ({ ...user, role: "FARMER", status: user.is_active ? "Active" : "Inactive" })),
      ];
      setUsers(merged);
    } catch (requestError) {
      setError(requestError.message || "Unable to load users.");
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTab = tab === "All" ? true : user.status === tab;
      const matchesQuery = !query || `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(query);
      return matchesTab && matchesQuery;
    });
  }, [search, tab, users]);

  const toggleStatus = async (user) => {
    try {
      setSavingId(user.user_id || user.id);
      await updateAdminUserStatus(user.user_id || user.id, { is_active: !user.is_active });
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Unable to update user status.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Users</span>
          <h1>Platform users</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." />
        </div>
      </div>

      <div className="farmer-filter-tabs admin-tabs">
        {['All', 'Active', 'Inactive'].map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.user_id || user.id}>
                <td>{String(user.user_id || user.id).slice(0, 8).toUpperCase()}</td>
                <td>{user.name || "Unknown"}</td>
                <td>{user.email || "No email"}</td>
                <td>{user.role}</td>
                <td>{formatDate(user.created_at || new Date())}</td>
                <td><span className={`admin-badge admin-badge-${user.is_active ? "active" : "inactive"}`}>{user.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button type="button" className="admin-action-button" onClick={() => toggleStatus(user)} disabled={savingId === (user.user_id || user.id)}>
                    {savingId === (user.user_id || user.id) ? "Updating..." : user.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
