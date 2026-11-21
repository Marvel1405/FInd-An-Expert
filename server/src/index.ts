import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

interface AuthedRequest extends Request {
  supabase: SupabaseClient;
  user: User;
}

interface ProfileUpdates {
  full_name?: string;
  role?: "client" | "consultant";
  specialty?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  phone_verified?: boolean;
}

const app = express();
const PORT = Number(process.env.PORT || 4000);

const supabaseUrl: string =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey: string =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabaseServiceKey: string = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY in server environment."
  );
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",")
      : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

const adminSupabase: SupabaseClient | null =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

function createUserClient(req: Request): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userClient = createUserClient(req);
    if (!userClient) {
      return res
        .status(401)
        .json({ error: "Missing or invalid Bearer token." });
    }

    const {
      data: { user },
      error,
    } = await userClient.auth.getUser();

    if (error || !user) {
      return res.status(401).json({ error: "Authentication failed." });
    }

    (req as AuthedRequest).supabase = userClient;
    (req as AuthedRequest).user = user;
    return next();
  } catch (err: unknown) {
    return res
      .status(401)
      .json({ error: getErrorMessage(err, "Authentication failed.") });
  }
}

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "micro-advisory-api" });
});

// Get current profile, wallet balance, bookings, transactions, and withdrawals
app.get(
  "/api/portal/state",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const userId = authedReq.user.id;
      const sb = authedReq.supabase;

      const [
        profileRes,
        walletRes,
        bookingsRes,
        txnsRes,
        withdrawalsRes,
        consultantsRes,
      ] = await Promise.all([
        sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
        sb
          .from("wallets")
          .select("balance_ngn")
          .eq("user_id", userId)
          .maybeSingle(),
        sb
          .from("bookings")
          .select("*")
          .or(`user_id.eq.${userId},consultant_id.eq.${userId}`)
          .order("created_at", { ascending: false }),
        sb
          .from("wallet_transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        sb
          .from("bank_withdrawals")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        sb
          .from("profiles")
          .select("id, full_name, specialty, avatar_url, role")
          .eq("role", "consultant"),
      ]);

      const firstError =
        profileRes.error ||
        walletRes.error ||
        bookingsRes.error ||
        txnsRes.error ||
        withdrawalsRes.error ||
        consultantsRes.error;

      if (firstError) {
        return res.status(400).json({ error: firstError.message });
      }

      return res.json({
        profile: profileRes.data ?? null,
        walletBalance: Number(walletRes.data?.balance_ngn ?? 0),
        bookings: bookingsRes.data ?? [],
        transactions: txnsRes.data ?? [],
        withdrawals: withdrawalsRes.data ?? [],
        consultants: consultantsRes.data ?? [],
      });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: getErrorMessage(err, "Failed to load portal state.") });
    }
  }
);

// Update profile (name, role, specialty, avatar_url, phone, phone_verified)
app.patch("/api/profile", requireUser, async (req: Request, res: Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const body = (req.body || {}) as {
      full_name?: unknown;
      role?: unknown;
      specialty?: unknown;
      avatar_url?: unknown;
      phone?: unknown;
      phone_verified?: unknown;
    };

    const updates: ProfileUpdates = {};

    if (typeof body.full_name === "string") {
      const cleanName = body.full_name.trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Full name cannot be empty." });
      }
      updates.full_name = cleanName;
    }

    if (body.role === "client" || body.role === "consultant") {
      updates.role = body.role;
      updates.specialty =
        body.role === "consultant"
          ? typeof body.specialty === "string" && body.specialty.trim()
            ? body.specialty.trim()
            : "General Advisory"
          : null;
    } else if (typeof body.specialty === "string") {
      updates.specialty = body.specialty.trim() || null;
    }

    if (typeof body.avatar_url === "string" || body.avatar_url === null) {
      updates.avatar_url = body.avatar_url;
    }

    if (typeof body.phone === "string" || body.phone === null) {
      updates.phone = body.phone;
    }

    if (typeof body.phone_verified === "boolean") {
      updates.phone_verified = body.phone_verified;
    }

    const { data, error } = await authedReq.supabase
      .from("profiles")
      .update(updates)
      .eq("id", authedReq.user.id)
      .select("*")
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ profile: data });
  } catch (err: unknown) {
    return res
      .status(500)
      .json({ error: getErrorMessage(err, "Failed to update profile.") });
  }
});

// Wallet top-up / adjustment via RPC (consultee-only top-up enforced in DB)
app.post(
  "/api/wallet/adjust",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const { amount_ngn, direction, type, description } = (req.body || {}) as {
        amount_ngn?: unknown;
        direction?: unknown;
        type?: unknown;
        description?: unknown;
      };

      const { data, error } = await authedReq.supabase.rpc(
        "adjust_wallet_balance_rpc",
        {
          p_amount_ngn: Number(amount_ngn),
          p_direction: String(direction || ""),
          p_type: typeof type === "string" ? type : null,
          p_description: typeof description === "string" ? description : null,
        }
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({ balance_ngn: Number(data ?? 0) });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: getErrorMessage(err, "Wallet adjustment failed.") });
    }
  }
);

// Create booking with escrow hold + pre-call complaint summary + room code
app.post(
  "/api/bookings/escrow",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const {
        consultant_id,
        consultant_name,
        topic,
        session_date,
        amount_ngn,
        complaint_summary,
        call_room_code,
      } = (req.body || {}) as {
        consultant_id?: unknown;
        consultant_name?: unknown;
        topic?: unknown;
        session_date?: unknown;
        amount_ngn?: unknown;
        complaint_summary?: unknown;
        call_room_code?: unknown;
      };

      if (!complaint_summary || String(complaint_summary).trim().length < 10) {
        return res.status(400).json({
          error:
            "A complaint summary of at least 10 characters is required before booking.",
        });
      }

      const { data: bookingId, error } = await authedReq.supabase.rpc(
        "create_booking_with_escrow_rpc",
        {
          p_consultant_name: String(consultant_name || ""),
          p_topic: String(topic || ""),
          p_session_date:
            typeof session_date === "string" && session_date
              ? session_date
              : new Date().toISOString().split("T")[0],
          p_amount_ngn: Number(amount_ngn),
          p_complaint_summary: String(complaint_summary).trim(),
          p_call_room_code:
            typeof call_room_code === "string" ? call_room_code : null,
        }
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      if (typeof consultant_id === "string" && consultant_id) {
        await authedReq.supabase
          .from("bookings")
          .update({ consultant_id })
          .eq("id", bookingId)
          .eq("user_id", authedReq.user.id);
      }

      return res.status(201).json({ booking_id: bookingId });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: getErrorMessage(err, "Failed to create booking.") });
    }
  }
);

// Mark booking In Progress when consultant accepts & starts call
app.patch(
  "/api/bookings/:id/start",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const { id } = req.params;
      const { call_room_code } = (req.body || {}) as {
        call_room_code?: unknown;
      };

      const { data, error } = await authedReq.supabase
        .from("bookings")
        .update({
          status: "In Progress",
          ...(typeof call_room_code === "string" && call_room_code
            ? { call_room_code }
            : {}),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({ booking: data });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: getErrorMessage(err, "Failed to start call session.") });
    }
  }
);

// Complete booking & auto-release payout via RPC
app.post(
  "/api/bookings/:id/complete",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const { id } = req.params;

      const { data: bookingId, error } = await authedReq.supabase.rpc(
        "complete_booking_payout_rpc",
        {
          p_booking_id: id,
        }
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json({ booking_id: bookingId, status: "Completed" });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({
          error: getErrorMessage(err, "Failed to complete session payout."),
        });
    }
  }
);

// Request 10-digit NUBAN bank withdrawal (₦1,000 minimum enforced in DB)
app.post(
  "/api/withdrawals",
  requireUser,
  async (req: Request, res: Response) => {
    try {
      const authedReq = req as AuthedRequest;
      const { bank_name, account_number, account_name, amount_ngn } =
        (req.body || {}) as {
          bank_name?: unknown;
          account_number?: unknown;
          account_name?: unknown;
          amount_ngn?: unknown;
        };

      const { data: withdrawalId, error } = await authedReq.supabase.rpc(
        "request_bank_withdrawal_rpc",
        {
          p_bank_name: String(bank_name || ""),
          p_account_number: String(account_number || "").trim(),
          p_account_name: String(account_name || ""),
          p_amount_ngn: Number(amount_ngn),
        }
      );

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res
        .status(201)
        .json({ withdrawal_id: withdrawalId, status: "Pending" });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ error: getErrorMessage(err, "Failed to request withdrawal.") });
    }
  }
);

// Optional admin endpoint to inspect system health with service role
app.get(
  "/api/admin/stats",
  requireUser,
  async (_req: Request, res: Response) => {
    if (!adminSupabase) {
      return res
        .status(503)
        .json({ error: "Service role key not configured on server." });
    }
    const { count: bookingsCount } = await adminSupabase
      .from("bookings")
      .select("*", { count: "exact", head: true });
    return res.json({ bookings_count: bookingsCount ?? 0 });
  }
);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
