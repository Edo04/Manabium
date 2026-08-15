const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function verifiedAdmin(request, env) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return { error: json({ error: "Cross-origin request denied." }, 403) };
  }
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { error: json({ error: "Authentication required." }, 401) };
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { error: json({ error: "Admin API is not configured." }, 503) };

  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization, "Content-Type": "application/json" };
  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return { error: json({ error: "Invalid session." }, 401) };
  const user = await userResponse.json();
  if (!user.id) return { error: json({ error: "Invalid session." }, 401) };
  const roleResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_current_user_admin`, { method: "POST", headers, body: "{}" });
  if (!roleResponse.ok || await roleResponse.json() !== true) return { error: json({ error: "Admin access required." }, 403) };
  return { headers };
}

export async function onRequestGet({ request, env }) {
  const verified = await verifiedAdmin(request, env);
  if (verified.error) return verified.error;

  const url = new URL(request.url);
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const start = url.searchParams.get("start") || defaultStart;
  const end = url.searchParams.get("end") || defaultEnd;
  const granularity = url.searchParams.get("granularity") || "day";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !["day", "week", "month"].includes(granularity)) {
    return json({ error: "Invalid range." }, 400);
  }
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime || endTime - startTime > 366 * 86400000) {
    return json({ error: "Invalid range." }, 400);
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_analytics_dashboard`, {
    method: "POST",
    headers: { ...verified.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_start_date: start, p_end_date: end, p_granularity: granularity }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Admin dashboard RPC failed", response.status, detail);
    return json({ error: response.status === 403 ? "Admin access required." : "Could not load dashboard." }, response.status === 403 ? 403 : 400);
  }
  return new Response(await response.text(), { status: 200, headers: JSON_HEADERS });
}
