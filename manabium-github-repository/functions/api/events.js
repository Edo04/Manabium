const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Origin",
};

const EVENT_TYPES = new Set(["page_view", "content_impression", "content_detail_view", "external_link_click"]);
const CONTENT_TYPES = new Set(["bottle", "article", "enterprise"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isSameOriginRequest(request) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function validOptionalText(value, maximum) {
  return value == null || (typeof value === "string" && value.length <= maximum);
}

function validOptionalUuid(value) {
  return value == null || value === "" || (typeof value === "string" && UUID_PATTERN.test(value));
}

function validEvent(event) {
  return event && typeof event === "object" && !Array.isArray(event)
    && typeof event.client_event_id === "string" && UUID_PATTERN.test(event.client_event_id)
    && EVENT_TYPES.has(event.event_type)
    && validOptionalText(event.page_key, 80)
    && (event.content_type == null || CONTENT_TYPES.has(event.content_type))
    && validOptionalUuid(event.content_id)
    && validOptionalUuid(event.enterprise_content_id);
}

export function onRequestOptions({ request }) {
  if (!isSameOriginRequest(request)) return json({ error: "Cross-origin request denied." }, 403);
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOriginRequest(request)) return json({ error: "Cross-origin request denied." }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: "Analytics is not configured." }, 503);
  }

  let payload;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 32768) return json({ error: "Request too large." }, 413);
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || typeof payload.session_id !== "string" || !UUID_PATTERN.test(payload.session_id)
    || typeof payload.visitor_id !== "string" || !UUID_PATTERN.test(payload.visitor_id)
    || !Array.isArray(payload.events) || payload.events.length === 0 || payload.events.length > 50
    || !payload.events.every(validEvent)
    || !validOptionalText(payload.landing_page, 160)
    || !validOptionalText(payload.referrer_host, 160)
    || !validOptionalText(payload.utm_source, 120)
    || !validOptionalText(payload.utm_medium, 120)
    || !validOptionalText(payload.utm_campaign, 160)
    || !validOptionalText(payload.utm_content, 160)
    || !validOptionalText(payload.utm_term, 160)) {
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
