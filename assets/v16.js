/* Sunshine v3.16.1 — nenhum pagamento Asaas recebido pode ficar solto */
(function(){
  const previousHandleAction=handleAction;
  const previousBindViewActions=bindViewActions;

  handleAction=async function(action,id){
    if(action==='ignore-asaas'){
      toast('Pagamento recebido pelo Asaas precisa ser associado a um cliente e a um serviço/trabalho. Ele não pode ser ignorado.','error');
      return;
    }
    return previousHandleAction(action,id);
  };

  bindViewActions=function(){
    previousBindViewActions();
    document.querySelectorAll('[data-action="ignore-asaas"]').forEach(btn=>btn.remove());
    const inbox=document.getElementById('asaasInbox');
    if(inbox){
      const p=inbox.querySelector('.section-head p');
      if(p) p.textContent='O dinheiro já entrou. Para concluir, associe obrigatoriamente o cliente e o serviço ou trabalho contratado.';
    }
  };
})();
