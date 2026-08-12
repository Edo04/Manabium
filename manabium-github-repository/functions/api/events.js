const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: "Analytics is not configured." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (!Array.isArray(payload.events) || payload.events.length === 0 || payload.events.length > 50) {
    return json({ error: "Invalid event batch." }, 400);
  }

  const authorization = request.headers.get("Authorization");
  const headers = {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (authorization?.startsWith("Bearer ")) headers.Authorization = authorization;

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_analytics_events`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_session_id: payload.session_id,
      p_visitor_id: payload.visitor_id,
      p_events: payload.events,
      p_landing_page: payload.landing_page ?? null,
      p_referrer_host: payload.referrer_host ?? null,
      p_utm_source: payload.utm_source ?? null,
      p_utm_medium: payload.utm_medium ?? null,
      p_utm_campaign: payload.utm_campaign ?? null,
      p_utm_content: payload.utm_content ?? null,
      p_utm_term: payload.utm_term ?? null,
      p_is_first_visit: Boolean(payload.is_first_visit),
      p_is_returning_visit: Boolean(payload.is_returning_visit),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Analytics RPC failed", response.status, detail);
    return json({ error: "Could not record analytics." }, response.status === 401 ? 401 : 400);
  }
  return json({ recorded: true });
}
