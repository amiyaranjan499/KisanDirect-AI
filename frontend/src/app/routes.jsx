export const routes = {
  home: "/",
  adminLogin: "/admin/login",
  adminDashboard: "/admin/dashboard",
  consumerDashboard: "/consumer/dashboard",
  farmerDashboard: "/farmer/dashboard",
};

export function getCurrentRoute(pathname = window.location.pathname) {
  return pathname.replace(/\/$/, "") || routes.home;
}

export function navigateTo(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}
