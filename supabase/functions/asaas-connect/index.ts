import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const webhookUrl = `${supabaseUrl}/functions/v1/asaas-webhook`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sha256 = async (value: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};
const secureToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  const b64 = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `whsec_${b64}`;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userData, error: userError } = await service.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: member } = await service.from("team_members").select("id,role,active").eq("auth_user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || member.role !== "ADMIN") return json({ error: "admin_required" }, 403);

  let body: any; try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const apiKey = String(body?.apiKey || "").trim();
  const alertEmail = String(body?.alertEmail || "").trim();
  const environment = body?.environment === "SANDBOX" ? "SANDBOX" : "PRODUCTION";
  if (!apiKey || !alertEmail) return json({ error: "api_key_and_email_required" }, 400);
  const base = environment === "SANDBOX" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  const headers = { accept: "application/json", "content-type": "application/json", access_token: apiKey, "user-agent": "Sunshine-Ecossistema/3.0" };

  const test = await fetch(`${base}/customers?offset=0&limit=1`, { method: "GET", headers });
  if (!test.ok) return json({ error: "asaas_auth_failed", status: test.status, detail: (await test.text()).slice(0,500) }, 400);
  const { error: vaultError } = await service.rpc("asaas_store_api_key", { p_api_key: apiKey });
  if (vaultError) return json({ error: "vault_store_failed", detail: vaultError.message }, 500);

  const token = secureToken(); const tokenHash = await sha256(token);
  const events = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_REFUNDED"];
  const listRes = await fetch(`${base}/webhooks?offset=0&limit=100`, { method: "GET", headers });
  if (!listRes.ok) return json({ error: "webhook_list_failed", status: listRes.status }, 400);
  const listJson: any = await listRes.json();
  const existing = (listJson?.data || []).find((w:any) => w?.name === "Sunshine Ecossistema" || w?.url === webhookUrl);
  let webhookId: string | null = null;
  if (existing?.id) {
    const r = await fetch(`${base}/webhooks/${encodeURIComponent(existing.id)}`, { method:"PUT", headers, body:JSON.stringify({ name:"Sunshine Ecossistema",url:webhookUrl,enabled:true,interrupted:false,authToken:token,sendType:"SEQUENTIALLY",events }) });
    if (!r.ok) return json({ error:"webhook_update_failed",status:r.status,detail:(await r.text()).slice(0,500) },400);
    const updated:any=await r.json(); webhookId=updated?.id||existing.id;
  } else {
    const r = await fetch(`${base}/webhooks`, { method:"POST", headers, body:JSON.stringify({ name:"Sunshine Ecossistema",url:webhookUrl,email:alertEmail,enabled:true,interrupted:false,apiVersion:3,authToken:token,sendType:"SEQUENTIALLY",events }) });
    if (!r.ok) return json({ error:"webhook_create_failed",status:r.status,detail:(await r.text()).slice(0,500) },400);
    const created:any=await r.json(); webhookId=created?.id||null;
  }
  const { data: settings } = await service.from("asaas_integration_settings").select("id").order("created_at",{ascending:true}).limit(1).maybeSingle();
  const patch={environment,status:"CONNECTED",webhook_id:webhookId,webhook_url:webhookUrl,webhook_token_hash:tokenHash,alert_email:alertEmail,connected_at:new Date().toISOString(),connected_by:member.id,last_error:null};
  if(settings?.id) await service.from("asaas_integration_settings").update(patch).eq("id",settings.id); else await service.from("asaas_integration_settings").insert(patch);
  return json({ok:true,status:"CONNECTED",environment,webhookId,webhookUrl,events});
});
