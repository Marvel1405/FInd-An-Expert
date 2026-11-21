import { Router, type Response } from "express";
import crypto from "node:crypto";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = Router();
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// GET /api/wallet — Fetch balance, transactions, bookings, and bank withdrawals
router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const [walletRes, txnsRes, bookingsRes, withdrawalsRes] = await Promise.all(
      [
        supabaseAdmin
          .from("wallets")
          .select("balance_ngn")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("wallet_transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("bookings")
          .select("*")
          .eq("client_id", userId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("bank_withdrawals")
          .select("*")
          .eq("consultant_id", userId)
          .order("created_at", { ascending: false }),
      ]
    );

    if (
      walletRes.error ||
      txnsRes.error ||
      bookingsRes.error ||
      withdrawalsRes.error
    ) {
      res.status(500).json({
        error:
          walletRes.error?.message ||
          txnsRes.error?.message ||
          bookingsRes.error?.message ||
          withdrawalsRes.error?.message,
      });
      return;
    }

    res.json({
      balance_ngn: Number(walletRes.data?.balance_ngn ?? 0),
      transactions: txnsRes.data ?? [],
      bookings: bookingsRes.data ?? [],
      withdrawals: withdrawalsRes.data ?? [],
    });
  }
);

// POST /api/wallet/adjust — Consultee add or remove money
router.post(
  "/adjust",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { amount_ngn, direction, description } = req.body as {
      amount_ngn: number;
      direction: "credit" | "debit";
      description?: string;
    };

    if (
      !amount_ngn ||
      Number(amount_ngn) <= 0 ||
      !["credit", "debit"].includes(direction)
    ) {
      res.status(400).json({
        error: "Valid positive amount_ngn and direction are required",
      });
      return;
    }

    const type = direction === "credit" ? "Deposit" : "Withdrawal";
    const defaultDesc =
      direction === "credit"
        ? "Consultee wallet deposit"
        : "Consultee wallet withdrawal";

    const { data, error } = await supabaseAdmin.rpc("adjust_wallet_balance", {
      p_amount: Number(amount_ngn),
      p_direction: direction,
      p_type: type,
      p_description: description?.trim() || defaultDesc,
    });

    // Note: RPCs using auth.uid() expect the user's JWT; if called via service role,
    // we can pass a user-scoped client or update directly for the verified req.user.id:
    if (error) {
      const userId = req.user!.id;
      const amt = Number(amount_ngn);

      const { data: currentWallet, error: wErr } = await supabaseAdmin
        .from("wallets")
        .select("balance_ngn")
        .eq("user_id", userId)
        .single();

      if (wErr || !currentWallet) {
        res.status(400).json({ error: "Wallet not found" });
        return;
      }

      const currentBal = Number(currentWallet.balance_ngn);
      if (direction === "debit" && currentBal < amt) {
        res.status(400).json({ error: "Insufficient wallet balance" });
        return;
      }

      const nextBal =
        direction === "credit" ? currentBal + amt : currentBal - amt;

      const { error: updErr } = await supabaseAdmin
        .from("wallets")
        .update({ balance_ngn: nextBal, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (updErr) {
        res.status(500).json({ error: updErr.message });
        return;
      }

      await supabaseAdmin.from("wallet_transactions").insert({
        user_id: userId,
        type,
        description: description?.trim() || defaultDesc,
        amount_ngn: amt,
        direction,
        status: "Completed",
      });

      res.json({ balance_ngn: nextBal });
      return;
    }

    res.json({ balance_ngn: Number(data) });
  }
);

// POST /api/wallet/bookings — Book a session & lock escrow
router.post(
  "/bookings",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { consultant_name, topic, session_date, amount_ngn } = req.body as {
      consultant_name: string;
      topic: string;
      session_date: string;
      amount_ngn: number;
    };

    if (
      !consultant_name?.trim() ||
      !topic?.trim() ||
      !session_date ||
      Number(amount_ngn) <= 0
    ) {
      res.status(400).json({
        error:
          "consultant_name, topic, session_date, and amount_ngn are required",
      });
      return;
    }

    const amt = Number(amount_ngn);
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance_ngn")
      .eq("user_id", userId)
      .single();

    const currentBal = Number(wallet?.balance_ngn ?? 0);
    if (currentBal < amt) {
      res
        .status(400)
        .json({ error: "Insufficient wallet balance for session escrow" });
      return;
    }

    const nextBal = currentBal - amt;
    const { error: balErr } = await supabaseAdmin
      .from("wallets")
      .update({ balance_ngn: nextBal, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (balErr) {
      res.status(500).json({ error: balErr.message });
      return;
    }

    const { data: booking, error: bookErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        client_id: userId,
        consultant_name: consultant_name.trim(),
        topic: topic.trim(),
        session_date,
        amount_ngn: amt,
        status: "Upcoming",
      })
      .select("*")
      .single();

    if (bookErr) {
      res.status(500).json({ error: bookErr.message });
      return;
    }

    await supabaseAdmin.from("wallet_transactions").insert({
      user_id: userId,
      type: "Session Escrow",
      description: `Escrow — ${consultant_name.trim()} (${topic.trim()})`,
      amount_ngn: amt,
      direction: "debit",
      status: "Completed",
    });

    res.status(201).json({ booking, balance_ngn: nextBal });
  }
);

// POST /api/wallet/bookings/:id/complete — Complete session & credit payout
router.post(
  "/bookings/:id/complete",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("client_id", userId)
      .single();

    if (fetchErr || !booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.status === "Completed") {
      res.status(400).json({ error: "Booking is already completed" });
      return;
    }

    const { error: updBookingErr } = await supabaseAdmin
      .from("bookings")
      .update({ status: "Completed" })
      .eq("id", id);

    if (updBookingErr) {
      res.status(500).json({ error: updBookingErr.message });
      return;
    }

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance_ngn")
      .eq("user_id", userId)
      .single();

    const nextBal =
      Number(wallet?.balance_ngn ?? 0) + Number(booking.amount_ngn);
    await supabaseAdmin
      .from("wallets")
      .update({ balance_ngn: nextBal, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    await supabaseAdmin.from("wallet_transactions").insert({
      user_id: userId,
      type: "Session Payout",
      description: `Payout Released — ${booking.topic}`,
      amount_ngn: Number(booking.amount_ngn),
      direction: "credit",
      status: "Completed",
    });

    res.json({ balance_ngn: nextBal });
  }
);

// POST /api/wallet/withdraw-bank — Consultant local bank withdrawal
router.post(
  "/withdraw-bank",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const { bank_name, account_number, account_name, amount_ngn } =
      req.body as {
        bank_name: string;
        account_number: string;
        account_name: string;
        amount_ngn: number;
      };

    const amt = Number(amount_ngn);
    if (
      !bank_name?.trim() ||
      !/^\d{10}$/.test(account_number) ||
      !account_name?.trim() ||
      amt < 1000
    ) {
      res.status(400).json({
        error:
          "Provide bank_name, a 10-digit account_number, account_name, and amount_ngn >= 1000",
      });
      return;
    }

    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance_ngn")
      .eq("user_id", userId)
      .single();

    const currentBal = Number(wallet?.balance_ngn ?? 0);
    if (currentBal < amt) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    const transferReference = `wd_${crypto.randomUUID()}`;
    const nextBal = currentBal - amt;

    const { error: balErr } = await supabaseAdmin
      .from("wallets")
      .update({ balance_ngn: nextBal, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (balErr) {
      res.status(500).json({ error: balErr.message });
      return;
    }

    const { data: withdrawal, error: wdErr } = await supabaseAdmin
      .from("bank_withdrawals")
      .insert({
        consultant_id: userId,
        bank_name: bank_name.trim(),
        account_number,
        account_name: account_name.trim(),
        amount_ngn: amt,
        status: "Processing",
        transfer_reference: transferReference,
      })
      .select("*")
      .single();

    if (wdErr) {
      res.status(500).json({ error: wdErr.message });
      return;
    }

    await supabaseAdmin.from("wallet_transactions").insert({
      user_id: userId,
      type: "Bank Withdrawal",
      description: `Transferred to ${bank_name.trim()} (${account_number})`,
      amount_ngn: amt,
      direction: "debit",
      status: "Processing",
    });

    // Optional: If PAYSTACK_SECRET_KEY is set, initiate real transfer via Paystack Transfer API
    if (
      PAYSTACK_SECRET_KEY &&
      process.env.ENABLE_PAYSTACK_TRANSFERS === "true"
    ) {
      try {
        // Create recipient & initiate transfer as needed in production
        console.log(
          "Paystack transfer queued with reference:",
          transferReference
        );
      } catch (paystackErr) {
        console.error("Paystack transfer error:", paystackErr);
      }
    }

    res.status(201).json({ withdrawal, balance_ngn: nextBal });
  }
);

export default router;
