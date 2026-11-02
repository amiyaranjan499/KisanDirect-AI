export default function AdminFilterTabs({
  tabs = [],
  activeTab = "",
  onChange = () => {},
  className = "",
}) {
  return (
    <div className={`admin-filter-tabs ${className}`} role="tablist">
      {tabs.map((tab) => {
        const key = typeof tab === "string" ? tab : tab.key;
        const label = typeof tab === "string" ? tab : tab.label;
        const count = typeof tab === "object" ? tab.count : undefined;
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`admin-tab-btn ${isActive ? "active" : ""}`}
            onClick={() => onChange(key)}
          >
            <span>{label}</span>
            {count !== undefined && (
              <span className={`admin-tab-badge ${isActive ? "active" : ""}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

