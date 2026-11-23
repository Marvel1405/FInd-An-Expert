import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface HomeProps {
  darkMode: boolean;
  wallpaper?: string;
}

export default function Home({ darkMode, wallpaper = "default" }: HomeProps) {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isCustomImageWallpaper = wallpaper.startsWith("data:image/");
  const bgMain = darkMode ? "#0b1020" : "#fdfbf7";
  const textPrimary = darkMode ? "#f8fafc" : "#222222";
  const textMuted = darkMode ? "#cbd5e1" : "#57534e";
  const borderColor = darkMode
    ? "rgba(148, 163, 184, 0.22)"
    : "rgba(34, 34, 34, 0.14)";
  const accentBlue = "#2563eb";

  const backgroundImage = isCustomImageWallpaper
    ? `linear-gradient(${
        darkMode
          ? "rgba(11, 16, 32, 0.56), rgba(11, 16, 32, 0.56)"
          : "rgba(253, 251, 247, 0.52), rgba(253, 251, 247, 0.52)"
      }), url("${wallpaper}")`
    : "none";

  const glassCard = {
    backgroundColor: darkMode
      ? "rgba(17, 24, 39, 0.68)"
      : "rgba(255, 255, 255, 0.72)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${borderColor}`,
    borderRadius: "14px",
    boxSizing: "border-box" as const,
  };

  const glassPill = {
    backgroundColor: darkMode
      ? "rgba(11, 16, 32, 0.58)"
      : "rgba(253, 251, 247, 0.68)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: `1px solid ${borderColor}`,
    borderRadius: "10px",
    boxSizing: "border-box" as const,
  };

  const features = [
    {
      title: "Instant Audio & Video Calls",
      desc: "Connect directly with verified specialists for focused micro-consultations without scheduling back-and-forth.",
    },
    {
      title: "Escrow-Protected Sessions",
      desc: "Funds stay safely held in escrow during live sessions and release smoothly upon completion.",
    },
    {
      title: "Complaint Briefs & Attachments",
      desc: "Share clear context and reference images before the call starts so every minute counts.",
    },
  ];

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
        boxSizing: "border-box",
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: "1080px",
          margin: "0 auto",
          padding: isMobile ? "1.35rem 1rem 2rem" : "2.25rem 1.5rem 2.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          boxSizing: "border-box",
        }}
      >
        {/* Hero Glass Section */}
        <section
          style={{
            ...glassCard,
            padding: isMobile ? "1.5rem 1.2rem" : "2.25rem 2rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <span
            style={{
              alignSelf: "flex-start",
              padding: "0.28rem 0.7rem",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              backgroundColor: "rgba(37, 99, 235, 0.16)",
              color: darkMode ? "#93c5fd" : "#1d4ed8",
            }}
          >
            LIVE MICRO-CONSULTATIONS · ESCROW PROTECTED
          </span>

          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "1.65rem" : "2.35rem",
              lineHeight: 1.2,
              fontWeight: 800,
              maxWidth: "760px",
            }}
          >
            Get Direct Answers From Real Experts on Live Calls
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? "0.95rem" : "1.05rem",
              lineHeight: 1.6,
              color: textMuted,
              maxWidth: "680px",
            }}
          >
            Book focused audio or video sessions, share your complaint summary
            upfront, and manage payments with built-in escrow protection.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginTop: "0.35rem",
            }}
          >
            <Link
              to="/dashboard"
              style={{
                padding: "0.72rem 1.25rem",
                borderRadius: "9px",
                backgroundColor: accentBlue,
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              Open Dashboard
            </Link>
            <Link
              to="/signin"
              style={{
                ...glassPill,
                padding: "0.72rem 1.25rem",
                color: textPrimary,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              Sign In
            </Link>
          </div>
        </section>

        {/* Feature Glass Cards Grid */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "1rem",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {features.map((item) => (
            <div
              key={item.title}
              style={{
                ...glassCard,
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                {item.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  lineHeight: 1.55,
                  color: textMuted,
                }}
              >
                {item.desc}
              </p>
            </div>
          ))}
        </section>

        {/* Bottom CTA Glass Bar */}
        <section
          style={{
            ...glassCard,
            padding: "1.25rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <strong style={{ fontSize: "1rem", display: "block" }}>
              Ready to start or host a session?
            </strong>
            <span style={{ fontSize: "0.86rem", color: textMuted }}>
              Switch roles anytime in Profile Settings and customize your
              wallpaper.
            </span>
          </div>

          <Link
            to="/dashboard"
            style={{
              padding: "0.62rem 1.15rem",
              borderRadius: "8px",
              backgroundColor: accentBlue,
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.86rem",
            }}
          >
            Go to Workspace
          </Link>
        </section>
      </main>
    </div>
  );
}
