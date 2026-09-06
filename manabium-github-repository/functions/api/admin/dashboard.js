import { JSON_HEADERS, json, verifiedAdmin, rpcFailure } from "../../_lib/admin.js";

export async function onRequestGet({ request, env }) {
  try {
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
    headers: verified.privilegedHeaders,
    body: JSON.stringify({ p_start_date: start, p_end_date: end, p_granularity: granularity }),
  });
  if (!response.ok) return rpcFailure(response.status);
  return new Response(await response.text(), { status: 200, headers: JSON_HEADERS });
  } catch {
    return json({ error: "Admin service unavailable.", code: "ADMIN_UNAVAILABLE" }, 503);
  }
}
