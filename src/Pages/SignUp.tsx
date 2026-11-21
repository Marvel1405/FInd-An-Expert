import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../Lib/supabase";

export default function SignUp() {
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

  return (
    <div className="auth-container">
      <h2>Create Your Account</h2>
      <p className="sub">
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
          }}
        >
          I want to join as a:
        </label>
        <div className="role-toggle">
          <button
            type="button"
            className={`role-btn ${role === "client" ? "active" : ""}`}
            onClick={() => setRole("client")}
          >
            Client
          </button>
          <button
            type="button"
            className={`role-btn ${role === "consultant" ? "active" : ""}`}
            onClick={() => setRole("consultant")}
          >
            Consultant
          </button>
        </div>

        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            required
            placeholder="e.g. Marvelous Kalu"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Email Address</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {role === "consultant" && (
          <div className="form-group">
            <label>Primary Specialty</label>
            <input
              type="text"
              required
              placeholder="e.g. Software Architecture, Corporate Law"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <p style={{ marginTop: "1rem", fontSize: "0.9rem", textAlign: "center" }}>
        Already have an account? <Link to="/signin">Sign In</Link>
      </p>
    </div>
  );
}
