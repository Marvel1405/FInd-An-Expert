import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./Lib/supabase";
import Navbar from "./Components/Navbar";
import Splashscreen from "./Components/Splashscreen";
import Home from "./Pages/Home";
import Auth from "./Pages/Auth";
import Dashboard from "./Pages/Dashboard";

export type DashboardTab =
  | "overview"
  | "consultants"
  | "bookings"
  | "wallet"
  | "profile";

const WALLPAPER_STORAGE_KEY = "fae_dashboard_wallpaper";
const THEME_STORAGE_KEY = "fae_dark_mode";

function AppShell() {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved !== null) return saved === "true";
    } catch {
      // Ignore storage read errors
    }
    return true;
  });
  const [activeNav, setActiveNav] = useState<DashboardTab>("overview");
  const [wallpaper, setWallpaper] = useState<string>(() => {
    try {
      return localStorage.getItem(WALLPAPER_STORAGE_KEY) || "default";
    } catch {
      return "default";
    }
  });

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        const currentSession = data.session ?? null;
        setSession(currentSession);
        if (currentSession) {
          setActiveNav("overview");
        }
        setAuthReady(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(null);
        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      const resolved = nextSession ?? null;
      setSession(resolved);
      setActiveNav("overview");
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 5000);
    return () => clearTimeout(t);
  }, []);

  const handleToggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  };

  const handleChangeWallpaper = (nextWallpaper: string) => {
    setWallpaper(nextWallpaper);
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, nextWallpaper);
    } catch {
      // Ignore storage quota errors
    }
  };

  if (!authReady || showSplash) {
    return <Splashscreen darkMode={darkMode} />;
  }

  const isAuthenticated = Boolean(session);
  const effectivePath = isAuthenticated ? "/dashboard" : location.pathname;

  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box" }}>
      <Navbar
        darkMode={darkMode}
        onToggleTheme={handleToggleTheme}
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        currentPath={effectivePath}
      />

      <div
        style={{
          paddingTop: "58px",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
      >
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Home darkMode={darkMode} wallpaper={wallpaper} />
              )
            }
          />
          <Route
            path="/signin"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Auth darkMode={darkMode} wallpaper={wallpaper} />
              )
            }
          />
          <Route
            path="/signup"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Auth darkMode={darkMode} wallpaper={wallpaper} />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                <Dashboard
                  darkMode={darkMode}
                  activeNav={activeNav}
                  onChangeNav={setActiveNav}
                  wallpaper={wallpaper}
                  onChangeWallpaper={handleChangeWallpaper}
                />
              ) : (
                <Navigate to="/signin" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              <Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
