// Login simples por nome; o e-mail técnico permanece invisível para a equipe.
(function(){
  const map={yasmin:'yasmin@sunshine.local',rosely:'rosely@sunshine.local',lourdes:'lourdes@sunshine.local'};
  const normalize=s=>String(s||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  document.addEventListener('submit',function(e){
    if(e.target?.id!=='loginForm') return;
    const username=document.getElementById('loginUsername');
    const email=document.getElementById('loginEmail');
    if(!username||!email) return;
    const key=normalize(username.value);
    email.value=map[key]||key;
  },true);
})();
