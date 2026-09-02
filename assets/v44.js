/* Sunshine v3.44 — reclassificação de lançamentos para serviço/trabalho específico */
(function(){
  let timer44=null;

  function styles44(){
    if(document.getElementById('v44style'))return;
    const s=document.createElement('style');s.id='v44style';s.textContent=`
      .finance-actions44{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.finance-edit44{white-space:nowrap}
      .sale-link-summary44{border:1px solid #eadfd8;background:#fffaf6;border-radius:12px;padding:12px 14px;line-height:1.5;color:#705d55}.sale-link-summary44 b{color:#3f241a}
      @media(max-width:720px){.finance-actions44{display:grid}.finance-actions44 button{width:100%;text-align:left}}
    `;document.head.appendChild(s);
  }

  function decorate44(){
    if(state.view!=='financeiro')return;
    const panel=document.getElementById('financeUnified40');if(!panel)return;
    panel.querySelectorAll('tbody tr').forEach(row=>{
      const detail=row.querySelector('[data-detail40]');if(!detail||row.querySelector('[data-reclassify-sale44]'))return;
      const saleId=detail.dataset.detail40;if(!saleId)return;
      const td=detail.closest('td');if(!td)return;
      let wrap=td.querySelector('.finance-actions44');
      if(!wrap){wrap=document.createElement('div');wrap.className='finance-actions44';td.appendChild(wrap);wrap.appendChild(detail);}
      const btn=document.createElement('button');btn.type='button';btn.className='link-btn finance-edit44';btn.dataset.reclassifySale44=saleId;btn.textContent='Editar vínculo';wrap.prepend(btn);
    });
  }

  async function open44(saleId){
    if(!requireReal())return;
    const q=await db.from('sales').select('id,client_id,service_id,work_id,total_amount,sale_type,responsible_member_id,clients(full_name)').eq('id',saleId).maybeSingle();
    if(q.error){toast(q.error.message,'error');return;}const sale=q.data;if(!sale){toast('Lançamento não encontrado.','error');return;}
    const client=sale.clients?.full_name||byId(state.clients||[],sale.client_id)?.full_name||'Cliente';
    openModal('Editar serviço / trabalho',`<form id="saleLinkForm44" class="form-grid">
      <div class="span-2 sale-link-summary44"><b>${escapeHtml(client)}</b><br>Valor contratado: <b>${fmtMoney(sale.total_amount)}</b><br><small>Use esta tela para corrigir um lançamento genérico e vinculá-lo ao trabalho correto. Os recebimentos permanecem na mesma venda.</small></div>
      <label class="span-2">Serviço<select id="slService44">${optionList(state.services||[],'name',sale.service_id)}</select></label>
      <label class="span-2">Trabalho específico<select id="slWork44"><option value="">Nenhum trabalho específico</option>${(state.works||[]).map(w=>`<option value="${w.id}" ${w.id===sale.work_id?'selected':''}>${escapeHtml(w.title)}</option>`).join('')}</select></label>
      <div class="span-2 note"><b>Como funciona:</b> se escolher um trabalho específico, o lançamento passa a compor arrecadação e lista de inscritos daquele trabalho. O pagamento não é recriado nem duplicado.</div>
      <div class="span-2">${formActions('Salvar vínculo')}</div>
    </form>`,true);
    bindCancel();
    document.getElementById('saleLinkForm44').addEventListener('submit',async e=>{
      e.preventDefault();
      const serviceId=document.getElementById('slService44').value||null;
      const workId=document.getElementById('slWork44').value||null;
      if(!serviceId&&!workId){toast('Selecione um serviço ou trabalho.','error');return;}
      const submit=e.currentTarget.querySelector('button[type=submit]');submit.disabled=true;submit.textContent='Salvando…';
      const r=await db.rpc('reclassify_sale',{p_sale_id:saleId,p_service_id:serviceId,p_work_id:workId});
      if(r.error){submit.disabled=false;submit.textContent='Salvar vínculo';toast(r.error.message,'error');return;}
      toast(workId?'Lançamento movido para o trabalho selecionado.':'Classificação do lançamento atualizada.');
      closeModal();await loadReferenceData();await render();
    });
  }

  function schedule44(delay=40){clearTimeout(timer44);timer44=setTimeout(decorate44,delay);}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-reclassify-sale44]');if(b){e.preventDefault();e.stopPropagation();open44(b.dataset.reclassifySale44);}},true);
  const prevRender44=render;render=async function(){await prevRender44();schedule44(30);setTimeout(decorate44,350);};
  function start44(){styles44();schedule44();const obs=new MutationObserver(()=>schedule44(35));obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start44);else start44();
})();
