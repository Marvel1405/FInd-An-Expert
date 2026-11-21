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

const NAV_ITEMS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Dashboard Overview" },
  { id: "consultants", label: "Consultants & Call Queue" },
  { id: "bookings", label: "Calls & Escrow" },
  { id: "wallet", label: "Wallet & Payouts" },
  { id: "profile", label: "Profile Settings" },
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
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const syncUserIdentity = useCallback(async () => {
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

  // Refresh avatar & name whenever the drawer opens or activeNav changes
  useEffect(() => {
    if (drawerOpen || activeNav === "profile") {
      syncUserIdentity();
    }
  }, [drawerOpen, activeNav, syncUserIdentity]);

  const handleLogout = async () => {
    setDrawerOpen(false);
    await supabase.auth.signOut();
    navigate("/signin");
  };

  const isHome = currentPath === "/";
  const bgHeader = darkMode ? "#111827" : "#ffffff";
  const bgDrawer = darkMode ? "#0f172a" : "#fdfbf7";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const borderColor = darkMode ? "#1e293b" : "#e5e0d8";
  const accentBlue = "#2563eb";

  const initials =
    (userName || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "U";

  return (
    <>
      <header
        style={{
          height: "58px",
          backgroundColor: bgHeader,
          borderBottom: `1px solid ${borderColor}`,
          padding: "0 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <button
            type="button"
            aria-label="Open menu"
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
            }}
          >
            ☰
          </button>

          <Link
            to="/dashboard"
            onClick={() => onSelectNav("overview")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              textDecoration: "none",
              color: textPrimary,
              fontWeight: 700,
              fontSize: "1.02rem",
            }}
          >
            <img
              src="/icon.png"
              alt="App Icon"
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "6px",
                objectFit: "cover",
              }}
            />
            <span>MicroAdvisory</span>
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            type="button"
            onClick={onToggleTheme}
            style={{
              padding: "0.42rem 0.75rem",
              borderRadius: "8px",
              border: `1px solid ${borderColor}`,
              backgroundColor: "transparent",
              color: textPrimary,
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>

          {!isHome && !userId && (
            <Link
              to="/signin"
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "8px",
                backgroundColor: accentBlue,
                color: "#ffffff",
                textDecoration: "none",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 50,
            display: "flex",
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "275px",
              maxWidth: "82vw",
              height: "100%",
              backgroundColor: bgDrawer,
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
              <strong style={{ fontSize: "0.98rem" }}>Navigation</strong>
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
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectNav(item.id);
                    setDrawerOpen(false);
                    navigate("/dashboard");
                  }}
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

            {/* Circular Avatar + Name Displayed Exclusively Right Above Log Out */}
            {userId && (
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: "0.9rem",
                  borderTop: `1px solid ${borderColor}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.7rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "9999px",
                      overflow: "hidden",
                      border: `2px solid ${accentBlue}`,
                      backgroundColor: accentBlue,
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      flexShrink: 0,
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
                  </div>

                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "0.92rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {userName}
                  </span>
                </div>

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
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
