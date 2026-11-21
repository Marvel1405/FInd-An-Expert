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
        gap: "0.9rem",
      }}
    >
      <style>{`
        @keyframes spinIcon {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <img
        src="/icon.png"
        alt="Find An Expert"
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          animation: "spinIcon 1.2s linear infinite",
        }}
      />
      <strong style={{ fontSize: "1.05rem", fontWeight: 700 }}>
        Find An Expert
      </strong>
      <span style={{ fontSize: "0.88rem", fontWeight: 500, opacity: 0.8 }}>
        Preparing your Find An Expert live advisory hub...
      </span>
    </div>
  );
}
