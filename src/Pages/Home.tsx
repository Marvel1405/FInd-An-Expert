import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

interface HomeProps {
  darkMode?: boolean;
  session?: Session | null;
}

export default function Home({ darkMode = false, session = null }: HomeProps) {
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#94a3b8" : "#57534e";
  const cardBg = darkMode ? "#111827" : "#ffffff";
  const borderColor = darkMode ? "#1e293b" : "#e5e0d8";

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "3rem 1.25rem",
        color: textPrimary,
      }}
    >
      <section style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <span
          style={{
            display: "inline-block",
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            fontSize: "0.78rem",
            fontWeight: 700,
            backgroundColor: darkMode ? "#1e3a8a" : "#dbeafe",
            color: darkMode ? "#bfdbfe" : "#1e40af",
            marginBottom: "0.85rem",
          }}
        >
          INSTANT MICRO-ADVISORY & LIVE CALLS
        </span>
        <h1
          style={{
            fontSize: "clamp(1.8rem, 4vw, 2.75rem)",
            margin: "0 0 0.75rem",
          }}
        >
          Skip the Long Wait. Talk Straight to an Expert.
        </h1>
        <p
          style={{
            maxWidth: "640px",
            margin: "0 auto 1.5rem",
            color: textMuted,
            fontSize: "1rem",
            lineHeight: 1.6,
          }}
        >
          Share a crisp summary of your complaint upfront, hop on a focused
          consultation call, and let escrow settle automatically once the
          session wraps.
        </p>

        {/* Hero Auth Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.85rem",
            flexWrap: "wrap",
          }}
        >
          {session ? (
            <Link to="/dashboard" className="btn btn-primary">
              Go to My Hub
            </Link>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary">
                Sign Up
              </Link>
              <Link to="/signin" className="btn btn-outline">
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: "12px",
            padding: "1.25rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>
            1. Drop Your Complaint Summary
          </h3>
          <p style={{ margin: 0, color: textMuted, fontSize: "0.9rem" }}>
            Give the consultant exact context before the call even rings so zero
            minutes go to waste.
          </p>
        </div>

        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: "12px",
            padding: "1.25rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>
            2. Join Live Call
          </h3>
          <p style={{ margin: 0, color: textMuted, fontSize: "0.9rem" }}>
            Connect directly with registered, available specialists on your
            schedule.
          </p>
        </div>

        <div
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: "12px",
            padding: "1.25rem",
          }}
        >
          <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.05rem" }}>
            3. Auto-Settled Payout
          </h3>
          <p style={{ margin: 0, color: textMuted, fontSize: "0.9rem" }}>
            Funds stay protected in escrow and release automatically the moment
            the session completes.
          </p>
        </div>
      </section>
    </main>
  );
}
