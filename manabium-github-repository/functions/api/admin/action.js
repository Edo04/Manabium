import { json, verifiedAdmin, rpcFailure } from "../../_lib/admin.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequestPost({ request, env }) {
  try {
  const verified = await verifiedAdmin(request, env);
  if (verified.error) return verified.error;
  const { user } = verified;

  let body;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8192) return json({ error: "Request too large." }, 413);
    body = JSON.parse(rawBody);
  } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request." }, 400);
  const optionalText = (value, maximum) => value == null || (typeof value === "string" && value.length <= maximum);
  const validUntil = body.until == null || (typeof body.until === "string" && Number.isFinite(Date.parse(body.until)));
  const validAction = body.action === "moderate_content"
    ? ["post", "reply", "note", "note_comment"].includes(body.target_type) && UUID_PATTERN.test(body.target_id ?? "") && ["visible", "hidden"].includes(body.status) && optionalText(body.note, 1000)
    : body.action === "resolve_report"
      ? UUID_PATTERN.test(body.report_id ?? "") && ["reviewing", "resolved", "dismissed"].includes(body.status) && optionalText(body.note, 1000)
      : body.action === "set_user_status"
        ? UUID_PATTERN.test(body.user_id ?? "") && ["active", "suspended"].includes(body.status) && optionalText(body.reason, 500) && validUntil
        : false;
  if (!validAction) return json({ error: "Invalid request." }, 400);
  const actions = {
    moderate_content: {
      rpc: "admin_moderate_content",
      params: { p_admin_user_id: user.id, p_target_type: body.target_type, p_target_id: body.target_id, p_status: body.status, p_note: body.note ?? null },
    },
    resolve_report: {
      rpc: "admin_resolve_report",
      params: { p_admin_user_id: user.id, p_report_id: body.report_id, p_status: body.status, p_note: body.note ?? null },
    },
    set_user_status: {
      rpc: "admin_set_user_status",
      params: { p_admin_user_id: user.id, p_user_id: body.user_id, p_status: body.status, p_reason: body.reason ?? null, p_until: body.until ?? null },
    },
  };
  const selected = actions[body.action];
  if (!selected) return json({ error: "Unknown action." }, 400);

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${selected.rpc}`, {
    method: "POST",
    headers: verified.privilegedHeaders,
    body: JSON.stringify(selected.params),
  });
  if (!response.ok) return rpcFailure(response.status);
  return json({ ok: true });
  } catch {
    return json({ error: "Admin service unavailable.", code: "ADMIN_UNAVAILABLE" }, 503);
  }
}
