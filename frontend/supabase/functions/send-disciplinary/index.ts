// supabase/functions/send-disciplinary/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - jsr import is resolved in Supabase Edge runtime
import { createClient } from "jsr:@supabase/supabase-js@2";
// Declare Deno for TypeScript tooling outside of Edge runtime
// deno-lint-ignore no-explicit-any
declare const Deno: any;

interface DisciplinaryPayload {
  to: string; // worker email
  subject: string;
  message: string; // HTML or plaintext
  type?: "warning" | "dismissal" | string;
  cc?: string | string[];
  bcc?: string | string[];
  includeMe?: boolean;
  hrEmail?: string; // current user's email for includeMe
  workerName?: string;
  workerId?: number;
  removedBy?: number; // profile id
  reason?: string;
}

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-client-info, apikey",
};

Deno.serve(async (req: Request) => {
  // Add CORS headers to all responses
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, x-client-info, apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }
  
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ message: "send-disciplinary is alive. Use POST to send." }),
      { status: 200, headers: corsHeaders }
    );
  }

  try {
    console.log("[send-disciplinary] Function invoked");
    
    let body;
    try {
      body = await req.json();
      console.log("[send-disciplinary] Request body:", JSON.stringify(body));
    } catch (parseErr) {
      console.error("[send-disciplinary] JSON parse error:", parseErr);
      return new Response(
        JSON.stringify({ message: "Invalid JSON in request body", details: String(parseErr) }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { to, subject, message, type, cc, bcc, includeMe, hrEmail, workerName, workerId, removedBy, reason } = body || {};

    console.log("[send-disciplinary] Parsed fields:", { to, subject, type, workerId, removedBy });

    if (!to || !subject || !message) {
      return new Response(
        JSON.stringify({ message: "Missing required fields: to, subject, message" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("DISCIPLINARY_FROM_EMAIL") || "no-reply@yourdomain.com";

    console.log("[send-disciplinary] Email config:", { hasApiKey: !!RESEND_API_KEY, from });

    // Build recipients
    const recipientsCc = Array.isArray(cc)
      ? cc
      : cc
      ? cc.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const recipientsBccBase = Array.isArray(bcc)
      ? bcc
      : bcc
      ? bcc.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];

    const recipientsBcc = includeMe && hrEmail ? [...recipientsBccBase, hrEmail] : recipientsBccBase;

    const subjectPrefix = type ? `[${String(type).toUpperCase()}] ` : "";
    const finalSubject = `${subjectPrefix}${subject}`;

    // Basic HTML wrapper
    const html = `
      <div style="font-family: Arial, sans-serif; line-height:1.6;">
        <p>Dear ${workerName || "Staff Member"},</p>
        <div>${message}</div>
        <p style="margin-top:16px;">Regards,<br/>HR Department</p>
      </div>
    `;

    if (!RESEND_API_KEY) {
      console.warn("[send-disciplinary] RESEND_API_KEY not set — simulating send");
      // Still proceed to record in DB even if email not actually sent
    }

    // Send via Resend API
    let emailResult: { status: string; id?: string | null; error?: string } = { status: "skipped" };
    if (RESEND_API_KEY) {
      console.log("[send-disciplinary] Sending email via Resend...");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          cc: recipientsCc.length ? recipientsCc : undefined,
          bcc: recipientsBcc.length ? recipientsBcc : undefined,
          subject: finalSubject,
          html,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[send-disciplinary] Resend error:", res.status, errText);
        emailResult = { status: "failed", error: errText };
      } else {
        const data = await res.json();
        console.log("[send-disciplinary] Email sent successfully:", data?.id);
        emailResult = { status: "sent", id: data?.id || null };
      }
    } else {
      console.log("[send-disciplinary] No API key - simulating send");
      emailResult = { status: "simulated" };
    }

    // Record to DB (worker_removal_reviews)
    let dbSuccess = false;
    let dbError = null;
    try {
      console.log("[send-disciplinary] Attempting DB record...");
      console.log("[send-disciplinary] Input data:", { workerId, removedBy, reason, type });
      
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      if (workerId) {
        // Get existing
        const { data: existing, error: fetchErr } = await supabaseAdmin
          .from("worker_removal_reviews")
          .select("id, warnings")
          .eq("removed_user_id", workerId)
          .maybeSingle();

        console.log("[send-disciplinary] Existing record:", existing, "Error:", fetchErr);

        const defaultWarnings = { warning_one: "", warning_two: "", final_warning: "" } as Record<string, string>;
        const warnings = (existing?.warnings && typeof existing.warnings === "object") ? { ...defaultWarnings, ...existing.warnings } : defaultWarnings;

        const msgForRecord = reason || subject || "";
        let shouldFreeze = false;

        if ((type || "").toLowerCase() === "dismissal") {
          warnings.final_warning = warnings.final_warning || msgForRecord;
          shouldFreeze = true;
        } else {
          if (!warnings.warning_one) {
            warnings.warning_one = msgForRecord;
          } else if (!warnings.warning_two) {
            warnings.warning_two = msgForRecord;
          } else if (!warnings.final_warning) {
            warnings.final_warning = msgForRecord;
            shouldFreeze = true; // Third warning = freeze
          }
        }

        console.log("[send-disciplinary] Warnings state:", warnings, "Should freeze:", shouldFreeze);

        const payload = {
          removed_user_id: workerId,
          removed_by_id: removedBy ?? null,
          reason: msgForRecord,
          warnings,
        };

        console.log("[send-disciplinary] DB payload:", payload);

        if (existing?.id) {
          const { error: updateErr } = await supabaseAdmin
            .from("worker_removal_reviews")
            .update(payload)
            .eq("id", existing.id);
          if (updateErr) {
            console.error("[send-disciplinary] Update error:", updateErr);
            throw updateErr;
          }
          console.log("[send-disciplinary] Updated existing record");
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from("worker_removal_reviews")
            .insert(payload);
          if (insertErr) {
            console.error("[send-disciplinary] Insert error:", insertErr);
            throw insertErr;
          }
          console.log("[send-disciplinary] Inserted new record");
        }

        // Freeze worker if final warning or dismissal
        if (shouldFreeze) {
          console.log("[send-disciplinary] Freezing worker ID:", workerId);
          const { error: freezeErr } = await supabaseAdmin
            .from("workers")
            .update({ is_frozen: true })
            .eq("id", workerId);
          
          if (freezeErr) {
            console.error("[send-disciplinary] Failed to freeze worker:", freezeErr);
          } else {
            console.log("[send-disciplinary] Worker frozen successfully");
          }
        }

        dbSuccess = true;
      } else {
        console.warn("[send-disciplinary] No workerId provided, skipping DB record");
      }
    } catch (dbErr) {
      console.error("[send-disciplinary] DB record failed:", dbErr);
      dbError = dbErr instanceof Error ? dbErr.message : String(dbErr);
      // Continue returning email result anyway
    }

    return new Response(JSON.stringify({ ...emailResult, dbSuccess, dbError }), {
      status: 200, // Always return 200 for now to see what's happening
      headers: corsHeaders,
    });
  } catch (err: unknown) {
    console.error("[send-disciplinary] Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[send-disciplinary] Error details:", { message: errorMessage, stack: errorStack });
    return new Response(
      JSON.stringify({ message: "Unexpected error", details: errorMessage, stack: errorStack }),
      { status: 200, headers: corsHeaders } // Return 200 even on error to see the details
    );
  }
});
