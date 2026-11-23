interface SplashscreenProps {
  darkMode: boolean;
}

export default function Splashscreen({ darkMode }: SplashscreenProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: darkMode ? "#0b1020" : "#fdfbf7",
        color: darkMode ? "#f8fafc" : "#222222",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "1.5rem",
      }}
    >
      <style>{`
        @keyframes breatheFastExpandContract {
          0% {
            transform: scale(0.92);
            opacity: 0.78;
          }
          20% {
            transform: scale(1.16);
            opacity: 1;
          }
          40% {
            transform: scale(0.94);
            opacity: 0.82;
          }
          60% {
            transform: scale(1.16);
            opacity: 1;
          }
          80% {
            transform: scale(0.94);
            opacity: 0.82;
          }
          100% {
            transform: scale(1.06);
            opacity: 0.96;
          }
        }
      `}</style>

      <div
        style={{
          animation: "breatheFastExpandContract 5s ease-in-out forwards",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <img
          src="/icon.png"
          alt="Find An Expert"
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "18px",
            boxShadow: "0 10px 28px rgba(37, 99, 235, 0.22)",
          }}
        />
        <strong style={{ fontSize: "1.15rem", fontWeight: 700 }}>
          Find An Expert
        </strong>
      </div>

      <span style={{ fontSize: "0.88rem", fontWeight: 500, opacity: 0.8 }}>
        Opening Find An Expert...
      </span>
    </div>
  );
}
