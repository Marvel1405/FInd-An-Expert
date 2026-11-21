import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../Lib/supabase";

interface SignUpProps {
  darkMode?: boolean;
}

export default function SignUp({ darkMode = false }: SignUpProps) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "consultant">("client");
  const [specialty, setSpecialty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        full_name: fullName,
        email,
        role,
        specialty: role === "consultant" ? specialty : null,
      });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      navigate("/dashboard");
    }
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
      <h2 style={{ color: textColor }}>Create Your Account</h2>
      <p className="sub" style={{ color: mutedColor }}>
        Join as a client seeking advice or a verified consultant.
      </p>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSignUp}>
        <label
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: "0.9rem",
            marginBottom: "0.35rem",
            color: textColor,
          }}
        >
          I want to join as a:
        </label>
        <div className="role-toggle">
          <button
            type="button"
            className={`role-btn ${role === "client" ? "active" : ""}`}
            onClick={() => setRole("client")}
            style={{
              backgroundColor: role === "client" ? "#2563eb" : inputBg,
              color: role === "client" ? "#ffffff" : textColor,
              borderColor,
            }}
          >
            Client
          </button>
          <button
            type="button"
            className={`role-btn ${role === "consultant" ? "active" : ""}`}
            onClick={() => setRole("consultant")}
            style={{
              backgroundColor: role === "consultant" ? "#2563eb" : inputBg,
              color: role === "consultant" ? "#ffffff" : textColor,
              borderColor,
            }}
          >
            Consultant
          </button>
        </div>

        <div className="form-group">
          <label style={{ color: textColor }}>Full Name</label>
          <input
            type="text"
            required
            placeholder="e.g. Marvelous Kalu"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ backgroundColor: inputBg, color: textColor, borderColor }}
          />
        </div>

        <div className="form-group">
          <label style={{ color: textColor }}>Email Address</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ backgroundColor: inputBg, color: textColor, borderColor }}
          />
        </div>

        {role === "consultant" && (
          <div className="form-group">
            <label style={{ color: textColor }}>Primary Specialty</label>
            <input
              type="text"
              required
              placeholder="e.g. Software Architecture, Corporate Law"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              style={{
                backgroundColor: inputBg,
                color: textColor,
                borderColor,
              }}
            />
          </div>
        )}

        <div className="form-group">
          <label style={{ color: textColor }}>Password</label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ backgroundColor: inputBg, color: textColor, borderColor }}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Create Account"}
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
        Already have an account?{" "}
        <Link to="/signin" style={{ color: "#2563eb", fontWeight: 600 }}>
          Sign In
        </Link>
      </p>
    </div>
  );
}
