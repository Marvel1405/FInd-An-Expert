import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../Lib/supabase";

interface SignInProps {
  darkMode?: boolean;
}

export default function SignIn({ darkMode = false }: SignInProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    navigate("/dashboard");
    setLoading(false);
  };

  const cardBg = darkMode ? "#111827" : "#ffffff";
  const textColor = darkMode ? "#f8fafc" : "#222222";
  const mutedColor = darkMode ? "#94a3b8" : "#57534e";
  const inputBg = darkMode ? "#0b1020" : "#fdfbf7";
  const borderColor = darkMode ? "#334155" : "#cbd5e1";

  return (
    <div
      className="auth-container"
      style={{
        backgroundColor: cardBg,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
      }}
    >
      <h2 style={{ color: textColor }}>Welcome Back</h2>
      <p className="sub" style={{ color: mutedColor }}>
        Sign in to access your sessions, escrow vault, and archive.
      </p>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSignIn}>
        <div className="form-group">
          <label style={{ color: textColor }}>Email Address</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              backgroundColor: inputBg,
              color: textColor,
              borderColor,
            }}
          />
        </div>

        <div className="form-group">
          <label style={{ color: textColor }}>Password</label>
          <input
            type="password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              backgroundColor: inputBg,
              color: textColor,
              borderColor,
            }}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={loading}
        >
          {loading ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.9rem",
          textAlign: "center",
          color: mutedColor,
        }}
      >
        Don&apos;t have an account?{" "}
        <Link to="/signup" style={{ color: "#2563eb", fontWeight: 600 }}>
          Create one
        </Link>
      </p>
    </div>
  );
}
