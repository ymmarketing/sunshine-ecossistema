/* Sunshine v3.21 — marca Sunshine sempre retorna para a Home */
(function(){
  function goHomeFromBrand(){
    if(typeof navigate==='function'){
      navigate('home');
    }
    const nav=document.getElementById('nav');
    if(nav)nav.classList.remove('is-open');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function enableBrandHomeLink(){
    const brand=document.querySelector('.sidebar .brand');
    if(!brand || brand.dataset.homeLinkBound==='1')return;
    brand.dataset.homeLinkBound='1';
    brand.setAttribute('role','link');
    brand.setAttribute('tabindex','0');
    brand.setAttribute('aria-label','Ir para a Home');
    brand.setAttribute('title','Ir para a Home');
    brand.style.cursor='pointer';
    brand.addEventListener('click',goHomeFromBrand);
    brand.addEventListener('keydown',e=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        goHomeFromBrand();
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enableBrandHomeLink);
  else enableBrandHomeLink();
})();
