/* Sunshine v3.25.1 — telefone obrigatório ao criar cliente a partir do Asaas */
(function(){
  function enhancePhone(root=document){
    const forms=[root.querySelector?.('#asaasGlobalResolveForm'),root.querySelector?.('#asaasResolveForm')].filter(Boolean);
    forms.forEach(form=>{
      const client=form.querySelector('#agClient,#arClient');
      const phone=form.querySelector('#agPhone,#arPhone');
      if(!phone||phone.dataset.asaasPhoneRequired==='1')return;
      phone.dataset.asaasPhoneRequired='1';
      const label=phone.closest('label');
      if(label){
        const helper=document.createElement('small');
        helper.className='helper';
        helper.textContent='Obrigatório quando estiver criando um novo cliente.';
        phone.insertAdjacentElement('afterend',helper);
      }
      const sync=()=>{
        const newClient=!client?.value;
        phone.required=newClient;
        phone.setAttribute('aria-required',newClient?'true':'false');
      };
      client?.addEventListener('change',sync);
      sync();
      form.addEventListener('submit',ev=>{
        if(!client?.value && !phone.value.trim()){
          ev.preventDefault();
          ev.stopImmediatePropagation();
          phone.focus();
          phone.scrollIntoView({behavior:'smooth',block:'center'});
          toast('Informe o telefone do novo cliente para concluir a associação.','error');
        }
      },true);
    });
  }
  const observer=new MutationObserver(()=>enhancePhone(document));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>enhancePhone(document));
  setTimeout(()=>enhancePhone(document),400);
})();
