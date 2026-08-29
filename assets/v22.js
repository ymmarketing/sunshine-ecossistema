/* Sunshine v3.22 — aplica escopo visual da Home */
(function(){
  const previousRenderHome22=renderHome;
  renderHome=async function(){
    return `<div class="home-view-v22">${await previousRenderHome22()}</div>`;
  };
})();
