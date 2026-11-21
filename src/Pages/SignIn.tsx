import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../Lib/supabase";

interface SignInProps {
  darkMode: boolean;
}

export default function SignIn({ darkMode }: SignInProps) {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"client" | "consultant">("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const bgCard = darkMode ? "#111827" : "#ffffff";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#94a3b8" : "#57534e";
  const borderColor = darkMode ? "#1e293b" : "#e5e0d8";
  const accentBlue = "#2563eb";

  const inputStyle = {
    width: "100%",
    padding: "0.7rem 0.85rem",
    borderRadius: "8px",
    border: `1px solid ${borderColor}`,
    backgroundColor: darkMode ? "#0b1020" : "#fdfbf7",
    color: textPrimary,
    fontSize: "0.92rem",
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!isSupabaseConfigured) {
      setMessage({
        type: "error",
        text: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your hosting environment variables.",
      });
      return;
    }

    if (!email.trim() || !password) {
      setMessage({
        type: "error",
        text: "Please enter both your email and password.",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const cleanName = fullName.trim() || email.split("@")[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: cleanName,
              role,
            },
          },
        });
        if (error) throw new Error(error.message);

        if (data.session) {
          navigate("/dashboard", { replace: true });
        } else {
          setMessage({
            type: "success",
            text: "Account created! Check your email if confirmation is enabled, or sign in now.",
          });
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(error.message);
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Authentication failed.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "calc(100vh - 58px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        color: textPrimary,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: bgCard,
          border: `1px solid ${borderColor}`,
          borderRadius: "14px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem" }}>
            {isSignUp ? "Create Account" : "Sign In"}
          </h1>
          <p
            style={{
              margin: "0.3rem 0 0",
              fontSize: "0.86rem",
              color: textMuted,
            }}
          >
            {isSignUp
              ? "Join as a Consultee or Consultant to book and host live audio calls."
              : "Sign in to access your advisory dashboard, wallet, and live calls."}
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div
            style={{
              padding: "0.75rem 0.9rem",
              borderRadius: "8px",
              backgroundColor: "#fef3c7",
              color: "#92400e",
              fontSize: "0.82rem",
            }}
          >
            Add <strong>VITE_SUPABASE_URL</strong> and{" "}
            <strong>VITE_SUPABASE_ANON_KEY</strong> in your host settings and
            redeploy.
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "0.75rem 0.9rem",
              borderRadius: "8px",
              fontSize: "0.86rem",
              backgroundColor:
                message.type === "success" ? "#dcfce7" : "#fee2e2",
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
          {isSignUp && (
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
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
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
                  Account Role
                </label>
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "client" | "consultant")
                  }
                  style={inputStyle}
                >
                  <option value="client">Consultee (Book Calls)</option>
                  <option value="consultant">
                    Consultant (Host Calls & Earn)
                  </option>
                </select>
              </div>
            </>
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
              required
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
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "0.72rem 1rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: accentBlue,
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "0.92rem",
              cursor: "pointer",
              marginTop: "0.2rem",
            }}
          >
            {submitting
              ? "Please wait..."
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setIsSignUp((prev) => !prev);
          }}
          style={{
            background: "none",
            border: "none",
            color: accentBlue,
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
          }}
        >
          {isSignUp
            ? "Already have an account? Sign In"
            : "Don't have an account? Sign Up"}
        </button>
      </div>
    </main>
  );
}
