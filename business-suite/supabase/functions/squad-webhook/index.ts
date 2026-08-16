// Supabase Edge Function: squad-webhook
// Replaces nomba-webhook (and the older, already-unused paystack-webhook)
// now that Squad (squadco.com) is the sole payment processor for KoboDocs.
// Handles every product on the site via the payment_intents table -- same
// pattern nomba-webhook used, since Squad also doesn't reliably echo
// custom metadata back on every payload variant.
//
// Squad webhook payload shape (confirmed from Squad docs):
//   { "Event": "charge_successful", "TransactionRef": "...", "Body": {
//       "amount": 10000, "transaction_ref": "...", "transaction_status": "Success", ... } }
// Signature: header x-squad-encrypted-body, HMAC-SHA512 of the raw request
// body using the secret key, compared as UPPERCASE hex (per Squad docs --
// different from Paystack's lowercase and Nomba's SHA-256).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SQUADCO_SECRET_KEY = Deno.env.get("SQUADCO_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function hmacSha512HexUpper(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const bodyText = await req.text();
  const signature = req.headers.get("x-squad-encrypted-body") || "";
  const expected = await hmacSha512HexUpper(SQUADCO_SECRET_KEY, bodyText);

  if (signature !== expected) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  if (event.Event !== "charge_successful") {
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  const body = event.Body ?? {};
  const reference = body.transaction_ref as string | undefined;
  const amountNaira = Number(body.amount ?? 0) / 100;

  if (!reference) {
    console.error("Squad webhook: missing transaction_ref");
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  if (String(body.transaction_status).toLowerCase() !== "success") {
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: intent } = await supabase
    .from("payment_intents")
    .select("metadata")
    .eq("order_reference", reference)
    .maybeSingle();

  if (!intent) {
    console.error("Squad webhook: no matching payment_intents row for", reference);
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  const metadata = intent.metadata ?? {};
  const cycleDays = metadata?.billing_cycle === "yearly" ? 365 : 30;

  // Central revenue log -- covers every product uniformly, regardless of
  // which branch below handles the actual subscription/entitlement
  // activation. Additive only: doesn't change any existing behavior.
  const productForLog = metadata?.document_id
    ? "client_document_payment"
    : metadata?.product ?? (metadata?.plan === "pro" ? "legacy_pro" : "unknown");
  // Wrapped so a logging failure can never block the actual entitlement
  // activation below, which matters far more than the log row. Supabase-js
  // returns {error} rather than throwing, so check that too, not just try/catch.
  try {
    const { error: logErr } = await supabase.from("payments_log").insert({
      order_reference: reference,
      user_id: metadata?.user_id ?? null,
      product: productForLog,
      plan: metadata?.plan ?? null,
      amount_naira: amountNaira,
    });
    if (logErr) console.error("payments_log insert failed (non-fatal):", logErr);
  } catch (logErr) {
    console.error("payments_log insert threw (non-fatal):", logErr);
  }

  try {
    if (metadata?.document_id) {
      await supabase
        .from("payment_transactions")
        .update({ status: "success", paid_at: new Date().toISOString() })
        .eq("provider_ref", reference);

      const { data: doc } = await supabase
        .from("documents")
        .select("amount, amount_paid, business_id")
        .eq("id", metadata.document_id)
        .single();

      if (doc) {
        const newAmountPaid = Number(doc.amount_paid || 0) + amountNaira;
        const newStatus = newAmountPaid >= Number(doc.amount) ? "paid" : "partial";
        await supabase
          .from("documents")
          .update({ amount_paid: newAmountPaid, payment_status: newStatus })
          .eq("id", metadata.document_id);

        await supabase.from("document_payments").insert({
          document_id: metadata.document_id,
          business_id: doc.business_id,
          amount: amountNaira,
          method: "squad",
        });
      }
    } else if (metadata?.plan === "pro") {
      await supabase
        .from("profiles")
        .update({ plan: "pro", plan_expires_at: addDays(cycleDays) })
        .eq("id", metadata.user_id);
    } else if (metadata?.product === "business_teams") {
      await supabase
        .from("profiles")
        .update({ plan: "business", plan_expires_at: addDays(cycleDays) })
        .eq("id", metadata.user_id);
    } else if (metadata?.product === "cooperative_plan") {
      await supabase
        .from("ajo_circles")
        .update({ plan: "cooperative", plan_expires_at: addDays(cycleDays) })
        .eq("id", metadata.circle_id);
    } else if (metadata?.product === "japa_pass") {
      await supabase.from("relocation_passes").insert({
        user_id: metadata.user_id,
        tier: metadata.tier,
        report_limit: metadata.report_limit,
        reports_used: 0,
        purchased_at: new Date().toISOString(),
        expires_at: addDays(90),
        paystack_reference: reference,
      });
    } else if (metadata?.product === "business_suite") {
      const { data: business } = await supabase
        .from("businesses")
        .select("id, suite_status, suite_expires_at")
        .eq("owner_user_id", metadata.user_id)
        .maybeSingle();

      if (business) {
        const currentExpiry = business.suite_expires_at ? new Date(business.suite_expires_at) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(base);
        newExpiry.setDate(newExpiry.getDate() + cycleDays);

        await supabase
          .from("businesses")
          .update({
            suite_status: "active",
            suite_expires_at: newExpiry.toISOString(),
            suite_billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
          })
          .eq("id", business.id);
      }
    } else if (metadata?.product === "business_suite_growth") {
      const { data: business } = await supabase
        .from("businesses")
        .select("id, suite_status, suite_expires_at")
        .eq("owner_user_id", metadata.user_id)
        .maybeSingle();

      if (business) {
        const currentExpiry = business.suite_expires_at ? new Date(business.suite_expires_at) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(base);
        newExpiry.setDate(newExpiry.getDate() + cycleDays);

        await supabase
          .from("businesses")
          .update({
            suite_tier: "growth",
            suite_status: "active",
            suite_expires_at: newExpiry.toISOString(),
            suite_billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
          })
          .eq("id", business.id);
      }
    } else if (metadata?.product === "tool_pass") {
      if (metadata.tool_key === "estate_bundle") {
        await supabase.from("tool_access_passes").insert([
          { user_id: metadata.user_id, tool_key: "will_generator", purchased_at: new Date().toISOString(), expires_at: null, paystack_reference: reference },
          { user_id: metadata.user_id, tool_key: "power_of_attorney", purchased_at: new Date().toISOString(), expires_at: null, paystack_reference: reference },
        ]);
      } else {
        await supabase.from("tool_access_passes").insert({
          user_id: metadata.user_id,
          tool_key: metadata.tool_key,
          purchased_at: new Date().toISOString(),
          expires_at: null,
          paystack_reference: reference,
        });
      }
    } else if (metadata?.product === "siwes_report") {
      const siwesDays = metadata.billing_cycle === "annual" ? 365 : 90;

      const { data: existing } = await supabase
        .from("tool_access_passes")
        .select("id, expires_at")
        .eq("user_id", metadata.user_id)
        .eq("tool_key", "siwes_report")
        .maybeSingle();

      const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + siwesDays);

      if (existing) {
        await supabase
          .from("tool_access_passes")
          .update({ expires_at: newExpiry.toISOString(), paystack_reference: reference })
          .eq("id", existing.id);
      } else {
        await supabase.from("tool_access_passes").insert({
          user_id: metadata.user_id,
          tool_key: "siwes_report",
          purchased_at: new Date().toISOString(),
          expires_at: newExpiry.toISOString(),
          paystack_reference: reference,
        });
      }
    } else if (metadata?.product === "grant_application_generator") {
      const grantDays = 90;

      const { data: existing } = await supabase
        .from("tool_access_passes")
        .select("id, expires_at")
        .eq("user_id", metadata.user_id)
        .eq("tool_key", "grant_application_generator")
        .maybeSingle();

      const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + grantDays);

      if (existing) {
        await supabase
          .from("tool_access_passes")
          .update({ expires_at: newExpiry.toISOString(), paystack_reference: reference })
          .eq("id", existing.id);
      } else {
        await supabase.from("tool_access_passes").insert({
          user_id: metadata.user_id,
          tool_key: "grant_application_generator",
          purchased_at: new Date().toISOString(),
          expires_at: newExpiry.toISOString(),
          paystack_reference: reference,
        });
      }
    } else if (metadata?.product === "school_report_card") {
      if (metadata.billing_mode === "per_term") {
        await supabase.from("tool_access_passes").insert({
          user_id: metadata.user_id,
          tool_key: "school_report_card_term",
          purchased_at: new Date().toISOString(),
          expires_at: addDays(120),
          paystack_reference: reference,
        });
      } else {
        const { data: existing } = await supabase
          .from("tool_access_passes")
          .select("id, expires_at")
          .eq("user_id", metadata.user_id)
          .eq("tool_key", "school_report_card_subscription")
          .maybeSingle();

        const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(base);
        newExpiry.setDate(newExpiry.getDate() + cycleDays);

        if (existing) {
          await supabase
            .from("tool_access_passes")
            .update({ expires_at: newExpiry.toISOString(), paystack_reference: reference })
            .eq("id", existing.id);
        } else {
          await supabase.from("tool_access_passes").insert({
            user_id: metadata.user_id,
            tool_key: "school_report_card_subscription",
            purchased_at: new Date().toISOString(),
            expires_at: newExpiry.toISOString(),
            paystack_reference: reference,
          });
        }
      }
    } else if (metadata?.product === "event_pass") {
      await supabase
        .from("events")
        .update({
          pass_status: "active",
          purchased_at: new Date().toISOString(),
          paystack_reference: reference,
        })
        .eq("id", metadata.event_id);
    } else if (metadata?.product === "payroll") {
      const currentExpiry0 = await supabase
        .from("payroll_subscriptions")
        .select("expires_at")
        .eq("business_id", metadata.business_id)
        .maybeSingle();

      const existingExpiry = currentExpiry0.data?.expires_at ? new Date(currentExpiry0.data.expires_at) : null;
      const base = existingExpiry && existingExpiry > new Date() ? existingExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + cycleDays);

      await supabase.from("payroll_subscriptions").upsert({
        business_id: metadata.business_id,
        plan: metadata.plan,
        employee_limit: metadata.employee_limit,
        status: "active",
        billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
    } else if (metadata?.product === "receivable_manager") {
      const currentExpiry0 = await supabase
        .from("receivable_subscriptions")
        .select("expires_at")
        .eq("business_id", metadata.business_id)
        .maybeSingle();

      const existingExpiry = currentExpiry0.data?.expires_at ? new Date(currentExpiry0.data.expires_at) : null;
      const base = existingExpiry && existingExpiry > new Date() ? existingExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + cycleDays);

      await supabase.from("receivable_subscriptions").upsert({
        business_id: metadata.business_id,
        plan: metadata.plan === "growth" ? "growth" : "starter",
        status: "active",
        billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
    } else if (metadata?.product === "esign") {
      if (metadata.mode === "payg") {
        const { data: existing } = await supabase
          .from("esign_subscriptions")
          .select("credits_balance")
          .eq("user_id", metadata.user_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("esign_subscriptions")
            .update({ credits_balance: Number(existing.credits_balance || 0) + Number(metadata.credit_count || 0), updated_at: new Date().toISOString() })
            .eq("user_id", metadata.user_id);
        } else {
          await supabase.from("esign_subscriptions").insert({
            user_id: metadata.user_id,
            plan: "payg",
            credits_balance: Number(metadata.credit_count || 0),
          });
        }
      } else if (metadata.mode === "subscription") {
        await supabase.from("esign_subscriptions").upsert({
          user_id: metadata.user_id,
          plan: metadata.plan,
          envelope_allowance: metadata.allowance,
          envelopes_used_this_period: 0,
          period_reset_at: addDays(30),
          status: "active",
          billing_cycle: "monthly",
          expires_at: addDays(30),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    } else if (metadata?.product === "wht") {
      if (metadata.mode === "payg") {
        const { data: existing } = await supabase
          .from("wht_subscriptions")
          .select("credits_balance")
          .eq("business_id", metadata.business_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("wht_subscriptions")
            .update({ credits_balance: Number(existing.credits_balance || 0) + Number(metadata.credit_count || 0), updated_at: new Date().toISOString() })
            .eq("business_id", metadata.business_id);
        } else {
          await supabase.from("wht_subscriptions").insert({
            business_id: metadata.business_id,
            plan: "payg",
            credits_balance: Number(metadata.credit_count || 0),
          });
        }
      } else if (metadata.mode === "subscription") {
        await supabase.from("wht_subscriptions").upsert({
          business_id: metadata.business_id,
          plan: metadata.plan,
          record_allowance: metadata.allowance,
          records_used_this_period: 0,
          period_reset_at: addDays(30),
          status: "active",
          billing_cycle: "monthly",
          expires_at: addDays(30),
          updated_at: new Date().toISOString(),
        }, { onConflict: "business_id" });
      }
    } else if (metadata?.product === "contract_scanner") {
      const { data: existing } = await supabase
        .from("contract_scan_credits")
        .select("credits_balance")
        .eq("user_id", metadata.user_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("contract_scan_credits")
          .update({ credits_balance: Number(existing.credits_balance || 0) + Number(metadata.credit_count || 0), updated_at: new Date().toISOString() })
          .eq("user_id", metadata.user_id);
      } else {
        await supabase.from("contract_scan_credits").insert({
          user_id: metadata.user_id,
          credits_balance: Number(metadata.credit_count || 0),
        });
      }
    } else if (metadata?.product === "freelance_tax") {
      const { data: existing } = await supabase
        .from("freelance_subscriptions")
        .select("expires_at")
        .eq("user_id", metadata.user_id)
        .maybeSingle();

      const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + cycleDays);

      await supabase.from("freelance_subscriptions").upsert({
        user_id: metadata.user_id,
        plan: "pro",
        status: "active",
        billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } else if (metadata?.product === "pdf_toolkit") {
      const { data: existing } = await supabase
        .from("pdf_toolkit_subscriptions")
        .select("expires_at")
        .eq("user_id", metadata.user_id)
        .maybeSingle();

      const currentExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + cycleDays);

      await supabase.from("pdf_toolkit_subscriptions").upsert({
        user_id: metadata.user_id,
        plan: "pro",
        status: "active",
        billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } else if (metadata?.product === "pdf_os") {
      // PDF OS carries its own subscriptions table (pdf_os_subscriptions),
      // separate from pdf_toolkit_subscriptions/profiles.plan, per the
      // explicit "own subscription" product decision.
      const { data: existing } = await supabase
        .from("pdf_os_subscriptions")
        .select("expires_at, status")
        .eq("user_id", metadata.user_id)
        .maybeSingle();

      const currentExpiry = existing?.expires_at && existing.status === "active"
        ? new Date(existing.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + cycleDays);

      await supabase.from("pdf_os_subscriptions").upsert({
        user_id: metadata.user_id,
        plan: metadata.plan === "business" ? "business" : "pro",
        status: "active",
        provider: "squad",
        provider_subscription_id: reference,
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    await supabase.from("payment_intents").delete().eq("order_reference", reference);
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
