import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  try {
    const { email, password, username, role_id, school_id, current_user_id } = req.body;

    // Fetch current user role to verify privilege
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("role_id")
      .eq("auth_uid", current_user_id)
      .single();
    if (userError) throw userError;

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("name")
      .eq("id", currentUser.role_id)
      .single();
    if (roleError) throw roleError;

    if (!["superuser", "admin", "hr"].includes(roleData.name.toLowerCase())) {
      return res.status(403).json({ message: "Only superusers, admins, or HR can create users" });
    }

    // Create new auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    // Insert user profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        auth_uid: authUser.id,
        email,
        username,
        role_id,
        school_id: school_id || null,
      });
    if (profileError) throw profileError;

    res.status(200).json({ auth_uid: authUser.id, email });
  } catch (err) {
    console.error("Create user failed:", err);
    res.status(400).json({ message: err.message });
  }
}
