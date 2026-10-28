const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
for(const [i,script] of scripts.entries())new vm.Script(script,{filename:'index-inline-'+i+'.js'});
new vm.Script(fs.readFileSync(path.join(root,'assets/finance-operations.js'),'utf8'),{filename:'finance-operations.js'});
new vm.Script(fs.readFileSync(path.join(root,'assets/expense-receipts.js'),'utf8'),{filename:'expense-receipts.js'});
console.log('JavaScript syntax OK');

new vm.Script(fs.readFileSync(path.join(root,'assets/payment-matching.js'),'utf8'),{filename:'payment-matching.js'});

new vm.Script(fs.readFileSync(path.join(root,'assets/agent-alerts.js'),'utf8'),{filename:'agent-alerts.js'});
