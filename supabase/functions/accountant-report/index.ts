import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://sunshine.ymnegocios.com.br", "https://sunshine-ecossistema.vercel.app"]);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origins.has(origin) || /^https:\/\/sunshine-ecossistema-[a-z0-9-]+-ym-marketing-negocios\.vercel\.app$/.test(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "Utilize POST." });
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Entre novamente no sistema." });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return reply(401, { error: "Sessão inválida." });
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const { reportId } = await req.json();
    if (typeof reportId !== "string" || !/^[0-9a-f-]{36}$/i.test(reportId)) return reply(400, { error: "Fechamento inválido." });
    // Permission is checked again, not inferred from possession of a draft ID.
    const { data: me, error: permissionError } = await userClient.rpc("v4_me");
    if (permissionError || !me?.permissions?.includes("record.update")) return reply(403, { error: "Sem permissão de envio." });
    const { data: draft, error: claimError } = await service.rpc("v4_claim_accountant_report", { p_report_id: reportId, p_user_id: auth.user.id });
    if (claimError) return reply(409, { error: claimError.message });
    if (draft.alreadySent) return reply(200, { status: "SENT", id: draft.providerId, alreadySent: true });
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${draft.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `sunshine-accountant-${reportId}` },
        body: JSON.stringify({ from: draft.from, to: [draft.to], subject: draft.subject, text: draft.text }),
      });
    } catch {
      // Delivery may have happened. Keep SENDING rather than risk a second email.
      return reply(502, { error: "O provedor não confirmou o resultado. Confira no Resend antes de repetir o fechamento.", status: "SENDING" });
    }
    const result = await response.json();
    if (!response.ok || !result.id) {
      const safeError = `Resend ${response.status}: ${String(result.message || "Envio recusado").slice(0, 250)}`;
      await service.rpc("v4_finish_accountant_report", { p_report_id: reportId, p_provider_id: null, p_error: safeError });
      return reply(502, { error: safeError });
    }
    const { error: finishError } = await service.rpc("v4_finish_accountant_report", { p_report_id: reportId, p_provider_id: result.id, p_error: null });
    if (finishError) return reply(502, { error: "O Resend aceitou o envio, mas o registro não foi confirmado. Confira no provedor antes de repetir.", status: "SENDING" });
    return reply(200, { status: "SENT", id: result.id });
  } catch {
    return reply(400, { error: "Não foi possível processar o fechamento." });
  }
});
