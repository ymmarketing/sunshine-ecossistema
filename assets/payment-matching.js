(function(global){
 'use strict';
 function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
 function mount(api,context){
  var form=document.getElementById('entryForm'),saved=null;try{saved=JSON.parse(sessionStorage.getItem('sunshine.debtMatch.v1')||'null');}catch(_){}
  if(saved)context=saved.context;
  if(!form)return;
  if(!context){
   var choose=document.createElement('button');choose.type='button';choose.className='secondary';choose.style.cssText='width:100%;margin-bottom:12px';choose.textContent='Este pagamento é de uma pendência existente';
   choose.onclick=async function(){choose.disabled=true;try{var rows=await api.rpc('v4_payment_debt_candidates',{});api.openDrawer('Escolher pendência existente','<form id="manualDebtChoiceForm"><div class="field"><label for="manualDebtChoice">Pessoa e pendência</label><select id="manualDebtChoice" required><option value="">Selecione</option>'+rows.map(function(d){return '<option value="'+api.esc(d.obligationId)+'">'+api.esc(d.personName+' · '+d.eventName+' · '+api.dateBR(d.soldAt)+' · falta '+api.money(d.pendingCents))+'</option>';}).join('')+'</select></div><button class="primary" type="submit">Continuar com esta pendência</button></form>');document.getElementById('manualDebtChoiceForm').onsubmit=function(ev){ev.preventDefault();var id=document.getElementById('manualDebtChoice').value,d=rows.find(function(x){return x.obligationId===id;});if(d)api.openDebtRegularization({dataset:{obligationId:d.obligationId,personId:d.personId,personName:d.personName,serviceName:d.eventName,pendingCents:String(d.pendingCents),responsibleId:d.responsibleMemberId||''}});};}catch(e){api.toast(e.message);}finally{choose.disabled=false;}};
   form.prepend(choose);return;
  }
  var el=function(id){return document.getElementById(id);},esc=api.esc,money=api.money;
  var originalSubmit=form.onsubmit,old=document.createElement('fieldset');old.id='newServiceFields';old.style.cssText='border:0;padding:0;margin:0;min-width:0';
  while(form.firstChild)old.appendChild(form.firstChild);form.appendChild(old);
  form.insertAdjacentHTML('afterbegin','<div class="summaryBox"><strong>Pagamento disponível: '+money(context.amountCents)+'</strong><p>'+esc(context.payerName||'Pagador não identificado')+'</p><label for="associationDestination">O que este pagamento cobre?</label><select id="associationDestination"><option value="DEBT">Pendência existente</option><option value="NEW">Serviço novo</option></select></div><fieldset id="existingDebtFields" style="border:0;padding:0;margin:0;min-width:0"><p class="note">Escolha a pendência original. O pagamento pode quitar tudo ou abater uma parte. Nenhuma nova venda ou inscrição será criada.</p><div class="field"><label for="debtSearch">Buscar pessoa, trabalho ou mês</label><input id="debtSearch" type="search" placeholder="Nome ou serviço"></div><div class="field"><label for="debtChoice">Pendência financeira</label><select id="debtChoice" required><option value="">Carregando pendências...</option></select></div><div class="field"><label for="debtResponsible">Responsável pelo atendimento/trabalho</label><select id="debtResponsible" required>'+api.teamOptions()+'</select></div><div class="field"><label for="debtAmount">Valor a abater agora</label><input id="debtAmount" inputmode="decimal" required></div><div id="debtPreview" class="summaryBox"></div><div id="debtMatchMsg" role="status" aria-live="polite"></div><button id="saveDebtMatch" class="primary" type="submit" style="width:100%">Associar à pendência</button></fieldset>');
  var debts=[],key='debt-'+crypto.randomUUID(),frozen=saved&&saved.payload||null,finished=false,loading=true;
  if(frozen){el('associationDestination').disabled=true;el('saveDebtMatch').textContent='Conferir confirmação';el('debtMatchMsg').textContent='Há uma confirmação aguardando conferência. Clique para verificar o resultado sem repetir o abatimento.';}
  function chosen(){return debts.find(function(x){return x.obligationId===el('debtChoice').value;});}
  function samePerson(d){return !!context.payerPersonId&&(d.personId===context.payerPersonId||d.customerPersonId===context.payerPersonId)||!!context.payerName&&normalize(d.personName)===normalize(context.payerName);}
  function exact(d){return Number(d.pendingCents)===Number(context.amountCents);}
  function label(d){return (samePerson(d)?'Desta pessoa · ':'')+(exact(d)?'Valor coincide · ':'')+d.personName+' · '+d.eventName+' · '+api.dateBR(d.soldAt)+(d.referenceMonth?' · '+String(d.referenceMonth).slice(0,7):'')+' · falta '+money(d.pendingCents);}
  function preview(){var d=chosen(),n=api.cents(el('debtAmount').value);el('debtPreview').textContent=d?'Pendente: '+money(d.pendingCents)+' · Abater: '+money(n)+' · Restará na dívida: '+money(Math.max(0,d.pendingCents-n))+' · Pagamento ainda disponível: '+money(Math.max(0,context.amountCents-n)):'Selecione uma pendência para conferir o abatimento.';}
  function selectDebt(){var d=chosen();el('debtAmount').value=d?(Math.min(Number(d.pendingCents),Number(context.amountCents))/100).toFixed(2).replace('.',','):'';el('debtResponsible').value=d&&d.responsibleMemberId||'';preview();}
  function render(){
   var previous=el('debtChoice').value,query=normalize(el('debtSearch').value),rows=debts.filter(function(d){return normalize(label(d)).includes(query);});
   el('debtChoice').innerHTML='<option value="">Selecione a pendência</option>'+rows.map(function(d){return '<option value="'+esc(d.obligationId)+'">'+esc(label(d))+'</option>';}).join('');
   if(rows.some(function(d){return d.obligationId===previous;}))el('debtChoice').value=previous;
   // Suggestions never silently select a debt, even when the amount matches.
   if(!previous||el('debtChoice').value!==previous)selectDebt();
  }
  function mode(){var debt=el('associationDestination').value==='DEBT';old.disabled=debt;old.classList.toggle('hidden',debt);el('existingDebtFields').disabled=!debt;el('existingDebtFields').classList.toggle('hidden',!debt);}
  el('associationDestination').onchange=mode;el('debtSearch').oninput=render;el('debtChoice').onchange=selectDebt;el('debtAmount').oninput=preview;mode();
  api.rpc('v4_payment_debt_candidates',{}).then(function(rows){if(!form.isConnected)return;debts=rows||[];debts.sort(function(a,b){return Number(samePerson(b))-Number(samePerson(a))||Number(exact(b))-Number(exact(a))||String(a.soldAt||'').localeCompare(String(b.soldAt||''));});loading=false;render();if(!debts.length)el('debtMatchMsg').textContent='Nenhuma pendência em aberto. Selecione Serviço novo para cadastrar.';}).catch(function(e){if(form.isConnected)el('debtMatchMsg').textContent='Não foi possível consultar pendências: '+e.message;});
  form.onsubmit=async function(ev){
   if(el('associationDestination').value==='NEW'&&!frozen)return originalSubmit.call(form,ev);
   ev.preventDefault();var msg=el('debtMatchMsg'),btn=el('saveDebtMatch');if(btn.disabled||finished)return;msg.textContent='';
   try{
    if(!frozen){
     if(loading)throw new Error('Aguarde a consulta de pendências.');
     var d=chosen(),amount=api.cents(el('debtAmount').value),responsible=el('debtResponsible').value;
     if(!d)throw new Error('Selecione a pendência existente.');
     if(!responsible)throw new Error('Selecione o responsável pelo atendimento/trabalho.');
     if(amount<=0||amount>Number(d.pendingCents)||amount>Number(context.amountCents))throw new Error('Informe um valor positivo até o saldo da pendência e do pagamento.');
     var payments=context.kind==='GROUP'?(context.paymentIds||[]).map(function(id){return {kind:'EXISTING',id:id};}).concat((context.asaasEntryIds||[]).map(function(id){return {kind:'ASAAS',id:id};})):[{kind:context.kind,id:context.kind==='ASAAS'?context.entryId:context.paymentId}];
     frozen={idempotencyKey:key,obligationId:d.obligationId,amountCents:amount,responsibleMemberId:responsible,payments:payments};
    }
    btn.disabled=true;el('associationDestination').disabled=true;sessionStorage.setItem('sunshine.debtMatch.v1',JSON.stringify({context:context,payload:frozen}));
    var proof=await api.rpc('v4_api_match_payments_to_debt',{p_payload:frozen});finished=true;sessionStorage.removeItem('sunshine.debtMatch.v1');
    // A committed write remains successful even if refreshing another panel fails.
    api.closeDrawer();api.state.personDetails={};
    api.toast(Number(proof.pendingAfterCents)>0?'Pagamento associado. Ainda resta '+money(proof.pendingAfterCents):'Pendência quitada.');
    try{await api.refresh();}catch(_){api.toast('Associação salva. Atualize a página para renovar os saldos.');}
   }catch(e){
    msg.textContent=e.message||String(e);btn.disabled=false;
    if(['P0001','23514','22P02','42501'].includes(e.code)){frozen=null;sessionStorage.removeItem('sunshine.debtMatch.v1');el('associationDestination').disabled=false;}
    else if(frozen){msg.textContent+=' Clique novamente para conferir a mesma confirmação, sem repetir o abatimento.';btn.textContent='Conferir confirmação';}
   }
  };
 }
 global.SunshinePaymentMatching={mount:mount};
})(window);
