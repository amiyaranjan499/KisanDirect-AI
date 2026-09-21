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

  function authenticate(nextToken) { localStorage.setItem("kisandirect_access_token", nextToken); setToken(nextToken); }
  function logout() { localStorage.removeItem("kisandirect_access_token"); setToken(""); setUser(null); }
  return { token, user, loading, authenticate, logout };
}
