/* Sunshine v3.47 — associação segura pagador ≠ cliente + busca mobile no Cliente 360 */
(function(){
  const norm47=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const digits47=v=>String(v||'').replace(/\D/g,'');

  function ensureStyles47(){
    if(document.getElementById('sunshineV47Styles'))return;
    const s=document.createElement('style');
    s.id='sunshineV47Styles';
    s.textContent=`
      .asaas-beneficiary47{grid-column:1/-1;border:1px solid #e7d8cc;border-radius:14px;background:#fffaf6;padding:13px;display:grid;gap:9px}
      .asaas-beneficiary47 b{font-size:13px;color:#4a271c}.asaas-beneficiary47 p{margin:0;color:#78655c;font-size:12px;line-height:1.45}
      .asaas-beneficiary47 input{width:100%;min-height:44px}
      .asaas-beneficiary-status47{font-size:12px;font-weight:800;color:#256044;background:#eaf5ef;border-radius:10px;padding:9px 11px}
      .asaas-beneficiary-status47.wait{color:#875100;background:#fff3d7}
      .asaas-beneficiary-status47.warn{color:#9a2d19;background:#fff0ea}
      .asaas-payer-note47{grid-column:1/-1;border-left:4px solid #b9472d;background:#fff5ef;padding:10px 12px;border-radius:8px;color:#735e54;font-size:12px;line-height:1.45}
      @media(max-width:720px){.asaas-beneficiary47{padding:12px}.asaas-beneficiary47 input{font-size:16px}}
    `;
    document.head.appendChild(s);
  }

  function safeMatch47(entry,clients){
    if(entry?.matched_client_id){
      const c=clients.find(x=>x.id===entry.matched_client_id);
      if(c)return {client:c,reason:'associação indicada'};
    }
    const stages=[
      ['cadastro do Asaas',entry?.asaas_customer_id,c=>String(c.asaas_customer_id||'')===String(entry.asaas_customer_id||'')],
      ['documento',digits47(entry?.customer_document),c=>digits47(entry?.customer_document)&&digits47(c.document_number)===digits47(entry.customer_document)],
      ['e-mail',String(entry?.customer_email||'').trim().toLowerCase(),c=>String(entry?.customer_email||'').trim()&&String(c.email||'').trim().toLowerCase()===String(entry.customer_email||'').trim().toLowerCase()],
      ['telefone',digits47(entry?.customer_mobile_phone||entry?.customer_phone),c=>{const p=digits47(entry?.customer_mobile_phone||entry?.customer_phone);const cp=digits47(c.phone);return p.length>=8&&cp.length>=8&&cp.slice(-11)===p.slice(-11);}]
    ];
    for(const [reason,key,test] of stages){
      if(!key)continue;
      const matches=clients.filter(test);
      if(matches.length===1)return {client:matches[0],reason};
      if(matches.length>1)return {client:null,ambiguous:true,reason,count:matches.length};
    }
    return {client:null,ambiguous:false};
  }

  async function validateAutomaticChoice47(form,client,clients,sync,status){
    const entryId=form.dataset.entryId27||'';
    if(!entryId||state.demo||!db)return;
    try{
      const {data,error}=await db.from('asaas_incoming_payments')
        .select('id,matched_client_id,asaas_customer_id,customer_document,customer_email,customer_phone,customer_mobile_phone')
        .eq('id',entryId).maybeSingle();
      if(error||!data)return;
      const match=safeMatch47(data,clients);
      if(match.ambiguous){
        client.value='';client.dispatchEvent(new Event('change',{bubbles:true}));sync();
        status.className='asaas-beneficiary-status47 warn';
        status.textContent=`Há ${match.count} clientes com o mesmo ${match.reason}. Por segurança, escolha manualmente a pessoa atendida.`;
        return;
      }
      if(match.client&&client.value!==match.client.id){
        client.value=match.client.id;client.dispatchEvent(new Event('change',{bubbles:true}));sync();
      }
    }catch(e){console.error('asaas_safe_match47',e);}
  }

  function decorateResolve47(form){
    if(!form||form.dataset.safeBeneficiary47==='1')return;
    const client=form.querySelector('#agClient,#arClient');
    if(!client)return;
    form.dataset.safeBeneficiary47='1';
    ensureStyles47();

    const firstBox=form.querySelector('.soft-box');
    const h3=firstBox?.querySelector('h3');
    const p=firstBox?.querySelector('p');
    if(h3)h3.textContent='1. Para quem é este pagamento?';
    if(p)p.textContent='O pagador no Asaas e o cliente atendido podem ser pessoas diferentes. Selecione o Cliente 360 correto.';

    const clientLabel=client.closest('label');
    if(clientLabel){
      const textNode=[...clientLabel.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
      if(textNode)textNode.nodeValue='Cliente que receberá o pagamento ';
    }

    const wrap=document.createElement('div');
    wrap.className='asaas-beneficiary47';
    const listId='asaasClientSearchList47-'+Math.random().toString(36).slice(2);
    const clients=[...(state?.clients||[])].sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR'));
    wrap.innerHTML=`<div><b>Buscar no Cliente 360</b><p>Use o nome da pessoa atendida, mesmo quando o PIX/cartão veio da conta de outra pessoa.</p></div>
      <input type="search" data-client-search47 list="${listId}" placeholder="Digite o nome do cliente" autocomplete="off">
      <datalist id="${listId}">${clients.map(c=>`<option value="${escapeHtml(c.full_name||'')}"></option>`).join('')}</datalist>
      <div class="asaas-beneficiary-status47 wait" data-beneficiary-status47>Escolha o cliente que deve receber este pagamento.</div>`;
    clientLabel?.insertAdjacentElement('beforebegin',wrap);

    const search=wrap.querySelector('[data-client-search47]');
    const status=wrap.querySelector('[data-beneficiary-status47]');
    const sync=()=>{
      const c=clients.find(x=>x.id===client.value);
      if(c){
        search.value=c.full_name||'';
        status.className='asaas-beneficiary-status47';
        status.textContent=`Será lançado para: ${c.full_name}. O cadastro desta pessoa não será substituído pelos dados do pagador.`;
      }else{
        status.className='asaas-beneficiary-status47 wait';
        status.textContent='Nenhum cliente existente selecionado. Se continuar assim, o sistema entenderá que é um novo cliente.';
      }
    };
    search.addEventListener('change',()=>{
      const q=norm47(search.value);
      if(!q)return;
      const exact=clients.find(c=>norm47(c.full_name)===q);
      const matches=clients.filter(c=>norm47(c.full_name).includes(q));
      const chosen=exact||(matches.length===1?matches[0]:null);
      if(chosen){client.value=chosen.id;client.dispatchEvent(new Event('change',{bubbles:true}));sync();}
      else if(matches.length>1){toast('Há mais de um cliente com esse trecho do nome. Selecione o nome completo na sugestão.','error');}
      else toast('Cliente não encontrado no Cliente 360.','error');
    });
    client.addEventListener('change',sync);
    sync();
    validateAutomaticChoice47(form,client,clients,sync,status);

    const divider=[...form.querySelectorAll('.form-divider')].find(x=>/criar|completar/i.test(x.textContent||''));
    if(divider)divider.textContent='Dados do pagador recebidos pelo Asaas (usados apenas se for criar um novo cliente)';
    const note=document.createElement('div');
    note.className='asaas-payer-note47';
    note.innerHTML='<b>Pagador ≠ cliente:</b> ao escolher um Cliente 360 existente, CPF, ID do Asaas, telefone e endereço do pagador ficam somente no histórico financeiro e não alteram o cadastro da pessoa atendida.';
    divider?.insertAdjacentElement('afterend',note);
  }

  function run47(){
    ensureStyles47();
    decorateResolve47(document.getElementById('asaasGlobalResolveForm'));
    decorateResolve47(document.getElementById('asaasResolveForm'));
  }

  const obs=new MutationObserver(run47);
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run47);else run47();
})();
