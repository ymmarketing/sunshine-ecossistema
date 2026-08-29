/* Sunshine v3.19 — Filhos da Casa oficiais + vencimento dia 10 + impressão de listas */
(function(){
  function fmtBirth19(v){
    if(!v)return '—';
    const s=String(v).slice(0,10), p=s.split('-');
    return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:fmtDate(v);
  }

  function printableDocument19(title,subtitle,headers,rows){
    const th=headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('');
    const body=rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v??'')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#24110B;margin:0;font-size:12pt}header{border-bottom:2px solid #B40001;padding-bottom:10px;margin-bottom:18px}h1{font-size:20pt;margin:0 0 4px}.brand{font-weight:700;color:#B40001;font-size:10pt;letter-spacing:.08em;text-transform:uppercase}.sub{color:#665852;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #d8d1cb;vertical-align:top}th{font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#6b5a52}tbody tr{break-inside:avoid}footer{margin-top:16px;color:#7a6c65;font-size:9pt}@media print{button{display:none}}
    </style></head><body><header><div class="brand">Sunshine Oráculos</div><h1>${escapeHtml(title)}</h1><div class="sub">${escapeHtml(subtitle||'')}</div></header><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table><footer>Ecossistema Sunshine · lista gerada em ${new Date().toLocaleString('pt-BR')}</footer></body></html>`;
  }

  async function printHouseRoster19(){
    if(state.demo){toast('Sem dados para imprimir.','error');return;}
    const win=window.open('','_blank');
    if(!win){toast('Permita a abertura da janela de impressão.','error');return;}
    win.document.write('<p style="font-family:Arial;padding:20px">Preparando lista…</p>');
    const {data,error}=await db.from('house_members').select('billing_exempt,status,clients(full_name,birth_date)').eq('status','ACTIVE');
    if(error){win.close();toast(error.message,'error');return;}
    const list=(data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const rows=list.map(h=>[h.clients?.full_name||'—',fmtBirth19(h.clients?.birth_date)]);
    win.document.open();win.document.write(printableDocument19('Filhos da Casa','Nomes completos e datas de nascimento',['Nome completo','Data de nascimento'],rows));win.document.close();
    setTimeout(()=>{win.focus();win.print();},250);
  }

  async function getWorkPrintData19(workId){
    const {data,error}=await db.from('work_registrations')
      .select('participant_name,participant_birth_date,loved_person_name,rival_name,status,clients(full_name,birth_date)')
      .eq('work_id',workId).neq('status','CANCELLED').order('created_at');
    if(error)throw error;
    return data||[];
  }

  async function printWorkRoster19(workId){
    if(state.demo){toast('Sem dados para imprimir.','error');return;}
    const win=window.open('','_blank');
    if(!win){toast('Permita a abertura da janela de impressão.','error');return;}
    win.document.write('<p style="font-family:Arial;padding:20px">Preparando lista…</p>');
    try{
      const regs=await getWorkPrintData19(workId);
      const work=(state.works||[]).find(w=>w.id===workId)||state.selectedWork||{};
      const hasLoved=regs.some(r=>String(r.loved_person_name||'').trim());
      const hasRival=regs.some(r=>String(r.rival_name||'').trim());
      const headers=['Nome completo','Data de nascimento'];
      if(hasLoved)headers.push('Pessoa amada');
      if(hasRival)headers.push('Rival');
      const rows=regs.map(r=>{
        const row=[r.clients?.full_name||r.participant_name||'—',fmtBirth19(r.participant_birth_date||r.clients?.birth_date)];
        if(hasLoved)row.push(r.loved_person_name||'—');
        if(hasRival)row.push(r.rival_name||'—');
        return row;
      });
      const subtitle=[work.scheduled_at?fmtDateTime(work.scheduled_at):'',work.work_type||''].filter(Boolean).join(' · ');
      win.document.open();win.document.write(printableDocument19(work.title||'Trabalho Sunshine',subtitle,headers,rows));win.document.close();
      setTimeout(()=>{win.focus();win.print();},250);
    }catch(e){win.close();toast(e.message||'Erro ao preparar impressão.','error');}
  }

  // CSV continua disponível, agora usando também o nascimento canônico do Cliente 360.
  exportRegistrations=async function(workId){
    if(state.demo){toast('Sem dados para exportar.','error');return;}
    try{
      const data=await getWorkPrintData19(workId);
      const rows=[['Nome','Nascimento','Pessoa amada','Rival','Status'],...data.map(r=>[
        r.clients?.full_name||r.participant_name||'',
        r.participant_birth_date||r.clients?.birth_date||'',
        r.loved_person_name||'',r.rival_name||'',r.status||''
      ])];
      const csv='\ufeff'+rows.map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n');
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inscritos-sunshine.csv';a.click();URL.revokeObjectURL(a.href);
    }catch(e){toast(e.message||'Erro ao exportar lista.','error');}
  };

  renderHouse=async function(){
    const q=state.demo?{data:[]}:await safeQuery(db.from('house_members').select('*,clients(full_name,phone,email,birth_date)'));
    const list=(q.data||[]).sort((a,b)=>(a.clients?.full_name||'').localeCompare(b.clients?.full_name||'','pt-BR'));
    const rows=list.length?list.map(h=>`<tr>
      <td><b>${escapeHtml(h.clients?.full_name||'—')}</b></td>
      <td>${escapeHtml(fmtBirth19(h.clients?.birth_date))}</td>
      <td>${escapeHtml(h.clients?.phone||'—')}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':`Dia ${Number(h.billing_due_day||10)}`}</td>
      <td>${h.billing_exempt?'<span class="pill gold">ISENTO</span>':fmtMoney(h.monthly_fee)}</td>
      <td>${statusPill(h.status)}</td>
    </tr>`).join(''):`<tr class="empty-row"><td colspan="6">Nenhum Filho da Casa cadastrado.</td></tr>`;
    return `<article class="panel"><div class="section-head"><div><h2>Filhos da Casa</h2><p>${list.length} pessoas vinculadas ao Cliente 360.</p></div><div class="button-row"><button class="btn ghost" type="button" data-print-house>Imprimir nomes</button><button class="btn" data-action="new-house">+ Novo vínculo</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Nascimento</th><th>Telefone</th><th>Vencimento</th><th>Mensalidade</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article><article class="panel"><div class="note"><b>Regra da mensalidade:</b> pagamento até o dia 10 de cada mês. O módulo Filhos da Casa não cria movimentação financeira. O recebimento entra somente pelo Asaas ou por lançamento manual no Financeiro e é associado ao serviço Mensalidade Filho da Casa. Cassia Schunck, Edson Carlos Rodrigues e Isabella Schunck Martins são exceções permanentes e aparecem como <b>ISENTO</b>.</div></article>`;
  };

  houseModal=function(){
    openModal('Vincular Filho da Casa',`<form id="houseForm" class="form-grid"><label class="span-2">Cliente<select id="hClient" required>${optionList(state.clients,'full_name')}</select></label><label>Data de entrada<input id="hJoined" type="date"></label><label>Mensalidade<input id="hFee" type="number" step="0.01" value="200"></label><div class="note span-2"><b>Vencimento padrão:</b> dia 10 de cada mês. Pagamentos são registrados somente no Financeiro/Asaas.</div><label>Status<select id="hStatus"><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="SUSPENDED">Suspenso</option></select></label><label class="span-2">Observações<textarea id="hNotes" rows="3"></textarea></label><div class="span-2">${formActions('Criar vínculo')}</div></form>`);
    bindCancel();document.getElementById('houseForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireReal())return;const {error}=await db.from('house_members').insert({client_id:val('hClient'),joined_at:val('hJoined')||null,monthly_fee:Number(val('hFee')||200),billing_due_day:10,status:val('hStatus'),notes:val('hNotes')||null});if(error){toast(error.message,'error');return;}toast('Vínculo criado.');closeModal();await render();});
  };

  const previousRenderWorks19=renderWorks;
  renderWorks=async function(){
    let html=await previousRenderWorks19();
    if(state.selectedWork?.id){
      html=html.replace('Exportar inscritos</button>',`Exportar inscritos</button><button class="btn ghost" type="button" data-print-work="${state.selectedWork.id}">Imprimir lista</button>`);
    }
    return html;
  };

  document.addEventListener('click',e=>{
    const house=e.target.closest('[data-print-house]');
    if(house){e.preventDefault();e.stopPropagation();printHouseRoster19();return;}
    const work=e.target.closest('[data-print-work]');
    if(work){e.preventDefault();e.stopPropagation();printWorkRoster19(work.dataset.printWork);}
  },true);
})();
