import { useEffect } from "react";

export default function AdminDetailDrawer({
  isOpen = false,
  onClose = () => {},
  title = "Details",
  subtitle = "",
  badge = null,
  children = null,
  footer = null,
  width = "540px",
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-drawer-root" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="admin-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="admin-drawer-panel" style={{ maxWidth: width }}>
        <header className="admin-drawer-header">
          <div className="admin-drawer-header-info">
            <div className="admin-drawer-title-row">
              <h3 id="drawer-title">{title}</h3>
              {badge}
            </div>
            {subtitle && <p className="admin-drawer-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="admin-drawer-close"
            onClick={onClose}
            aria-label="Close details"
          >
            <i className="bi bi-x-lg" />
          </button>
        </header>

        <div className="admin-drawer-body">{children}</div>

        {footer && <footer className="admin-drawer-footer">{footer}</footer>}
      </aside>
    </div>
  );
}

