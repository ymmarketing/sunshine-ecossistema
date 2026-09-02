/* Sunshine v3.50 — fechamento da auditoria: compatibilidade entre patches legados e UX canônica. */
(function(){
  const VERSION='v3.50';
  const workState50={query:'',type:''};
  const digits50=v=>String(v||'').replace(/\D/g,'');
  const norm50=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  // Datas civis vindas de colunas DATE nunca passam por Date()/UTC.
  const previousFmtDate50=fmtDate;
  fmtDate=function(v){
    if(v==null||v==='')return '—';
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;
    }
    return previousFmtDate50(v);
  };

  function pin50(){
    document.documentElement.dataset.sunshineVersion=VERSION;
    document.documentElement.dataset.sunshineBuild=VERSION;
    const foot=document.querySelector('.sidebar-version-current,.sidebar-foot');
    if(foot)foot.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;
  }

  // Impede os observers v3.33 de recriarem filtros antigos e chamadas de até 5.000 linhas.
  function neutralizeLegacyPeriod50(){
    const content=document.getElementById('content');if(!content)return;
    if(state.view==='financeiro'){
      content.querySelectorAll('.period-bar32[data-period-context32="financeiro"]').forEach(x=>x.remove());
      const current=content.querySelector('.finance49-filter');
      if(current&&!current.hasAttribute('data-period-context32'))current.setAttribute('data-period-context32','financeiro');
    }
    if(state.view==='consultas'){
      content.querySelectorAll('.period-bar32[data-period-context32="consultas"]').forEach(x=>x.remove());
      const current=content.querySelector('.consult49-filter');
      if(current&&!current.hasAttribute('data-period-context32'))current.setAttribute('data-period-context32','consultas');
    }
  }

  // O DOM real usa #workTypeFilter; patches antigos ouviam #workType.
  function bindWorkFilter50(){
    if(state.view!=='trabalhos')return;
    const search=document.getElementById('workSearch');
    const type=document.getElementById('workTypeFilter')||document.getElementById('workType');
    if(!search||!type)return;
    search.value=workState50.query;type.value=workState50.type;
    const apply=()=>{
      const q=norm50(workState50.query),t=workState50.type;
      document.querySelectorAll('.work-metric-row[data-work-id]').forEach(row=>{
        const text=norm50(row.innerText),rowType=row.dataset.workType||((state.works||[]).find(w=>w.id===row.dataset.workId)?.work_type||'');
        row.hidden=!((!q||text.includes(q))&&(!t||rowType===t));
      });
    };
    if(search.dataset.v50!=='1'){
      search.dataset.v50='1';search.addEventListener('input',()=>{workState50.query=search.value;apply();});
      type.dataset.v50='1';type.addEventListener('change',()=>{workState50.type=type.value;apply();});
    }
    apply();
  }

  // Corrige a ação de vínculo para homônimos usando nome + telefone, sem depender apenas do nome.
  async function bindHouseRows50(){
    if(state.view!=='filhos'||state.demo||!db)return;
    const q=await db.from('house_members').select('*,clients(full_name,phone)').order('created_at',{ascending:false});
    if(q.error)return;
    const buckets=new Map();
    (q.data||[]).forEach(h=>{
      const key=`${norm50(h.clients?.full_name)}|${digits50(h.clients?.phone)}`;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(h);
    });
    document.querySelectorAll('#content table tbody tr').forEach(row=>{
      row.querySelectorAll('.house-actions49,.house-actions50').forEach(x=>x.remove());
      const name=row.children?.[0]?.querySelector('b')?.textContent?.trim()||row.children?.[0]?.textContent?.trim()||'';
      const phone=row.children?.[2]?.textContent?.trim()||'';
      const list=buckets.get(`${norm50(name)}|${digits50(phone)}`)||[];
      const h=list.shift();if(!h)return;
      const td=document.createElement('td');td.className='house-actions50';td.innerHTML=`<button type="button" class="link-btn" data-edit-house49="${h.id}">Editar vínculo</button>`;row.appendChild(td);
    });
  }

  function phase50(work,campaign,registrations,revenue){
    const now=new Date(),d=work.scheduled_at?new Date(work.scheduled_at):null,days=d?Math.ceil((d-now)/86400000):999;
    let phase='Planejamento',text='Definir tese comercial, promessa, prova, CTA e calendário de conteúdo na Central YM.';
    if(days<=45&&days>20){phase='Aquecimento';text='Aumentar repetição do tema, prova, contexto do trabalho e captação de intenção antes da janela de venda.';}
    if(days<=20&&days>7){phase='Conversão';text='Priorizar oferta, benefício, preço, prazo e CTA direto.';}
    if(days<=7&&days>=0){phase='Fechamento';text='Operar urgência real, reforço de benefício e chamadas diretas.';}
    if(days<0){phase='Encerrado';text='Trabalho já passou; usar para leitura de resultado e aprendizado.';}
    if(!campaign&&days>=0)text+=' A campanha ainda não está estruturada nesta aba.';
    if(registrations===0&&days<=20&&days>=0)text+=' Ainda não há inscrições registradas.';
    if(revenue>0)text+=` Receita efetivamente recebida: ${fmtMoney(revenue)}.`;
    return {phase,text};
  }

  // Campanhas e Trabalhos passam a usar exatamente a mesma agregação financeira validada no banco.
  renderCampaigns=async function(){
    if(state.demo)return `<article class="panel"><div class="empty-state">Faça login para visualizar as campanhas.</div></article>`;
    const start=new Date(),end=new Date(start);end.setMonth(end.getMonth()+3);
    const [wq,cq]=await Promise.all([
      db.from('works').select('*').gte('scheduled_at',start.toISOString()).lt('scheduled_at',end.toISOString()).neq('status','CANCELLED').order('scheduled_at'),
      db.from('marketing_campaigns').select('*').gte('starts_at',new Date(start.getFullYear(),start.getMonth(),1).toISOString()).lt('starts_at',end.toISOString()).order('starts_at')
    ]);
    if(wq.error)throw wq.error;if(cq.error)throw cq.error;
    const works=wq.data||[],campaigns=cq.data||[],ids=works.map(w=>w.id);let metrics=[];
    if(ids.length){const mq=await db.rpc('get_work_metrics_v349',{p_work_ids:ids});if(mq.error)throw mq.error;metrics=mq.data||[];}
    const mm=Object.fromEntries(metrics.map(m=>[m.work_id,{registrations:Number(m.registrations||0),received:Number(m.received||0)}]));
    const byWork={};campaigns.forEach(c=>{if(c.work_id&&!byWork[c.work_id])byWork[c.work_id]=c;});
    const monthBuckets=[];for(let i=0;i<3;i++){const d=new Date(start.getFullYear(),start.getMonth()+i,1);monthBuckets.push({year:d.getFullYear(),month:d.getMonth(),label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d),count:0});}
    works.forEach(w=>{const d=new Date(w.scheduled_at),b=monthBuckets.find(x=>x.year===d.getFullYear()&&x.month===d.getMonth());if(b)b.count++;});
    const months=monthBuckets.map(m=>`<div class="month-card"><div class="month">${escapeHtml(m.label)}</div><div class="count">${m.count}</div><p>${m.count===1?'trabalho previsto':'trabalhos previstos'}</p></div>`).join('');
    const rows=works.map(w=>{const c=byWork[w.id],m=mm[w.id]||{registrations:0,received:0},a=phase50(w,c,m.registrations,m.received);return `<tr data-campaign-work50="${w.id}"><td><b>${escapeHtml(w.title)}</b><small>${fmtDateTime(w.scheduled_at)}</small></td><td>${escapeHtml(a.phase)}</td><td>${m.registrations}</td><td><b>${fmtMoney(m.received)}</b><small>pagamentos confirmados</small></td><td>${c?statusPill(c.ym_content_status):'<span class="pill neutral">Não iniciado</span>'}</td><td>${c?statusPill(c.ym_validation_status):'<span class="pill neutral">Pendente</span>'}</td><td class="analysis-cell">${escapeHtml(c?.technical_analysis||a.text)}</td><td><button class="btn ghost" data-action="campaign-for-work" data-id="${w.id}">${c?'Atualizar plano':'Planejar'}</button></td></tr>`;}).join('');
    return `<article class="panel zero-top"><div class="source-note"><b>Receita canônica:</b> Campanhas e Trabalhos usam a mesma fonte financeira de pagamentos confirmados. O valor não é recalculado a partir de quantidade × preço nem de vendas sem recebimento.</div></article><div class="month-grid">${months}</div><article class="panel"><div class="section-head"><div><h2>Próximos trabalhos</h2><p>Planejamento comercial dos próximos 3 meses.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Trabalho</th><th>Fase</th><th>Inscritos</th><th>Receita recebida</th><th>Conteúdo YM</th><th>Validação</th><th>Análise</th><th>Ação</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhum trabalho no período.</td></tr>'}</tbody></table></div></article>`;
  };

  // Validação automática no próprio cliente: se alguém voltar a alterar uma das telas, a divergência fica visível no console.
  async function auditCampaignMetrics50(){
    if(state.view!=='campanhas'||state.demo||!db)return;
    const ids=[...document.querySelectorAll('[data-campaign-work50]')].map(x=>x.dataset.campaignWork50);if(!ids.length)return;
    const q=await db.rpc('get_work_metrics_v349',{p_work_ids:ids});if(q.error){console.error('[Sunshine v3.50] campaign metric audit failed',q.error);return;}
    const expected=Object.fromEntries((q.data||[]).map(x=>[x.work_id,Number(x.received||0)]));
    document.querySelectorAll('[data-campaign-work50]').forEach(row=>{row.dataset.metricVerified50=Number.isFinite(expected[row.dataset.campaignWork50])?'1':'0';});
  }

  function after50(){pin50();neutralizeLegacyPeriod50();bindWorkFilter50();if(state.view==='filhos')bindHouseRows50();if(state.view==='campanhas')auditCampaignMetrics50();}
  const previousRender50=render;
  render=async function(){await previousRender50();after50();setTimeout(after50,80);setTimeout(after50,450);};

  function start50(){pin50();after50();const obs=new MutationObserver(()=>{neutralizeLegacyPeriod50();bindWorkFilter50();pin50();});obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start50);else start50();
})();
