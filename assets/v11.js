/* Sunshine v3.10 — Financeiro compacto: comissões antes de pagamentos/vendas e topo recolhível */
(function(){
  const previousBindViewActions = bindViewActions;

  function ensureFinanceStyle(){
    if(document.getElementById('financeCompactStyle')) return;
    const style=document.createElement('style');
    style.id='financeCompactStyle';
    style.textContent=`
      .finance-fold{padding:0;overflow:hidden}
      .finance-fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;font-weight:800;color:var(--text,#24110B);user-select:none}
      .finance-fold>summary::-webkit-details-marker{display:none}
      .finance-fold>summary:after{content:'▾';font-size:18px;transition:transform .18s ease}
      .finance-fold[open]>summary:after{transform:rotate(180deg)}
      .finance-fold .summary-copy{display:flex;flex-direction:column;gap:3px}
      .finance-fold .summary-copy small{font-weight:500;color:var(--muted,#806b62)}
      .finance-fold-body{padding:0 18px 18px}
      .finance-fold-body>.panel,.finance-fold-body>.kpi-grid,.finance-fold-body>.asaas-banner{margin-top:12px}
      #commissionControl{margin-top:14px}
      @media(max-width:720px){
        .finance-fold>summary{padding:16px}
        .finance-fold-body{padding:0 12px 12px}
      }
    `;
    document.head.appendChild(style);
  }

  function organizeFinance(){
    if(state.view!=='financeiro') return;
    const content=document.getElementById('content');
    const commission=content?.querySelector('#commissionControl');
    if(!content||!commission) return;

    ensureFinanceStyle();

    const paymentSales=Array.from(content.children).find(el=>
      el.classList?.contains('two') &&
      /Pagamentos/i.test(el.textContent||'') &&
      /Vendas/i.test(el.textContent||'')
    );

    if(paymentSales && commission.nextElementSibling!==paymentSales){
      content.insertBefore(commission,paymentSales);
    }

    if(content.querySelector('#financeTopFold')) return;

    const topNodes=[];
    let node=content.firstElementChild;
    while(node && node!==commission){
      const next=node.nextElementSibling;
      topNodes.push(node);
      node=next;
    }

    if(topNodes.length){
      const details=document.createElement('details');
      details.id='financeTopFold';
      details.className='panel finance-fold';
      details.innerHTML=`<summary><span class="summary-copy">Resumo, pendências e lançamentos<small>Abra somente quando precisar consultar indicadores, entradas do Asaas ou fazer um lançamento manual.</small></span></summary><div class="finance-fold-body"></div>`;
      content.insertBefore(details,commission);
      const body=details.querySelector('.finance-fold-body');
      topNodes.forEach(el=>body.appendChild(el));
    }
  }

  bindViewActions=function(){
    previousBindViewActions();
    organizeFinance();
  };
})();
