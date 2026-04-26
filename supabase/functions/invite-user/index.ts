import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Not authenticated");

    const { data: roleCheck } = await callerClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!roleCheck) throw new Error("Admin only");

    const { email, password, employee_id, role, full_name } = await req.json();
    if (!email || !employee_id || !role) throw new Error("Missing email, employee_id, or role");
    if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if user already exists
    const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers();
    const existingUser = allUsers?.find((u: any) => u.email === email);

    let userId: string;

    if (existingUser) {
      // Reset password for existing user
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true });
      if (updateErr) throw updateErr;
      userId = existingUser.id;
      // Upsert role in case it changed
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("user_roles").insert({ user_id: userId, role });
    } else {
      // Create new user
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });
      if (createErr) throw createErr;
      userId = newUser.user.id;
      await adminClient.from("profiles").update({ employee_id, full_name: full_name || email }).eq("id", userId);
      await adminClient.from("user_roles").insert({ user_id: userId, role });
    }

    await adminClient.from("employees").update({ email, profile_id: userId }).eq("id", employee_id);

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      message: existingUser ? `Password reset for ${email}.` : `Account created for ${email}.`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
