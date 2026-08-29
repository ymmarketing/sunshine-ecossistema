/* Sunshine v3.20 — detalhe de trabalho clicável no desktop/mobile */
(function(){
  function birth20(v){
    if(!v)return '—';
    const s=String(v).slice(0,10),p=s.split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }
  function statusPt20(v){
    const m={REGISTERED:'Inscrito',CONFIRMED:'Confirmado',DONE:'Concluído',CANCELLED:'Cancelado'};
    return m[v]||v||'—';
  }

  async function openWorkDetail20(workId){
    if(state.demo){toast('Faça login para abrir os inscritos.','error');return;}
    const work=(state.works||[]).find(w=>w.id===workId);
    if(!work){toast('Trabalho não encontrado.','error');return;}
    state.selectedWork=work;

    openModal(work.title,`<div class="empty-state"><span class="spinner"></span>Carregando inscritos…</div>`,true);
    const [regsQ,metricsQ]=await Promise.all([
      db.from('work_registrations')
        .select('id,participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)')
        .eq('work_id',workId).neq('status','CANCELLED').order('created_at'),
      db.rpc('get_work_metrics')
    ]);
    if(regsQ.error){closeModal();toast(regsQ.error.message,'error');return;}
    const regs=regsQ.data||[];
    const metric=(metricsQ.data||[]).find(m=>m.work_id===workId)||{};
    const rows=regs.length?regs.map(r=>`<tr>
      <td><b>${escapeHtml(r.clients?.full_name||r.participant_name||'—')}</b></td>
      <td>${escapeHtml(birth20(r.participant_birth_date||r.clients?.birth_date))}</td>
      <td>${escapeHtml(r.loved_person_name||'—')}</td>
      <td>${escapeHtml(r.rival_name||'—')}</td>
      <td>${escapeHtml(statusPt20(r.status))}</td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="5">Nenhum inscrito neste trabalho.</td></tr>`;

    const root=document.getElementById('modalRoot');
    const body=root?.querySelector('.modal-body');
    if(!body)return;
    body.innerHTML=`
      <div class="work-detail-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn" type="button" data-v20-register="${workId}">+ Inscrição</button>
        <button class="btn ghost" type="button" data-print-work="${workId}">Imprimir lista</button>
        <button class="btn ghost" type="button" data-v20-export="${workId}">Exportar inscritos</button>
      </div>
      ${kpis([
        ['Inscritos',String(Number(metric.registrations||regs.length)),'Participantes'],
        ['Arrecadado',fmtMoney(metric.revenue||0),'Vendas vinculadas'],
        ['Valor',work.unit_price!=null?fmtMoney(work.unit_price):'—','Por participação'],
        ['Status',escapeHtml(work.status||'—'),'Situação do trabalho']
      ])}
      <div class="table-wrap" style="margin-top:14px">
        <table class="table">
          <thead><tr><th>Nome completo</th><th>Nascimento</th><th>Pessoa amada</th><th>Rival</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  document.addEventListener('click',e=>{
    const row=e.target.closest('.work-metric-row[data-work-id]');
    if(row && !e.target.closest('button,a,input,select')){
      e.preventDefault();e.stopPropagation();openWorkDetail20(row.dataset.workId);return;
    }
    const reg=e.target.closest('[data-v20-register]');
    if(reg){
      e.preventDefault();e.stopPropagation();
      const w=(state.works||[]).find(x=>x.id===reg.dataset.v20Register);
      closeModal();setTimeout(()=>registrationModal(w),0);return;
    }
    const exp=e.target.closest('[data-v20-export]');
    if(exp){e.preventDefault();e.stopPropagation();exportRegistrations(exp.dataset.v20Export);return;}
  },true);

  // Sinal visual explícito de que o nome abre o trabalho.
  const prevRenderWorks20=renderWorks;
  renderWorks=async function(){
    const html=await prevRenderWorks20();
    setTimeout(()=>{
      document.querySelectorAll('.work-metric-row[data-work-id]').forEach(row=>{
        row.style.cursor='pointer';
        const first=row.querySelector('td:first-child b');
        if(first){first.style.textDecoration='underline';first.style.textDecorationColor='#B40001';first.style.textUnderlineOffset='3px';}
      });
    },0);
    return html;
  };
})();
