// supabase/functions/auth-token-upsert/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ message: "Use POST to upsert auth tokens." }), { status: 405, headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { profileId, token, expiresAt, current_user_id } = body || {};

    if (!profileId || !token || !expiresAt || !current_user_id) {
      return new Response(JSON.stringify({ message: "Missing required fields" }), { status: 400, headers: CORS_HEADERS });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the profile belongs to the requesting auth UID
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ message: 'Profile not found', details: profileError }), { status: 404, headers: CORS_HEADERS });
    }

    if (profile.auth_uid !== current_user_id) {
      return new Response(JSON.stringify({ message: 'Not allowed to create a token for this profile' }), { status: 403, headers: CORS_HEADERS });
    }

    // Upsert into auth_tokens using service role (bypasses RLS)
    const payload = {
      user_id: current_user_id,
      profile_id: profileId,
      token,
      expires_at: expiresAt,
      used: false,
      created_at: new Date().toISOString()
    };

    // Try the plural table name first, then fall back to singular if it doesn't exist
    let upserted = null;
    let upsertError = null;
    try {
      const res = await supabaseAdmin
        .from('auth_tokens')
        .upsert(payload, { onConflict: 'user_id' })
        .select();
      upserted = res.data;
      upsertError = res.error;
    } catch (e) {
      upsertError = e;
    }

    if (upsertError) {
      console.warn('[auth-token-upsert] auth_tokens upsert failed, trying auth_token singular', upsertError?.message || upsertError);
      try {
        const res2 = await supabaseAdmin
          .from('auth_token')
          .upsert(payload, { onConflict: 'user_id' })
          .select();
        upserted = res2.data;
        upsertError = res2.error;
      } catch (e2) {
        upsertError = e2;
      }
    }

    if (upsertError) {
      console.error('[auth-token-upsert] DB upsert error', upsertError);
      return new Response(JSON.stringify({ message: 'Failed to upsert token', details: upsertError }), { status: 500, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ token, expiresAt, db: upserted }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error('[auth-token-upsert] Unexpected error', err);
    return new Response(JSON.stringify({ message: 'Unexpected error', details: err?.message ?? err }), { status: 500, headers: CORS_HEADERS });
  }
});
