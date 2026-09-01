/* Sunshine v3.34 — período visível dentro de Comissões */
(function(){
  const KEY='sunshine.period.v33';
  let observer34=null;
  let refreshing34=false;

  function today34(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function default34(){const d=new Date();return {start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,end:today34()};}
  function period34(){try{return {...default34(),...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(_e){return default34();}}
  function save34(p){localStorage.setItem(KEY,JSON.stringify(p));}
  function valid34(p){return Boolean(p.start&&p.end&&p.start<=p.end);}
  function bounds34(p){const a=new Date(`${p.start}T00:00:00-03:00`),b=new Date(`${p.end}T00:00:00-03:00`);b.setDate(b.getDate()+1);return [a.toISOString(),b.toISOString()];}
  function br34(v){return String(v||'').split('-').reverse().join('/');}

  function panel34(){return [...document.querySelectorAll('#content article.panel')].find(p=>/^comiss[oõ]es$/i.test((p.querySelector('h2')?.textContent||'').trim()))||null;}
  function ensureStyle34(){if(document.getElementById('v34style'))return;const s=document.createElement('style');s.id='v34style';s.textContent=`
    .commission-period34{border:1px solid #e5d5cb;background:#fffaf6;border-radius:16px;padding:14px 16px;margin:14px 0;display:grid;gap:12px}
    .commission-period34-head b{display:block;color:#5b2e20;font-size:14px}.commission-period34-head span{display:block;color:#806b62;font-size:12px;line-height:1.4;margin-top:3px}
    .commission-period34-fields{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.commission-period34-fields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#6c5147}.commission-period34-fields input{width:100%}
    .commission-period34-status{padding:10px 12px;border-radius:12px;background:#fff;color:#705d55;font-size:12px;line-height:1.4}.commission-period34-status b{color:#3c2017}
    @media(max-width:720px){.commission-period34-fields{grid-template-columns:1fr 1fr}.commission-period34-fields .btn{grid-column:1/-1;width:100%}}
  `;document.head.appendChild(s);}

  async function data34(p,status='DUE'){
    const [start,end]=bounds34(p);
    const cq=await db.from('commission_entries').select('id,amount,beneficiary_member_id,payment_allocation_id,status').eq('status',status).limit(10000);
    if(cq.error)throw cq.error;
    const entries=cq.data||[];if(!entries.length)return {rows:[],total:0,totals:{},count:0};
    const allocIds=[...new Set(entries.map(x=>x.payment_allocation_id).filter(Boolean))];if(!allocIds.length)return {rows:[],total:0,totals:{},count:0};
    const aq=await db.from('payment_allocations').select('id,payment_id').in('id',allocIds).limit(10000);if(aq.error)throw aq.error;
    const payByAlloc=Object.fromEntries((aq.data||[]).map(x=>[x.id,x.payment_id]));
    const payIds=[...new Set((aq.data||[]).map(x=>x.payment_id).filter(Boolean))];if(!payIds.length)return {rows:[],total:0,totals:{},count:0};
    const pq=await db.from('payments').select('id,paid_at,created_at').in('id',payIds).gte('paid_at',start).lt('paid_at',end).limit(10000);if(pq.error)throw pq.error;
    const ok=new Set((pq.data||[]).map(x=>x.id));
    const team=Object.fromEntries((state.team||[]).map(x=>[x.id,x.full_name]));
    const rows=entries.filter(x=>ok.has(payByAlloc[x.payment_allocation_id]));
    const totals={};rows.forEach(x=>{const name=team[x.beneficiary_member_id]||'Outros';totals[name]=(totals[name]||0)+Number(x.amount||0);});
    return {rows,count:rows.length,total:rows.reduce((s,x)=>s+Number(x.amount||0),0),totals};
  }

  function syncTopFilter34(p){document.querySelectorAll('[data-period-context32="financeiro"]').forEach(bar=>{const a=bar.querySelector('[data-period-start32]'),b=bar.querySelector('[data-period-end32]');if(a)a.value=p.start;if(b)b.value=p.end;});}

  async function refresh34(){
    if(refreshing34||state.view!=='financeiro'||state.demo||!db)return;
    const box=document.getElementById('commissionPeriod34'),bulk=document.getElementById('commissionBulkBar30');if(!box||!bulk)return;
    refreshing34=true;
    try{
      const p=period34(),d=await data34(p,'DUE');
      const status=box.querySelector('[data-period-status34]');
      if(status)status.innerHTML=d.count?`No período de <b>${br34(p.start)} a ${br34(p.end)}</b>: <b>${d.count}</b> comissões abertas · total <b>${fmtMoney(d.total)}</b>.`:`No período de <b>${br34(p.start)} a ${br34(p.end)}</b>: nenhuma comissão aberta.`;
      const title=bulk.querySelector('b');if(title&&title.textContent!=='Baixa do período')title.textContent='Baixa do período';
      const copy=bulk.querySelector('[data-commission-bulk-copy30]');if(copy){const txt=d.count?`${d.count} comissões do período · total ${fmtMoney(d.total)}. Somente este período será baixado.`:'Nenhuma comissão aberta no período selecionado.';if(copy.textContent!==txt)copy.textContent=txt;}
      let btn=bulk.querySelector('[data-pay-all-commissions30],[data-pay-period32],[data-pay-period34]');
      if(btn){btn.removeAttribute('data-pay-all-commissions30');btn.removeAttribute('data-pay-period32');btn.dataset.payPeriod34='1';btn.disabled=!d.count;const txt=d.count?`Marcar período como pago (${d.count})`:'Nenhuma comissão no período';if(btn.textContent!==txt)btn.textContent=txt;}
      const copyBtn=bulk.querySelector('[data-copy-commission-closing31],[data-copy-period34]');if(copyBtn){copyBtn.removeAttribute('data-copy-commission-closing31');copyBtn.dataset.copyPeriod34='1';copyBtn.textContent='Copiar fechamento deste período';}
    }catch(e){toast(e.message||'Não foi possível carregar as comissões do período.','error');}
    finally{refreshing34=false;}
  }

  function inject34(){
    if(state.view!=='financeiro')return;ensureStyle34();const p=panel34();if(!p)return;
    const bulk=document.getElementById('commissionBulkBar30');if(!bulk)return;
    let box=document.getElementById('commissionPeriod34');
    if(!box){const r=period34();box=document.createElement('div');box.id='commissionPeriod34';box.className='commission-period34';box.innerHTML=`<div class="commission-period34-head"><b>Filtrar período das comissões</b><span>Escolha o período antes da baixa. Agosto e setembro ficam separados.</span></div><div class="commission-period34-fields"><label>De<input class="field" type="date" data-start34 value="${r.start}"></label><label>Até<input class="field" type="date" data-end34 value="${r.end}"></label><button class="btn secondary" type="button" data-apply34>Aplicar filtro</button></div><div class="commission-period34-status" data-period-status34>Carregando período…</div>`;bulk.insertAdjacentElement('beforebegin',box);}
    setTimeout(refresh34,120);
  }

  async function apply34(btn){const box=btn.closest('#commissionPeriod34'),p={start:box.querySelector('[data-start34]').value,end:box.querySelector('[data-end34]').value};if(!valid34(p)){toast('A data inicial não pode ser posterior à data final. Corrija o período para continuar.','error');return;}save34(p);syncTopFilter34(p);const top=document.querySelector('[data-period-context32="financeiro"] [data-apply-period32]');if(top)top.click();await refresh34();}

  async function pay34(btn){const p=period34();if(!valid34(p)){toast('Falta definir um período válido antes da baixa.','error');return;}let d;try{d=await data34(p,'DUE');}catch(e){toast(e.message||'Não foi possível consultar as comissões.','error');return;}if(!d.count){toast('Não há comissões abertas no período selecionado.');return;}if(!confirm(`Marcar como pagas ${d.count} comissões de ${br34(p.start)} a ${br34(p.end)}, total ${fmtMoney(d.total)}?\n\nSomente este período será baixado.`))return;btn.disabled=true;btn.textContent='Dando baixa no período…';const [start,end]=bounds34(p);const q=await db.rpc('admin_pay_due_commissions_between',{p_start:start,p_end:end});if(q.error){btn.disabled=false;toast(q.error.message||'Não foi possível concluir a baixa.','error');await refresh34();return;}toast(`${Number(q.data?.count||0)} comissões do período marcadas como pagas · ${fmtMoney(q.data?.total||0)}.`);await navigate('financeiro');}

  async function copy34(btn){const p=period34();let d;try{d=await data34(p,'DUE');}catch(e){toast(e.message||'Não foi possível montar o fechamento.','error');return;}const names=['Yasmin','Lourdes','Rosely',...Object.keys(d.totals).filter(x=>!['Yasmin','Lourdes','Rosely'].includes(x))];const lines=d.count?[`COMISSÃO DO PERÍODO: ${br34(p.start)} A ${br34(p.end)}`,'',...names.filter(n=>d.totals[n]).map(n=>`${n.toUpperCase()}: ${fmtMoney(d.totals[n])}`)]:[`COMISSÃO DO PERÍODO: ${br34(p.start)} A ${br34(p.end)}`,'','SEM PENDÊNCIAS'];const text=lines.join('\n');try{await navigator.clipboard.writeText(text);toast('Fechamento do período copiado.');}catch(_e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Fechamento do período copiado.');}}

  document.addEventListener('click',e=>{const a=e.target.closest('[data-apply34]');if(a){e.preventDefault();apply34(a);return;}const p=e.target.closest('[data-pay-period34]');if(p){e.preventDefault();e.stopPropagation();pay34(p);return;}const c=e.target.closest('[data-copy-period34]');if(c){e.preventDefault();e.stopPropagation();copy34(c);return;}},true);
  function start34(){inject34();if(observer34)return;observer34=new MutationObserver(inject34);observer34.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='<span class="dot"></span> Ecossistema Sunshine · v3.34';}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start34);else start34();
})();
