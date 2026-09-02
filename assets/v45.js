/* Sunshine v3.45 — Home com todos os trabalhos em aberto + filtro de tipos funcional */
(function(){
  const VERSION='v3.45';
  let timer45=null;
  let homeToken45=0;
  let activeWorks45=[];

  function styles45(){
    if(document.getElementById('v45style'))return;
    const s=document.createElement('style');s.id='v45style';s.textContent=`
      .sidebar-foot{font-size:0!important}.sidebar-foot .dot{font-size:11px!important}.sidebar-foot::after{content:'Ecossistema Sunshine · v3.45';font-size:11px;color:inherit;margin-left:6px}
      .active-works45{margin-top:16px}.active-works45 .section-head{align-items:center}.active-grid45{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .active-card45{border:1px solid #eadfd8;border-radius:14px;background:#fffaf6;padding:15px;display:grid;gap:11px;min-width:0}
      .active-top45{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.active-top45 h3{margin:0;font-size:18px;line-height:1.2}.active-type45{font-size:10px;font-weight:800;text-transform:uppercase;color:#8b4a35;background:#fdeee8;padding:5px 8px;border-radius:999px;white-space:nowrap}
      .active-meta45{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.active-meta45>div{border-top:1px solid #eadfd8;padding-top:8px}.active-meta45 span{display:block;font-size:9px;text-transform:uppercase;color:#8c746a;font-weight:700}.active-meta45 b{display:block;margin-top:3px;font-size:14px;color:#3d251c}
      .active-bottom45{display:flex;align-items:center;justify-content:space-between;gap:10px}.active-bottom45 small{color:#806b62}.active-empty45{padding:14px;border:1px dashed #dfcfc5;border-radius:12px;color:#806b62}
      #workType[data-fixed45="1"]{min-width:180px}
      @media(max-width:820px){.active-grid45{grid-template-columns:1fr}.active-meta45{grid-template-columns:1fr 1fr}.active-bottom45{align-items:stretch;flex-direction:column}.active-bottom45 button{width:100%}}
    `;document.head.appendChild(s);
  }

  function typeLabel45(v){return v==='COLETIVO_PREMIUM'?'Coletivo premium':v==='COLETIVO'?'Coletivo':v==='PARTICULAR'?'Particular':String(v||'Outro').replaceAll('_',' ')}

  async function loadActive45(){
    if(state.demo||!db)return [];
    const wq=await db.from('works').select('id,title,work_type,status,scheduled_at,unit_price,responsible_member_id,team_members:responsible_member_id(full_name)').eq('status','OPEN').order('scheduled_at',{ascending:true});
    if(wq.error)throw wq.error;
    const works=wq.data||[]; if(!works.length)return [];
    const ids=works.map(w=>w.id);
    const [rq,sq]=await Promise.all([
      db.from('work_registrations').select('work_id,status').in('work_id',ids).neq('status','CANCELLED'),
      db.from('sales').select('id,work_id,status').in('work_id',ids).neq('status','CANCELLED')
    ]);
    if(rq.error)throw rq.error;if(sq.error)throw sq.error;
    const regs=rq.data||[],sales=sq.data||[],saleIds=sales.map(s=>s.id);
    let alloc=[],paid=new Set();
    if(saleIds.length){
      const aq=await db.from('payment_allocations').select('sale_id,payment_id,amount').in('sale_id',saleIds).limit(10000);if(aq.error)throw aq.error;alloc=aq.data||[];
      const pids=[...new Set(alloc.map(a=>a.payment_id).filter(Boolean))];
      if(pids.length){const pq=await db.from('payments').select('id,status').in('id',pids).eq('status','PAID').limit(10000);if(pq.error)throw pq.error;paid=new Set((pq.data||[]).map(p=>p.id));}
    }
    return works.map(w=>{
      const workSaleIds=new Set(sales.filter(s=>s.work_id===w.id).map(s=>s.id));
      const received=alloc.filter(a=>workSaleIds.has(a.sale_id)&&paid.has(a.payment_id)).reduce((sum,a)=>sum+Number(a.amount||0),0);
      const registrations=regs.filter(r=>r.work_id===w.id).length;
      return {...w,registrations,received};
    });
  }

  function activePanel45(works){
    const cards=works.length?works.map(w=>`<div class="active-card45">
      <div class="active-top45"><div><h3>${escapeHtml(w.title)}</h3><div class="muted">${w.scheduled_at?fmtDateTime(w.scheduled_at):'Sem data definida'}</div></div><span class="active-type45">${escapeHtml(typeLabel45(w.work_type))}</span></div>
      <div class="active-meta45"><div><span>Inscritos</span><b>${w.registrations}</b></div><div><span>Arrecadado</span><b>${fmtMoney(w.received)}</b></div><div><span>Valor</span><b>${fmtMoney(w.unit_price)}</b></div></div>
      <div class="active-bottom45"><small>Responsável: <b>${escapeHtml(w.team_members?.full_name||byId(state.team||[],w.responsible_member_id)?.full_name||'—')}</b></small><button type="button" class="link-btn" data-open-work45="${w.id}">Abrir trabalho</button></div>
    </div>`).join(''):'<div class="active-empty45">Nenhum trabalho está em aberto neste momento.</div>';
    return `<article class="panel active-works45" id="activeWorks45"><div class="section-head"><div><h2>Trabalhos em aberto</h2><p>Todos os trabalhos ativos agora, com inscritos e arrecadação.</p></div><button type="button" class="link-btn" data-go-works45>Ver todos</button></div><div class="active-grid45">${cards}</div></article>`;
  }

  function updateHomeKpis45(works){
    const grid=document.querySelector('#content .kpi-grid');if(!grid)return;
    const cards=[...grid.querySelectorAll('.card')];if(cards.length<3)return;
    const totalRegs=works.reduce((s,w)=>s+Number(w.registrations||0),0),totalRaised=works.reduce((s,w)=>s+Number(w.received||0),0);
    const set=(card,label,value,foot)=>{const l=card.querySelector('.card-label'),v=card.querySelector('.value'),f=card.querySelector('.card-foot');if(l)l.textContent=label;if(v)v.textContent=value;if(f)f.textContent=foot;};
    set(cards[0],'TRABALHOS EM ABERTO',String(works.length),works.length?'Ativos agora':'Nenhum ativo');
    set(cards[1],'INSCRITOS NOS ATIVOS',String(totalRegs),'Somando todos os trabalhos em aberto');
    set(cards[2],'ARRECADADO NOS ATIVOS',fmtMoney(totalRaised),'Recebimentos confirmados');
  }

  async function decorateHome45(){
    if(state.view!=='home')return;
    const token=++homeToken45;
    try{
      const works=await loadActive45();if(token!==homeToken45||state.view!=='home')return;activeWorks45=works;
      updateHomeKpis45(works);
      document.getElementById('activeWorks45')?.remove();
      const grid=document.querySelector('#content .kpi-grid');if(!grid)return;
      grid.insertAdjacentHTML('afterend',activePanel45(works));
    }catch(e){console.error('v45 home',e);}
  }

  function prepareWorkFilter45(){
    if(state.view!=='trabalhos')return;
    const sel=document.getElementById('workType');if(!sel)return;
    const current=sel.value;
    sel.innerHTML='<option value="">Todos os tipos</option><option value="COLETIVO">Coletivo</option><option value="COLETIVO_PREMIUM">Coletivo premium</option><option value="PARTICULAR">Particular</option>';
    if([...sel.options].some(o=>o.value===current))sel.value=current;
    sel.dataset.fixed45='1';
    applyWorkFilter45();
  }

  function applyWorkFilter45(){
    if(state.view!=='trabalhos')return;
    const search=(document.getElementById('workSearch')?.value||'').trim().toLowerCase();
    const type=document.getElementById('workType')?.value||'';
    const rows=[...document.querySelectorAll('#content tr[data-work-id]')];let visible=0;
    rows.forEach(row=>{
      const w=(state.works||[]).find(x=>x.id===row.dataset.workId);
      const matchesText=!search||row.innerText.toLowerCase().includes(search);
      const matchesType=!type||w?.work_type===type;
      row.hidden=!(matchesText&&matchesType);if(!row.hidden)visible++;
    });
    let empty=document.getElementById('workFilterEmpty45');
    if(!visible&&rows.length){
      if(!empty){empty=document.createElement('tr');empty.id='workFilterEmpty45';empty.className='empty-row';empty.innerHTML='<td colspan="8">Nenhum trabalho encontrado com este filtro.</td>';rows[0].parentElement?.appendChild(empty)}empty.hidden=false;
    }else if(empty)empty.hidden=true;
  }

  function pinVisualVersion45(){
    document.documentElement.dataset.sunshineVersion=VERSION;
  }

  function run45(){
    styles45();pinVisualVersion45();
    if(state.view==='home')decorateHome45();
    if(state.view==='trabalhos')prepareWorkFilter45();
  }
  function schedule45(delay=60){clearTimeout(timer45);timer45=setTimeout(run45,delay)}

  const prevRender45=render;
  render=async function(){await prevRender45();schedule45(50)};

  document.addEventListener('input',e=>{if(e.target?.id==='workSearch')setTimeout(applyWorkFilter45,0)},false);
  document.addEventListener('change',e=>{if(e.target?.id==='workType')setTimeout(applyWorkFilter45,0)},false);
  document.addEventListener('click',async e=>{
    const open=e.target.closest('[data-open-work45]');if(open){e.preventDefault();const id=open.dataset.openWork45;state.selectedWork=(state.works||[]).find(w=>w.id===id)||activeWorks45.find(w=>w.id===id)||null;await navigate('trabalhos');return;}
    if(e.target.closest('[data-go-works45]')){e.preventDefault();await navigate('trabalhos');}
  },true);

  function start45(){styles45();pinVisualVersion45();schedule45(120);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start45);else start45();
})();
