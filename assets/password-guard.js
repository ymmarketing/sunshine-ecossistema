// Obriga a troca da senha inicial compartilhada no primeiro acesso.
(function(){
  if(typeof db==='undefined' || !db) return;
  let showing=false;

  function removeGuard(){
    document.getElementById('initialPasswordGuard')?.remove();
    showing=false;
  }

  function showGuard(session){
    if(!session?.user?.user_metadata?.must_change_password || showing) return;
    showing=true;
    const root=document.createElement('div');
    root.id='initialPasswordGuard';
    root.className='modal-backdrop';
    root.innerHTML=`<div class="modal" style="max-width:430px">
      <div class="modal-head"><h2>Crie sua senha pessoal</h2></div>
      <div class="modal-body">
        <div class="note"><b>Primeiro acesso.</b><br>A senha recebida é temporária. Defina uma senha pessoal antes de continuar.</div>
        <form id="initialPasswordForm" class="form-grid" style="margin-top:14px">
          <label class="span-2">Nova senha<input id="initialNewPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Mínimo de 8 caracteres"></label>
          <label class="span-2">Confirmar nova senha<input id="initialNewPassword2" type="password" minlength="8" autocomplete="new-password" required></label>
          <div class="span-2" id="initialPasswordError" style="color:var(--red);font-size:11px;min-height:16px"></div>
          <div class="form-actions span-2"><button class="btn" id="initialPasswordSave" type="submit">Salvar nova senha</button></div>
        </form>
      </div>
    </div>`;
    document.body.appendChild(root);
    document.getElementById('initialPasswordForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const p1=document.getElementById('initialNewPassword').value;
      const p2=document.getElementById('initialNewPassword2').value;
      const errorEl=document.getElementById('initialPasswordError');
      if(p1.length<8){errorEl.textContent='Use pelo menos 8 caracteres.';return;}
      if(p1!==p2){errorEl.textContent='As senhas não coincidem.';return;}
      const btn=document.getElementById('initialPasswordSave');btn.disabled=true;btn.textContent='Salvando…';
      const {error}=await db.auth.updateUser({password:p1,data:{must_change_password:false}});
      if(error){btn.disabled=false;btn.textContent='Salvar nova senha';errorEl.textContent=error.message||'Não foi possível alterar a senha.';return;}
      removeGuard();
      if(typeof toast==='function') toast('Senha pessoal criada com sucesso.');
    });
  }

  db.auth.getSession().then(({data})=>showGuard(data?.session)).catch(()=>{});
  db.auth.onAuthStateChange((_event,session)=>showGuard(session));
})();
