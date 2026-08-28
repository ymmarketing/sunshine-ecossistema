/* Sunshine v3.11 — clareza de baixa de comissões + menu mobile fecha após navegação */
(function(){
  function closeMobileMenu(){
    const nav=document.getElementById('nav');
    if(nav) nav.classList.remove('is-open');
  }

  // No mobile, selecionar uma seção deve levar direto ao conteúdo, sem deixar o menu aberto.
  document.querySelectorAll('#nav button[data-view]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      closeMobileMenu();
      if(window.matchMedia && window.matchMedia('(max-width: 900px)').matches){
        setTimeout(()=>document.querySelector('main')?.scrollIntoView({block:'start'}),30);
      }
    });
  });

  const previousBindViewActions=bindViewActions;
  bindViewActions=function(){
    previousBindViewActions();

    if(state.view==='financeiro'){
      const panel=document.getElementById('commissionControl');
      if(panel && !panel.querySelector('.commission-howto')){
        const head=panel.querySelector('.section-head');
        const guide=document.createElement('div');
        guide.className='source-note commission-howto';
        guide.style.margin='12px 0 14px';
        guide.innerHTML=`<b>Como dar baixa:</b> quando existir uma comissão aberta, ela aparecerá abaixo com status <b>A pagar</b> e botão <b>Marcar como pago</b>. Ao tocar nesse botão, o sistema muda para <b>Pago</b> e registra automaticamente a data e a hora. Se não houver linha abaixo, não existe comissão operacional nova aguardando pagamento.`;
        if(head) head.insertAdjacentElement('afterend',guide); else panel.prepend(guide);

        const empty=panel.querySelector('tbody .empty-row td');
        if(empty){
          empty.innerHTML='<b>Nenhuma comissão nova a pagar neste momento.</b><br><small>O histórico importado não vira saldo em aberto. Uma comissão nova nasce quando um pagamento confirmado é vinculado a uma venda e o responsável pelo atendimento está definido.</small>';
        }
      }
    }
  };
})();
