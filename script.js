const DOCS={death:[["id_dec","Valid ID of deceased"],["id_cl","Valid ID of claimant"],["proof","Proof of death (mortuary receipt / medical cause of death)"],["police","Police report (needed if accidental)"]],
tpd:[["assess","Doctor's disability assessment"],["id","National ID"]],ci:[["med","Medical report"],["id","Valid ID"]],hosp:[["id","Valid ID"],["dis","Discharge summary"]]};
const $=id=>document.getElementById(id);
const days=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
function renderDocs(have){const t=$('type').value;$('docs').innerHTML=DOCS[t].map(([k,l])=>`<div class="ck"><input type="checkbox" data-k="${k}" ${have&&have.includes(k)?'checked':''}><span>${l}</span></div>`).join('')}
function read(){return{type:$('type').value,chan:$('chan').value,amt:+$('amt').value,sa:+$('sa').value,prior:+$('prior').value||0,inc:$('inc').value,ev:$('ev').value,miss:+$('miss').value||0,rein:$('rein').value,
docs:[...document.querySelectorAll('#docs input:checked')].map(i=>i.dataset.k),conf:+$('conf').value,
f:{name:$('f_name').checked,ben:$('f_ben').checked,dup:$('f_dup').checked,dx:$('f_dx').checked,acc:$('f_acc').checked}}}
function evaluate(c){
 const ch=[],P=(r,m)=>ch.push({s:'pass',r,m}),F=(r,m)=>ch.push({s:'fail',r,m}),W=(r,m)=>ch.push({s:'warn',r,m});
 let hard=[],esc=[],std=[],missing=[];
 // 1 policy status
 if(c.miss>=3&&!c.rein){F('R1 Policy status',`${c.miss} consecutive months missed: policy had lapsed at event date.`);hard.push('lapsed')}
 else if(c.miss>=3&&c.rein){W('R1 Policy status',`Lapsed (${c.miss} months missed) but reinstated on ${c.rein}.`)}
 else P('R1 Policy status',`${c.miss} missed month(s), under the 3-month lapse threshold.`);
 // 2 waiting
 const d1=days(c.inc,c.ev);
 if(!c.inc||!c.ev){F('R2 Waiting period','Missing inception or event date.');hard.push('dates')}
 else if(d1<0){F('R2 Waiting period','Event date is before policy inception.');hard.push('wait')}
 else if(d1<180){F('R2 Waiting period',`Event ${d1} days after inception; 180 required (eligible from ${addD(c.inc,180)}).`);hard.push('wait')}
 else P('R2 Waiting period',`${d1} days since inception (180 required).`);
 let near=false;
 if(c.rein){const d2=days(c.rein,c.ev);
  if(d2<180){F('R2b Reinstatement wait',`Event ${d2} days after reinstatement; extra 180 days required (eligible from ${addD(c.rein,180)}).`);hard.push('rein')}
  else{P('R2b Reinstatement wait',`${d2} days since reinstatement (180 required).`);if(d2<=14)near=true}}
 if(d1>=180&&d1<=14+180){near=true}
 // 3 limit
 const lim=c.type==='hosp'?[250,500]:[2000,30000];
 if(c.sa<lim[0]||c.sa>lim[1]){W('R3a Product range',`Cover of GHS ${c.sa} is outside the product range ${lim[0]}–${lim[1]}; check policy record.`);std.push('range')}
 if(c.type==='hosp'){const tot=c.amt+c.prior;
  if(tot>c.sa){F('R3 Benefit limit',`Claim ${c.amt} + prior ${c.prior} = ${tot} exceeds annual limit ${c.sa}.`);hard.push('limit')}
  else P('R3 Benefit limit',`Claim ${c.amt} + prior ${c.prior} = ${tot}, within annual limit ${c.sa}.`)}
 else{if(c.amt>c.sa){F('R3 Benefit limit',`Claimed ${c.amt} exceeds sum assured ${c.sa}.`);hard.push('limit')}
  else P('R3 Benefit limit',`Claimed ${c.amt} is within sum assured ${c.sa}.`)}
 // 4 docs
 DOCS[c.type].forEach(([k,l])=>{
  if(k==='police'&&!c.f.acc)return;
  if(!c.docs.includes(k))missing.push(l.replace(/ \(.*\)/,''))});
 if(missing.length)W('R4 Documents',`Missing: ${missing.join('; ')}.`);else P('R4 Documents','All required documents present.');
 // 5 AI layer
 if(c.conf<80){W('A1 Extraction quality',`Confidence ${c.conf}% is below 80%: manual verification of fields.`);std.push('ocr')}else P('A1 Extraction quality',`Confidence ${c.conf}%.`);
 if(c.f.name){W('A2 Identity match','Name or ID mismatch across documents.');std.push('name')}
 if(c.f.ben){W('A3 Beneficiary','Claimant differs from named beneficiary.');esc.push('beneficiary')}
 if(c.f.dup){F('A4 Duplicates','Duplicate document or claim detected on another policy.');esc.push('duplicate')}
 if(c.f.dx&&c.type==='ci'){W('A5 Diagnosis','Diagnosis not on the covered list.');std.push('dx')}
 if(near){W('A6 Timing pattern','Event falls within 14 days after a waiting period ended.');esc.push('timing')}
 if(c.amt>=20000){W('A7 High value','Claim of GHS 20,000 or more needs senior sign-off.');esc.push('high value')}
 if(!ch.some(x=>x.r.startsWith('A')&&x.s!=='pass')&&!ch.some(x=>x.s==='fail'))P('A0 Anomaly scan','No anomalies flagged.');
 // outcome
 let o,k,act;
 if(hard.length){o='Likely ineligible';k='no';act='Officer must confirm before any rejection. Send a plain-language explanation to the claimant.'}
 else if(esc.length){o='Escalate';k='esc';act='Route to a senior officer / investigator: '+esc.join(', ')+'.'}
 else if(missing.length){o='Incomplete';k='inc';act='Auto-notify the claimant of the missing documents. Claim stays open.'}
 else if(std.length){o='Standard review';k='std';act='Officer reviews with flagged fields highlighted.'}
 else{o='Fast-track';k='fast';act='Queue for light-touch officer confirmation.'}
 let msg='';
 if(o==='Likely ineligible')msg='Dear customer, we have reviewed your claim and, based on your policy terms, it may not qualify for payment at this stage ('+hard.map(h=>({lapsed:'the policy had lapsed because premiums were missed for 3 months in a row',wait:'the event happened before the 180-day waiting period ended',rein:'the extra 180-day waiting period after reinstatement had not ended',limit:'the amount is above your cover limit',dates:'dates are missing'}[h])).join('; ')+'). A claims officer will confirm this and contact you.';
 if(o==='Incomplete')msg='Dear customer, your claim is received. To continue, please provide: '+missing.join(', ')+'. You can upload on the portal or bring it to any branch.';
 return{outcome:o,cls:k,action:act,checks:ch,msg,missing,esc,std,hard}}
const S=[
{n:'Clean death claim',type:'death',chan:'Online portal',amt:10000,sa:10000,inc:'2025-10-15',ev:'2026-05-10',miss:0,docs:['id_dec','id_cl','proof'],conf:96},
{n:'Died in month 4',type:'death',chan:'Branch office',amt:5000,sa:5000,inc:'2026-06-01',ev:'2026-09-20',miss:0,docs:['id_dec','id_cl','proof'],conf:94},
{n:'Lapsed policy',type:'tpd',chan:'Branch office',amt:8000,sa:8000,inc:'2025-01-10',ev:'2026-08-01',miss:3,docs:['assess','id'],conf:92},
{n:'Hospital over limit',type:'hosp',chan:'Online portal',amt:300,sa:400,prior:200,inc:'2025-11-01',ev:'2026-08-15',miss:0,docs:['id','dis'],conf:93},
{n:'Missing discharge summary',type:'hosp',chan:'Online portal',amt:250,sa:500,inc:'2025-09-01',ev:'2026-09-01',miss:0,docs:['id'],conf:90},
{n:'Accident, day 185',type:'death',chan:'Branch office',amt:25000,sa:25000,inc:'2026-03-01',ev:'2026-09-02',miss:0,docs:['id_dec','id_cl','proof','police'],conf:88,f:{acc:true,ben:true}},
{n:'Reinstated, 90 days',type:'ci',chan:'Online portal',amt:12000,sa:15000,inc:'2024-02-01',ev:'2026-09-10',miss:3,rein:'2026-06-12',docs:['med','id'],conf:91},
{n:'Blurry scan',type:'ci',chan:'Branch office',amt:6000,sa:6000,inc:'2025-06-01',ev:'2026-06-01',miss:1,docs:['med','id'],conf:62,f:{name:true}}];
const ICON={fast:'✓',inc:'✉',std:'👁',esc:'⚑',no:'✕'};
let tab='res',cur=null,logTxt='';
const full=s=>({prior:0,rein:'',...s,f:{name:0,ben:0,dup:0,dx:0,acc:0,...(s.f||{})}});
function show(c){const r=evaluate(c);cur=r;
 $('pill').className='pill o-'+r.cls;$('pill').textContent=ICON[r.cls]+' '+r.outcome;
 const d1=(c.inc&&c.ev)?days(c.inc,c.ev):null;let bar='';
 if(d1!==null){const pc=Math.max(0,Math.min(100,d1/180*100));bar=`<div class="bar"><div class="${d1>=180?'ok':'bad'}" style="width:${pc}%"></div></div><div class="hint">${Math.max(d1,0)} of 180 waiting days served at the event date</div>`}
 $('res').innerHTML=`<div class="ban o-${r.cls}"><b>${ICON[r.cls]} ${r.outcome}</b><span>${r.action}</span></div>${bar}`;
 const row=x=>`<div class="ch"><span class="ic ${x.s[0]}">${{pass:'✓',fail:'✕',warn:'!'}[x.s]}</span><div><small>${x.r}</small>${x.m}</div></div>`;
 r.html={res:`<div class="grp" style="margin-top:0">Policy rules</div>`+r.checks.filter(x=>x.r[0]==='R').map(row).join('')+`<div class="grp">AI document checks</div>`+r.checks.filter(x=>x.r[0]==='A').map(row).join(''),
 msg:r.msg?`<div class="msg">${r.msg}</div><button class="b s" id="cp" type="button">Copy message</button>`:`<p class="hint">No message needed for this outcome. The claim goes to the officer queue.</p>`};
 logTxt=JSON.stringify({timestamp:new Date().toISOString(),channel:c.chan,claim_type:c.type,inputs:{claimed:c.amt,cover:c.sa,inception:c.inc,event:c.ev,missed_months:c.miss,reinstated:c.rein||null,docs:c.docs,ocr_confidence:c.conf},rules_fired:r.checks.filter(x=>x.s!=='pass').map(x=>x.r),outcome:r.outcome,human_review_required:true},null,1);
 draw()}
function draw(){const t=$('tab');
 if(tab==='log')t.innerHTML=`<pre>${logTxt}</pre>`;
 else if(tab==='all')t.innerHTML=`<p class="hint">Tap a row to load it.</p><table><tr><th>Scenario</th><th>Outcome</th></tr>`+S.map((s,i)=>{const o=evaluate(full(s));return`<tr class="cl" data-i="${i}"><td>${s.n}</td><td><span class="pill o-${o.cls}">${o.outcome}</span></td></tr>`}).join('')+`</table>`;
 else{t.innerHTML=cur.html[tab];const b=$('cp');if(b)b.onclick=()=>{try{navigator.clipboard.writeText(cur.msg);b.textContent='Copied'}catch(e){b.textContent='Select and copy the text above'}}}
 document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab))}
function load(i){const s=S[i];$('type').value=s.type;renderDocs(s.docs);$('chan').value=s.chan;$('amt').value=s.amt;$('sa').value=s.sa;$('prior').value=s.prior||0;$('inc').value=s.inc;$('ev').value=s.ev;$('miss').value=s.miss;$('rein').value=s.rein||'';$('conf').value=s.conf;
 const f=s.f||{};['name','ben','dup','dx','acc'].forEach(k=>$('f_'+k).checked=!!f[k]);show(read())}
$('scn').innerHTML='<option value="">Custom claim (enter your own)</option>'+S.map((s,i)=>`<option value="${i}">${i+1}. ${s.n}</option>`).join('');
$('scn').onchange=e=>{if(e.target.value!=='')load(+e.target.value)};
$('type').addEventListener('change',()=>renderDocs([]));
document.querySelector('.form').addEventListener('input',e=>{if(e.target.id!=='scn'){$('scn').value=''}if(e.target.id!=='scn')show(read())});
document.querySelector('.form').addEventListener('change',e=>{if(e.target.id==='type'){$('scn').value='';show(read())}});
document.querySelector('.tabs').onclick=e=>{if(e.target.dataset.t){tab=e.target.dataset.t;draw()}};
$('tab').onclick=e=>{const tr=e.target.closest('tr.cl');if(tr){$('scn').value=tr.dataset.i;load(+tr.dataset.i);tab='res';draw();window.scrollTo({top:0,behavior:'smooth'})}};
$('scn').value='0';load(0);
