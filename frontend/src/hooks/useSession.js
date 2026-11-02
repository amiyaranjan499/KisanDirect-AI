import { useEffect, useState } from "react";
import { getCurrentUser } from "../services/authApi";

export default function useSession() {
  const [token, setToken] = useState(() => localStorage.getItem("kisandirect_access_token") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) { setUser(null); setLoading(false); return undefined; }
    setLoading(true);
    getCurrentUser().then(setUser).catch(() => { localStorage.removeItem("kisandirect_access_token"); setToken(""); setUser(null); }).finally(() => setLoading(false));
  }, [token]);

  async function authenticate(nextToken) {
    localStorage.setItem("kisandirect_access_token", nextToken);
    setToken(nextToken);
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      localStorage.removeItem("kisandirect_access_token");
      setToken("");
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }
  function logout() { localStorage.removeItem("kisandirect_access_token"); setToken(""); setUser(null); }
  return { token, user, loading, authenticate, logout };
}
