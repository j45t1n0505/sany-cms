import { createContext, useContext, useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = logged out
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("sp_token");
      if (!token) {
        setUser(false);
        setReady(true);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        localStorage.removeItem("sp_token");
        setUser(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("sp_token", data.token);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("sp_token");
    setUser(false);
  };

  const hasRole = (...roles) => {
    if (!user) return false;
    if (user.role === "superadmin") return true;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}
