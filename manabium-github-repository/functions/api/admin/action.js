const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: "Admin API is not configured." }, 503);
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization, "Content-Type": "application/json" };

  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return json({ error: "Invalid session." }, 401);
  const user = await userResponse.json();
  if (!user.id) return json({ error: "Invalid session." }, 401);
  const roleResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_current_user_admin`, { method: "POST", headers, body: "{}" });
  if (!roleResponse.ok || await roleResponse.json() !== true) return json({ error: "Admin access required." }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const actions = {
    moderate_content: {
      rpc: "admin_moderate_content",
      params: { p_target_type: body.target_type, p_target_id: body.target_id, p_status: body.status, p_note: body.note ?? null },
    },
    resolve_report: {
      rpc: "admin_resolve_report",
      params: { p_report_id: body.report_id, p_status: body.status, p_note: body.note ?? null },
    },
    set_user_status: {
      rpc: "admin_set_user_status",
      params: { p_user_id: body.user_id, p_status: body.status, p_reason: body.reason ?? null, p_until: body.until ?? null },
    },
  };
  const selected = actions[body.action];
  if (!selected) return json({ error: "Unknown action." }, 400);

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${selected.rpc}`, {
    method: "POST",
    headers,
    body: JSON.stringify(selected.params),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Admin action failed", response.status, detail);
    return json({ error: response.status === 403 ? "Admin access required." : "Could not complete action." }, response.status === 403 ? 403 : 400);
  }
  return json({ ok: true });
}
