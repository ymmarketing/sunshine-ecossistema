/* Sunshine v3.43 — estabilização pós-auditoria: Financeiro unificado sempre visível + versão fixa */
(function(){
  const VERSION='v3.43';
  let timer43=null;

  function pin43(){
    const foot=document.querySelector('.sidebar-foot');
    if(foot && !String(foot.textContent||'').includes(VERSION)) foot.innerHTML=`<span class="dot"></span> Ecossistema Sunshine · ${VERSION}`;
  }

  function stabilizeFinance43(){
    if(state.view!=='financeiro')return;
    const unified=document.getElementById('financeUnified40');
    if(!unified)return;
    const parent=unified.parentElement;
    if(parent) parent.hidden=false;
    [...document.querySelectorAll('#content article.panel')].forEach(panel=>{
      if(panel===unified)return;
      const title=(panel.querySelector('h2')?.textContent||'').trim();
      if(/^pagamentos$/i.test(title)||/^vendas$/i.test(title)) panel.hidden=true;
    });
    unified.hidden=false;
  }

  function run43(){pin43();stabilizeFinance43();}
  function schedule43(delay=30){clearTimeout(timer43);timer43=setTimeout(run43,delay);}

  const prevRender43=render;
  render=async function(){await prevRender43();schedule43(20);setTimeout(run43,240);};

  function start43(){
    run43();
    const obs=new MutationObserver(()=>schedule43(20));
    obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start43);else start43();
})();
