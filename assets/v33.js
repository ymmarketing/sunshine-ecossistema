/* Sunshine v3.33 mobile — Cliente 360 abre no próprio cliente selecionado */
(function(){
  let obs=null;
  function placeClientAccordion(){
    if(state.view!=='clientes'||!window.matchMedia('(max-width:720px)').matches||!state.selectedClient?.id)return;
    const row=document.querySelector(`#clientTable tbody tr[data-client-id="${state.selectedClient.id}"]`);
    const fold=document.querySelector('#content .client-fold32');
    if(!row||!fold||fold.closest('[data-client-inline33]'))return;
    document.querySelectorAll('[data-client-inline33]').forEach(x=>x.remove());
    const tr=document.createElement('tr');tr.dataset.clientInline33='1';
    const td=document.createElement('td');td.colSpan=5;td.style.padding='8px 0 12px';
    tr.appendChild(td);row.insertAdjacentElement('afterend',tr);td.appendChild(fold);
    const btn=fold.querySelector('[data-client-fold32]');
    if(btn){btn.querySelector('span:first-child').textContent=`Abrir dados de ${state.selectedClient.preferred_name||state.selectedClient.full_name||'cliente'}`;}
    row.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function start(){placeClientAccordion();if(obs)return;obs=new MutationObserver(placeClientAccordion);obs.observe(document.getElementById('content')||document.body,{childList:true,subtree:true});}
  window.addEventListener('resize',placeClientAccordion);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
