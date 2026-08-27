import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const sha256=async(value:string)=>{const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("")};
const norm=(v:unknown)=>String(v??"").replace(/\D/g,"");

async function processEvent(payload:any,settings:any){
  const eventId=String(payload?.id||"");const eventType=String(payload?.event||"");const payment=payload?.payment||{};const paymentId=payment?.id?String(payment.id):null;const customerId=payment?.customer?String(payment.customer):null;
  try{
    let customer:any={}; const {data:apiKey}=await supabase.rpc("asaas_get_api_key");
    if(apiKey&&customerId){const base=settings.environment==="SANDBOX"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";const r=await fetch(`${base}/customers/${encodeURIComponent(customerId)}`,{method:"GET",headers:{accept:"application/json",access_token:apiKey,"user-agent":"Sunshine-Ecossistema/3.0"}});if(r.ok)customer=await r.json();}
    let matchedClientId:string|null=null;
    if(customerId){const{data}=await supabase.from("clients").select("id").eq("asaas_customer_id",customerId).maybeSingle();matchedClientId=data?.id||null;}
    if(!matchedClientId&&customer?.cpfCnpj){const{data}=await supabase.from("clients").select("id,document_number").not("document_number","is",null);matchedClientId=(data||[]).find((c:any)=>norm(c.document_number)===norm(customer.cpfCnpj))?.id||null;}
    if(!matchedClientId&&customer?.email){const{data}=await supabase.from("clients").select("id").ilike("email",customer.email).limit(1).maybeSingle();matchedClientId=data?.id||null;}
    const paidDate=payment?.paymentDate||payment?.clientPaymentDate||payment?.confirmedDate||payload?.dateCreated||null;
    const row:any={asaas_payment_id:paymentId,asaas_customer_id:customerId,latest_event_id:eventId,latest_event_type:eventType,asaas_status:payment?.status||null,gross_amount:Number(payment?.value||0),net_amount:payment?.netValue==null?null:Number(payment.netValue),billing_type:payment?.billingType||null,due_date:payment?.dueDate||null,payment_date:paidDate?new Date(paidDate).toISOString():null,description:payment?.description||null,external_reference:payment?.externalReference||null,customer_name:customer?.name||null,customer_email:customer?.email||null,customer_phone:customer?.phone||null,customer_mobile_phone:customer?.mobilePhone||null,customer_document:customer?.cpfCnpj||null,customer_postal_code:customer?.postalCode||null,customer_address:customer?.address||null,customer_address_number:customer?.addressNumber||null,customer_address_complement:customer?.complement||null,customer_district:customer?.province||null,customer_city:customer?.cityName||customer?.city||null,customer_state:customer?.state||null,customer_snapshot:customer||{},payment_snapshot:payment||{},matched_client_id:matchedClientId,received_at:new Date().toISOString()};
    if(paymentId&&["PAYMENT_RECEIVED","PAYMENT_CONFIRMED"].includes(eventType)){const{data:existing}=await supabase.from("asaas_incoming_payments").select("classification_status").eq("asaas_payment_id",paymentId).maybeSingle();if(existing?.classification_status==="RESOLVED")delete row.classification_status;else row.classification_status="PENDING";await supabase.from("asaas_incoming_payments").upsert(row,{onConflict:"asaas_payment_id"});}
    else if(paymentId){const{data:existing}=await supabase.from("asaas_incoming_payments").select("id").eq("asaas_payment_id",paymentId).maybeSingle();if(existing?.id)await supabase.from("asaas_incoming_payments").update(row).eq("id",existing.id);}
    if(paymentId&&eventType==="PAYMENT_REFUNDED")await supabase.from("payments").update({status:"REFUNDED",updated_at:new Date().toISOString()}).eq("source","ASAAS").eq("external_ref",paymentId);
    await supabase.from("asaas_webhook_events").update({process_status:"PROCESSED",processed_at:new Date().toISOString()}).eq("asaas_event_id",eventId);
    await supabase.from("asaas_integration_settings").update({last_event_at:new Date().toISOString(),status:"CONNECTED",last_error:null}).eq("id",settings.id);
  }catch(err){const message=err instanceof Error?err.message:String(err);await supabase.from("asaas_webhook_events").update({process_status:"ERROR",processed_at:new Date().toISOString(),error_message:message}).eq("asaas_event_id",eventId);await supabase.from("asaas_integration_settings").update({last_error:message}).eq("id",settings.id);}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const token=req.headers.get("asaas-access-token")||"";
  const{data:settings,error:settingsError}=await supabase.from("asaas_integration_settings").select("*").order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(settingsError||!settings?.webhook_token_hash)return json({error:"integration_not_configured"},503);
  if(!token||await sha256(token)!==settings.webhook_token_hash)return json({error:"invalid_webhook_token"},401);
  let payload:any;try{payload=await req.json()}catch{return json({error:"invalid_json"},400)}
  const eventId=String(payload?.id||"");const eventType=String(payload?.event||"");if(!eventId||!eventType)return json({error:"invalid_event"},400);
  const paymentId=payload?.payment?.id?String(payload.payment.id):null;const customerId=payload?.payment?.customer?String(payload.payment.customer):null;
  const{error:insertError}=await supabase.from("asaas_webhook_events").insert({asaas_event_id:eventId,event_type:eventType,asaas_payment_id:paymentId,asaas_customer_id:customerId,raw_payload:payload});
  if(insertError&&insertError.code==="23505")return json({ok:true,duplicate:true});if(insertError)return json({error:"event_store_failed"},500);
  EdgeRuntime.waitUntil(processEvent(payload,settings));
  return json({ok:true});
});
