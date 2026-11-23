import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { DashboardTab } from "../App";
import { supabase } from "../Lib/supabase";

interface NavbarProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  activeNav: DashboardTab;
  onSelectNav: (tab: DashboardTab) => void;
  currentPath: string;
}

const NAV_ITEMS: { id: DashboardTab; label: string; shortLabel: string }[] = [
  { id: "overview", label: "Dashboard Overview", shortLabel: "Overview" },
  {
    id: "consultants",
    label: "Consultants & Call Queue",
    shortLabel: "Consultants",
  },
  { id: "bookings", label: "Calls & Escrow", shortLabel: "Calls & Escrow" },
  { id: "wallet", label: "Wallet & Payouts", shortLabel: "Wallet" },
  { id: "profile", label: "Profile Settings", shortLabel: "Profile" },
];

export default function Navbar({
  darkMode,
  onToggleTheme,
  activeNav,
  onSelectNav,
  currentPath,
}: NavbarProps) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : true
  );
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const goOnline = () => setIsNetworkOnline(true);
    const goOffline = () => setIsNetworkOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const syncUserIdentity = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setUserName("");
        setAvatarUrl("");
        return;
      }

      setUserId(user.id);
      const fallbackName =
        (user.user_metadata?.full_name as string) ||
        user.email?.split("@")[0] ||
        "Member";
      const fallbackAvatar = (user.user_metadata?.avatar_url as string) || "";

      setUserName(fallbackName);
      setAvatarUrl(fallbackAvatar);

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (prof) {
        if (prof.full_name) setUserName(String(prof.full_name));
        setAvatarUrl(String(prof.avatar_url || fallbackAvatar || ""));
      }
    } catch {
      // Ignore transient auth check errors
    }
  }, []);

  useEffect(() => {
    syncUserIdentity();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      syncUserIdentity();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncUserIdentity]);

  useEffect(() => {
    if (drawerOpen || activeNav === "profile") {
      syncUserIdentity();
    }
  }, [drawerOpen, activeNav, syncUserIdentity]);

  const isActiveOnline = isNetworkOnline && Boolean(userId);
  const statusColor = isActiveOnline ? "#22c55e" : "#ef4444";
  const statusLabel = isActiveOnline ? "Online" : "Offline";

  const handleLogout = async () => {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  const handleNavClick = (tab: DashboardTab) => {
    onSelectNav(tab);
    setDrawerOpen(false);
    navigate("/dashboard");
  };

  const normalizedPath = currentPath.toLowerCase();
  const isHome = normalizedPath === "/";
  const isAuthPage =
    normalizedPath === "/signin" || normalizedPath === "/signup";
  const showNavs = !isHome && !isAuthPage;

  const bgHeader = darkMode ? "#111827" : "#ffffff";
  const bgSidebar = darkMode ? "#0f172a" : "#fdfbf7";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#94a3b8" : "#57534e";
  const borderColor = darkMode ? "#1e293b" : "#e5e0d8";
  const accentBlue = "#2563eb";

  const initials =
    (userName || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";

  const activeLightDot = (size = 9) => (
    <span
      aria-label={statusLabel}
      title={statusLabel}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "9999px",
        backgroundColor: statusColor,
        boxShadow: isActiveOnline
          ? "0 0 0 2px rgba(34, 197, 94, 0.25), 0 0 8px rgba(34, 197, 94, 0.85)"
          : "0 0 0 2px rgba(239, 68, 68, 0.2)",
        display: "inline-block",
        flexShrink: 0,
        transition: "background-color 0.2s ease, box-shadow 0.2s ease",
      }}
    />
  );

  const headerAvatarWithName = userId ? (
    <button
      type="button"
      onClick={() => handleNavClick("profile")}
      title={`${userName} (${statusLabel}) — Profile Settings`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.22rem 0.6rem 0.22rem 0.25rem",
        borderRadius: "9999px",
        border: `1px solid ${borderColor}`,
        backgroundColor: darkMode ? "#0f172a" : "#fdfbf7",
        color: textPrimary,
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: isMobile ? "146px" : "220px",
      }}
    >
      <span
        style={{
          position: "relative",
          width: "28px",
          height: "28px",
          borderRadius: "9999px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "9999px",
            overflow: "hidden",
            backgroundColor: accentBlue,
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <span>{initials}</span>
          )}
        </span>
        <span
          style={{
            position: "absolute",
            right: "-1px",
            bottom: "-1px",
            width: "9px",
            height: "9px",
            borderRadius: "9999px",
            backgroundColor: statusColor,
            border: `2px solid ${darkMode ? "#0f172a" : "#fdfbf7"}`,
            boxShadow: isActiveOnline
              ? "0 0 6px rgba(34, 197, 94, 0.9)"
              : "none",
          }}
        />
      </span>
      <span
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {userName}
      </span>
    </button>
  ) : null;

  const homeThemeToggle = (
    <button
      type="button"
      onClick={onToggleTheme}
      style={{
        padding: "0.42rem 0.72rem",
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
        backgroundColor: "transparent",
        color: textPrimary,
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {darkMode ? "Light Mode" : "Dark Mode"}
    </button>
  );

  const statusIndicatorRow = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.48rem 0.75rem",
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
        backgroundColor: darkMode
          ? "rgba(17, 24, 39, 0.6)"
          : "rgba(255, 255, 255, 0.7)",
        fontSize: "0.8rem",
        fontWeight: 600,
      }}
    >
      <span style={{ color: textMuted }}>Status</span>
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "0.42rem" }}
      >
        {activeLightDot(9)}
        <span style={{ color: isActiveOnline ? "#22c55e" : "#ef4444" }}>
          {statusLabel}
        </span>
      </span>
    </div>
  );

  return (
    <>
      <header
        style={{
          height: "58px",
          backgroundColor: bgHeader,
          borderBottom: `1px solid ${borderColor}`,
          padding: "0 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
        }}
      >
        {/* Left side: Hamburger on mobile (when navs are shown), Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            minWidth: 0,
          }}
        >
          {showNavs && isMobile && (
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
                color: textPrimary,
                fontSize: "1.15rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ☰
            </button>
          )}

          <Link
            to="/"
            onClick={() => onSelectNav("overview")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              color: textPrimary,
              fontWeight: 700,
              fontSize: isMobile ? "0.95rem" : "1.02rem",
              whiteSpace: "nowrap",
            }}
          >
            <img
              src="/icon.png"
              alt="Find An Expert Icon"
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "6px",
                objectFit: "cover",
              }}
            />
            <span>Find An Expert</span>
          </Link>
        </div>

        {/* Far right end: Theme Switch on Home + Avatar with User Name & Status Light */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            flexShrink: 0,
          }}
        >
          {isHome && homeThemeToggle}
          {!isAuthPage && headerAvatarWithName}
        </div>
      </header>

      {/* Fixed Left Desktop Sidebar (hidden on Home, Sign In, and Sign Up) */}
      {showNavs && !isMobile && (
        <aside
          aria-label="Primary Dashboard Navigation"
          style={{
            position: "fixed",
            top: "58px",
            left: 0,
            bottom: 0,
            width: "230px",
            backgroundColor: bgSidebar,
            borderRight: `1px solid ${borderColor}`,
            padding: "1rem 0.85rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            zIndex: 35,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              currentPath === "/dashboard" && activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                style={{
                  textAlign: "left",
                  padding: "0.62rem 0.8rem",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: isActive ? accentBlue : "transparent",
                  color: isActive ? "#ffffff" : textPrimary,
                  fontWeight: isActive ? 700 : 500,
                  fontSize: "0.86rem",
                  cursor: "pointer",
                }}
              >
                {item.shortLabel}
              </button>
            );
          })}

          <div
            style={{
              marginTop: "auto",
              paddingTop: "0.85rem",
              borderTop: `1px solid ${borderColor}`,
              display: "flex",
              flexDirection: "column",
              gap: "0.55rem",
            }}
          >
            {statusIndicatorRow}

            <button
              type="button"
              onClick={onToggleTheme}
              style={{
                width: "100%",
                padding: "0.58rem 0.8rem",
                borderRadius: "8px",
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
                color: textPrimary,
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            </button>

            {userId && (
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  width: "100%",
                  padding: "0.58rem 0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #ef4444",
                  backgroundColor: "transparent",
                  color: "#ef4444",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Log Out
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Mobile Drawer (hidden on Home, Sign In, and Sign Up) */}
      {showNavs && isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 60,
            display: "flex",
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "275px",
              maxWidth: "82vw",
              height: "100%",
              backgroundColor: bgSidebar,
              color: textPrimary,
              borderRight: `1px solid ${borderColor}`,
              padding: "1.15rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.65rem",
              }}
            >
              <strong style={{ fontSize: "0.98rem" }}>Find An Expert</strong>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                style={{
                  border: `1px solid ${borderColor}`,
                  backgroundColor: "transparent",
                  color: textPrimary,
                  borderRadius: "6px",
                  padding: "0.2rem 0.55rem",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {NAV_ITEMS.map((item) => {
              const active =
                currentPath === "/dashboard" && activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.68rem 0.85rem",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: active ? accentBlue : "transparent",
                    color: active ? "#ffffff" : textPrimary,
                    fontWeight: active ? 700 : 500,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              );
            })}

            <div
              style={{
                marginTop: "auto",
                paddingTop: "0.9rem",
                borderTop: `1px solid ${borderColor}`,
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
              }}
            >
              {statusIndicatorRow}

              <button
                type="button"
                onClick={onToggleTheme}
                style={{
                  width: "100%",
                  padding: "0.62rem 0.9rem",
                  borderRadius: "8px",
                  border: `1px solid ${borderColor}`,
                  backgroundColor: "transparent",
                  color: textPrimary,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              </button>

              {userId && (
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "0.62rem 0.9rem",
                    borderRadius: "8px",
                    border: "1px solid #ef4444",
                    backgroundColor: "transparent",
                    color: "#ef4444",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log Out
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
