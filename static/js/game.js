/* ═══════════════════════════════════════════════════════════
   CAKE STORE MANAGER — Phase 2
   New: recipe shop with lock animations, waiter/manager
        cards, skill rarity badges, course system UI,
        Today's Guest order, bake time removed from cashiers
═══════════════════════════════════════════════════════════ */
'use strict';

let G            = {};
let pollTimer    = null;
let animFrame    = null;
let selectedOven = null;
const lockedWorkers = new Set();

// ── CSRF ──────────────────────────────────────────────────────────────────────
function getCsrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

const $ = id => document.getElementById(id);
const fmt = n => `$${Number(n).toFixed(2)}`;
const secsFrom = iso => iso ? Math.max(0, (new Date(iso) - Date.now()) / 1000) : 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

async function api(endpoint, body = null) {
  const opts = { headers: { 'Content-Type':'application/json','X-CSRFToken':getCsrf() } };
  if (body !== null) { opts.method='POST'; opts.body=JSON.stringify(body); }
  const res = await fetch(endpoint, opts);
  return res.json();
}

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function switchTab(groupId, tabId) {
  const panel = $(groupId).parentElement;
  panel.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId));
  panel.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === tabId));
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
(() => {
  const el = document.createElement('div');
  el.id = 'custom-tooltip';
  el.style.cssText = `position:fixed;z-index:9999;pointer-events:none;display:none;
    background:#1a1a2e;color:#eaeaea;font-size:0.75rem;line-height:1.5;
    padding:0.4rem 0.65rem;border-radius:6px;border:1px solid #2a2a4a;
    box-shadow:0 4px 16px rgba(0,0,0,0.5);max-width:240px;white-space:normal;`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  let mx=0,my=0;
  document.addEventListener('mousemove', e => { mx=e.clientX;my=e.clientY; if(el.style.display==='block')pos(); });
  function pos() {
    const r=el.getBoundingClientRect();
    el.style.left=(mx+12+r.width>window.innerWidth?mx-r.width-8:mx+12)+'px';
    el.style.top =(my+12+r.height>window.innerHeight?my-r.height-8:my+12)+'px';
  }
  document.addEventListener('mouseover',e=>{
    const t=e.target.closest('[data-tip]');
    if(!t){el.style.display='none';return;}
    el.textContent=t.dataset.tip; el.style.display='block'; pos();
  });
  document.addEventListener('mouseout',e=>{
    if(!e.target.closest('[data-tip]'))return; el.style.display='none';
  });
})();

// ── Animation loop ────────────────────────────────────────────────────────────
function startAnimationLoop() {
  if (animFrame) cancelAnimationFrame(animFrame);
  function loop() {
    G.orders?.forEach(o => {
      const bar=$(`otimer-${o.id}`), sec=$(`osec-${o.id}`);
      if (!bar&&!sec) return;
      const s=secsFrom(o.expires_at);
      const max=o.order_type==='bulk'?480:o.order_type==='urgent'?120:300;
      if(bar) bar.style.width=`${clamp(s/max*100,0,100)}%`;
      if(sec) sec.textContent=`⏱ ${Math.ceil(s)}s`;
    });
    G.baking?.forEach(c => {
      const bar=$(`bprog-${c.id}`),sec=$(`bsec-${c.id}`);
      if(!bar&&!sec) return;
      const s=secsFrom(c.bake_finish_at);
      const pct=c.bake_duration_sec>0?clamp(100-(s/c.bake_duration_sec)*100,0,100):100;
      if(bar) bar.style.width=`${pct}%`;
      if(sec) sec.textContent=`${Math.ceil(s)}s`;
    });
    G.ovens?.forEach(ov => {
      const c=ov.current_cake; if(!c) return;
      const bar=$(`oprog-${ov.id}`),sec=$(`osec2-${ov.id}`);
      if(!bar&&!sec) return;
      const s=secsFrom(c.bake_finish_at);
      const pct=c.bake_duration_sec>0?clamp(100-(s/c.bake_duration_sec)*100,0,100):100;
      if(bar) bar.style.width=`${pct}%`;
      if(sec) sec.textContent=`${Math.ceil(s)}s`;
    });
    animFrame = requestAnimationFrame(loop);
  }
  loop();
}

// ── Poll ──────────────────────────────────────────────────────────────────────
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, 500);
  poll();
  startAnimationLoop();
}

async function poll() {
  try {
    const tick  = await api('/api/tick/', {});
    handleEvents(tick.events);
    const state = await api('/api/state/');
    G = state;
    render();
  } catch(e) { console.error('Poll error',e); }
}

async function fetchState() {
  try { G = await api('/api/state/'); render(); }
  catch(e) { console.error(e); }
}

function handleEvents(events) {
  if (!events) return;
  events.newly_done?.forEach(c =>
    toast(`${c.emoji} ${c.name} (${c.size}) is ready!`,'success'));
  events.new_unlocks?.forEach(n =>
    toast(`🔓 Recipe available to buy: ${n}!`,'success'));
  events.level_ups?.filter(Boolean).forEach(lu => {
    toast(lu.new_star
      ? `🌟 ${lu.worker_name} → Level ${lu.level}, now ★${lu.skill_level}!`
      : `⬆️ ${lu.worker_name} reached Level ${lu.level}!`,'success');
  });
  events.courses_done?.forEach(cd => {
    toast(`🎓 ${cd.worker_name}'s skill upgraded to ${cd.new_rarity}!`,'success');
  });
  if (events.new_order) {
    const o=events.new_order;
    const d=o.quantity?`${o.quantity} whole`:`${o.pieces} slice(s)`;
    const i=o.order_type==='urgent'?'🔥':o.order_type==='bulk'?'📦':'🛎';
    const special=o.is_todays?' 👑 TODAY\'S GUEST':'';
    toast(`${i}${o.customer_icon||''} ${o.customer_name}${special} — ${d} of ${o.recipe_name}`,'info');
  }
}

function render() {
  if (!G.state) return;
  renderTopBar();
  renderEventBanner();
  renderOvens();
  renderBaking();
  renderInventory();
  renderOrders();
  renderStaff();
  renderUpgrades();
  renderRecipeShop();
  renderReportsTab();
  renderNotificationBadge();
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
function renderTopBar() {
  const s=G.state;
  $('tb-store').textContent    = s.store_name;
  $('tb-day').textContent      = `Day ${s.day}`;
  $('tb-money').textContent    = fmt(s.money);
  $('tb-rep-val').textContent  = `${s.reputation}/100`;
  $('tb-rep-fill').style.width      = `${s.reputation}%`;
  $('tb-rep-fill').style.background = s.reputation_color||'var(--green)';
  const t=$('tb-tier');
  if(t){t.textContent=s.reputation_tier||'';t.style.color=s.reputation_color||'';}
  const banner=$('store-banner');
  banner.textContent=s.is_open?'🟢 STORE OPEN':'🔴 STORE CLOSED';
  banner.className=`status-banner ${s.is_open?'open':'closed'}`;
  $('btn-open-store').disabled=s.is_open||!s.game_started;
  $('btn-end-day').disabled=!s.is_open;
}

function renderEventBanner() {
  const el=$('event-banner'), event=G.state?.active_event;
  if(!event||!el){if(el)el.style.display='none';return;}
  el.style.display='flex';
  el.className=`event-banner ${event.type||'info'}`;
  el.innerHTML=`<span class="event-icon">${event.icon}</span>
    <div class="event-text"><strong>${event.title}</strong><span>${event.msg}</span></div>
    ${event.id==='blogger'||event.id==='critic'
      ?`<span class="event-counter">${G.state.event_counter}/${event.id==='blogger'?5:10}</span>`:''}`;
}

// ── Ovens (smart diff) ────────────────────────────────────────────────────────
function renderOvens() {
  const el=$('panel-ovens');
  if (!G.ovens?.length) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">🔥</div>No ovens.</div>`;return;
  }
  const existing=new Set([...el.querySelectorAll('[data-oven-id]')].map(c=>parseInt(c.dataset.ovenId)));
  const incoming=new Set(G.ovens.map(o=>o.id));
  existing.forEach(id=>{ if(!incoming.has(id))$(`oven-card-${id}`)?.remove(); });

  G.ovens.forEach(ov => {
    const cake=ov.current_cake, baker=ov.baker;
    const bakerHtml=baker
      ? `<div class="oven-status" data-tip="Baker assigned — reduces bake time">👨‍🍳 ${baker.name} <span style="color:var(--muted);font-size:0.72rem">Lv.${baker.level}</span></div>`
      : `<div class="oven-status" style="color:var(--accent)" data-tip="No baker — no bake time reduction">No baker assigned</div>`;
    const innerHtml=ov.is_busy&&cake
      ? `<div class="oven-status">${cake.emoji} ${cake.recipe_name} (${cake.size}) — <span id="osec2-${ov.id}">${Math.ceil(secsFrom(cake.bake_finish_at))}s</span></div>
         <div class="progress-bar"><div class="progress-fill" id="oprog-${ov.id}" style="width:${cake.progress_pct}%;transition:width 0.5s linear"></div></div>`
      : `<div class="oven-status" style="color:var(--green)" data-tip="Ready — click Bake to start">Ready to bake</div>`;

    if (!existing.has(ov.id)) {
      const card=document.createElement('div');
      card.id=`oven-card-${ov.id}`; card.dataset.ovenId=ov.id;
      card.className=`oven-card ${ov.is_busy?'busy':'free'}`;
      card.innerHTML=`
        <div class="oven-title" data-tip="${ov.tier} oven ×${ov.speed_bonus} speed">
          🔥 ${ov.name} <span class="oven-badge ${ov.tier}">${ov.tier}</span>
          <span style="color:var(--muted);font-size:0.75rem">×${ov.speed_bonus}</span>
        </div>
        <div class="oven-baker-line">${bakerHtml}</div>
        <div class="oven-inner">${innerHtml}</div>
        <div class="oven-actions">
          ${!ov.is_busy?`<button class="btn btn-warning btn-sm" data-tip="Bake a cake in ${ov.name}" onclick="openBakeModal(${ov.id})">🍰 Bake</button>`:''}
        </div>`;
      el.appendChild(card);
    } else {
      const card=$(`oven-card-${ov.id}`); if(!card) return;
      card.className=`oven-card ${ov.is_busy?'busy':'free'}`;
      card.querySelector('.oven-baker-line').innerHTML=bakerHtml;
      card.querySelector('.oven-inner').innerHTML=innerHtml;
      const actions=card.querySelector('.oven-actions');
      const hasBtn=!!actions?.querySelector('button');
      if(!ov.is_busy&&!hasBtn&&actions)
        actions.innerHTML=`<button class="btn btn-warning btn-sm" data-tip="Bake a cake in ${ov.name}" onclick="openBakeModal(${ov.id})">🍰 Bake</button>`;
      else if(ov.is_busy&&hasBtn&&actions) actions.innerHTML='';
    }
  });
}

function renderBaking() {
  const el=$('panel-baking');
  if(!G.baking?.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">⏳</div>Nothing baking.</div>`;return;}
  const incoming=new Set(G.baking.map(c=>c.id));
  el.querySelectorAll('[data-bake-id]').forEach(card=>{ if(!incoming.has(parseInt(card.dataset.bakeId)))card.remove(); });
  G.baking.forEach(c=>{
    if($(`bake-item-${c.id}`)) return;
    const item=document.createElement('div');
    item.id=`bake-item-${c.id}`; item.dataset.bakeId=c.id; item.className='baking-item';
    item.innerHTML=`<div class="baking-top"><span>${c.emoji}</span>
      <span class="baking-name">${c.recipe_name} (${c.size})</span>
      <span class="baking-time" id="bsec-${c.id}">${Math.ceil(secsFrom(c.bake_finish_at))}s</span></div>
      <div class="progress-bar"><div class="progress-fill" id="bprog-${c.id}" style="width:${c.progress_pct}%;transition:width 0.5s linear"></div></div>`;
    el.appendChild(item);
  });
}

function renderInventory() {
  const el=$('panel-inventory');
  if(!G.inventory?.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎂</div>Shelf empty — bake something!</div>`;return;}
  const incoming=new Set(G.inventory.map(c=>c.id));
  el.querySelectorAll('[data-inv-id]').forEach(card=>{ if(!incoming.has(parseInt(card.dataset.invId)))card.remove(); });
  G.inventory.forEach(c=>{
    const dots=Array.from({length:c.total_slices},(_,i)=>`<div class="slice-dot ${i<c.remaining_slices?'used':''}"></div>`).join('');
    const freshLabel=c.is_fresh
      ?`<span style="font-size:0.7rem;color:var(--green)" data-tip="Fresh — baked today">✨ Fresh</span>`
      :`<span style="font-size:0.7rem;color:var(--muted)" data-tip="Stale — baked previously">🕒 Stale</span>`;
    const html=`<span class="inv-emoji">${c.emoji}</span>
      <div class="inv-info">
        <div class="inv-name">${c.recipe_name}</div>
        <div class="inv-meta">${c.size} · ${c.remaining_slices}/${c.total_slices} slices · ${fmt(c.slice_price)}/slice</div>
        <div class="slice-bar">${dots}</div>
      </div>${freshLabel}`;
    const existing=$(`inv-item-${c.id}`);
    if(!existing){
      const card=document.createElement('div');
      card.id=`inv-item-${c.id}`; card.dataset.invId=c.id;
      card.className=`inv-cake ${c.is_fresh?'fresh':'stale'}`;
      card.innerHTML=html; el.appendChild(card);
    } else { existing.className=`inv-cake ${c.is_fresh?'fresh':'stale'}`; existing.innerHTML=html; }
  });
}

function renderOrders() {
  const el=$('panel-orders');
  if(!G.orders?.length){
    el.innerHTML=G.state?.is_open
      ?`<div class="empty-state"><div class="empty-icon">🛎</div>Waiting for customers…</div>`
      :`<div class="empty-state"><div class="empty-icon">🔐</div>Open the store to get orders.</div>`;
    return;
  }
  const existing=new Set([...el.querySelectorAll('[data-order-id]')].map(c=>parseInt(c.dataset.orderId)));
  const incoming=new Set(G.orders.map(o=>o.id));
  existing.forEach(id=>{ if(!incoming.has(id))$(`order-card-${id}`)?.remove(); });
  G.orders.forEach(o=>{ if(!existing.has(o.id)) el.appendChild(buildOrderCard(o)); });
  if(el.querySelectorAll('[data-order-id]').length===0) G.orders.forEach(o=>el.appendChild(buildOrderCard(o)));
}

function buildOrderCard(o) {
  const div=document.createElement('div');
  const secs=secsFrom(o.expires_at);
  const max=o.order_type==='bulk'?480:o.order_type==='urgent'?120:300;
  const pct=clamp(secs/max*100,0,100);
  const color=secs>120?'var(--green)':secs>60?'var(--accent2)':'var(--accent)';
  const desc=o.quantity?`${o.quantity} whole cake${o.quantity>1?'s':''}`:`${o.pieces} slice(s)`;
  const isTodays=o.is_todays||o.customer_type==='todays';
  const typeTag=o.order_type==='urgent'
    ?`<span class="order-type-tag urgent" data-tip="Urgent — pays ×1.5, expires fast">🔥 URGENT</span>`
    :o.order_type==='bulk'?`<span class="order-type-tag bulk" data-tip="Bulk — pays ×1.2">📦 BULK</span>`:'';
  const todaysTag=isTodays?`<span class="order-type-tag todays" data-tip="Today's Guest — serve perfectly for ×3 reputation!">👑 TODAY'S GUEST</span>`:'';
  const ctipMap={
    standard:'Regular customer',impatient:'Impatient — expires fast, pays 20% more',
    patient:'Patient — plenty of time',picky:'Picky — MUST be fresh',
    bulk_buyer:'Bulk buyer',vip:"VIP — pays ×2, tips generously. Don't fail them!",
    regular:'Regular — returns daily, tips if consistent',
    inspector:'Inspector — stale cake = −15 reputation',
    critic:'Critic — can post bad reviews',
    todays:"Today's Guest — ×3 reputation on success OR failure!",
  };
  const cicon=o.customer_icon?`<span class="ctype-icon" data-tip="${ctipMap[o.customer_type]||''}">${o.customer_icon}</span>`:'';

  div.id=`order-card-${o.id}`; div.dataset.orderId=o.id;
  div.className=`order-card${isTodays?' todays-order':''}`;
  div.innerHTML=`
    <div class="order-timer" id="otimer-${o.id}" style="width:${pct}%;background:${color}"></div>
    <div class="order-top">
      <span class="order-emoji">${o.emoji}</span>
      <div class="order-info">
        <div class="order-customer">${cicon} ${o.customer_name} ${typeTag}${todaysTag}</div>
        <div class="order-detail">${desc} · ${o.recipe_name} (${o.size})</div>
        ${o.want_fresh?'<div class="order-fresh" data-tip="Must be baked today">⭐ Wants fresh</div>':''}
        <div class="order-detail" id="osec-${o.id}">⏱ ${Math.ceil(secs)}s</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
        <div class="order-revenue">${fmt(o.revenue)}</div>
        <button class="btn btn-success btn-sm" data-tip="Serve ${o.customer_name}'s order"
                onclick="fulfillOrder(${o.id},this)">Fulfill ✓</button>
      </div>
    </div>`;
  return div;
}

// ═══════════════════════════════════════════════════════════
//  STAFF PANEL
//  Phase 2: waiter + manager cards, skill rarity badges,
//  course button, bake UI hidden for cashiers
// ═══════════════════════════════════════════════════════════
const AVATAR_COLORS=[
  ['#e94560','#fff'],['#f5a623','#000'],['#2ecc71','#000'],
  ['#3498db','#fff'],['#9b59b6','#fff'],['#1abc9c','#000'],
  ['#e67e22','#000'],['#e91e8c','#fff'],['#1abc9c','#fff'],['#e74c3c','#fff'],
];

function workerRoleIcon(role){
  return {baker:'👨‍🍳',cashier:'💳',waiter:'🍽️',manager:'📋'}[role]||'👤';
}

function skillRarityBadge(si) {
  if (!si) return '';
  const neg = si.negative ? ' data-tip="⚠️ Negative skill — this has a downside!"' : '';
  return `<span class="skill-rarity-badge" style="background:${si.rarity_color}22;color:${si.rarity_color};border:1px solid ${si.rarity_color}44;"
    data-tip="${si.rarity_label}: ${si.desc}"${neg}>
    ${si.rarity_label} · ${si.name}${si.negative?' ⚠️':''}
  </span>`;
}

function buildWorkerCard(w, recipeOpts, ovenOpts) {
  const stars=Array.from({length:3},(_,i)=>
    `<span style="color:${i<w.skill_level?'var(--accent2)':'var(--border)'}">★</span>`).join('');
  const sizeMap={1:'Small',2:'S+M',3:'All'};
  const [bg,fg]=AVATAR_COLORS[w.id%AVATAR_COLORS.length];
  const roleIcon=workerRoleIcon(w.role);
  const si=w.skill_info;

  const xpTip=w.xp_for_next_level
    ?`${w.experience}/${w.xp_for_next_level} XP to Level ${w.level+1}`:'Max level';
  const xpBar=`<div class="xp-row" data-tip="${xpTip}">
    <span class="xp-label">Lv.${w.level}</span>
    <div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${w.xp_progress_pct}%"></div></div>
    <span class="xp-label">${w.experience}xp</span></div>`;

  // Course status
  let courseHtml = '';
  if (w.course_finish_day) {
    const daysLeft = w.course_finish_day - (G.state?.day||1);
    courseHtml = `<div class="course-active-badge" data-tip="Course finishes in ${daysLeft} day(s)">
      📚 Upgrading → ${w.course_target_rarity} (${daysLeft}d)
    </div>`;
  } else if (si && si.rarity !== 'legendary' && si.rarity !== 'unique') {
    const costs=G.course_costs||{};
    const key=`${si.rarity}_to_${nextRarity(si.rarity)}`;
    const cfg=costs[key];
    if (cfg) {
      courseHtml = `<button class="btn btn-info btn-sm" style="margin-top:0.3rem;font-size:0.72rem"
        data-tip="Send ${w.name} on a course to upgrade skill to ${nextRarity(si.rarity)} — ${cfg.days} days, ${fmt(cfg.cost)}"
        onclick="startCourse(${w.id})">📚 Course ${fmt(cfg.cost)}</button>`;
    }
  }

  // Controls — role-specific
  let controls = '';
  if (w.role === 'baker') {
    const modeDesc={
      orders_only:'Baker only fulfills orders when you click Fulfill — never bakes automatically',
      casual:'Baker auto-fulfills orders; when idle, auto-bakes to restock shelves',
      cake_only:'Baker ignores orders — only bakes the specific recipe you choose',
    }[w.work_mode]||'';
    controls = `<div class="worker-controls">
      <select class="mode-select" data-wid="${w.id}" data-type="mode"
              data-tip="Set baker's automatic behavior"
              onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="orders_only" ${w.work_mode==='orders_only'?'selected':''}>🛎 Orders only</option>
        <option value="casual"      ${w.work_mode==='casual'?'selected':''}>🔀 Casual</option>
        <option value="cake_only"   ${w.work_mode==='cake_only'?'selected':''}>🎂 Specific cake</option>
      </select>
      ${w.work_mode==='cake_only'?`<select class="mode-select" data-wid="${w.id}" data-type="cake"
        onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="">Pick recipe…</option>${recipeOpts}</select>`:''}
      <select class="mode-select" data-wid="${w.id}" data-type="oven"
              data-tip="Assign to an oven for automatic baking"
              onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="">No oven</option>${ovenOpts}
      </select>
    </div>`;
  } else if (w.role === 'cashier') {
    controls = `<div class="worker-cashier-status" data-tip="Cashiers auto-fulfill the most urgent pending orders every second">
      💳 Auto-fulfills orders</div>`;
  } else if (w.role === 'waiter') {
    controls = `<div class="worker-cashier-status" data-tip="Waiters passively buff customer patience, tips, and order frequency based on their skill">
      🍽️ Passive buffs active</div>`;
  } else if (w.role === 'manager') {
    controls = `<div class="worker-cashier-status" data-tip="Manager buffs all workers based on their skills. Check their skill for effects.">
      📋 Store-wide buffs active</div>`;
  }

  return `
  <div class="worker-card-new" id="wcard-${w.id}">
    <div class="worker-avatar-circle" style="background:${bg};color:${fg}"
         data-tip="Click to view ${w.name}'s profile" onclick="openWorkerDetail(${w.id})">
      <div class="avatar-initials">${w.name.slice(0,2).toUpperCase()}</div>
      <div class="avatar-role-icon">${roleIcon}</div>
    </div>
    <div class="worker-body">
      <div class="worker-name-row">
        <span class="worker-name" data-tip="View ${w.name}'s profile" onclick="openWorkerDetail(${w.id})">${w.name}</span>
        <span class="worker-role-badge ${w.role}" data-tip="${roleDesc(w.role)}">${w.role}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--muted)">
        ${fmt(w.salary_per_day)}/day &nbsp;${stars}&nbsp;
        <span style="color:var(--accent2);font-size:0.68rem" data-tip="Can bake ${sizeMap[w.skill_level]||''} sizes">${sizeMap[w.skill_level]||''}</span>
      </div>
      <div class="skill-tags">
        ${w.role==='baker'?`<span class="skill-tag base" data-tip="Bake speed ${w.bake_speed}/5 — reduces bake time by ${Math.round((1-Math.max(0.5,1-(w.bake_speed-1)*0.1))*100)}%">⚡ Bake ${w.bake_speed}</span>`:''}
        <span class="skill-tag base" data-tip="Service speed ${w.service_speed}/5">🤝 Svc ${w.service_speed}</span>
        ${si?skillRarityBadge(si):''}
      </div>
      ${xpBar}
      ${courseHtml}
      ${controls}
    </div>
    <button class="btn btn-danger btn-sm" style="align-self:flex-start;flex-shrink:0"
            data-tip="Fire ${w.name} — saves ${fmt(w.salary_per_day)}/day"
            onclick="openFireModal(${w.id},'${w.name}')">✕</button>
  </div>`;
}

function nextRarity(r) {
  return {standard:'rare',rare:'epic',epic:'legendary'}[r]||'legendary';
}

function roleDesc(role) {
  return {
    baker:'Bakers bake cakes and can auto-fulfill orders',
    cashier:'Cashiers specialize in serving customers quickly',
    waiter:'Waiters passively improve customer experience and patience',
    manager:'Managers buff all workers — check their skill for specific effects',
  }[role]||role;
}

async function onWorkerChange(sel) {
  const wid=parseInt(sel.dataset.wid),type=sel.dataset.type,val=sel.value;
  lockedWorkers.delete(wid);
  if(type==='mode'){const r=await api('/api/worker-mode/',{worker_id:wid,work_mode:val});toast(r.message,r.ok?'info':'error');}
  else if(type==='cake'){const r=await api('/api/worker-mode/',{worker_id:wid,target_recipe_id:val?parseInt(val):null});toast(r.message,r.ok?'info':'error');}
  else if(type==='oven'){const r=await api('/api/assign/',{worker_id:wid,oven_id:val?parseInt(val):null});toast(r.message,r.ok?'success':'error');}
  fetchState();
}

function lockWorker(wid){lockedWorkers.add(wid);}

function renderStaff() {
  const el=$('panel-staff'); if(!el) return;
  const recipeOpts=(G.recipes||[]).filter(r=>r.is_unlocked).map(r=>`<option value="${r.id}">${r.emoji} ${r.name}</option>`).join('');
  const ovenOpts=(G.ovens||[]).map(o=>`<option value="${o.id}">${o.name}</option>`).join('');
  const hasCards=el.querySelector('.worker-card-new');
  if(!hasCards){
    const html=G.workers?.length
      ?G.workers.map(w=>buildWorkerCard(w,recipeOpts,ovenOpts)).join('')
      :`<div class="empty-state"><div class="empty-icon">👥</div>No staff. Hire from the pool.</div>`;
    el.innerHTML=html+`<div class="hire-btn-section">
      <button class="btn btn-success btn-full" data-tip="Browse available workers — pool refreshes every few days"
              onclick="openHireModal()">➕ Hire Staff</button></div>`;
    restoreSelects(el); return;
  }
  G.workers?.forEach(w=>{
    if(lockedWorkers.has(w.id)) return;
    const existing=$(`wcard-${w.id}`);
    const newCard=buildWorkerCard(w,recipeOpts,ovenOpts);
    if(!existing){const btn=el.querySelector('.hire-btn-section');const tmp=document.createElement('div');tmp.innerHTML=newCard;el.insertBefore(tmp.firstElementChild,btn);}
    else existing.outerHTML=newCard;
  });
  el.querySelectorAll('.worker-card-new').forEach(card=>{
    const wid=parseInt(card.id.replace('wcard-',''));
    if(!G.workers?.find(w=>w.id===wid))card.remove();
  });
  restoreSelects(el);
}

function restoreSelects(el) {
  G.workers?.forEach(w=>{
    if(lockedWorkers.has(w.id)) return;
    const card=el.querySelector(`#wcard-${w.id}`); if(!card) return;
    const os=card.querySelector('[data-type="oven"]'); if(os&&w.assigned_oven_id) os.value=String(w.assigned_oven_id);
    const cs=card.querySelector('[data-type="cake"]'); if(cs&&w.target_recipe_id) cs.value=String(w.target_recipe_id);
  });
}

// ── Upgrades ──────────────────────────────────────────────────────────────────
function renderUpgrades() {
  const el=$('panel-upgrades'); if(!el||!G.upgrades) return;
  el.innerHTML=G.upgrades.map(u=>`
    <div class="shop-item ${u.owned?'owned':''}">
      <div class="shop-item-name">${u.emoji} ${u.name}</div>
      <div class="shop-item-desc">${u.desc}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.4rem">
        <span class="shop-item-cost">${u.owned?'✅ Owned':fmt(u.cost)}</span>
        ${!u.owned?`<button class="btn btn-info btn-sm" data-tip="Buy ${u.name}: ${u.desc}" onclick="buyUpgrade('${u.id}')">Buy</button>`:''}
      </div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  RECIPE SHOP
//  Phase 2: recipes shown with lock animation, blur overlay,
//  padlock icon, price tag, and animated unlock on purchase
// ═══════════════════════════════════════════════════════════
function renderRecipeShop() {
  const el=$('panel-recipe-shop'); if(!el||!G.recipes) return;
  const state=G.state||{};

  el.innerHTML = G.recipes.map(r => {
    const locked   = !r.is_unlocked;
    const canBuy   = r.can_purchase && r.shop_price;
    const price    = r.shop_price;
    const affordable = price && float(state.money) >= price;

    // Lock message
    let lockMsg = '';
    if (locked) {
      if (r.unlock_rep && state.reputation < r.unlock_rep)
        lockMsg = `⭐ Need reputation ${r.unlock_rep}`;
      else if (r.unlock_day && state.day < r.unlock_day)
        lockMsg = `📅 Available from Day ${r.unlock_day}`;
      else if (canBuy)
        lockMsg = `🔓 Available to purchase!`;
    }

    return `
    <div class="recipe-shop-card ${locked?'locked':''} ${r.is_todays?'secret':''}"
         id="rshop-${r.id}">
      <div class="rshop-emoji-wrap">
        <span class="rshop-emoji ${locked?'blurred':''}">${r.emoji}</span>
        ${locked?`<div class="rshop-lock-overlay">
          ${canBuy?'🔓':'🔒'}
          ${canBuy&&price?`<div class="rshop-price-tag">${fmt(price)}</div>`:''}
        </div>`:''}
      </div>
      <div class="rshop-info">
        <div class="rshop-name">${locked&&!canBuy?'???':r.name}</div>
        <div class="rshop-type">${r.type}</div>
        ${locked?`<div class="rshop-lock-msg">${lockMsg}</div>`:`
        <div class="price-row" style="margin-top:0.3rem">
          <div class="price-tag" data-tip="Small — ${r.bake_seconds.Small}s"><span class="sz">S</span><span class="pr">$${r.prices.Small}</span></div>
          <div class="price-tag" data-tip="Medium — ${r.bake_seconds.Medium}s"><span class="sz">M</span><span class="pr">$${r.prices.Medium}</span></div>
          <div class="price-tag" data-tip="Large — ${r.bake_seconds.Large}s"><span class="sz">L</span><span class="pr">$${r.prices.Large}</span></div>
        </div>`}
      </div>
      ${canBuy?`<button class="btn ${affordable?'btn-success':'btn-secondary'} btn-sm"
        style="flex-shrink:0;align-self:center"
        ${!affordable?'disabled':''}
        data-tip="${affordable?`Unlock ${r.name} for ${fmt(price)}`:`Need ${fmt(price)} — you have ${fmt(state.money)}`}"
        onclick="buyRecipe(${r.id})">
        ${affordable?`🔓 ${fmt(price)}`:`🔒 ${fmt(price)}`}
      </button>`:''}
    </div>`;
  }).join('');
}

function float(v){return Number(v);}

// ── History ───────────────────────────────────────────────────────────────────
function renderReportsTab() {
  const el=$('panel-history'); if(!G.reports?.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📊</div>No reports yet.</div>`;return;}
  const rows=G.reports.map(r=>{const c=r.net_profit>=0?'var(--green)':'var(--accent)';return`<tr>
    <td>Day ${r.day}</td><td style="color:var(--accent2)">${fmt(r.revenue)}</td>
    <td style="color:${c}">${fmt(r.net_profit)}</td>
    <td>${r.orders_fulfilled}</td><td style="color:var(--accent)">${r.orders_expired}</td>
    <td>${r.customer_satisfaction}%</td>
    <td style="color:var(--muted);font-size:0.75rem">${r.best_seller?`${r.best_seller}×${r.best_seller_count}`:'-'}</td>
  </tr>`;}).join('');
  el.innerHTML=`<table class="history-table"><thead><tr><th>Day</th><th>Rev</th><th>Net</th><th>✔</th><th>✘</th><th>😊</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Notification ──────────────────────────────────────────────────────────────
function renderNotificationBadge(){
  const badge=$('notif-badge');
  if(badge&&G.event_log?.length){badge.textContent=G.event_log.length>9?'9+':G.event_log.length;badge.style.display='flex';}
}
function toggleNotifications(){
  const panel=$('notif-panel'); if(!panel) return;
  const open=panel.classList.toggle('open');
  if(open&&G.event_log){
    panel.innerHTML=`<div class="notif-header"><strong>Activity Log</strong>
      <button class="btn btn-secondary btn-sm" onclick="toggleNotifications()">✕</button></div>
      <div class="notif-list">${G.event_log.map(e=>`<div class="notif-item ${e.log_type}">
        <span class="notif-icon">${e.icon}</span>
        <span class="notif-msg">${e.message}</span>
        <span class="notif-day">D${e.day}</span></div>`).join('')}</div>`;
  }
}

// ── Fire Modal ────────────────────────────────────────────────────────────────
let _fireId=null,_fireName='';
function openFireModal(id,name){
  _fireId=id;_fireName=name;
  $('fire-modal-name').textContent=name;
  const w=G.workers?.find(w=>w.id===id);
  const sl=$('fire-modal-salary');
  if(sl&&w)sl.textContent=`Firing ${name} saves ${fmt(w.salary_per_day)}/day.`;
  $('fire-modal').classList.add('open');
}
function closeFireModal(){$('fire-modal').classList.remove('open');_fireId=null;}
async function confirmFire(){
  if(!_fireId) return;
  const r=await api('/api/fire/',{worker_id:_fireId});
  toast(r.message,r.ok?'success':'error');
  closeFireModal(); if(r.ok)fetchState();
}

// ── Worker Detail Modal ───────────────────────────────────────────────────────
function openWorkerDetail(workerId) {
  const w=G.workers?.find(w=>w.id===workerId); if(!w) return;
  const state=G.state||{};
  const sizeMap={1:'Small only (★1)',2:'Small + Medium (★★2)',3:'All sizes (★★★3)'};
  const si=w.skill_info;
  const [bg]=AVATAR_COLORS[w.id%AVATAR_COLORS.length];
  const roleIcon=workerRoleIcon(w.role);

  const xpNeeded=w.xp_for_next_level?w.xp_for_next_level-w.experience:0;
  const nextLvl=w.level>=10?'Max level':`${xpNeeded} XP to Level ${w.level+1}`;

  const starNote=()=>{
    if(w.skill_level>=3) return '';
    const tl=w.skill_level===1?4:8,ts=w.skill_level===1?2:3;
    const lvlXp=[0,20,50,100,180,300,480,700,1000,1400][tl]||0;
    const rem=Math.max(0,lvlXp-w.experience);
    return `<div class="detail-row" style="color:var(--accent2)">⭐ Reaches ★${ts} at Level ${tl} (${rem} XP away)</div>`;
  };

  const courseNote=w.course_finish_day
    ?`<div class="detail-row" style="color:var(--blue)">📚 Course in progress → ${w.course_target_rarity} (Day ${w.course_finish_day})</div>`
    :'';

  const modeDesc={
    orders_only:'Orders Only — fulfills orders when you click Fulfill',
    casual:'Casual — auto-fulfills + auto-bakes when idle',
    cake_only:'Specific Cake — only bakes assigned recipe',
  };
  const assignedOven=G.ovens?.find(o=>o.id===w.assigned_oven_id);

  $('worker-detail-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">
      <div style="width:56px;height:56px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:1.6rem;box-shadow:0 2px 8px rgba(0,0,0,0.3);flex-shrink:0">${roleIcon}</div>
      <div>
        <div style="font-size:1.2rem;font-weight:800">${w.name}</div>
        <div style="font-size:0.82rem;color:var(--muted);text-transform:capitalize">${w.role}</div>
        <div style="font-size:0.82rem;color:var(--accent2)">${fmt(w.salary_per_day)}/day salary</div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Level & XP</div>
      <div class="detail-row">Level <strong>${w.level}</strong>/10 · ${w.experience} XP total</div>
      <div class="xp-row" style="margin:0.4rem 0">
        <span class="xp-label">Lv.${w.level}</span>
        <div class="xp-bar-wrap" style="flex:1"><div class="xp-bar-fill" style="width:${w.xp_progress_pct}%"></div></div>
        <span class="xp-label">Lv.${Math.min(w.level+1,10)}</span>
      </div>
      <div class="detail-row" style="color:var(--muted)">${nextLvl}</div>
      ${starNote()}
    </div>
    <div class="detail-section">
      <div class="detail-label">Skills</div>
      ${w.role==='baker'?`<div class="detail-row">⚡ Bake Speed <strong>${w.bake_speed}/5</strong> — bake time −${Math.round((1-Math.max(0.5,1-(w.bake_speed-1)*0.1))*100)}%</div>`:''}
      <div class="detail-row">🤝 Service <strong>${w.service_speed}/5</strong></div>
      ${w.role==='baker'||w.role==='cashier'?`<div class="detail-row">🎯 Star <strong>${'★'.repeat(w.skill_level)}</strong> — ${sizeMap[w.skill_level]}</div>`:''}
      ${si?`<div class="detail-row">${skillRarityBadge(si)}</div>`:''}
      ${courseNote}
    </div>
    ${w.role==='baker'?`
    <div class="detail-section">
      <div class="detail-label">Work Mode</div>
      <div class="detail-row"><strong>${w.work_mode.replace('_',' ')}</strong></div>
      <div class="detail-row" style="color:var(--muted);font-size:0.8rem">${modeDesc[w.work_mode]||''}</div>
      <div class="detail-row">Oven: <strong>${assignedOven?`${assignedOven.name} (×${assignedOven.speed_bonus})`:'None'}</strong></div>
    </div>`:`
    <div class="detail-section">
      <div class="detail-label">Role</div>
      <div class="detail-row">${roleDesc(w.role)}</div>
    </div>`}
    <div class="detail-section">
      <div class="detail-label">Employment</div>
      <div class="detail-row">Hired on Day <strong>${w.hired_on_day||'?'}</strong></div>
      <div class="detail-row">Days employed: <strong>${state.day-(w.hired_on_day||state.day)}</strong></div>
    </div>`;
  $('worker-detail-modal').classList.add('open');
}
function closeWorkerDetail(){$('worker-detail-modal').classList.remove('open');}

// ── Hire Modal ────────────────────────────────────────────────────────────────
function openHireModal(){
  const pool=G.hire_pool||[];
  const body=$('hire-modal-body');
  if(!pool.length){
    body.innerHTML=`<div class="empty-state"><div class="empty-icon">😴</div>No workers available.<br><span style="color:var(--muted);font-size:0.8rem">Pool refreshes every few days.</span></div>`;
  } else {
    body.innerHTML=pool.map(hw=>{
      const stars=Array.from({length:3},(_,i)=>`<span style="color:${i<hw.skill_level?'#f5a623':'#333'};font-size:1rem">★</span>`).join('');
      const icon=workerRoleIcon(hw.role);
      const si=hw.skill_info;
      const daysLeft=hw.expires_on_day-(G.state?.day||1);
      return `<div class="hire-pool-card">
        <div class="hire-pool-avatar" data-tip="${hw.role}">${icon}</div>
        <div class="hire-pool-info">
          <div class="hire-pool-name">${hw.name}</div>
          <div style="font-size:0.78rem;color:var(--muted);text-transform:capitalize">${hw.role}</div>
          <div>${stars}</div>
          <div class="skill-tags" style="margin-top:0.3rem">
            ${hw.role==='baker'?`<span class="skill-tag base" data-tip="Bake speed">⚡ ${hw.bake_speed}</span>`:''}
            <span class="skill-tag base" data-tip="Service speed">🤝 ${hw.service_speed}</span>
            ${si?`<span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:6px;font-weight:700;background:${si.rarity_color}22;color:${si.rarity_color};border:1px solid ${si.rarity_color}44" data-tip="${si.rarity_label}: ${si.desc}">${si.name}</span>`:''}
          </div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:0.2rem">${fmt(hw.salary_per_day)}/day · <span data-tip="${daysLeft}d left in pool">${daysLeft}d left</span></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem">
          <div style="font-weight:800;color:var(--accent2)">${fmt(hw.hire_cost)}</div>
          <button class="btn btn-success btn-sm" data-tip="Hire ${hw.name}" onclick="hireFromPool(${hw.id},this)">Hire</button>
        </div>
      </div>`;
    }).join('');
  }
  $('hire-modal').classList.add('open');
}
function closeHireModal(){$('hire-modal').classList.remove('open');}
async function hireFromPool(hwId,btn){
  btn.disabled=true;btn.textContent='…';
  const r=await api('/api/hire-worker/',{hireable_worker_id:hwId});
  if(r.ok){toast(r.message,'success');closeHireModal();fetchState();}
  else{toast(r.message,'error');btn.disabled=false;btn.textContent='Hire';}
}

// ── Bake Modal ────────────────────────────────────────────────────────────────
function openBakeModal(ovenId){
  selectedOven=ovenId;
  const oven=G.ovens.find(o=>o.id===ovenId);
  $('bake-modal-title').textContent=`🔥 Bake — ${oven?oven.name:''}`;
  $('bake-recipe-select').innerHTML=(G.recipes||[]).filter(r=>r.is_unlocked).map(r=>`<option value="${r.id}">${r.emoji} ${r.name}</option>`).join('');
  updateBakePreview(); $('bake-modal').classList.add('open');
}
function closeBakeModal(){$('bake-modal').classList.remove('open');selectedOven=null;}
function updateBakePreview(){
  const r=G.recipes?.find(r=>r.id===parseInt($('bake-recipe-select').value)); if(!r) return;
  const size=$('bake-size-select').value,price=r.prices[size];
  $('bake-preview').innerHTML=`<div style="display:flex;justify-content:space-between;font-size:0.85rem;gap:1rem">
    <span data-tip="Revenue when sold">Sell: <strong style="color:var(--accent2)">${fmt(price)}</strong></span>
    <span data-tip="Deducted now">Cost: <strong style="color:var(--accent)">${fmt((price*0.30).toFixed(2))}</strong></span>
    <span data-tip="Real seconds to bake">Time: <strong>${r.bake_seconds[size]}s</strong></span></div>`;
}
async function confirmBake(){
  const recipeId=parseInt($('bake-recipe-select').value),size=$('bake-size-select').value;
  if(!recipeId||!size||!selectedOven){toast('Pick recipe + size.','error');return;}
  const r=await api('/api/bake/',{recipe_id:recipeId,size,oven_id:selectedOven});
  if(r.ok){toast(r.message,'success');closeBakeModal();fetchState();}
  else toast(r.message,'error');
}

// ── Report ────────────────────────────────────────────────────────────────────
function showReport(r){
  const pc=r.net_profit>=0?'positive':'negative';
  $('report-content').innerHTML=`
    <div class="report-title">📋 Day ${r.day} Report</div>
    <div class="report-grid">
      <div class="report-stat ${pc}"><div class="rs-label">Net Profit</div><div class="rs-value">${fmt(r.net_profit)}</div></div>
      <div class="report-stat neutral"><div class="rs-label">Revenue</div><div class="rs-value">${fmt(r.revenue)}</div></div>
      <div class="report-stat ${r.orders_fulfilled>0?'positive':'negative'}"><div class="rs-label">Fulfilled</div><div class="rs-value">${r.orders_fulfilled}</div></div>
      <div class="report-stat ${r.orders_expired>0?'negative':'positive'}"><div class="rs-label">Expired</div><div class="rs-value">${r.orders_expired}</div></div>
    </div>
    <div class="report-row"><span>Revenue</span><span class="positive">+${fmt(r.revenue)}</span></div>
    <div class="report-row"><span>Salaries</span><span class="negative">-${fmt(r.worker_salaries)}</span></div>
    <div class="report-row"><span>Waste</span><span class="negative">-${fmt(r.waste_cost)}</span></div>
    <div class="report-row total"><span>Net Profit</span><span class="${pc}">${fmt(r.net_profit)}</span></div>
    <div class="report-row" style="margin-top:0.5rem"><span>Best Seller</span><span style="color:var(--accent2)">${r.best_seller?`${r.best_seller} ×${r.best_seller_count}`:'-'}</span></div>
    <div class="report-row"><span>Wasted</span><span style="color:var(--accent)">${r.cakes_wasted}</span></div>
    <div class="report-row"><span>Satisfaction</span><span>${r.customer_satisfaction}%</span></div>
    <div class="report-row"><span>Closing Balance</span><span style="color:var(--accent2);font-weight:800">${fmt(r.closing_balance)}</span></div>`;
  showScreen('screen-report');
}

// ── Briefing ──────────────────────────────────────────────────────────────────
async function showBriefing(){
  const r=await api('/api/briefing/'); if(!r.ok){showScreen('screen-game');return;}
  const b=r.briefing||{};const profColor=(b.net_profit||0)>=0?'var(--green)':'var(--accent)';
  const dayEl=$('briefing-day-title'); if(dayEl)dayEl.textContent=`☀️ Day ${r.day} — Good Morning!`;
  $('briefing-body').innerHTML=`
    <div class="briefing-section">
      <div class="briefing-label">Yesterday</div>
      ${b.best_seller?`<div class="briefing-row">🏆 Best seller: <strong>${b.best_seller}</strong> (×${b.best_count})</div>`:''}
      <div class="briefing-row">Net profit: <strong style="color:${profColor}">${fmt(b.net_profit||0)}</strong></div>
    </div>
    ${b.worker_notes?.length?`<div class="briefing-section"><div class="briefing-label">Staff</div>${b.worker_notes.map(n=>`<div class="briefing-row">${n}</div>`).join('')}</div>`:''}
    <div class="briefing-section"><div class="briefing-label">Hire Pool</div><div class="briefing-row">${r.hire_pool_count} worker(s) available.</div></div>`;
  showScreen('screen-briefing');
}
function closeBriefing(){showScreen('screen-game');}

// ── Actions ───────────────────────────────────────────────────────────────────
async function startGame(){
  const name=$('input-store-name').value.trim()||'Sweet Layers';
  const r=await api('/api/start/',{store_name:name,confirmed:false});
  if(r.needs_confirm){if(!confirm(r.message))return;const r2=await api('/api/start/',{store_name:name,confirmed:true});if(!r2.ok){toast(r2.message,'error');return;}toast(r2.message,'success');}
  else if(!r.ok){toast(r.message,'error');return;}
  else toast(r.message,'success');
  showScreen('screen-game');startPolling();
}
async function openStore(){
  const r=await api('/api/open/',{});
  if(r.ok){if(r.active_event)toast(`${r.active_event.icon} ${r.active_event.title}: ${r.active_event.msg}`,'warn');toast(r.message,'success');fetchState();}
  else toast(r.message,'error');
}
async function endDay(){
  const r=await api('/api/end-day/',{});
  if(r.ok){showReport(r.report);if(r.game_over)setTimeout(()=>toast('💸 Game Over!','error'),400);}
  else toast(r.message,'error');
}
function continueFromReport(){showBriefing();}
async function fulfillOrder(id,btn){
  const card=$(`order-card-${id}`);if(card)card.style.opacity='0.3';btn.disabled=true;
  const r=await api('/api/fulfill/',{order_id:id});
  if(r.ok){toast(r.message,'success');if(card)card.remove();fetchState();}
  else{toast(r.message,'error');if(card)card.style.opacity='1';btn.disabled=false;}
}
async function buyOven(tier){const r=await api('/api/buy-oven/',{tier});toast(r.message,r.ok?'success':'error');if(r.ok)fetchState();}
async function buyUpgrade(id){const r=await api('/api/buy-upgrade/',{upgrade_id:id});toast(r.message,r.ok?'success':'error');if(r.ok)fetchState();}
async function buyRecipe(id){
  const r=await api('/api/buy-recipe/',{recipe_id:id});
  if(r.ok){
    toast(r.message,'success');
    // Animate the unlock
    const card=$(`rshop-${id}`);
    if(card){card.classList.add('unlocking');setTimeout(()=>card.classList.remove('unlocking'),600);}
    fetchState();
  } else toast(r.message,'error');
}
async function startCourse(workerId){
  const r=await api('/api/start-course/',{worker_id:workerId});
  toast(r.message,r.ok?'success':'error');if(r.ok)fetchState();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  try{
    const data=await api('/api/state/');
    if(data.state?.game_started){G=data;showScreen('screen-game');startPolling();}
    else showScreen('screen-start');
  }catch{showScreen('screen-start');}
  $('input-store-name')?.addEventListener('keydown',e=>{if(e.key==='Enter')startGame();});
});