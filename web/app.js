/* Northstar: offline-only tracker. Amounts are entered by the user, not market feeds. */
(() => {
  'use strict';
  const DEFAULT = {
    version: 1, usdToSgd: 1.289416, goal: 500000, goalDate: '2028-01-04', rolex: false,
    // Public-safe default: keep personal balances out of hosted source code.
    items: [], history: []
  };
  const dom = id => document.getElementById(id);
  const native = false;
  let state, currentTab='overview';
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeText = input => String(input).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (n, digits=2) => 'S$' + Number(n || 0).toLocaleString('en-SG', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const abbrMoney = n => Number(n).toLocaleString('en-SG', {maximumFractionDigits:0});
  const asSgd = item => Number(item.amount) * (item.currency === 'USD' ? state.usdToSgd : 1);
  function totals() {
    const assets = state.items.filter(x=>x.kind==='asset').reduce((a,x)=>a+asSgd(x),0);
    const debts = state.items.filter(x=>x.kind==='debt').reduce((a,x)=>a+asSgd(x),0);
    return {assets,debts,net:assets-debts};
  }
  function sanitize(raw) {
    if (!raw || typeof raw!=='object' || !Array.isArray(raw.items)) throw new Error('Invalid backup file');
    const s = clone(DEFAULT);
    const rate = Number(raw.usdToSgd);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 99) throw new Error('Invalid currency rate');
    s.usdToSgd=rate;
    s.goal = Number(raw.goal);
    if (!Number.isFinite(s.goal) || s.goal < 1 || s.goal > 1e15) throw new Error('Invalid goal');
    s.goalDate = String(raw.goalDate || '').slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.goalDate) || Number.isNaN(new Date(s.goalDate+'T00:00:00').getTime())) throw new Error('Invalid target date');
    s.rolex=Boolean(raw.rolex);
    if (raw.items.length>300) throw new Error('Too many entries');
    s.items=raw.items.map((x,i)=>{
      const amount=Number(x.amount);
      if (!Number.isFinite(amount)||amount<0||amount>1e15) throw new Error('Invalid entry amount');
      const name=String(x.name||'').trim().slice(0,50);
      if (!name) throw new Error('Invalid entry name');
      return {id:String(x.id||'entry'+i).slice(0,80),name,amount,currency:x.currency==='USD'?'USD':'SGD',kind:x.kind==='debt'?'debt':'asset'};
    });
    s.history=(Array.isArray(raw.history)?raw.history:[]).slice(-2000).filter(x=>Number.isFinite(Number(x.value))&&!Number.isNaN(new Date(x.date).getTime())).map(x=>({date:new Date(x.date).toISOString(),value:Number(x.value)}));
    s.history.sort((a,b)=>new Date(a.date)-new Date(b.date));
    return s;
  }
  function read() {
    return window.NorthstarAccount.state ? sanitize(window.NorthstarAccount.state) : clone(DEFAULT);
  }
  function persist() {
    return window.NorthstarAccount.save(state).catch(() => {});
  }
  const todayKey = date => {
    const y=date.getFullYear();const m=String(date.getMonth()+1).padStart(2,'0');const d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`;
  };
  function recordSnapshot(force=false) {
    const now=new Date();const value=Number(totals().net.toFixed(2));const last=state.history[state.history.length-1];
    if(!force && last && todayKey(new Date(last.date))===todayKey(now)) last.value=value;
    else state.history.push({date:now.toISOString(),value});
    if(state.history.length>2000)state.history=state.history.slice(-2000);
  }
  function update() {recordSnapshot();persist();render();}
  function toast(message){const node=dom('toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000);}
  function goto(tab) {
    if(!['overview','holdings','history','goals'].includes(tab))return;
    currentTab=tab; const labels={overview:'OVERVIEW',holdings:'HOLDINGS',history:'PERFORMANCE',goals:'MILESTONES'};dom('top-tab-name').textContent=labels[tab];
    document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id===`view-${tab}`));
    document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));
    window.scrollTo(0,0);
    if(tab==='history') renderChart();
  }
  function iconFor(name,kind) {
    if(kind==='debt')return '↘';
    const n=name.toLowerCase();
    if(n.includes('bank'))return '▣';
    if(n.includes('cash'))return '◈';
    if(n.includes('pokemon')||n.includes('pokémon')||n.includes('card'))return '✧';
    if(n.includes('stock')||n.includes('cmc')||n.includes('invest'))return '↗';
    if(n.includes('receivable'))return '⇄';
    return '◆';
  }
  function row(item,editable=true){
    const amount=asSgd(item); const fmt=money(amount);
    return `<div class="asset-row"><div class="asset-ico" aria-hidden="true">${iconFor(item.name,item.kind)}</div><div class="asset-main"><strong>${safeText(item.name)}</strong><small>${item.currency==='USD'?`US$${Number(item.amount).toLocaleString('en-SG',{maximumFractionDigits:2})} · USD`:'Singapore dollars'}${item.kind==='debt'?' · Liability':''}</small></div><div class="asset-amount sensitive ${item.kind==='debt'?'negative':''}">${item.kind==='debt'?'−':''}${fmt}</div>${editable?`<button class="asset-edit" data-edit="${safeText(item.id)}" aria-label="Edit ${safeText(item.name)}">Edit</button>`:''}</div>`;
  }
  function daysUntil(dateStr) {
    const now=new Date(); const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const [y,m,d]=dateStr.split('-').map(Number);const target=new Date(y,m-1,d);
    return Math.ceil((target-start)/86400000);
  }
  function formatGoalDate(d){const [y,m,day]=d.split('-').map(Number);return new Date(y,m-1,day).toLocaleDateString('en-SG',{day:'numeric',month:'long',year:'numeric'});}
  function render(){
    const {assets,debts,net}=totals();const fraction=Math.max(0,Math.min(1,net/state.goal));const pct=(net/state.goal*100);const percent=Math.max(0,pct).toFixed(1)+'%';const remaining=Math.max(0,state.goal-net);
    dom('net-worth').textContent=money(net);dom('hero-sub').textContent=`Across ${state.items.filter(x=>x.kind==='asset').length} assets and ${state.items.filter(x=>x.kind==='debt').length} liabilities`;
    dom('hero-percent').textContent=percent;dom('hero-bar').style.width=fraction*100+'%';dom('hero-remaining').textContent=net>=state.goal?'Target reached! ✦':`${money(remaining,0)} to go`;
    dom('hero-date').textContent=formatGoalDate(state.goalDate).toUpperCase();dom('stat-goal-date').textContent='Until '+formatGoalDate(state.goalDate);
    dom('hero-target-label').textContent=money(state.goal,0);
    dom('goal-ring-pct').textContent=percent;
    dom('goal-ring').style.background=`conic-gradient(#cbfb81 0deg ${Math.round(fraction*360)}deg, #2a3933 ${Math.round(fraction*360)}deg 360deg)`;
    const remainingDays=daysUntil(state.goalDate);
    dom('pace-note').textContent=net>=state.goal?'Target reached. What a milestone!':remainingDays>0?`${money(remaining/remainingDays,0)} per day to close the gap.`:'Your goal date has passed. You can set a new one.';
    renderAllocation(assets);
    dom('total-assets').textContent=money(assets);dom('total-debts').textContent=money(debts);
    const days=daysUntil(state.goalDate);dom('days-left').textContent=days>0?`${days} days`:days===0?'Today!':`${Math.abs(days)} days ago`;
    dom('overview-holdings').innerHTML=[...state.items.filter(x=>x.kind==='asset')].sort((a,b)=>asSgd(b)-asSgd(a)).slice(0,5).map(x=>row(x,false)).join('');
    dom('rolex-status').textContent=state.rolex?'ACHIEVED':'IN PROGRESS';dom('watch-btn').textContent=state.rolex?'Mark as in progress':'Mark as achieved';
    dom('hold-assets').textContent=money(assets);dom('hold-debts').textContent=money(debts);dom('hold-net').textContent=money(net);
    dom('asset-rows').innerHTML=state.items.filter(x=>x.kind==='asset').map(x=>row(x)).join('');
    dom('debt-rows').innerHTML=state.items.filter(x=>x.kind==='debt').map(x=>row(x)).join('');
    dom('goal-target').textContent=money(state.goal,0);dom('goal-target-date').textContent=formatGoalDate(state.goalDate);
    dom('goal-bar').style.width=fraction*100+'%';dom('goal-pct').textContent=percent;dom('goal-gap').textContent=net>=state.goal?'Goal achieved':`${money(remaining,0)} remaining`;
    dom('goal-watch-status').textContent=state.rolex?'ACHIEVED':'IN PROGRESS';dom('toggle-rolex').textContent=state.rolex?'Mark as in progress':'Mark as achieved';
    dom('exchange-rate').value=state.usdToSgd;dom('goal-amount').value=state.goal;dom('goal-date').value=state.goalDate;
    dom('snapshot-rows').innerHTML=state.history.slice().reverse().map(x=>`<div class="snapshot-row"><div><strong class="sensitive">${money(x.value)}</strong><small>${new Date(x.date).toLocaleString('en-SG',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div><span class="tag">RECORDED</span></div>`).join('');
    dom('today-date').textContent=new Date().toLocaleDateString('en-SG',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    renderChart();
  }
  function renderAllocation(assets) {
    const colors=['#cafa83','#84bba5','#dcb880','#8c9ad1','#d99796'];
    const positive=state.items.filter(x=>x.kind==='asset'&&asSgd(x)>0).sort((a,b)=>asSgd(b)-asSgd(a));
    const top=positive.slice(0,4).map(x=>({name:x.name,value:asSgd(x)}));
    if(positive.length>4)top.push({name:'Other',value:positive.slice(4).reduce((sum,x)=>sum+asSgd(x),0)});
    if(assets<=0){dom('allocation-ring').style.background='#2a3933';dom('allocation-legend').innerHTML='<span style="color:#819a8a;font-size:11px;line-height:1.6">Add an asset to see your mix.</span>';return;}
    let cursor=0;const stops=[];
    top.forEach((item,i)=>{const end=cursor+(item.value/assets)*360;stops.push(`${colors[i]} ${cursor.toFixed(2)}deg ${end.toFixed(2)}deg`);cursor=end;});
    dom('allocation-ring').style.background=`conic-gradient(${stops.join(',')})`;
    dom('allocation-legend').innerHTML=top.map((item,i)=>`<div class="allocation-legend-row"><i style="background:${colors[i]}"></i><span title="${safeText(item.name)}">${safeText(item.name.length>16?item.name.slice(0,15)+'…':item.name)}</span><b>${(item.value/assets*100).toFixed(0)}%</b></div>`).join('');
  }
  function renderChart() {
    const node=dom('history-chart');const points=state.history;
    if(points.length<2){node.innerHTML='<div class="chart-empty">Your first data point is saved.<br>Make an update or log another snapshot to see the journey.</div>';return;}
    const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo)*.14||Math.max(1000,Math.abs(hi)*.08),min=lo-pad,max=hi+pad;
    const w=820,h=242,l=65,r=16,t=17,b=35,plotW=w-l-r,plotH=h-t-b;
    const x=i=>l+(i/(points.length-1))*plotW,y=v=>t+(1-(v-min)/(max-min))*plotH;
    const path=points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.value).toFixed(1)).join(' ');
    const area=path+` L${x(points.length-1)} ${t+plotH} L${x(0)} ${t+plotH} Z`;
    const grid=[0,1,2,3].map(i=>{const val=min+(max-min)*(1-i/3),py=t+i*plotH/3;return `<line x1="${l}" y1="${py}" x2="${w-r}" y2="${py}" stroke="#2b3b4d" stroke-dasharray="4 5"/><text x="${l-13}" y="${py+4}" text-anchor="end" fill="#8293a7" font-size="11">${val<0?'-':''}${Math.abs(val)>=1000?(Math.abs(val)/1000).toFixed(0)+'k':Math.abs(val).toFixed(0)}</text>`;}).join('');
    const first=new Date(points[0].date),last=new Date(points.at(-1).date);const dateFormat=d=>d.toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'2-digit'});
    node.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Net worth history from ${safeText(dateFormat(first))} to ${safeText(dateFormat(last))}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b9f58e" stop-opacity=".23"/><stop offset="100%" stop-color="#b9f58e" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#chart-fill)"/><path d="${path}" fill="none" stroke="#b9f58e" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/>${points.length<=120?points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="#b9f58e"/>`).join(''):''}<text x="${l}" y="${h-7}" fill="#8495a9" font-size="11">${safeText(dateFormat(first))}</text><text x="${w-r}" y="${h-7}" text-anchor="end" fill="#8495a9" font-size="11">${safeText(dateFormat(last))}</text></svg>`;
  }
  function openModal(id){dom(id).classList.add('open');dom(id).setAttribute('aria-hidden','false');}
  function closeModal(id){dom(id).classList.remove('open');dom(id).setAttribute('aria-hidden','true');}
  function openEntry(id){
    const item=state.items.find(x=>x.id===id);
    dom('entry-form').reset();dom('entry-id').value=item?.id||'';dom('modal-title').textContent=item?'Edit entry':'Add an entry';
    dom('entry-name').value=item?.name||'';dom('entry-amount').value=item?.amount??'';dom('entry-currency').value=item?.currency||'SGD';dom('entry-kind').value=item?.kind||'asset';dom('delete-entry').hidden=!item;
    openModal('entry-modal');
  }
  function saveEntry(event){
    event.preventDefault();const id=dom('entry-id').value;const name=dom('entry-name').value.trim();const amount=Number(dom('entry-amount').value);
    if(!name||!Number.isFinite(amount)||amount<0||amount>1e15){toast('Check the name and amount');return;}
    const item={id:id||('item-'+Date.now()+'-'+Math.floor(Math.random()*9999)),name:name.slice(0,50),amount,currency:dom('entry-currency').value,kind:dom('entry-kind').value};
    if(id){const i=state.items.findIndex(x=>x.id===id);if(i>=0)state.items[i]=item;else state.items.push(item);}else state.items.push(item);
    closeModal('entry-modal');update();toast(id?'Entry updated':'Entry added');
  }
  function downloadBackup(json){
    if(native && typeof window.AndroidBridge.shareBackup==='function'){window.AndroidBridge.shareBackup(json);return;}
    const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='northstar-backup-'+todayKey(new Date())+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function bind(){
    document.querySelectorAll('[data-tab]').forEach(n=>n.addEventListener('click',()=>goto(n.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach(n=>n.addEventListener('click',()=>goto(n.dataset.goto)));
    ['add-top','add-holdings','add-fab'].forEach(id=>dom(id).addEventListener('click',()=>openEntry(null)));
    document.addEventListener('click',e=>{const target=e.target.closest('[data-edit]');if(target)openEntry(target.dataset.edit);const closer=e.target.closest('[data-close]');if(closer)closeModal(closer.dataset.close);});
    dom('entry-form').addEventListener('submit',saveEntry);
    dom('delete-entry').addEventListener('click',()=>{const id=dom('entry-id').value;state.items=state.items.filter(x=>x.id!==id);closeModal('entry-modal');update();toast('Entry removed');});
    dom('settings-btn').addEventListener('click',()=>openModal('settings-modal'));
    dom('privacy-btn').addEventListener('click',()=>{const on=document.body.classList.toggle('privacy-on');dom('privacy-btn').setAttribute('aria-pressed',String(on));dom('privacy-btn').setAttribute('aria-label',on?'Reveal amounts':'Hide amounts');});
    dom('rate-form').addEventListener('submit',e=>{e.preventDefault();const rate=Number(dom('exchange-rate').value);if(!Number.isFinite(rate)||rate<=0||rate>99)return toast('Enter a valid exchange rate');state.usdToSgd=rate;closeModal('settings-modal');update();toast('Exchange rate updated');});
    dom('snapshot-btn').addEventListener('click',()=>{recordSnapshot(true);persist();render();toast('Snapshot recorded');});
    const toggle=()=>{state.rolex=!state.rolex;persist();render();toast(state.rolex?'Rolex milestone achieved!':'Rolex milestone reset');};
    dom('toggle-rolex').addEventListener('click',toggle);dom('watch-btn').addEventListener('click',toggle);
    dom('edit-goal').addEventListener('click',()=>openModal('goal-modal'));
    dom('goal-form').addEventListener('submit',e=>{e.preventDefault();const goal=Number(dom('goal-amount').value),date=dom('goal-date').value;if(!Number.isFinite(goal)||goal<1||!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('Enter a valid target');state.goal=goal;state.goalDate=date;closeModal('goal-modal');persist();render();toast('Goal updated');});
    dom('export-btn').addEventListener('click',async()=>{try{downloadBackup(JSON.stringify(await window.NorthstarAccount.export(state)));toast('Encrypted backup downloaded');}catch{toast('Could not export backup');}});
    dom('import-btn').addEventListener('click',()=>dom('import-file').click());
    dom('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text());const imported=sanitize(await window.NorthstarAccount.import(raw));if(!confirm('Replace all current Northstar data with this backup?'))return;state=imported;persist();render();closeModal('settings-modal');toast('Backup restored');}catch(err){toast('Could not import: '+err.message);}finally{e.target.value='';}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-shell.open').forEach(n=>closeModal(n.id));});
  }
  window.addEventListener('northstar-unlocked',()=>{state=read();bind();render();goto(currentTab);persist();},{once:true});
  window.addEventListener('northstar-retry-sync',()=>{if(state)persist();});
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
})();
