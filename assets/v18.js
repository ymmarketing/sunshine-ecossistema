/* Sunshine v3.18 — métricas de trabalhos agregadas no banco, sem limite de 1000 linhas */
(function(){
  const monthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const WORK_PT={COLETIVO:'Coletivo',COLETIVO_PREMIUM:'Coletivo premium',PARTICULAR:'Particular'};

  function periodFromTitle18(title){
    const t=String(title||'').toLowerCase();
    for(let i=0;i<monthNames.length;i++){
      if(t.includes(monthNames[i])){
        const y=(t.match(/20\d{2}/)||[])[0];
        if(y)return {label:`${monthNames[i][0].toUpperCase()+monthNames[i].slice(1)}/${y}`,sort:new Date(Number(y),i,28,12,0,0).getTime()};
      }
    }
    return null;
  }
  function workSortDate18(w,lastSale){
    if(w.scheduled_at)return new Date(w.scheduled_at).getTime();
    if(lastSale)return new Date(lastSale).getTime();
    return periodFromTitle18(w.title)?.sort||new Date(w.created_at||0).getTime();
  }
  function workDateLabel18(w,lastSale){
    if(w.scheduled_at)return fmtDate(w.scheduled_at);
    const p=periodFromTitle18(w.title); if(p)return p.label;
    if(lastSale)return new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric'}).format(new Date(lastSale));
    return '—';
  }

  renderWorks=async function(){
    if(state.demo){
      return `${kpis([['Trabalhos cadastrados','—','Todos os períodos'],['Abertos','—','Aceitando inscrições'],['Planejados','—','Próximos'],['Concluídos','—','Histórico']])}<article class="panel"><div class="empty-state">Faça login para visualizar os trabalhos.</div></article>`;
    }

    const [wq,mq]=await Promise.all([
      safeQuery(db.from('works').select('*,team_members:responsible_member_id(full_name)').limit(500)),
      safeQuery(db.rpc('get_work_metrics'))
    ]);
    const works=wq.data||[]; state.works=works;
    const metrics={};
    (mq.data||[]).forEach(m=>metrics[m.work_id]={
      volume:Number(m.registrations||0),
      revenue:Number(m.revenue||0),
      lastSale:m.last_sale||null
    });

    works.sort((a,b)=>{
      const ao=a.status==='OPEN'?0:1,bo=b.status==='OPEN'?0:1;
      if(ao!==bo)return ao-bo;
      return workSortDate18(b,metrics[b.id]?.lastSale)-workSortDate18(a,metrics[a.id]?.lastSale);
    });

    const open=works.filter(w=>w.status==='OPEN').length;
    const planned=works.filter(w=>w.status==='PLANNED').length;
    const done=works.filter(w=>w.status==='DONE').length;

    const rows=works.map(w=>{
      const m=metrics[w.id]||{volume:0,revenue:0,lastSale:null};
      return `<tr class="clickable work-metric-row" data-work-id="${w.id}" data-work-type="${escapeHtml(w.work_type||'')}">
        <td><b>${escapeHtml(w.title)}</b>${w.status==='OPEN'?'<small class="open-note">Em aberto · prioridade atual</small>':''}</td>
        <td>${escapeHtml(WORK_PT[w.work_type]||w.work_type||'—')}</td>
        <td>${escapeHtml(workDateLabel18(w,m.lastSale))}</td>
        <td>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</td>
        <td><b>${m.volume}</b><small>inscrições</small></td>
        <td><b>${fmtMoney(m.revenue)}</b></td>
        <td>${escapeHtml(w.team_members?.full_name||byId(state.team,w.responsible_member_id)?.full_name||'—')}</td>
        <td>${statusPill(w.status)}</td>
      </tr>`;
    }).join('');

    let detail='';
    if(state.selectedWork){
      const w=works.find(x=>x.id===state.selectedWork.id)||state.selectedWork;
      const m=metrics[w.id]||{volume:0,revenue:0,lastSale:null};
      detail=`<article class="panel work-summary-panel"><div class="section-head"><div><h2>${escapeHtml(w.title)}</h2><p>${escapeHtml(workDateLabel18(w,m.lastSale))}</p></div><div class="button-row"><button class="btn" data-action="new-registration" data-id="${w.id}">+ Inscrição</button><button class="btn ghost" data-action="export-registration" data-id="${w.id}">Exportar inscritos</button></div></div><div class="profile-grid"><div><span>Volume</span><b>${m.volume} inscrições</b></div><div><span>Arrecadado</span><b>${fmtMoney(m.revenue)}</b></div><div><span>Valor por participação</span><b>${w.unit_price!=null?fmtMoney(w.unit_price):'—'}</b></div><div><span>Status</span><b>${statusPill(w.status)}</b></div></div></article>`;
    }

    return `${kpis([['Trabalhos cadastrados',String(works.length),'Todos os períodos'],['Abertos',String(open),'Sempre no topo'],['Planejados',String(planned),'Próximos'],['Concluídos',String(done),'Histórico']])}<article class="panel"><div class="toolbar"><input id="workSearch" class="field grow" placeholder="Buscar trabalho"><select id="workTypeFilter" class="select"><option value="">Todos os tipos</option><option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option></select><button class="btn" data-action="new-work">+ Novo trabalho</button></div><div class="table-wrap"><table class="table work-metrics-table"><thead><tr><th>Trabalho</th><th>Tipo</th><th>Data / período</th><th>Valor</th><th>Volume</th><th>Arrecadado</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${rows||'<tr class="empty-row"><td colspan="8">Nenhum trabalho cadastrado.</td></tr>'}</tbody></table></div></article>${detail}`;
  };
})();
