import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || "https://ypkjfgdeuuwxtdiftbnz.supabase.co",
  supabaseAnonKey || "sb_publishable_N1RKGl_y60E5fFbK5Gth9Q_9OSVUlEj"
);

export interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: "client" | "consultant" | string | null;
  specialty?: string | null;
  kyc_status?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  phone_verified?: boolean | null;
  created_at?: string;
  updated_at?: string;
}
