import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type UserProfile } from "../Lib/supabase";

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/signin");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) setProfile(data as UserProfile);
      setLoading(false);
    };

    loadProfile();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading)
    return (
      <div className="hero">
        <p>Loading your workspace...</p>
      </div>
    );

  return (
    <div
      style={{ maxWidth: "760px", margin: "2.5rem auto", padding: "0 1.5rem" }}
    >
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <span className="badge" style={{ textTransform: "uppercase" }}>
            {profile?.role} Workspace
          </span>
          <button onClick={handleSignOut} className="btn btn-outline">
            Sign Out
          </button>
        </div>
        <h2>Welcome, {profile?.full_name}</h2>
        <p style={{ marginTop: "0.4rem" }}>
          <strong>Email:</strong> {profile?.email}
        </p>
        {profile?.specialty && (
          <p>
            <strong>Specialty:</strong> {profile.specialty}
          </p>
        )}
        <p>
          <strong>KYC Verification Status:</strong> {profile?.kyc_status}
        </p>
      </div>
    </div>
  );
}
