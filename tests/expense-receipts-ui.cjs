const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function boot(viewer=false){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{url:'https://sunshine.ymnegocios.com.br/',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 let context={ok:true,can_write:!viewer,member:{id:'member-1',name:'Yasmin',whatsapp_phone:'+5531999999999'},team:[{id:'member-1',name:'Yasmin',active:true,whatsapp_phone:'+5531999999999'}],categories:[],works:[{id:'work-1',title:'Magia Cigana',entity_detail:'Povo Cigano',work_type:'COLLECTIVE',scheduled_at:'2026-10-13'}],cost_items:[{id:'cost-1',name:'Materiais'}],general_cost_categories:[{id:'general-1',name:'Estoque da casa',kind:'RATEIO_GERAL'}]},receipts=[];
 async function handler(name,args){
  if(name==='v4_expense_receipt_context')return context;
  if(name==='v4_list_expense_receipts')return {ok:true,receipts:receipts.filter(r=>!args.p_receipt_id||r.id===args.p_receipt_id)};
  if(name==='v4_manual_create_receipt'){receipts=[{...args.payload,id:'receipt-1',status:'PENDING_CONFIRMATION',sent_by:'Yasmin',source:'MANUAL',lines:args.payload.lines.map(l=>({...l,work_title:l.work_id?'Magia Cigana':null,cost_item_name:l.work_id?'Materiais':null,general_category_name:l.general_category_id?'Estoque da casa':null}))}];return {ok:true,receipt_id:'receipt-1'};}
  if(name==='v4_manual_update_receipt'){receipts[0]={...receipts[0],...args.payload};return {ok:true,receipt_id:'receipt-1'};}
  if(name==='v4_manual_confirm_receipt'){receipts[0].status='CONFIRMED';return {ok:true,receipt_id:'receipt-1'};}
  if(name==='v4_manual_cancel_receipt'){receipts[0].status='CANCELLED';return {ok:true,receipt_id:'receipt-1'};}
  if(name==='v4_save_general_cost_category'){const c={...args.p_data,id:'category-new'};context={...context,categories:[c],general_cost_categories:[...context.general_cost_categories,c]};return {ok:true};}
  if(name==='v4_save_expense_member_phone'){context.team[0].whatsapp_phone=args.p_phone;return {ok:true};}
  if(name==='v4_work_receipt_costs')return {ok:true,lines:[{id:'line1',receipt_id:'receipt-1',cost_item_name:'Materiais',description:'Velas',amount:50,status:'CONFIRMED',expense_date:'2026-10-04',drive_url:'https://drive.google.com/file/d/file123/view'}]};
  if(name==='v4_receipt_cost_totals')return {ok:true,confirmed_amount:100,pending_amount:0};
  return [];
 }
 w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>{}},rpc:async(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});try{return {data:await handler(name,args),error:null};}catch(error){return {data:null,error};}}})};
 w.eval(fs.readFileSync(path.join(root,'assets/expense-receipts.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(root,'assets/finance-operations.js'),'utf8'));
 const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 w.eval(inline.replace('\ninit();','\nwindow.__testing={get operations(){return operations},state:state};init();'));
 const module=w.__testing.operations.receiptModule;
 return {w,dom,calls,module,close:()=>w.close()};
}
const event={preventDefault(){}};
test('manual 100 receipt with 50 work + 50 general, correction, confirmation and cancellation',async()=>{
 const app=boot(),w=app.w,e=id=>w.document.getElementById(id);
 try{
  await app.module.onPage('comprovantes');await app.module.openForm();
  e('receiptTotal').value='100.00';e('receiptSupplier').value='Fornecedor';e('receiptWork0').value='work-1';e('receiptCategory0').value='cost-1';e('receiptLineAmount0').value='50,00';e('addCostReceiptLine').click();
  e('receiptCategory1').value='general-1';e('receiptLineAmount1').value='50,00';e('costReceiptForm').dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(e('receiptFormTotals').textContent,/Diferença:.*0,00/);
  await e('costReceiptForm').onsubmit(event);
  const write=app.calls.find(c=>c.name==='v4_manual_create_receipt');assert.equal(write.args.payload.total_amount,100);assert.deepEqual(write.args.payload.lines.map(l=>l.amount),[50,50]);assert.equal(write.args.payload.lines[1].destination,'RATEIO_GERAL');assert(!('from_phone' in write.args));
  await e('editCostReceipt').onclick(event);e('receiptLineAmount0').value='60,00';e('receiptLineAmount1').value='40,00';await e('costReceiptForm').onsubmit(event);
  assert.equal(app.calls.filter(c=>c.name==='v4_manual_update_receipt').length,1);
  await e('confirmCostReceipt').onclick(event);assert(!e('editCostReceipt'));assert.match(e('drawerBody').textContent,/Confirmado/);
  await e('cancelCostReceipt').onclick(event);assert.match(e('drawerBody').textContent,/Cancelado/);assert(!e('cancelCostReceipt'));
 }finally{app.close();}
});
test('mismatched totals stay editable and never call write RPC',async()=>{
 const app=boot(),w=app.w,e=id=>w.document.getElementById(id);
 try{await app.module.openForm();e('receiptTotal').value='100,00';e('receiptWork0').value='work-1';e('receiptCategory0').value='cost-1';e('receiptLineAmount0').value='90,00';await e('costReceiptForm').onsubmit(event);assert.match(e('costReceiptFormMsg').textContent,/somar exatamente/);assert.equal(app.calls.filter(c=>c.name==='v4_manual_create_receipt').length,0);assert(e('costReceiptForm'));}finally{app.close();}
});
test('new cost category is selectable immediately and phone form validates E.164',async()=>{
 const app=boot(),w=app.w,e=id=>w.document.getElementById(id);
 try{await app.module.onPage('categorias-custos');e('newGeneralCostCategory').click();e('generalCostName').value='Instagram';await e('generalCostCategoryForm').onsubmit(event);await app.module.openForm();e('receiptDest0').value='CUSTO_FIXO';e('receiptDest0').dispatchEvent(new w.Event('change'));assert.match(e('receiptCategory0').textContent,/Instagram/);await app.module.onPage('equipe-custos');w.document.querySelector('[data-expense-team-member]').click();e('expenseMemberPhone').value='31999999999';assert.equal(e('expenseMemberPhone').checkValidity(),false);e('expenseMemberPhone').value='+5531999999999';assert.equal(e('expenseMemberPhone').checkValidity(),true);await e('expenseTeamForm').onsubmit(event);assert(app.calls.some(c=>c.name==='v4_save_expense_member_phone'));}finally{app.close();}
});
test('VIEWER receives lists with no write controls; work cost opens receipt and Drive link',async()=>{
 const app=boot(true),w=app.w,e=id=>w.document.getElementById(id);
 try{await app.module.onPage('comprovantes');assert(e('newCostReceipt').classList.contains('hidden'));await app.module.onPage('categorias-custos');assert(e('newGeneralCostCategory').classList.contains('hidden'));await app.module.onPage('equipe-custos');assert.equal(w.document.querySelectorAll('[data-expense-team-member]').length,0);await assert.rejects(app.module.openForm(),/ADMIN ou EDITOR/);const target=w.document.createElement('div');await app.module.loadWorkCosts(target,'work-1');assert.match(target.textContent,/50,00/);assert(target.querySelector('[data-open-expense-receipt]'));assert.equal(target.querySelector('a').href,'https://drive.google.com/file/d/file123/view');}finally{app.close();}
});
