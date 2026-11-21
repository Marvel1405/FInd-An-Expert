import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = Router();
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function verifyPaystackSignature(req: RawBodyRequest): boolean {
  const signature = req.headers["x-paystack-signature"];
  if (
    !signature ||
    typeof signature !== "string" ||
    !req.rawBody ||
    !PAYSTACK_SECRET_KEY
  ) {
    return false;
  }

  const computedHash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(req.rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "utf8");
  const hashBuf = Buffer.from(computedHash, "utf8");

  if (sigBuf.length !== hashBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, hashBuf);
}

// POST /api/webhooks/paystack
router.post("/paystack", async (req: RawBodyRequest, res: Response) => {
  if (!verifyPaystackSignature(req)) {
    res.status(401).json({ error: "Invalid Paystack signature" });
    return;
  }

  const payload = req.body as {
    event?: string;
    data?: {
      reference?: string;
      transfer_code?: string;
      amount?: number; // in kobo
      reason?: string;
      metadata?: {
        user_id?: string;
        purpose?: string;
      };
    };
  };

  const event = payload.event;
  const data = payload.data;

  if (!event || !data) {
    res.status(400).json({ error: "Malformed webhook payload" });
    return;
  }

  const reference = data.reference || data.transfer_code || "unknown";
  const eventKey = `${event}:${reference}`;

  // Idempotency check: ignore duplicate webhook deliveries
  const { data: existingEvent } = await supabaseAdmin
    .from("processed_webhook_events")
    .select("event_key")
    .eq("event_key", eventKey)
    .maybeSingle();

  if (existingEvent) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  await supabaseAdmin.from("processed_webhook_events").insert({
    event_key: eventKey,
    event_type: event,
    reference,
  });

  // Acknowledge 200 promptly
  res.status(200).json({ received: true });

  // Process event asynchronously
  try {
    if (event === "charge.success") {
      const userId = data.metadata?.user_id;
      const amountNgn = Math.floor(Number(data.amount ?? 0) / 100);

      if (userId && amountNgn > 0) {
        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("balance_ngn")
          .eq("user_id", userId)
          .maybeSingle();

        const currentBal = Number(wallet?.balance_ngn ?? 0);
        await supabaseAdmin.from("wallets").upsert(
          {
            user_id: userId,
            balance_ngn: currentBal + amountNgn,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        await supabaseAdmin.from("wallet_transactions").insert({
          user_id: userId,
          type: "Deposit",
          description: `Paystack Top-up (${reference})`,
          amount_ngn: amountNgn,
          direction: "credit",
          status: "Completed",
        });
      }
    }

    if (event === "transfer.success" && data.reference) {
      await supabaseAdmin
        .from("bank_withdrawals")
        .update({
          status: "Completed",
          transfer_code: data.transfer_code ?? null,
        })
        .eq("transfer_reference", data.reference);

      await supabaseAdmin
        .from("wallet_transactions")
        .update({ status: "Completed" })
        .eq("type", "Bank Withdrawal")
        .ilike("description", `%${data.reference}%`);
    }

    if (event === "transfer.failed" && data.reference) {
      const { data: wd } = await supabaseAdmin
        .from("bank_withdrawals")
        .select("*")
        .eq("transfer_reference", data.reference)
        .maybeSingle();

      if (wd && wd.status !== "Completed") {
        await supabaseAdmin
          .from("bank_withdrawals")
          .update({
            status: "Completed",
            failure_reason:
              data.reason || "Transfer failed — refunded to wallet",
          })
          .eq("id", wd.id);

        await supabaseAdmin.rpc("refund_failed_withdrawal", {
          p_user_id: wd.consultant_id,
          p_amount_ngn: Number(wd.amount_ngn),
          p_description: `Refunded failed bank transfer (${wd.account_number})`,
        });
      }
    }
  } catch (err) {
    console.error("Error processing Paystack webhook event:", err);
  }
});

export default router;
