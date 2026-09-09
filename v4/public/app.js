const $ = s => document.querySelector(s)
const $$ = s => [...document.querySelectorAll(s)]
const brl = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100)
const toCents = value => Math.round(Number(value)*100)
const tokenKey = 'sunshine-v4-isolated-token'
let token = sessionStorage.getItem(tokenKey)
let me = null
let state = null

function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.classList.remove('hidden');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.classList.add('hidden'),2600)}
function permission(code){return Boolean(me?.permissions?.includes(code))}
function authHeaders(extra={}){return token?{...extra,authorization:`Bearer ${token}`}:{...extra}}
async function api(path,method='GET',payload){
  const r=await fetch(path,{method,headers:authHeaders(payload?{'content-type':'application/json'}:{}),body:payload?JSON.stringify(payload):undefined})
  const d=await r.json().catch(()=>({error:'Resposta inválida'}))
  if(r.status===401){logout(false);throw new Error(d.error||'Sessão expirada')}
  if(!r.ok)throw Object.assign(new Error(d.error||'Erro'),{status:r.status,code:d.code})
  return d
}
function showLogged(logged){$('#loginView').classList.toggle('hidden',logged);$('#appView').classList.toggle('hidden',!logged);$('#logoutBtn').classList.toggle('hidden',!logged)}
function logout(show=true){token=null;me=null;state=null;sessionStorage.removeItem(tokenKey);showLogged(false);if(show)toast('Sessão encerrada')}
function setTab(name){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tabpane').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${name}`));if(name==='audit')loadAudit().catch(e=>toast(e.message,true))}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o}
function replaceOptions(selector, rows){$$(selector).forEach(select=>{const prev=select.value;select.innerHTML='';rows.forEach(r=>select.append(option(r.value,r.label)));if(rows.some(r=>r.value===prev))select.value=prev})}
function renderPermissions(){
  $$('.action').forEach(card=>{
    const code=card.dataset.permission;const allowed=permission(code);card.classList.toggle('locked',!allowed)
    card.querySelectorAll('input,select,button').forEach(el=>el.disabled=!allowed)
  })
  const auditTab=$('.tab[data-tab="audit"]');auditTab.classList.toggle('hidden',!permission('audit.read'))
}
function renderMetrics(){
  const m=state.summary
  $('#metrics').innerHTML=`
    <div class="metric"><span>A receber</span><b>${brl(m.openReceivablesCents)}</b></div>
    <div class="metric"><span>Não alocado</span><b>${brl(m.unallocatedPaymentsCents)}</b></div>
    <div class="metric"><span>Cobranças abertas</span><b>${m.pendingCollectionTasks}</b></div>
    <div class="metric ${m.inconsistentObligationsCents||m.inconsistentPaymentsCents?'alert':''}"><span>Inconsistências</span><b>${brl(m.inconsistentObligationsCents+m.inconsistentPaymentsCents)}</b></div>`
}
function renderPayments(){
  const people=new Map(state.people.map(p=>[p.id,p]))
  $('#paymentsList').innerHTML=state.payments.length?state.payments.map(p=>`<div class="row"><div class="row-head"><div><strong>${people.get(p.payerPersonId)?.fullName||p.payerSnapshot?.name||'Pagador não identificado'}</strong><p>${p.source} · ${new Date(p.paidAt).toLocaleString('pt-BR')}</p></div><span class="amount">${brl(p.amountCents)}</span></div><p><span class="badge">alocado ${brl(p.allocatedCents)}</span><span class="badge ${p.signedUnallocatedCents>0?'warn':''}">disponível ${brl(p.signedUnallocatedCents)}</span>${p.isOverallocated?'<span class="badge bad">INCONSISTENTE</span>':''}</p></div>`).join(''):'<div class="empty">Nenhum pagamento fictício.</div>'
}
function renderReceivables(){
  const people=new Map(state.people.map(p=>[p.id,p]))
  const rows=state.obligations.slice().sort((a,b)=>(b.signedBalanceCents||0)-(a.signedBalanceCents||0))
  $('#receivablesList').innerHTML=rows.length?rows.map(o=>`<div class="row"><div class="row-head"><div><strong>${people.get(o.beneficiaryPersonId)?.fullName||'Beneficiário'}</strong><p>${o.serviceName}</p></div><span class="amount">${brl(o.signedBalanceCents)}</span></div><p><span class="badge ${o.liquidationStatus==='PAID'?'good':o.isOverallocated?'bad':'warn'}">${o.liquidationStatus}</span><span class="badge">recebido ${brl(o.receivedCents)}</span>${o.dueDate?`<span class="badge">vence ${String(o.dueDate).slice(0,10)}</span>`:''}${o.nextCollectionDate?`<span class="badge">cobrar ${String(o.nextCollectionDate).slice(0,10)}</span>`:''}</p></div>`).join(''):'<div class="empty">Nenhuma obrigação fictícia.</div>'
}
function renderSelectors(){
  replaceOptions('.peopleSelect',state.people.map(p=>({value:p.id,label:p.fullName})))
  replaceOptions('#paymentSelect',state.payments.map(p=>({value:p.id,label:`${brl(p.amountCents)} · disponível ${brl(p.signedUnallocatedCents)}`})))
  const obligations=state.obligations.map(o=>({value:o.id,label:`${o.serviceName} · saldo ${brl(o.signedBalanceCents)}`}))
  replaceOptions('#obligationSelect',obligations);replaceOptions('.obligationSelect',obligations)
}
async function refresh(){state=await api('/api/state');renderMetrics();renderPayments();renderReceivables();renderSelectors()}
async function loadAudit(){if(!permission('audit.read'))return;const rows=await api('/api/audit');$('#auditList').innerHTML=rows.length?rows.map(a=>`<div class="row"><div class="row-head"><div><strong>${a.action}</strong><p>${a.entityType} · ${new Date(a.occurredAt).toLocaleString('pt-BR')}</p></div><span class="badge">${a.actorRole||'—'}</span></div><p>${a.entityId||''}</p></div>`).join(''):'<div class="empty">Sem eventos.</div>'}
async function bootstrap(){
  if(!token){showLogged(false);return}
  try{const x=await api('/api/me');me=x.user;showLogged(true);$('#identityLabel').textContent=me.displayName||me.username;$('#roleLabel').textContent=me.role;renderPermissions();await refresh()}catch{logout(false)}
}
function bindForm(selector, handler){$(selector).addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;try{await handler(new FormData(e.currentTarget));toast('Salvo no PostgreSQL isolado');await refresh()}catch(err){toast(err.message,true)}finally{if(btn)btn.disabled=!permission(e.currentTarget.closest('.action')?.dataset.permission||'')}})}

$('#loginUser').addEventListener('change',e=>{const map={'admin-demo':'sunshine-v4-admin','finance-demo':'sunshine-v4-finance','operacao-demo':'sunshine-v4-operacao','viewer-demo':'sunshine-v4-viewer'};$('#loginPassword').value=map[e.target.value]||''})
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=new FormData(e.currentTarget);const result=await api('/api/auth/login','POST',{username:f.get('username'),password:f.get('password')});token=result.token;sessionStorage.setItem(tokenKey,token);me=result.user;showLogged(true);$('#identityLabel').textContent=me.displayName;$('#roleLabel').textContent=me.role;renderPermissions();await refresh();toast('Acesso fictício liberado')}catch(err){toast(err.message,true)}})
$('#logoutBtn').onclick=()=>logout(true);$('#refreshBtn').onclick=()=>refresh().then(()=>toast('Atualizado')).catch(e=>toast(e.message,true));$$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab))

bindForm('#personForm',f=>api('/api/people','POST',{fullName:f.get('fullName'),phone:f.get('phone')||null}))
bindForm('#contractForm',f=>api('/api/contracts','POST',{customerPersonId:f.get('customerPersonId'),source:'MANUAL_DEMO',idempotencyKey:crypto.randomUUID(),items:[{beneficiaryPersonId:f.get('beneficiaryPersonId'),serviceCode:'CUSTOM_DEMO',serviceName:f.get('serviceName'),amountCents:toCents(f.get('amount')),dueDate:f.get('dueDate')||null}]}))
bindForm('#paymentForm',f=>api('/api/payments','POST',{payerPersonId:f.get('payerPersonId'),payerSnapshot:{name:'Pagador fictício via UI'},source:'MANUAL_DEMO',externalRef:f.get('externalRef'),idempotencyKey:f.get('externalRef'),amountCents:toCents(f.get('amount')),paidAt:new Date().toISOString()}))
bindForm('#allocationForm',f=>api('/api/allocations','POST',{paymentId:f.get('paymentId'),obligationId:f.get('obligationId'),amountCents:toCents(f.get('amount')),idempotencyKey:crypto.randomUUID()}))
bindForm('#promiseForm',f=>api('/api/promises','POST',{obligationId:f.get('obligationId'),promisedFor:f.get('promisedFor'),nextCollectionDate:f.get('nextCollectionDate')||null}))
bindForm('#collectionForm',f=>api('/api/collection-tasks','POST',{obligationId:f.get('obligationId'),scheduledFor:f.get('scheduledFor'),note:f.get('note')||null}))

bootstrap()
