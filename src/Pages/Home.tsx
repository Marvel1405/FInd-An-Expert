import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../Lib/supabase";

interface HomeProps {
  darkMode: boolean;
}

const CONSULTING_AREAS = [
  {
    title: "Business & Operations Strategy",
    description:
      "Get a clear outside perspective on pricing, workflow bottlenecks, customer retention, and day-to-day execution.",
  },
  {
    title: "Service Disputes & Escalations",
    description:
      "Walk through a vendor, contract, or service issue with a structured summary and figure out your practical next steps.",
  },
  {
    title: "Product, Tech & Career Guidance",
    description:
      "Sanity-check project roadmaps, career pivots, hiring choices, or tough decisions before committing time and money.",
  },
];

const VALUE_PILLARS = [
  {
    badge: "01 · PRE-CALL BRIEF",
    title: "Complaint & Context Summary First",
    description:
      "Consultees share a clear summary of their issue, background, and expected outcome before the call starts—so consultants join prepared from minute one.",
  },
  {
    badge: "02 · ESCROW PROTECTION",
    title: "Escrow-Backed Session Fees",
    description:
      "Booking fees are held securely in escrow when a call is requested and released automatically once the session is marked complete.",
  },
  {
    badge: "03 · LIVE TWO-WAY AUDIO",
    title: "Direct Browser Voice Calls",
    description:
      "Consultants review incoming requests, accept with a click, and speak live over two-way audio with mute controls and an active session timer.",
  },
  {
    badge: "04 · WALLET & BANK PAYOUTS",
    title: "Simple Wallet Top-Ups & Bank Withdrawals",
    description:
      "Consultees fund their Naira wallet to book calls, while consultants manage earnings and withdraw to 10-digit local bank accounts starting from ₦1,000.",
  },
];

const CONSULTEE_STEPS = [
  "Top up your Naira wallet from your dashboard.",
  "Choose an available general consultant, enter your call topic, and write a brief summary of your complaint or challenge.",
  "Join the live audio call once accepted, review action points, and let settlement complete automatically.",
];

const CONSULTANT_STEPS = [
  "Set your role to Consultant in Profile Settings and add your consulting focus or specialty.",
  "Check incoming call requests and read each consultee’s complaint summary before accepting.",
  "Host the live audio call, complete the session for automatic payout, and withdraw funds to your bank account.",
];

export default function Home({ darkMode }: HomeProps) {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const bgCard = darkMode ? "#111827" : "#ffffff";
  const bgSubtle = darkMode ? "#0b1020" : "#fdfbf7";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#94a3b8" : "#57534e";
  const borderColor = darkMode ? "#1e293b" : "#e5e0d8";
  const accentBlue = "#2563eb";

  return (
    <main
      style={{
        minHeight: "calc(100vh - 58px)",
        maxWidth: "1040px",
        margin: "0 auto",
        padding: "2.25rem 1.25rem 3rem",
        color: textPrimary,
        display: "flex",
        flexDirection: "column",
        gap: "1.85rem",
      }}
    >
      {/* Hero Section */}
      <section
        style={{
          backgroundColor: bgCard,
          border: `1px solid ${borderColor}`,
          borderRadius: "16px",
          padding: "2.25rem 1.65rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.1rem",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: accentBlue,
            textTransform: "uppercase",
          }}
        >
          GENERAL CONSULTING · ESCROW PROTECTION · LIVE TWO-WAY AUDIO
        </span>

        <h1
          style={{
            margin: 0,
            fontSize: "2.1rem",
            lineHeight: 1.2,
            maxWidth: "800px",
          }}
        >
          Practical 1-on-1 General Consulting with Escrow &amp; Instant Payouts
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "1rem",
            color: textMuted,
            maxWidth: "740px",
            lineHeight: 1.65,
          }}
        >
          Whether you are navigating a business roadblock, resolving a service
          or vendor issue, or weighing an important decision, book a focused
          live audio call with an independent consultant. Every booking starts
          with a pre-call complaint summary, locks funds safely in escrow, and
          settles automatically when the session finishes.
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.85rem",
            flexWrap: "wrap",
            marginTop: "0.35rem",
          }}
        >
          <Link
            to="/signin"
            style={{
              padding: "0.75rem 1.35rem",
              borderRadius: "8px",
              backgroundColor: accentBlue,
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.94rem",
            }}
          >
            Get Started / Sign In
          </Link>

          <Link
            to="/dashboard"
            style={{
              padding: "0.75rem 1.35rem",
              borderRadius: "8px",
              border: `1px solid ${borderColor}`,
              backgroundColor: bgSubtle,
              color: textPrimary,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.94rem",
            }}
          >
            Go to Dashboard
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            gap: "1.25rem",
            flexWrap: "wrap",
            paddingTop: "0.9rem",
            marginTop: "0.25rem",
            borderTop: `1px solid ${borderColor}`,
            fontSize: "0.84rem",
            color: textMuted,
          }}
        >
          <span>✓ Pre-call complaint &amp; context summary</span>
          <span>✓ Escrow-backed consulting fees</span>
          <span>✓ Live browser two-way audio</span>
          <span>✓ Local bank withdrawals from ₦1,000</span>
        </div>
      </section>

      {/* Common General Consulting Topics */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem" }}>
            What People Bring to a Session
          </h2>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.9rem",
              color: textMuted,
            }}
          >
            Straightforward, actionable guidance tailored to real-world
            situations.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {CONSULTING_AREAS.map((area) => (
            <div
              key={area.title}
              style={{
                backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
                borderRadius: "12px",
                padding: "1.2rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.04rem" }}>{area.title}</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: textMuted,
                  lineHeight: 1.55,
                }}
              >
                {area.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Features Grid */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem" }}>
            How the Platform Protects Both Sides
          </h2>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.9rem",
              color: textMuted,
            }}
          >
            Clear context before you speak, protected funds during the call, and
            smooth settlement afterward.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(225px, 1fr))",
            gap: "1rem",
          }}
        >
          {VALUE_PILLARS.map((item) => (
            <div
              key={item.title}
              style={{
                backgroundColor: bgCard,
                border: `1px solid ${borderColor}`,
                borderRadius: "12px",
                padding: "1.2rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: accentBlue,
                  letterSpacing: "0.04em",
                }}
              >
                {item.badge}
              </span>
              <h3 style={{ margin: 0, fontSize: "1.04rem" }}>{item.title}</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: textMuted,
                  lineHeight: 1.55,
                }}
              >
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Step-by-Step Guide for Consultees & Consultants */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.15rem",
        }}
      >
        <div
          style={{
            backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: "14px",
            padding: "1.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: accentBlue,
              textTransform: "uppercase",
            }}
          >
            FOR CONSULTEES
          </span>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
            Book a Call &amp; Resolve Faster
          </h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              color: textMuted,
              fontSize: "0.9rem",
              lineHeight: 1.55,
            }}
          >
            {CONSULTEE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div
          style={{
            backgroundColor: bgCard,
            border: `1px solid ${borderColor}`,
            borderRadius: "14px",
            padding: "1.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#16a34a",
              textTransform: "uppercase",
            }}
          >
            FOR CONSULTANTS
          </span>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
            Offer General Advisory &amp; Earn
          </h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              color: textMuted,
              fontSize: "0.9rem",
              lineHeight: 1.55,
            }}
          >
            {CONSULTANT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section
        style={{
          backgroundColor: bgCard,
          border: `1px solid ${borderColor}`,
          borderRadius: "14px",
          padding: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
            Ready to Talk Through Your Next Step?
          </h2>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.9rem",
              color: textMuted,
            }}
          >
            Sign in or create an account to set up your profile, verify your
            phone number, and enter your consulting workspace.
          </p>
        </div>

        <Link
          to="/signin"
          style={{
            padding: "0.72rem 1.3rem",
            borderRadius: "8px",
            backgroundColor: accentBlue,
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.92rem",
          }}
        >
          Sign In Now
        </Link>
      </section>
    </main>
  );
}
