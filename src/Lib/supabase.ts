import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
