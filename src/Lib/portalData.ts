import { supabase } from "./supabase";

export interface DbBooking {
  id: string;
  user_id: string;
  consultant_id?: string | null;
  consultant_name: string;
  topic: string;
  complaint_summary?: string | null;
  call_room_code?: string | null;
  session_date: string;
  amount_ngn: number;
  status: string;
  created_at: string;
  updated_at?: string;
}

export interface DbWalletTransaction {
  id: string;
  user_id: string;
  amount_ngn: number;
  direction: "credit" | "debit";
  type: string;
  description: string;
  created_at: string;
}

export interface DbBankWithdrawal {
  id: string;
  user_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount_ngn: number;
  status: string;
  created_at: string;
  updated_at?: string;
}

export async function fetchWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance_ngn")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? Number(data.balance_ngn ?? 0) : 0;
}

export async function fetchUserBookings(userId: string): Promise<DbBooking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .or(`user_id.eq.${userId},consultant_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DbBooking[];
}

export async function fetchWalletTransactions(
  userId: string
): Promise<DbWalletTransaction[]> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DbWalletTransaction[];
}

export async function fetchBankWithdrawals(
  userId: string
): Promise<DbBankWithdrawal[]> {
  const { data, error } = await supabase
    .from("bank_withdrawals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DbBankWithdrawal[];
}

export async function adjustWalletBalanceRpc(params: {
  amountNgn: number;
  direction: "credit" | "debit";
  type?: string;
  description?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_wallet_balance_rpc", {
    p_amount_ngn: params.amountNgn,
    p_direction: params.direction,
    p_type: params.type ?? null,
    p_description: params.description ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function createBookingWithEscrowRpc(params: {
  consultantName: string;
  topic: string;
  sessionDate?: string;
  amountNgn: number;
  complaintSummary?: string;
  callRoomCode?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_booking_with_escrow_rpc", {
    p_consultant_name: params.consultantName,
    p_topic: params.topic,
    p_session_date:
      params.sessionDate ?? new Date().toISOString().split("T")[0],
    p_amount_ngn: params.amountNgn,
    p_complaint_summary: params.complaintSummary ?? null,
    p_call_room_code: params.callRoomCode ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function completeBookingPayoutRpc(
  bookingId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("complete_booking_payout_rpc", {
    p_booking_id: bookingId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function requestBankWithdrawalRpc(params: {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountNgn: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("request_bank_withdrawal_rpc", {
    p_bank_name: params.bankName,
    p_account_number: params.accountNumber,
    p_account_name: params.accountName,
    p_amount_ngn: params.amountNgn,
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}
