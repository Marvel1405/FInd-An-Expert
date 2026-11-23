import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../Lib/supabase";

interface AuthProps {
  darkMode: boolean;
  wallpaper?: string;
}

export default function Auth({ darkMode, wallpaper = "default" }: AuthProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"signin" | "signup">(() =>
    location.pathname.toLowerCase().includes("signup") ? "signup" : "signin"
  );
  const [animKey, setAnimKey] = useState<number>(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "consultant">("client");
  const [specialty, setSpecialty] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const nextMode = location.pathname.toLowerCase().includes("signup")
      ? "signup"
      : "signin";
    setMode(nextMode);
    setAnimKey((k) => k + 1);
    setMessage(null);
  }, [location.pathname]);

  const switchMode = (next: "signin" | "signup") => {
    if (next === mode) return;
    setMode(next);
    setAnimKey((k) => k + 1);
    setMessage(null);
    navigate(next === "signup" ? "/signup" : "/signin", { replace: true });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setMessage({
        type: "error",
        text: "Please enter both your email and password.",
      });
      return;
    }

    if (mode === "signup" && !fullName.trim()) {
      setMessage({
        type: "error",
        text: "Please enter your full name to create an account.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw new Error(error.message);
        navigate("/dashboard", { replace: true });
      } else {
        const cleanName = fullName.trim();
        const cleanSpecialty =
          role === "consultant" ? specialty.trim() || "General Advisory" : null;

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              role,
              specialty: cleanSpecialty,
            },
          },
        });
        if (error) throw new Error(error.message);

        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            email: cleanEmail,
            full_name: cleanName,
            role,
            specialty: cleanSpecialty,
            kyc_status: "pending",
          });
        }

        if (data.session) {
          navigate("/dashboard", { replace: true });
        } else {
          setMessage({
            type: "success",
            text: "Account created! Check your email to confirm, then sign in.",
          });
          switchMode("signin");
        }
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Authentication failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  const isCustomImageWallpaper = wallpaper.startsWith("data:image/");
  const bgMain = darkMode ? "#0b1020" : "#fdfbf7";
  const glassCardBg = darkMode
    ? "rgba(17, 24, 39, 0.72)"
    : "rgba(255, 255, 255, 0.76)";
  const glassInputBg = darkMode
    ? "rgba(11, 16, 32, 0.62)"
    : "rgba(253, 251, 247, 0.72)";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#cbd5e1" : "#57534e";
  const borderColor = darkMode
    ? "rgba(148, 163, 184, 0.22)"
    : "rgba(34, 34, 34, 0.14)";
  const accentBlue = "#2563eb";

  const backgroundImage = isCustomImageWallpaper
    ? `linear-gradient(${
        darkMode
          ? "rgba(11, 16, 32, 0.58), rgba(11, 16, 32, 0.58)"
          : "rgba(253, 251, 247, 0.52), rgba(253, 251, 247, 0.52)"
      }), url("${wallpaper}")`
    : "none";

  const inputStyle = {
    width: "100%",
    padding: "0.68rem 0.85rem",
    borderRadius: "9px",
    border: `1px solid ${borderColor}`,
    backgroundColor: glassInputBg,
    color: textPrimary,
    fontSize: "0.92rem",
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 58px)",
        width: "100%",
        backgroundColor: bgMain,
        backgroundImage,
        backgroundSize: isCustomImageWallpaper ? "cover" : "auto",
        backgroundPosition: "center",
        backgroundRepeat: isCustomImageWallpaper ? "no-repeat" : "repeat",
        backgroundAttachment: "fixed",
        color: textPrimary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes authSmoothReveal {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: "430px",
          backgroundColor: glassCardBg,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: `1px solid ${borderColor}`,
          borderRadius: "16px",
          padding: "1.5rem",
          boxSizing: "border-box",
          boxShadow: darkMode
            ? "0 20px 45px rgba(2, 6, 23, 0.45)"
            : "0 18px 40px rgba(15, 23, 42, 0.08)",
        }}
      >
        {/* Sliding Segmented Toggle */}
        <div
          role="tablist"
          aria-label="Sign In or Sign Up toggle"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            padding: "0.28rem",
            borderRadius: "11px",
            backgroundColor: glassInputBg,
            border: `1px solid ${borderColor}`,
            marginBottom: "1.35rem",
            boxSizing: "border-box",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "0.28rem",
              bottom: "0.28rem",
              left: "0.28rem",
              width: "calc(50% - 0.28rem)",
              borderRadius: "8px",
              backgroundColor: accentBlue,
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              transform:
                mode === "signup" ? "translateX(100%)" : "translateX(0%)",
              transition: "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />

          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => switchMode("signin")}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "0.55rem 0.75rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "transparent",
              color: mode === "signin" ? "#ffffff" : textPrimary,
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              transition: "color 0.25s ease",
            }}
          >
            Sign In
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => switchMode("signup")}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "0.55rem 0.75rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "transparent",
              color: mode === "signup" ? "#ffffff" : textPrimary,
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              transition: "color 0.25s ease",
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Animated Form Body */}
        <div
          key={`${mode}-${animKey}`}
          style={{
            animation:
              "authSmoothReveal 0.34s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          <div style={{ marginBottom: "1.1rem" }}>
            <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800 }}>
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p
              style={{
                margin: "0.3rem 0 0",
                fontSize: "0.86rem",
                color: textMuted,
              }}
            >
              {mode === "signin"
                ? "Sign in to access your calls, escrow wallet, and profile."
                : "Join Find An Expert as a consultee or verified consultant."}
            </p>
          </div>

          {message && (
            <div
              style={{
                padding: "0.75rem 0.9rem",
                borderRadius: "9px",
                fontSize: "0.85rem",
                fontWeight: 500,
                marginBottom: "1rem",
                backgroundColor:
                  message.type === "success"
                    ? "rgba(220, 252, 231, 0.92)"
                    : "rgba(254, 226, 226, 0.92)",
                color: message.type === "success" ? "#166534" : "#991b1b",
              }}
            >
              {message.text}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}
          >
            {mode === "signup" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    marginBottom: "0.3rem",
                  }}
                >
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  marginBottom: "0.3rem",
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  marginBottom: "0.3rem",
                }}
              >
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            {mode === "signup" && (
              <>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      marginBottom: "0.3rem",
                    }}
                  >
                    Account Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as "client" | "consultant")
                    }
                    style={inputStyle}
                  >
                    <option value="client">Consultee (Book Sessions)</option>
                    <option value="consultant">
                      Consultant (Host Sessions)
                    </option>
                  </select>
                </div>

                {role === "consultant" && (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        marginBottom: "0.3rem",
                      }}
                    >
                      Specialty
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Finance, Legal, Software"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "0.35rem",
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "9px",
                border: "none",
                backgroundColor: accentBlue,
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.92rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 8px 18px rgba(37, 99, 235, 0.28)",
                transition: "transform 0.15s ease, opacity 0.2s ease",
              }}
            >
              {loading
                ? mode === "signin"
                  ? "Signing In..."
                  : "Creating Account..."
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
