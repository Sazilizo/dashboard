// supabase/functions/database-access/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ message: "Function is alive. Use POST to create users." }),
      { status: 405, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await req.json();
    const { email, password, username, role_id, school_id, current_user_id } = body;

    if (!email || !password || !username || !role_id) {
      return new Response(
        JSON.stringify({ message: "Missing required fields" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get current user (who is creating the new user)
    const { data: currentUser, error: fetchUserError } = await supabaseAdmin
      .from("users")
      .select("role_id")
      .eq("auth_uid", current_user_id)
      .single();

    if (fetchUserError || !currentUser) {
      return new Response(
        JSON.stringify({ message: "Invalid current user", details: fetchUserError }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const { data: currentUserRole, error: fetchRoleError } = await supabaseAdmin
      .from("roles")
      .select("name")
      .eq("id", currentUser.role_id)
      .single();

    if (
      fetchRoleError ||
      !currentUserRole ||
      !["superuser", "admin", "hr"].includes(currentUserRole.name.toLowerCase())
    ) {
      return new Response(
        JSON.stringify({ message: "Not authorized to create users" }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Get the name of the role the new user will have
    const { data: newUserRoleData, error: newUserRoleError } = await supabaseAdmin
      .from("roles")
      .select("name")
      .eq("id", role_id)
      .single();

    if (newUserRoleError || !newUserRoleData) {
      return new Response(
        JSON.stringify({ message: "Invalid role_id provided", details: newUserRoleError }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const newUserRoleName = newUserRoleData.name.toLowerCase();
    const privilegedRoles = ["superuser", "admin", "hr"];

    // Enforce school_id rule
    if (!privilegedRoles.includes(newUserRoleName) && !school_id) {
      return new Response(
        JSON.stringify({ message: "school_id is required for non-privileged roles." }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Create the auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(
        JSON.stringify({ message: "Auth creation error", details: authError }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Log insert payload for debugging
    const insertPayload = {
      auth_uid: authUser.id,
      email,
      username,
      role_id,
      school_id: school_id || null,
    };

    console.log("Inserting user with data:", insertPayload);

    // Insert user into `users` table
    const { error: profileError } = await supabaseAdmin
      .from("users")
      .insert(insertPayload);

    if (profileError) {
      console.error("Insert user error:", profileError);
      // Cleanup: delete auth user if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return new Response(
        JSON.stringify({ message: "Database insert error", details: profileError }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        message: "User created successfully",
        auth_uid: authUser.id,
        email,
        username,
        role_id,
        school_id: school_id || null,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ message: "Unexpected error", details: err?.message ?? err }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
