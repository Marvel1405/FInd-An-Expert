import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./Components/Navbar";
import Splashscreen from "./Components/Splashscreen";
import Dashboard from "./Pages/Dashboard";
import Home from "./Pages/Home";
import SignIn from "./Pages/SignIn";

export type DashboardTab =
  | "overview"
  | "consultants"
  | "bookings"
  | "wallet"
  | "profile";

function AppShell() {
  const location = useLocation();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [activeNav, setActiveNav] = useState<DashboardTab>("overview");

  useEffect(() => {
    document.title = "Find An Expert";
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("theme", darkMode ? "dark" : "light");
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (showSplash) {
    return <Splashscreen darkMode={darkMode} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: darkMode ? "#0b1020" : "#fdfbf7",
        color: darkMode ? "#f8fafc" : "#222222",
        transition: "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      <Navbar
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((prev) => !prev)}
        activeNav={activeNav}
        onSelectNav={(tab) => setActiveNav(tab)}
        currentPath={location.pathname}
      />

      <Routes>
        <Route path="/" element={<Home darkMode={darkMode} />} />
        <Route path="/signin" element={<SignIn darkMode={darkMode} />} />
        <Route path="/login" element={<SignIn darkMode={darkMode} />} />
        <Route
          path="/dashboard"
          element={
            <Dashboard
              darkMode={darkMode}
              activeNav={activeNav}
              onChangeNav={setActiveNav}
            />
          }
        />
        <Route path="*" element={<Home darkMode={darkMode} />} />
      </Routes>
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
