import './style.css';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', {maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const blank = {products:[], sales:[], expenses:[]};
let db;
try {
  // Preserve the existing app's database keys and record format.
  db = JSON.parse(localStorage.getItem('supelike_db_v2') || 'null')
    || JSON.parse(localStorage.getItem('supelike_db') || 'null') || structuredClone(blank);
} catch { db = structuredClone(blank); }
db.products = Array.isArray(db.products) ? db.products : [];
db.sales = Array.isArray(db.sales) ? db.sales : [];
db.expenses = Array.isArray(db.expenses) ? db.expenses : [];
let tab = 'dashboard';
let formMode = 'sale';
let stockFilter = 'all';
let stockQuery = '';
let historyRange = 'month';
let historyKind = 'sales';
let historyQuery = '';
let editingProductId = null;
let productPhoto = '';

const save = () => {
  const snapshot = JSON.stringify(db);
  localStorage.setItem('supelike_db_v2', snapshot);
  localStorage.setItem('supelike_db', snapshot);
};
const total = arr => arr.reduce((sum, x) => sum + Number(x.total ?? x.amount ?? 0), 0);
const product = id => db.products.find(p => Number(p.id) === Number(id));
const monthKey = d => String(d || '').slice(0,7);
const thisMonth = () => monthKey(today());
const monthSales = () => db.sales.filter(s => monthKey(s.date) === thisMonth());
const monthExpenses = () => db.expenses.filter(e => monthKey(e.date) === thisMonth());
const saleProfit = s => Number(s.profit ?? (Number(s.total||0) - Number(s.unitCost||0)*Number(s.qty||0)));
const expenseTotal = arr => arr.reduce((a,e)=>a+Number(e.amount||0),0);
const dateLabel = d => {
  if (!d) return 'No date';
  const x = new Date(`${d}T12:00:00`);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
};
const notify = message => {
  const el = $('#toast');
  if (!el) { alert(message); return; }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>el.classList.remove('show'), 2500);
};
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const exportJSON = () => downloadBlob(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),'supelike-shop-backup.json');
const csvCell = x => `"${String(x ?? '').replace(/"/g,'""')}"`;
const exportSalesCSV = rows => {
  const data = [['Date','Product','Quantity','Sale total','Unit cost at sale','Profit','Customer','Payment method'],
    ...rows.map(s=>[s.date,s.productName,s.qty,s.total,s.unitCost,saleProfit(s),s.customer,s.payment])];
  downloadBlob(new Blob([data.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'supelike-sales-history.csv');
};
const exportExpensesCSV = rows => {
  const data = [['Date','Category / Details','Amount'],...rows.map(e=>[e.date,e.name,e.amount])];
  downloadBlob(new Blob([data.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'supelike-expenses.csv');
};

function appShell() {
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="brand-mark">S</div>
      <div class="brand-copy"><strong>supelike studios</strong><span>SHOP MANAGER</span></div>
      <button id="backupButton" class="backup-button" aria-label="Backup and restore data"><span class="backup-dot"></span> Backup ▾</button><input id="restoreInput" type="file" accept="application/json,.json" hidden>
    </header>
    <main id="view" aria-live="polite"></main>
    <nav class="bottom-nav" aria-label="Main navigation">
      ${[
        ['dashboard','⌂','Home'],
        ['sales','↗','Sales'],
        ['add','＋','Add'],
        ['stock','▦','Stock'],
        ['history','◷','History']
      ].map(([key,icon,label])=>`<button class="nav-item" data-tab="${key}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}
    </nav>
    <div id="toast" role="status" class="toast"></div>
  `;
  $('#backupButton').onclick = showBackupMenu;
  $$('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  render();
}

function showBackupMenu() {
  const old = $('#backupMenu');
  if (old) { old.remove(); return; }
  const menu = document.createElement('div');
  menu.id = 'backupMenu';
  menu.className = 'backup-menu';
  menu.innerHTML = `<button id="exportBackupMenu">↓ Export backup (JSON)</button><button id="restoreBackupMenu">↑ Restore backup (JSON)</button><p>Export a backup before reinstalling or updating the app.</p>`;
  $('.topbar').appendChild(menu);
  $('#exportBackupMenu').onclick = () => { menu.remove(); exportJSON(); };
  $('#restoreBackupMenu').onclick = () => { menu.remove(); $('#restoreInput').click(); };
}

function setNav() {
  $$('[data-tab]').forEach(b=>{
    const active = b.dataset.tab === tab;
    b.classList.toggle('active',active);
    if(active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
}
function render() {
  setNav();
  const view = $('#view');
  const pages = {dashboard:dashboardView,sales:salesView,add:addView,stock:stockView,history:historyView};
  (pages[tab] || dashboardView)(view);
}
function pageHeading(eyebrow,title,subtitle='') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</div></div>`;
}
function dashboardView(v) {
  const ss = monthSales(), ee = monthExpenses();
  const salesTotal = total(ss), costs = expenseTotal(ee);
  const grossProfit = ss.reduce((n,s)=>n+saleProfit(s),0);
  const net = grossProfit - costs;
  const todaySales = db.sales.filter(s=>s.date===today());
  const todayExpenses = db.expenses.filter(e=>e.date===today());
  const todayRevenue = total(todaySales);
  const todayNet = todaySales.reduce((n,s)=>n+saleProfit(s),0)-expenseTotal(todayExpenses);
  const activeDays = new Set(ss.map(s=>s.date)).size;
  const ranked = {};
  db.sales.forEach(s=>{
    const name = s.productName || product(s.productId)?.name || 'Deleted product';
    ranked[name] ||= {qty:0,revenue:0,profit:0};
    ranked[name].qty += Number(s.qty||0);
    ranked[name].revenue += Number(s.total||0);
    ranked[name].profit += saleProfit(s);
  });
  const best = Object.entries(ranked).sort((a,b)=>b[1].qty-a[1].qty || b[1].revenue-a[1].revenue)[0];
  const low = db.products.filter(p=>Number(p.qty||0)<=Number(p.low??3)).sort((a,b)=>Number(a.qty)-Number(b.qty)).slice(0,3);
  const days = {};
  ss.forEach(s=>days[s.date]=(days[s.date]||0)+Number(s.total||0));
  const recentDays = Object.entries(days).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
  const max = Math.max(1,...recentDays.map(x=>x[1]));
  const monthName = new Date(`${thisMonth()}-15T12:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  v.innerHTML = `
    ${pageHeading('BUSINESS OVERVIEW', 'Dashboard', monthName)}
    <section class="hero-card">
      <div class="hero-top"><span class="hero-label">SALES THIS MONTH</span><span class="hero-pill">${ss.length} ${ss.length===1?'sale':'sales'}</span></div>
      <div class="hero-number">${money(salesTotal)}</div>
      <div class="hero-bottom"><span>Estimated net profit</span><strong class="${net>=0?'positive':'negative'}">${money(net)}</strong></div>
      <div class="hero-track"><span style="width:${salesTotal?Math.max(6,Math.min(100,Math.max(0,net)/Math.max(1,salesTotal)*100)):0}%"></span></div>
      <small class="hero-footnote">Sale profit estimate less recorded expenses</small>
    </section>
    <div class="metric-grid">
      <article class="metric-card"><span class="metric-icon blue">↗</span><span class="metric-label">Today's sales</span><strong>${money(todayRevenue)}</strong><small>${todaySales.length} transactions</small></article>
      <article class="metric-card"><span class="metric-icon green">⌁</span><span class="metric-label">Today's profit*</span><strong class="positive">${money(todayNet)}</strong><small>After today's expenses</small></article>
      <article class="metric-card"><span class="metric-icon amber">−</span><span class="metric-label">Month expenses</span><strong class="negative">${money(costs)}</strong><small>${ee.length} entries</small></article>
      <article class="metric-card"><span class="metric-icon violet">▦</span><span class="metric-label">Stock on hand</span><strong>${db.products.reduce((n,p)=>n+Number(p.qty||0),0)}</strong><small>${db.products.length} products</small></article>
    </div>
    <div class="section-head"><div><div class="eyebrow">AT A GLANCE</div><h2>Sales trend</h2></div><button class="text-action" id="openHistory">View history <span>→</span></button></div>
    <section class="surface chart-surface">
      ${recentDays.length?`<div class="chart-bars">${recentDays.map(([d,n])=>`<div class="chart-column"><div class="chart-value">${n>=1000?(n/1000).toFixed(1)+'k':Math.round(n)}</div><div class="chart-bar-track"><span style="height:${Math.max(5,n/max*100)}%"></span></div><small>${d.slice(8)}</small></div>`).join('')}</div><div class="chart-caption"><span>Last 7 active days</span><span>Revenue · ₹</span></div>`:`<div class="empty-state compact"><div class="empty-icon">↗</div><strong>Your sales trend will appear here</strong><p>Record your first sale to start tracking performance.</p></div>`}
    </section>
    <div class="section-head"><div><div class="eyebrow">PERFORMANCE</div><h2>Best-selling product</h2></div></div>
    <section class="surface best-card">
      ${best?`<div class="best-rank">1</div><div class="best-copy"><strong>${esc(best[0])}</strong><span>${best[1].qty} units sold · ${money(best[1].revenue)} revenue</span></div><div class="best-value"><strong>${money(best[1].profit)}</strong><small>profit</small></div>`:`<div class="empty-state compact"><div class="empty-icon">★</div><strong>No sales yet</strong><p>Your top product will appear after a sale.</p></div>`}
    </section>
    <div class="section-head"><div><div class="eyebrow">INVENTORY</div><h2>Stock attention</h2></div><button class="text-action" id="openStock">View stock <span>→</span></button></div>
    <section class="surface low-stock-list">
      ${low.length?low.map(p=>`<div class="mini-product"><div class="mini-product-icon">${p.image?`<img src="${p.image}" alt="">`:'▦'}</div><div class="mini-product-copy"><strong>${esc(p.name)}</strong><small>ID ${esc(p.id)} · ${money(p.price)} selling price</small></div><span class="stock-badge ${Number(p.qty)<=0?'out':''}">${Number(p.qty)<=0?'Out of stock':`${p.qty} left`}</span></div>`).join(''):`<div class="empty-state compact"><div class="empty-icon">✓</div><strong>Stock looks good</strong><p>No products are at or below their alert level.</p></div>`}
    </section>
    <div class="quick-actions"><button class="quick-action" id="quickSale"><span>＋</span><strong>Record sale</strong></button><button class="quick-action" id="quickExpense"><span>−</span><strong>Add expense</strong></button><button class="quick-action" id="quickProduct"><span>▦</span><strong>Add product</strong></button></div>
    <p class="footnote">*Profit is an estimate based on saved cost at the time of sale. Tax is stored but is not automatically calculated. Back up your data regularly.</p>
  `;
  $('#openHistory').onclick=()=>{tab='history';historyKind='sales';render();};
  $('#openStock').onclick=()=>{tab='stock';render();};
  $('#quickSale').onclick=()=>{tab='sales';formMode='sale';render();};
  $('#quickExpense').onclick=()=>{tab='sales';formMode='expense';render();};
  $('#quickProduct').onclick=()=>{tab='add';editingProductId=null;render();};
}
function addView(v) {
  const p = editingProductId===null?null:product(editingProductId);
  productPhoto = p?.image || '';
  const id = p?.id ?? Math.max(0,...db.products.map(x=>Number(x.id)||0))+1;
  v.innerHTML = `
    ${pageHeading('INVENTORY',p?'Edit product':'Add product','Keep your product list and stock levels up to date.')}
    <section class="surface form-surface">
      <div class="photo-picker-row"><div class="product-photo-preview" id="photoPreview">${productPhoto?`<img src="${productPhoto}" alt="Product photo">`:'▦'}</div><div><strong>Product photo</strong><p>Optional · JPG or PNG</p><label class="upload-link" for="photoInput">Choose image</label><input id="photoInput" type="file" accept="image/*" hidden></div></div>
      <form id="productForm">
        <label for="pname">Product name <em>*</em></label><input class="field" id="pname" required maxlength="100" value="${esc(p?.name||'')}" placeholder="e.g. Rudraksha mala">
        <div class="form-grid"><div><label>Product ID</label><input class="field readonly" value="${esc(id)}" readonly></div><div><label for="size">Size / variant</label><input class="field" id="size" maxlength="60" value="${esc(p?.size||'')}" placeholder="Optional"></div></div>
        <div class="form-grid"><div><label for="qty">Quantity in stock <em>*</em></label><input class="field" id="qty" type="number" min="0" step="1" required value="${p?.qty??1}"></div><div><label for="low">Low-stock alert at</label><input class="field" id="low" type="number" min="0" step="1" value="${p?.low??3}"></div></div>
        <div class="form-grid"><div><label for="cost">Cost price (₹) <em>*</em></label><input class="field" id="cost" type="number" min="0" step=".01" required value="${p?.cost??''}" placeholder="0.00"></div><div><label for="price">Selling price (₹) <em>*</em></label><input class="field" id="price" type="number" min="0" step=".01" required value="${p?.price??''}" placeholder="0.00"></div></div>
        <label for="tax">Tax percentage (informational)</label><input class="field" id="tax" type="number" min="0" max="100" step=".01" value="${p?.tax??0}">
        <button class="primary-button" type="submit">${p?'Save product changes':'Save product'}</button>
        ${p?'<button class="danger-button" id="deleteProduct" type="button">Delete product</button>':''}
      </form>
    </section>`;
  $('#photoInput').onchange=e=>{
    const f=e.target.files?.[0]; if(!f)return;
    if(f.size>3*1024*1024){notify('Choose an image under 3 MB.');return;}
    const r=new FileReader();r.onload=()=>{productPhoto=r.result;$('#photoPreview').innerHTML=`<img src="${productPhoto}" alt="Product photo">`;};r.readAsDataURL(f);
  };
  $('#productForm').onsubmit=e=>{
    e.preventDefault();
    const item={id:Number(id),name:$('#pname').value.trim(),qty:Number($('#qty').value),low:Number($('#low').value||3),cost:Number($('#cost').value),price:Number($('#price').value),tax:Number($('#tax').value||0),size:$('#size').value.trim(),image:productPhoto};
    if(!item.name||item.qty<0||item.cost<0||item.price<0){notify('Check the product details.');return;}
    if(p) Object.assign(p,item); else db.products.push(item);
    save();editingProductId=null;tab='stock';render();notify(p?'Product updated':'Product saved');
  };
  if(p) $('#deleteProduct').onclick=()=>{
    if(confirm('Delete this product? Existing sales history will be kept.')){
      db.products=db.products.filter(x=>Number(x.id)!==Number(id));save();editingProductId=null;tab='stock';render();notify('Product deleted');
    }
  };
}
function stockView(v) {
  const arr=db.products.filter(p=>(`${p.name} ${p.id} ${p.size||''}`).toLowerCase().includes(stockQuery.toLowerCase()))
    .filter(p=>stockFilter==='all'||stockFilter==='in'&&Number(p.qty)>Number(p.low??3)||stockFilter==='low'&&Number(p.qty)>0&&Number(p.qty)<=Number(p.low??3)||stockFilter==='out'&&Number(p.qty)<=0);
  const stockCost=db.products.reduce((s,p)=>s+Number(p.qty||0)*Number(p.cost||0),0);
  v.innerHTML=`
    ${pageHeading('PRODUCTS & INVENTORY','Stock','Manage products, prices and available quantities.')}
    <section class="stock-summary"><div><span class="summary-label">TOTAL STOCK COST</span><strong>${money(stockCost)}</strong><small>${db.products.length} products · ${db.products.reduce((s,p)=>s+Number(p.qty||0),0)} units</small></div><div class="stock-summary-icon">▦</div></section>
    <div class="search-row"><div class="search-field"><span>⌕</span><input id="stockSearch" aria-label="Search products" placeholder="Search name, ID or size" value="${esc(stockQuery)}"></div><button id="sortStock" class="square-button" aria-label="Sort products">↕</button></div>
    <div class="filter-pills">${[['all','All',db.products.length],['in','In stock',db.products.filter(p=>Number(p.qty)>Number(p.low??3)).length],['low','Low stock',db.products.filter(p=>Number(p.qty)>0&&Number(p.qty)<=Number(p.low??3)).length],['out','Out',db.products.filter(p=>Number(p.qty)<=0).length]].map(([k,l,n])=>`<button class="filter-pill ${stockFilter===k?'selected':''}" data-stock-filter="${k}">${l} <span>${n}</span></button>`).join('')}</div>
    <div class="product-list">${arr.map(p=>`<article class="product-row"><div class="product-thumb">${p.image?`<img src="${p.image}" alt="">`:'▦'}</div><div class="product-details"><div class="product-meta">#${esc(p.id)}${p.size?` · ${esc(p.size)}`:''}</div><strong>${esc(p.name)}</strong><p>Cost ${money(p.cost)} <span>·</span> Sell ${money(p.price)}</p></div><div class="quantity-status"><strong class="${Number(p.qty)<=0?'negative':Number(p.qty)<=Number(p.low??3)?'warning':''}">${Number(p.qty||0)}</strong><small>${Number(p.qty)<=0?'OUT':Number(p.qty)<=Number(p.low??3)?'LOW STOCK':'IN STOCK'}</small></div><button class="row-chevron" data-edit-product="${p.id}" aria-label="Edit ${esc(p.name)}">›</button></article>`).join('')||'<div class="empty-state"><div class="empty-icon">▦</div><strong>No products found</strong><p>Try another search or add a product.</p></div>'}</div>
    <button class="primary-button" id="addProductBottom">＋ Add a product</button>`;
  $('#stockSearch').oninput=e=>{stockQuery=e.target.value;const start=e.target.selectionStart;stockView(v);$('#stockSearch').focus();$('#stockSearch').setSelectionRange(start,start);};
  $$('[data-stock-filter]').forEach(b=>b.onclick=()=>{stockFilter=b.dataset.stockFilter;stockView(v);});
  $$('[data-edit-product]').forEach(b=>b.onclick=()=>{editingProductId=Number(b.dataset.editProduct);tab='add';render();});
  $('#sortStock').onclick=()=>{db.products.sort((a,b)=>String(a.name).localeCompare(String(b.name)));stockView(v);};
  $('#addProductBottom').onclick=()=>{editingProductId=null;tab='add';render();};
}
function salesView(v) {
  const todays=db.sales.filter(s=>s.date===today());
  v.innerHTML=`
    ${pageHeading('DAILY OPERATIONS','Sales & expenses','Record each transaction so your reports stay accurate.')}
    <div class="mini-overview"><div><span>Today's sales</span><strong>${money(total(todays))}</strong></div><div><span>Today's expenses</span><strong class="negative">${money(expenseTotal(db.expenses.filter(e=>e.date===today())))}</strong></div></div>
    <div class="segmented-control"><button id="saleMode" class="${formMode==='sale'?'selected':''}">＋ Record sale</button><button id="expenseMode" class="${formMode==='expense'?'selected':''}">− Add expense</button></div>
    <section class="surface form-surface" id="transactionFormSurface"></section>
    <button class="outline-button" id="goHistory">View transaction history <span>→</span></button>`;
  $('#saleMode').onclick=()=>{formMode='sale';salesView(v);};
  $('#expenseMode').onclick=()=>{formMode='expense';salesView(v);};
  $('#goHistory').onclick=()=>{tab='history';historyKind=formMode==='expense'?'expenses':'sales';render();};
  const form=$('#transactionFormSurface');
  if(formMode==='sale') {
    form.innerHTML=`
      <div class="form-title"><span class="form-title-icon blue">↗</span><div><h2>Record a sale</h2><p>Stock is reduced when the sale is saved.</p></div></div>
      <form id="saleForm">
        <label for="saleProduct">Product <em>*</em></label><select class="field" id="saleProduct" required><option value="">Choose a product</option>${db.products.map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.qty} left · ${money(p.price)}</option>`).join('')}</select>
        <div class="form-grid"><div><label for="saleQty">Quantity <em>*</em></label><input class="field" id="saleQty" type="number" min="1" step="1" value="1" required></div><div><label for="saleTotal">Total sale (₹) <em>*</em></label><input class="field" id="saleTotal" type="number" min="0" step=".01" required placeholder="0.00"></div></div>
        <div class="price-hint" id="priceHint">Choose a product to calculate the suggested total.</div>
        <label for="saleCustomer">Customer name</label><input class="field" id="saleCustomer" maxlength="100" placeholder="Optional">
        <div class="form-grid"><div><label for="saleDate">Sale date <em>*</em></label><input class="field" id="saleDate" type="date" value="${today()}" required></div><div><label for="salePayment">Payment method</label><select class="field" id="salePayment"><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option><option>Other</option></select></div></div>
        <button class="primary-button" type="submit">Save sale</button>
      </form>`;
    const calc=()=>{
      const p=product($('#saleProduct').value),q=Math.max(1,Number($('#saleQty').value||1));
      if(p){$('#saleTotal').value=(Number(p.price)*q).toFixed(2);$('#priceHint').textContent=`List price ${money(p.price)} each · ${p.qty} available · estimated cost ${money(Number(p.cost)*q)}`;}
      else $('#priceHint').textContent='Choose a product to calculate the suggested total.';
    };
    $('#saleProduct').onchange=calc;$('#saleQty').oninput=calc;
    $('#saleForm').onsubmit=e=>{
      e.preventDefault();
      const p=product($('#saleProduct').value),q=Number($('#saleQty').value),t=Number($('#saleTotal').value);
      if(!p){notify('Choose a product first.');return;}
      if(!Number.isInteger(q)||q<1||q>Number(p.qty)){notify('Quantity exceeds available stock.');return;}
      if(!Number.isFinite(t)||t<0){notify('Enter a valid sale total.');return;}
      const record={id:Date.now(),productId:p.id,productName:p.name,qty:q,total:t,profit:t-Number(p.cost||0)*q,customer:$('#saleCustomer').value.trim(),date:$('#saleDate').value,payment:$('#salePayment').value,unitCost:Number(p.cost||0)};
      db.sales.push(record);p.qty=Number(p.qty)-q;save();salesView(v);notify('Sale saved and stock updated.');
    };
  } else {
    form.innerHTML=`
      <div class="form-title"><span class="form-title-icon coral">−</span><div><h2>Record an expense</h2><p>Track shop costs for more useful net-profit reports.</p></div></div>
      <form id="expenseForm">
        <label for="expenseName">Category / details <em>*</em></label><input class="field" id="expenseName" required maxlength="120" placeholder="e.g. Transport, rent, packaging">
        <div class="form-grid"><div><label for="expenseAmount">Amount (₹) <em>*</em></label><input class="field" id="expenseAmount" type="number" min=".01" step=".01" required placeholder="0.00"></div><div><label for="expenseDate">Date <em>*</em></label><input class="field" id="expenseDate" type="date" value="${today()}" required></div></div>
        <label for="expenseNote">Notes</label><textarea class="field textarea" id="expenseNote" rows="3" maxlength="300" placeholder="Optional details"></textarea>
        <button class="primary-button" type="submit">Save expense</button>
      </form>`;
    $('#expenseForm').onsubmit=e=>{
      e.preventDefault();
      const amount=Number($('#expenseAmount').value);
      if(!Number.isFinite(amount)||amount<=0){notify('Enter an expense greater than zero.');return;}
      db.expenses.push({id:Date.now(),name:$('#expenseName').value.trim(),amount,date:$('#expenseDate').value,note:$('#expenseNote').value.trim()});
      save();salesView(v);notify('Expense saved.');
    };
  }
}
function historyDates() {
  const t=today();
  if(historyRange==='today') return {start:t,end:t};
  if(historyRange==='7') return {start:new Date(Date.now()-6*86400000).toISOString().slice(0,10),end:t};
  if(historyRange==='month') return {start:`${thisMonth()}-01`,end:t};
  return {start:'0000-01-01',end:'9999-12-31'};
}
function historyView(v) {
  const {start,end}=historyDates();
  const ss=db.sales.filter(s=>s.date>=start&&s.date<=end&&(`${s.productName||''} ${s.customer||''} ${s.payment||''} ${s.date||''}`).toLowerCase().includes(historyQuery.toLowerCase())).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));
  const ee=db.expenses.filter(e=>e.date>=start&&e.date<=end&&(`${e.name||''} ${e.note||''} ${e.date||''}`).toLowerCase().includes(historyQuery.toLowerCase())).sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id));
  const selected=historyKind==='sales'?ss:ee;
  v.innerHTML=`
    ${pageHeading('RECORDS','Transaction history','Search, filter and export recorded sales and expenses.')}
    <div class="range-pills">${[['today','Today'],['7','7 days'],['month','This month'],['all','All time']].map(([k,l])=>`<button class="range-pill ${historyRange===k?'selected':''}" data-range="${k}">${l}</button>`).join('')}</div>
    <div class="search-field history-search"><span>⌕</span><input id="historySearch" aria-label="Search history" placeholder="${historyKind==='sales'?'Search product, customer, payment':'Search category or notes'}" value="${esc(historyQuery)}"><button id="clearHistorySearch" aria-label="Clear search">×</button></div>
    <div class="history-summary-grid"><article><span>Sales</span><strong>${money(total(ss))}</strong><small>${ss.length} transactions</small></article><article><span>Expenses</span><strong class="negative">${money(expenseTotal(ee))}</strong><small>${ee.length} entries</small></article><article><span>Estimated net</span><strong class="${ss.reduce((n,s)=>n+saleProfit(s),0)-expenseTotal(ee)>=0?'positive':'negative'}">${money(ss.reduce((n,s)=>n+saleProfit(s),0)-expenseTotal(ee))}</strong><small>Selected period</small></article></div>
    <div class="segmented-control history-kind"><button id="historySales" class="${historyKind==='sales'?'selected':''}">Sales (${ss.length})</button><button id="historyExpenses" class="${historyKind==='expenses'?'selected':''}">Expenses (${ee.length})</button></div>
    <div class="history-list">${historyKind==='sales'?renderSalesHistory(selected):renderExpenseHistory(selected)}</div>
    <div class="export-row"><button id="exportVisible" class="outline-button">${historyKind==='sales'?'Export sales CSV':'Export expenses CSV'}</button><button id="exportBackup" class="outline-button">Full backup JSON</button></div>
    <p class="footnote">Deleting a sale record does not automatically restore stock. Export a backup before making bulk changes.</p>`;
  $$('[data-range]').forEach(b=>b.onclick=()=>{historyRange=b.dataset.range;historyView(v);});
  $('#historySearch').oninput=e=>{
    historyQuery=e.target.value;const pos=e.target.selectionStart;historyView(v);$('#historySearch').focus();$('#historySearch').setSelectionRange(pos,pos);
  };
  $('#clearHistorySearch').onclick=()=>{historyQuery='';historyView(v);};
  $('#historySales').onclick=()=>{historyKind='sales';historyView(v);};
  $('#historyExpenses').onclick=()=>{historyKind='expenses';historyView(v);};
  $('#exportVisible').onclick=()=>historyKind==='sales'?exportSalesCSV(ss):exportExpensesCSV(ee);
  $('#exportBackup').onclick=exportJSON;
  $$('[data-delete-sale]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.deleteSale);
    if(!confirm('Delete this sale record? Stock will not be changed automatically.'))return;
    db.sales=db.sales.filter(s=>Number(s.id)!==id);save();historyView(v);notify('Sale record deleted.');
  });
  $$('[data-delete-expense]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.deleteExpense);
    if(!confirm('Delete this expense record?'))return;
    db.expenses=db.expenses.filter(e=>Number(e.id)!==id);save();historyView(v);notify('Expense deleted.');
  });
}
function renderSalesHistory(rows) {
  return rows.map(s=>`<article class="history-row"><div class="history-icon sale-icon">↗</div><div class="history-main"><strong>${esc(s.productName||product(s.productId)?.name||'Deleted product')} × ${Number(s.qty||0)}</strong><span>${dateLabel(s.date)}${s.customer?' · '+esc(s.customer):''}</span><small>${esc(s.payment||'Payment not set')} · Profit ${money(saleProfit(s))}</small></div><div class="history-amount"><strong>${money(s.total)}</strong><button data-delete-sale="${Number(s.id)}" aria-label="Delete sale">Delete</button></div></article>`).join('')||'<div class="empty-state"><div class="empty-icon">◷</div><strong>No sales found</strong><p>Try another date range or record a sale.</p></div>';
}
function renderExpenseHistory(rows) {
  return rows.map(e=>`<article class="history-row"><div class="history-icon expense-icon">−</div><div class="history-main"><strong>${esc(e.name||'Expense')}</strong><span>${dateLabel(e.date)}</span>${e.note?`<small>${esc(e.note)}</small>`:''}</div><div class="history-amount"><strong class="negative">${money(e.amount)}</strong><button data-delete-expense="${Number(e.id)}" aria-label="Delete expense">Delete</button></div></article>`).join('')||'<div class="empty-state"><div class="empty-icon">−</div><strong>No expenses found</strong><p>Try another date range or add an expense.</p></div>';
}

appShell();
$('#restoreInput').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.sales) || !Array.isArray(parsed.expenses)) {
      throw new Error('This file is not a valid Supelike Shop Manager backup.');
    }
    if (!confirm(`Restore backup with ${parsed.products.length} products, ${parsed.sales.length} sales and ${parsed.expenses.length} expenses? This replaces the data currently on this device.`)) return;
    db = {products:parsed.products, sales:parsed.sales, expenses:parsed.expenses};
    save(); tab='dashboard'; render(); notify('Backup restored successfully.');
  } catch (err) {
    alert(err.message || 'Could not read this backup file.');
  } finally {
    e.target.value = '';
  }
});
