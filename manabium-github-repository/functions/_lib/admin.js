export const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Only server environment secrets may enter these headers. Never use the caller's JWT.
export function serverHeaders(env) {
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (key.startsWith("sb_secret_")) return { apikey: key, "Content-Type": "application/json" };
  if (/^eyJ[^.]+\.[^.]+\.[^.]+$/.test(key)) {
    return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  }
  return null;
}

export async function verifiedAdmin(request, env) {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && !["same-origin", "same-site", "none"].includes(site)) return { error: json({ error: "Cross-origin request denied." }, 403) };
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { error: json({ error: "Authentication required.", code: "SESSION_REQUIRED" }, 401) };
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !publicKey) return { error: json({ error: "Admin API is not configured.", code: "ADMIN_CONFIG_MISSING" }, 503) };
  const headers = { apikey: publicKey, Authorization: authorization, "Content-Type": "application/json" };
  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return { error: json({ error: "Invalid session.", code: "SESSION_REQUIRED" }, 401) };
  const user = await userResponse.json();
  if (!user.id) return { error: json({ error: "Invalid session.", code: "SESSION_REQUIRED" }, 401) };
  const roleResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_my_session_context`, { method: "POST", headers, body: "{}" });
  if (!roleResponse.ok) return { error: json({ error: "Could not verify admin access.", code: "ADMIN_ROLE_CHECK_FAILED" }, 503) };
  const sessionContext = await roleResponse.json();
  if (sessionContext?.is_admin !== true) return { error: json({ error: "Admin access required.", code: "ADMIN_REQUIRED" }, 403) };
  const privilegedHeaders = serverHeaders(env);
  if (!privilegedHeaders) return { error: json({ error: "Admin API is not configured.", code: "ADMIN_SECRET_MISSING" }, 503) };
  return { user, privilegedHeaders };
}

export function rpcFailure(status) {
  // Detailed database messages can contain row data. Do not return or log them.
  return json({ error: "Admin database request failed.", code: status === 401 ? "ADMIN_KEY_REJECTED" : status === 403 || status === 404 ? "ADMIN_DATABASE_SETUP" : "ADMIN_QUERY_FAILED" }, 502);
}
