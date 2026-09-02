/* Sunshine v3.48 — correção definitiva do valor recebido no Asaas.
   Evita que CPF/telefone desabilitados sejam confundidos com o campo monetário
   pelo fluxo multi-serviço legado da v27. */
(function(){
  const digits48=v=>String(v||'').replace(/\D/g,'');

  function formatCpfCnpj48(v){
    let d=digits48(v);
    if(d.length===13 && /00$/.test(d)) d=d.slice(0,-2); // recupera CPF convertido para number + .00
    if(d.length===16 && /00$/.test(d)) d=d.slice(0,-2); // recupera CNPJ convertido para number + .00
    if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
    return d;
  }

  function formatPhone48(v){
    const d=digits48(v);
    if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    if(d.length===13 && d.startsWith('55'))return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
    if(d.length===12 && d.startsWith('55'))return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
    return v;
  }

  function labelText48(label,text){
    if(!label)return;
    const node=[...label.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
    if(node)node.nodeValue=text;
  }

  function preflight48(){
    const form=document.getElementById('asaasGlobalResolveForm')||document.getElementById('asaasResolveForm');
    if(!form)return;
    const doc=form.querySelector('#agDocument,#arDocument');
    const phone=form.querySelector('#agPhone,#arPhone');
    if(doc && /^\d+$/.test(String(doc.value||''))) doc.value=formatCpfCnpj48(doc.value);
    if(phone && /^\d+$/.test(String(phone.value||''))) phone.value=formatPhone48(phone.value);
  }

  function recalc48(form){
    const gross=Number(form.dataset.gross27||0);
    let total=Number(form.querySelector('#agAmount0')?.value||0);
    form.querySelectorAll('.asaas-extra-item27').forEach(x=>{
      total+=Number(x.querySelector('.agExtraAmount27')?.value||0);
    });
    const el=form.querySelector('.asaas-total27');
    if(!el)return;
    const diff=Math.round((gross-total)*100)/100;
    el.className=`asaas-total27 ${Math.abs(diff)<.005?'ok':'bad'}`;
    el.innerHTML=`Recebido: <b>${fmtMoney(gross)}</b> · Associado: <b>${fmtMoney(total)}</b> · ${Math.abs(diff)<.005?'Fechou corretamente':`Falta distribuir ${fmtMoney(diff)}`}`;
  }

  function repairWrongAmount48(form){
    if(!form||form.dataset.multi27!=='1')return;
    const current=form.querySelector('#agAmount0');
    if(!current)return;

    // O campo monetário verdadeiro permanece no label "Valor recebido" quando a v27 captura CPF/telefone por engano.
    const realLabel=[...form.querySelectorAll('label')].find(l=>/^valor recebido/i.test((l.childNodes[0]?.textContent||'').trim()));
    const real=realLabel?.querySelector('input');
    if(!real||real===current)return;

    const badValue=Number(current.value||0);
    const realValue=Number(String(real.value||'').replace(',','.'));
    if(!(realValue>=0) || Math.abs(badValue-realValue)<.005)return;

    const badLabel=current.closest('label');
    const likelyDoc=badValue>=1000000000;
    const likelyPhone=badValue>=10000000 && badValue<1000000000;

    if(likelyDoc){
      current.id='agDocument';
      current.type='text';
      current.removeAttribute('step');current.removeAttribute('min');
      current.value=formatCpfCnpj48(String(Math.trunc(badValue)));
      current.disabled=Boolean(form.querySelector('#agClient')?.value);
      labelText48(badLabel,'CPF/CNPJ ');
    }else if(likelyPhone){
      current.id='agPhone';
      current.type='text';
      current.removeAttribute('step');current.removeAttribute('min');
      current.value=formatPhone48(String(Math.trunc(badValue)));
      current.disabled=Boolean(form.querySelector('#agClient')?.value);
      labelText48(badLabel,'Telefone ');
    }else{
      return;
    }

    real.disabled=false;
    real.type='number';
    real.step='0.01';
    real.min='0.01';
    real.id='agAmount0';
    real.value=realValue.toFixed(2);
    labelText48(realLabel,'Valor desta parte ');
    form.dataset.gross27=String(realValue);
    real.addEventListener('input',()=>recalc48(form));
    recalc48(form);
    toast('Valor recebido corrigido para '+fmtMoney(realValue)+'.','error');
  }

  function run48(){
    preflight48();
    const form=document.getElementById('asaasGlobalResolveForm')||document.getElementById('asaasResolveForm');
    if(form)repairWrongAmount48(form);
  }

  // O clique que abre a pendência cria o formulário de forma síncrona. Este listener roda
  // ainda no mesmo evento, antes dos MutationObservers da v27 tentarem descobrir o valor.
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-asaas-resolve-global]')) preflight48();
  },true);

  const obs=new MutationObserver(()=>run48());
  obs.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run48);else run48();
})();
