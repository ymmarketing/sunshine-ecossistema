(async function initSunshineBackendStatus(){
  const chip = document.getElementById('backendStatus');
  const cfg = window.SUNSHINE_CONFIG || {};
  if (!chip) return;
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    chip.textContent = 'BACKEND NÃO CONFIGURADO';
    return;
  }
  try {
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: cfg.supabasePublishableKey,
        Authorization: `Bearer ${cfg.supabasePublishableKey}`
      }
    });
    chip.textContent = response.ok ? 'SUPABASE ATIVO' : 'SUPABASE CONECTADO';
  } catch (error) {
    chip.textContent = 'VERIFICAR CONEXÃO';
  }
})();
