(function(root){
 'use strict';
 function status(gap,revenue){return revenue<=0?'warn':gap<0?'bad':'good';}
 function render(w,api){
  var money=api.money,esc=api.esc,revenue=Number(w.receivedCents||0),costs=Number(w.costsCents||0),budget=Number(w.costTargetCents||0),house=Number(w.houseTargetCents||0),balance=Number(w.balanceCents||0),gap=balance-house,costGap=budget-costs;
  function light(kind,text){return '<span class="badge '+kind+'">'+(kind==='bad'?'🔴 ':kind==='warn'?'🟡 ':'🟢 ')+esc(text)+'</span>';}
  function card(label,value,detail){return '<div class="moneyCard"><span>'+label+'</span><b>'+money(value)+'</b><div class="breakdown">'+detail+'</div></div>';}
  var people=Object.keys(w.commissionsByPerson||{}).map(function(name){return esc(name)+': '+money(w.commissionsByPerson[name]);}).join('<br>');
  return '<article class="panel eventFinance"><p class="sectionTitle">PAINEL DO TRABALHO EM ABERTO</p><h2>'+esc(w.title)+'</h2><div class="moneyGroup">'+
   card('ARRECADADO',revenue,'Pagamentos recebidos deste trabalho')+
   card('META DE CUSTOS — 20%',budget,'Notas e custos lançados: <strong>'+money(costs)+'</strong><br>'+light(status(costGap,revenue),revenue<=0?'Aguardando arrecadação':costGap<0?'Limite excedido em '+money(-costGap):'Dentro da meta · disponível '+money(costGap)))+
   card('COMISSÕES — TOTAL GERADO',w.commissionCents,people||'Nenhuma comissão gerada')+
   card('RESERVA DA CASA — META 20%',house,'Saldo após comissões e custos: <strong>'+money(balance)+'</strong><br>'+light(status(gap,revenue),revenue<=0?'Aguardando arrecadação':gap<0?'Faltam '+money(-gap):'Meta atingida · sobra '+money(gap)))+
   '</div><p class="note">Arrecadado − comissões geradas − custos lançados = <strong>'+money(balance)+'</strong>. A meta da casa é '+money(house)+'. Custos incluem notas confirmadas e despesas do trabalho, pagas ou pendentes. Recebimentos anteriores mantêm sua divisão original.</p></article>';
 }
 root.SunshineEventFinance={render:render,status:status};
 if(typeof module!=='undefined')module.exports=root.SunshineEventFinance;
})(typeof window!=='undefined'?window:globalThis);
