const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
function boot(rows){
 const dom=new JSDOM('<main></main><div class="menuGrid"></div>',{runScripts:'outside-only'}),w=dom.window;let saved=[];
 const esc=x=>String(x==null?'':x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 w.eval(fs.readFileSync('assets/agent-alerts.js','utf8'));
 const api={el:id=>w.document.getElementById(id),esc,client:()=>({from:table=>{assert.equal(table,'agent_alert_rules');return {select:()=>({order:async()=>({data:rows})}),update:values=>({eq:(key,type)=>({select:async()=>{saved.push({values,type});return {data:[{alert_type:type}]};}})})};}})};
 const module=w.SunshineAgentAlerts(api);module.init();return {dom,w,module,saved};
}
const rule={alert_type:'SO_AGRADO_COLETIVO',active:true,days_min:30,days_max:null,max_per_day:5,cooldown_days:30,description:'Somente agrado coletivo'};
test('settings entry and rule editor persist numeric limits and active state',async()=>{
 const b=boot([rule]);try{
  assert(b.w.document.querySelector('[data-go="configuracoes-agente"]'));await b.module.onPage('alertas-agente');
  const form=b.w.document.querySelector('form');form.elements.days_min.value='45';form.elements.active.checked=false;
  await form.onsubmit({preventDefault(){}});
  assert.equal(b.saved.length,1);assert.equal(b.saved[0].values.days_min,45);assert.equal(b.saved[0].values.days_max,null);assert.equal(b.saved[0].values.active,false);
  assert.match(form.querySelector('.ruleMessage').textContent,/Regra salva/);
 }finally{b.dom.window.close();}
});
test('invalid ranges are rejected without saving and non-admin sees no rules',async()=>{
 const b=boot([rule]);try{await b.module.onPage('alertas-agente');const form=b.w.document.querySelector('form');form.elements.days_max.value='2';await form.onsubmit({preventDefault(){}});assert.equal(b.saved.length,0);assert.match(form.querySelector('.ruleMessage').textContent,/maior ou igual/);}finally{b.dom.window.close();}
 const c=boot([]);try{await c.module.onPage('alertas-agente');assert.match(c.w.document.getElementById('agentRulesNotice').textContent,/administradores/);}finally{c.dom.window.close();}
});
