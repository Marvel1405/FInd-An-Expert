import { Link } from "react-router-dom";
import { ShieldCheck, Sparkles, Video, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div>
      <section className="hero">
        <span className="badge">
          Escrow-Protected • AI-Briefed • Verified Experts
        </span>
        <h1>High-Trust Micro-Consultations Without Wasted Minutes</h1>
        <p>
          Book verified specialists with automated escrow protection, pre-call
          AI Executive Briefs, embedded whiteboards &amp; code editors, and
          automated post-call action tracking.
        </p>
        <div className="nav-links" style={{ justifyContent: "center" }}>
          <Link to="/signup" className="btn btn-primary">
            Get Started
          </Link>
          <Link to="/signin" className="btn btn-outline">
            Sign In
          </Link>
        </div>
      </section>

      <section className="features-grid">
        <div className="card">
          <ShieldCheck
            size={28}
            color="#2563eb"
            style={{ marginBottom: "0.75rem" }}
          />
          <h3>Escrow &amp; Auto-Dispute</h3>
          <p>
            Funds stay safely in escrow until your session completes. Calls
            under 2 minutes on Agora logs trigger automatic refunds.
          </p>
        </div>

        <div className="card">
          <Sparkles
            size={28}
            color="#2563eb"
            style={{ marginBottom: "0.75rem" }}
          />
          <h3>15-Min Pre-Call AI Brief</h3>
          <p>
            Our intake bot organizes your problem statement and files into a
            1-page Executive Brief before the call begins.
          </p>
        </div>

        <div className="card">
          <Video
            size={28}
            color="#2563eb"
            style={{ marginBottom: "0.75rem" }}
          />
          <h3>Live Whiteboard &amp; Co-Editor</h3>
          <p>
            Collaborate inside the call using an embedded Excalidraw canvas and
            live code/document editor with E2EE controls.
          </p>
        </div>

        <div className="card">
          <CheckCircle2
            size={28}
            color="#2563eb"
            style={{ marginBottom: "0.75rem" }}
          />
          <h3>Post-Call Action Tracker</h3>
          <p>
            OpenAI converts transcripts into interactive tasks, 7-day progress
            check-ins, and a searchable Client Notes Archive.
          </p>
        </div>
      </section>
    </div>
  );
}
