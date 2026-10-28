(function(){
 'use strict';
 window.SunshineAgentAlerts=function(api){
  var el=api.el,esc=api.esc;
  var labels={MEMBRO_CASA_ATRASADO:'Mensalidade atrasada',TRABALHO_PARTICULAR_RECENTE:'Trabalho particular recente',CONSULTA_SEM_TRABALHO:'Consulta sem trabalho',PRIMEIRA_COMPRA_SEM_RETORNO:'Primeira compra sem retorno',SO_AGRADO_COLETIVO:'Somente agrado coletivo',ESFRIANDO:'Cliente esfriando',INATIVA:'Sem compras há muito tempo',LEAD_SEM_COMPRA:'Cadastro sem compra'};
  function init(){
   document.querySelector('main').insertAdjacentHTML('beforeend','<section id="configuracoes-agente" class="page"><div class="pageHead"><div><h1>Configurações</h1><p>Preferências da operação.</p></div></div><div class="panel"><button class="secondary" data-go="alertas-agente">Alertas do agente</button></div></section><section id="alertas-agente" class="page"><div class="pageHead"><div><h1>Alertas do agente</h1><p>Os prazos e limites passam a valer assim que forem salvos.</p></div><button class="ghost" data-go="configuracoes-agente">Configurações</button></div><div class="panel"><p class="note">O intervalo é contado em dias. O cooldown vale por pessoa e tipo de alerta. Os alertas descrevem fatos do histórico; não enviam mensagens automaticamente.</p><div id="agentRulesNotice" role="status" aria-live="polite"></div><div id="agentRulesList" class="grid"></div></div></section>');
   document.querySelector('.menuGrid').insertAdjacentHTML('beforeend','<button data-go="configuracoes-agente">Configurações</button>');
  }
  function field(type,label,value){return '<div class="field"><label>'+esc(label)+'<input name="'+type+'" type="number" min="0" step="1" '+(type==='days_max'?'':'required')+' value="'+esc(value==null?'':value)+'"></label></div>';}
  async function load(){
   el('agentRulesNotice').textContent='Carregando regras…';
   var response=await api.client().from('agent_alert_rules').select('*').order('alert_type');
   if(response.error)throw response.error;
   el('agentRulesNotice').textContent=response.data.length?'':'Somente administradores podem consultar e editar estas regras.';
   el('agentRulesList').innerHTML=response.data.map(function(r){return '<form class="row agentRule" data-type="'+esc(r.alert_type)+'"><h2>'+esc(labels[r.alert_type]||r.alert_type)+'</h2><label><input type="checkbox" name="active" '+(r.active?'checked':'')+'> Ativo</label><div class="filters">'+field('days_min','Prazo mínimo (dias)',r.days_min)+field('days_max','Prazo máximo (opcional)',r.days_max)+field('max_per_day','Limite por dia',r.max_per_day)+field('cooldown_days','Cooldown (dias)',r.cooldown_days)+'</div><div class="field"><label>Descrição<textarea name="description" required>'+esc(r.description)+'</textarea></label></div><div class="ruleMessage" role="status" aria-live="polite"></div><button class="primary" type="submit">Salvar regra</button></form>';}).join('');
   el('agentRulesList').querySelectorAll('form').forEach(function(form){form.onsubmit=async function(event){
    event.preventDefault();var button=form.querySelector('button'),notice=form.querySelector('.ruleMessage');button.disabled=true;
    try{
     var data=new FormData(form),min=Number(data.get('days_min')),max=data.get('days_max')===''?null:Number(data.get('days_max'));
     if(max!==null&&max<min)throw new Error('O prazo máximo deve ser maior ou igual ao mínimo.');
     var result=await api.client().from('agent_alert_rules').update({active:data.get('active')==='on',days_min:min,days_max:max,max_per_day:Number(data.get('max_per_day')),cooldown_days:Number(data.get('cooldown_days')),description:String(data.get('description')).trim()}).eq('alert_type',form.dataset.type).select('alert_type');
     if(result.error)throw result.error;if(result.data.length!==1)throw new Error('Não foi possível salvar. Confira suas permissões.');
     notice.textContent='Regra salva. A próxima consulta já usará os novos valores.';
    }catch(error){notice.textContent=error.message||'Não foi possível salvar a regra.';}finally{button.disabled=false;}
   };});
  }
  return {init:init,onPage:async function(id){if(id==='alertas-agente')try{await load();}catch(e){el('agentRulesNotice').textContent=e.message||'Não foi possível carregar as regras.';}}};
 };
})();
