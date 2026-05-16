/* ═══════════════════════════════════════════════════════════
   CAKE STORE MANAGER — Phase 2 + fixes
   Fix 1: bake modal empty → fallback message when no recipes unlocked
   Fix 2: recipes tab → renderRecipeShop waits for G to load
   Fix 3: tooltip 250ms delay
   Fix 4: history tab overflow handled in CSS (tab-btn flex nowrap)
   Fix 6: start screen shown correctly (only when game_started=false)
   Fix 8: day timer countdown + auto-ended detection
═══════════════════════════════════════════════════════════ */
'use strict';

let G            = {};
let _lastReadLogCount = 0;
let pollTimer    = null;
let animFrame    = null;
let selectedOven = null;
const lockedWorkers = new Set();
const POSITIVE_TRAITS = {
  fast_learner:  {name:'Fast Learner',  icon:'⚡', desc:'Gains skill XP 30% faster'},
  perfectionist: {name:'Perfectionist', icon:'🎯', desc:'Perfect zone 20% more likely'},
  team_player:   {name:'Team Player',   icon:'🤝', desc:'Adjacent workers +5% speed'},
  early_bird:    {name:'Early Bird',    icon:'🌅', desc:'First 2 orders 20% faster'},
  cool_head:     {name:'Cool Head',     icon:'🧊', desc:'No penalty in rush hour'},
  innovative:    {name:'Innovative',    icon:'💡', desc:'Discovers new deco options'},
  loyal:         {name:'Loyal',         icon:'💛', desc:'Salary never increases'},
  energetic:     {name:'Energetic',     icon:'⚡', desc:'Serves 1 extra customer/tick'},
};
const NEGATIVE_TRAITS = {
  clumsy:          {name:'Clumsy',          icon:'🤕', desc:'10% chance drops ingredient'},
  slow_starter:    {name:'Slow Starter',    icon:'🐢', desc:'First 30s at -20% speed'},
  picky:           {name:'Picky',           icon:'😤', desc:'Refuses certain recipe types'},
  forgetful:       {name:'Forgetful',       icon:'😶', desc:'1% chance misses an order'},
  expensive_taste: {name:'Expensive Taste', icon:'💸', desc:'Demands raise every 5 days'},
  distracted:      {name:'Distracted',      icon:'😵', desc:'5% chance idles 5 seconds'},
  overconfident:   {name:'Overconfident',   icon:'😎', desc:'Ignores instructions 10%'},
  sensitive:       {name:'Sensitive',       icon:'😢', desc:'-2 morale per expired order'},
};
const ROLE_SKILLS = {
  baker:   ['mixing_technique','dough_shaping','decoration_eye','oven_instinct','recipe_memory'],
  cashier: ['quick_service','charm','upselling','cash_handling','regular_memory'],
  waiter:  ['floor_reading','presentation','conflict_resolution','speed_walking','sommelier_eye'],
  manager: ['staff_motivation','cost_control','scheduling','talent_eye','crisis_management'],
};
const SKILL_MASTERY_NAMES = {1:'Novice',2:'Apprentice',3:'Skilled',4:'Expert',5:'Master'};

// day-end ISO string for the timer
let _dayEndAt = null;
const DAY_DURATION_SEC = 5 * 60; // must match settings.DEFAULT_DAY_DURATION_SECONDS

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
if (id === 'screen-game') {
// Boot Phaser if not already running
if (typeof initPhaserGame !== 'undefined') initPhaserGame();
// Wire oven-click → bake modal
if (typeof PhaserBridge !== 'undefined') {
PhaserBridge.onOvenClicked(ovenId => openBakeModal(ovenId));
PhaserBridge.onShowBrewTab(() => {
const brewTab = document.querySelector('[data-tab="tab-drinks"]');
if (brewTab) brewTab.style.display = 'flex';
});
}
}
}

function switchTab(groupId, tabId) {
  const panel = $(groupId).parentElement;
  panel.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId));
  panel.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === tabId));
}

function showPopup(html) {
  const overlay = $('popup-overlay');
  const inner   = $('popup-inner');
  if (!overlay || !inner) return;
  inner.innerHTML = html;
  overlay.style.display = 'flex';
}

function closePopup() {
  const overlay = $('popup-overlay');
  if (overlay) overlay.style.display = 'none';
  const $inner = $('popup-inner');
  if ($inner) $inner.innerHTML = '';
}

function openKitchenPopup() {
  const ovens = G.ovens || [];
  const html = `
  <div style="background:var(--surface);min-width:340px;max-width:480px;">
    <div style="background:var(--gold2);padding:6px 12px;font-size:11px;font-weight:700;color:#1a0f06;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--border-dark);">
      🍳 Kitchen — Active Ovens
      <button class="btn btn-danger btn-sm" onclick="closePopup()">✕</button>
    </div>
    <div style="padding:8px;display:flex;flex-direction:column;gap:6px;max-height:360px;overflow-y:auto;">
      ${ovens.length ? ovens.map(ov => {
        const cake = ov.current_cake;
        const baker = ov.baker;
        return `<div style="background:var(--surface2);padding:8px;border-top:2px solid var(--border-light);border-left:2px solid var(--border-light);border-right:2px solid var(--border-dark);border-bottom:2px solid var(--border-dark);">
          <div style="font-weight:700;font-size:10px;color:var(--gold);">🔥 ${ov.name} <span style="color:var(--cream-dim);font-weight:400;">×${ov.speed_bonus}</span></div>
          ${baker ? `<div style="font-size:9px;color:var(--cream-dim);margin-top:2px;">👨‍🍳 ${baker.name} · Lv.${baker.level}</div>` : '<div style="font-size:9px;color:var(--red);">No baker assigned</div>'}
          ${cake ? `
            <div style="font-size:9px;margin-top:4px;">${cake.emoji} ${cake.recipe_name} (${cake.size})</div>
            <div style="height:6px;background:var(--border-dark);margin-top:3px;">
              <div style="height:100%;width:${cake.progress_pct}%;background:var(--gold2);"></div>
            </div>` : `<div style="font-size:9px;color:var(--green2);margin-top:4px;">✅ Ready to bake</div>
            <button class="btn btn-warning btn-sm" style="margin-top:4px;font-size:9px;" onclick="closePopup();openBakeModal(${ov.id})">🍰 Bake</button>`}
        </div>`;
      }).join('') : '<div style="color:var(--cream-dim);font-size:10px;padding:8px;">No ovens found.</div>'}
    </div>
  </div>`;
  showPopup(html);
}

// ── Tooltip (Fix 3: 250ms delay) ─────────────────────────────────────────────
(() => {
  const el = document.createElement('div');
  el.id = 'custom-tooltip';
  el.style.cssText = `position:fixed;z-index:9999;pointer-events:none;display:none;
    background:#1a1a2e;color:#eaeaea;font-size:0.75rem;line-height:1.5;
    padding:0.4rem 0.65rem;border-radius:6px;border:1px solid #2a2a4a;
    box-shadow:0 4px 16px rgba(0,0,0,0.5);max-width:240px;white-space:normal;`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));

  let mx=0, my=0, showTimer=null;

  document.addEventListener('mousemove', e => {
    mx=e.clientX; my=e.clientY;
    if (el.style.display==='block') pos();
  });

  function pos() {
    const r=el.getBoundingClientRect();
    el.style.left=(mx+12+r.width>window.innerWidth ? mx-r.width-8 : mx+12)+'px';
    el.style.top =(my+12+r.height>window.innerHeight ? my-r.height-8 : my+12)+'px';
  }

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      el.textContent = t.dataset.tip;
      el.style.display = 'block';
      pos();
    }, 250);
  });

  document.addEventListener('mouseout', e => {
    const tip = e.target.closest('[data-tip]');
    if (!tip) return;
    if (tip.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    el.style.display = 'none';
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

    // Issue 8: day timer countdown
    if (_dayEndAt && G.state?.is_open) {
      const secs = secsFrom(_dayEndAt);
      const chip = $('day-timer-chip');
      const timerEl = $('tb-day-timer');
      const fill = $('tb-day-timer-fill');
      if (chip) chip.style.display = 'flex';
      if (timerEl) {
        const m = Math.floor(secs / 60);
        const s2 = Math.floor(secs % 60);
        timerEl.textContent = `${m}:${String(s2).padStart(2,'0')}`;
      }
      if (fill) {
        const pct = clamp(secs / DAY_DURATION_SEC * 100, 0, 100);
        fill.style.width = `${pct}%`;
        fill.style.background = secs > 60 ? 'var(--green)' : secs > 20 ? 'var(--accent2)' : 'var(--accent)';
      }
    } else {
      const chip = $('day-timer-chip');
      if (chip) chip.style.display = 'none';
    }

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
    // Issue 8: detect auto-end
    if (tick.events?.auto_ended) {
      $('day-ended-banner').style.display = 'block';
      setTimeout(() => {
        $('day-ended-banner').style.display = 'none';
        showReport(tick.events.report);
      }, 1800);
      return;
    }
    handleEvents(tick.events);
    const state = await api('/api/state/');
    G = state;
    // sync day timer
    if (G.state?.day_end_at) _dayEndAt = G.state.day_end_at;
    else _dayEndAt = null;
    render();
  } catch(e) { console.error('Poll error',e); }
}

async function fetchState() {
  try {
    G = await api('/api/state/');
    if (G.state?.day_end_at) _dayEndAt = G.state.day_end_at;
    render();
  }
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
    const special=o.is_todays?" 👑 TODAY'S GUEST":'';
    toast(`${i}${o.customer_icon||''} ${o.customer_name}${special} — ${d} of ${o.recipe_name}`,'info');
  }
}

function render() {
if (!G.state) return;
// Push to Phaser cafe scene
if (typeof PhaserBridge !== 'undefined') PhaserBridge.push(G);
  renderTopBar();
  renderEventBanner();
  renderOvens();
  renderBaking();
  renderInventory();
  renderOrders();
  renderStaff();
  renderUpgrades();
  renderRecipeShop();   // Issue 2: called after G is populated
  renderReportsTab();
  renderNotificationBadge();
  // updateCafeScene(G);
  renderDrinksTab();
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

// ── Ovens ─────────────────────────────────────────────────────────────────────
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
      ? `<div class="oven-status">👨‍🍳 ${baker.name} <span style="color:var(--muted);font-size:0.72rem">Lv.${baker.level}</span></div>`
      : `<div class="oven-status" style="color:var(--accent)">No baker assigned</div>`;
    const innerHtml=ov.is_busy&&cake
      ? `<div class="oven-status">${cake.emoji} ${cake.recipe_name} (${cake.size}) — <span id="osec2-${ov.id}">${Math.ceil(secsFrom(cake.bake_finish_at))}s</span></div>
         <div class="progress-bar"><div class="progress-fill" id="oprog-${ov.id}" style="width:${cake.progress_pct}%;transition:width 0.5s linear"></div></div>`
      : `<div class="oven-status" style="color:var(--green)">Ready to bake</div>`;

    if (!existing.has(ov.id)) {
      const card=document.createElement('div');
      card.id=`oven-card-${ov.id}`; card.dataset.ovenId=ov.id;
      card.className=`oven-card ${ov.is_busy?'busy':'free'}`;
      card.innerHTML=`
        <div class="oven-title">
          🔥 ${ov.name} <span class="oven-badge ${ov.tier}">${ov.tier}</span>
          <span style="color:var(--muted);font-size:0.75rem">×${ov.speed_bonus}</span>
        </div>
        <div class="oven-baker-line">${bakerHtml}</div>
        <div class="oven-inner">${innerHtml}</div>
        <div class="oven-actions">
          ${!ov.is_busy?`<button class="btn btn-warning btn-sm" onclick="openBakeModal(${ov.id})">🍰 Bake</button>`:''}
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
        actions.innerHTML=`<button class="btn btn-warning btn-sm" onclick="openBakeModal(${ov.id})">🍰 Bake</button>`;
      else if(ov.is_busy&&hasBtn&&actions) actions.innerHTML='';
    }
  });
}

function renderBaking() {
  const el=$('panel-baking');
  const incoming=new Set((G.baking||[]).map(c=>c.id));
  el.querySelectorAll('[data-bake-id]').forEach(card=>{ if(!incoming.has(parseInt(card.dataset.bakeId)))card.remove(); });
  if(!G.baking?.length){
    if(!el.querySelector('[data-bake-id]')) el.innerHTML=`<div class="empty-state"><div class="empty-icon">⏳</div>Nothing baking.</div>`;
    return;
  }
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
  const incoming=new Set((G.inventory||[]).map(c=>c.id));
  el.querySelectorAll('[data-inv-id]').forEach(card=>{ if(!incoming.has(parseInt(card.dataset.invId)))card.remove(); });
  if(!G.inventory?.length){
    if(!el.querySelector('[data-inv-id]')) el.innerHTML=`<div class="empty-state"><div class="empty-icon">🎂</div>Shelf empty — bake something!</div>`;
    return;
  }
  el.querySelectorAll('[data-inv-id]').forEach(card=>{ if(!incoming.has(parseInt(card.dataset.invId)))card.remove(); });
  G.inventory.forEach(c=>{
    const dots=Array.from({length:c.total_slices},(_,i)=>`<div class="slice-dot ${i<c.remaining_slices?'used':''}"></div>`).join('');
    const freshLabel=c.is_fresh
      ?`<span style="font-size:0.7rem;color:var(--green)">✨ Fresh</span>`
      :`<span style="font-size:0.7rem;color:var(--muted)">🕒 Stale</span>`;
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
  const incoming=new Set((G.orders||[]).map(o=>o.id));
  el.querySelectorAll('[data-order-id]').forEach(c=>{ if(!incoming.has(parseInt(c.dataset.orderId)))c.remove(); });
  if(!G.orders?.length){
    if(!el.querySelector('[data-order-id]')) el.innerHTML=G.state?.is_open
      ?`<div class="empty-state"><div class="empty-icon">🛎</div>Waiting for customers…</div>`
      :`<div class="empty-state"><div class="empty-icon">🔐</div>Open the store to get orders.</div>`;
    return;
  }
  const existing=new Set([...el.querySelectorAll('[data-order-id]')].map(c=>parseInt(c.dataset.orderId)));
  G.orders.forEach(o=>{ if(!existing.has(o.id)) el.appendChild(buildOrderCard(o)); });
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
    ?`<span class="order-type-tag urgent">🔥 URGENT</span>`
    :o.order_type==='bulk'?`<span class="order-type-tag bulk">📦 BULK</span>`:'';
  const todaysTag=isTodays?`<span class="order-type-tag todays">👑 TODAY'S GUEST</span>`:'';
  const cicon=o.customer_icon?`<span class="ctype-icon">${o.customer_icon}</span>`:'';

  div.id=`order-card-${o.id}`; div.dataset.orderId=o.id;
  div.className=`order-card${isTodays?' todays-order':''}`;
  div.innerHTML=`
    <div class="order-timer" id="otimer-${o.id}" style="width:${pct}%;background:${color}"></div>
    <div class="order-top">
      <span class="order-emoji">${o.emoji}</span>
      <div class="order-info">
        <div class="order-customer">${cicon} ${o.customer_name} ${typeTag}${todaysTag}</div>
        <div class="order-detail">${desc} · ${o.recipe_name} (${o.size})</div>
        ${o.want_fresh?'<div class="order-fresh">⭐ Wants fresh</div>':''}
        <div class="order-detail" id="osec-${o.id}">⏱ ${Math.ceil(secs)}s</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
        <div class="order-revenue">${fmt(o.revenue)}</div>
        <button class="btn btn-success btn-sm"
                onclick="fulfillOrder(${o.id},this)">Fulfill ✓</button>
      </div>
    </div>`;
  return div;
}

// ── Staff ─────────────────────────────────────────────────────────────────────
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
  const neg = si.negative ? ' data-tip="⚠️ Negative skill"' : '';
  return `<span class="skill-rarity-badge" style="background:${si.rarity_color}22;color:${si.rarity_color};border:1px solid ${si.rarity_color}44;"
    data-tip="${si.rarity_label}: ${si.desc}"${neg}>
    ${si.rarity_label} · ${si.name}${si.negative?' ⚠️':''}
  </span>`;
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

function buildWorkerCard(w, recipeOpts, ovenOpts) {
  const [bg] = AVATAR_COLORS[w.id % AVATAR_COLORS.length];
  const roleIcon = workerRoleIcon(w.role);
  const si = w.skill_info;
  const morale = w.morale ?? 70;
  const moraleColor = morale >= 80 ? 'var(--green2)' : morale >= 50 ? 'var(--gold2)' : 'var(--red)';
  const moraleEmoji = morale >= 80 ? '😊' : morale >= 50 ? '😐' : '😟';
  const posT = w.positive_trait ? POSITIVE_TRAITS[w.positive_trait] : null;
  const negT = w.negative_trait ? NEGATIVE_TRAITS[w.negative_trait] : null;

  const xpTip = w.xp_for_next_level ? `${w.experience}/${w.xp_for_next_level} XP to Level ${w.level+1}` : 'Max level';

  let controls = '';
  if (w.role === 'baker') {
    controls = `<div class="worker-controls">
      <select class="mode-select" data-wid="${w.id}" data-type="mode"
              onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="orders_only" ${w.work_mode==='orders_only'?'selected':''}>🛎 Orders only</option>
        <option value="casual"      ${w.work_mode==='casual'?'selected':''}>🔀 Casual</option>
        <option value="cake_only"   ${w.work_mode==='cake_only'?'selected':''}>🎂 Specific cake</option>
      </select>
      ${w.work_mode==='cake_only'?`<select class="mode-select" data-wid="${w.id}" data-type="cake"
        onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="">Pick recipe…</option>${recipeOpts}</select>`:''}
      <select class="mode-select" data-wid="${w.id}" data-type="oven"
              onfocus="lockWorker(${w.id})" onchange="onWorkerChange(this)">
        <option value="">No oven</option>${ovenOpts}
      </select>
    </div>`;
  } else {
    const statusMap = {
      cashier: '💳 Auto-fulfills orders',
      waiter:  '🍽️ Passive buffs active',
      manager: '📋 Store-wide buffs active',
    };
    controls = `<div class="worker-cashier-status">${statusMap[w.role]||''}</div>`;
  }

  let courseHtml = '';
  if (w.course_finish_day) {
    const daysLeft = w.course_finish_day - (G.state?.day||1);
    courseHtml = `<div class="course-active-badge">📚 Upgrading → ${w.course_target_rarity} (${daysLeft}d)</div>`;
  } else if (si && si.rarity !== 'legendary' && si.rarity !== 'unique') {
    const key = `${si.rarity}_to_${nextRarity(si.rarity)}`;
    const cfg = (G.course_costs||{})[key];
    if (cfg) courseHtml = `<button class="btn btn-info btn-sm" style="margin-top:0.3rem;font-size:0.72rem"
      data-tip="Course: ${cfg.days} days, ${fmt(cfg.cost)}"
      onclick="startCourse(${w.id})">📚 Course ${fmt(cfg.cost)}</button>`;
  }

  return `
  <div class="worker-card-new" id="wcard-${w.id}">
    <div class="worker-avatar-circle" style="background:${bg}"
         onclick="openWorkerDetail(${w.id})" data-tip="View ${w.name}'s profile">
      <span class="avatar-role-emoji">${roleIcon}</span>
      <div class="avatar-star-badge">${'★'.repeat(w.skill_level)}</div>
    </div>
    <div class="worker-body">
      <div class="worker-name-row">
        <span class="worker-name" onclick="openWorkerDetail(${w.id})">${w.name}</span>
        <span class="worker-role-badge ${w.role}">${w.role}</span>
        <span style="font-size:10px;margin-left:auto;">${moraleEmoji}</span>
      </div>
      <div style="font-size:0.75rem;color:var(--muted)">${fmt(w.salary_per_day)}/day</div>

      <!-- Morale bar -->
      <div style="display:flex;align-items:center;gap:4px;margin:2px 0;">
        <span style="font-size:8px;color:var(--muted);">Morale</span>
        <div style="flex:1;height:4px;background:var(--border-dark);">
          <div style="width:${morale}%;height:100%;background:${moraleColor};"></div>
        </div>
        <span style="font-size:8px;color:${moraleColor};">${morale}</span>
      </div>

      <!-- Traits -->
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin:2px 0;">
        ${posT ? `<span style="font-size:8px;padding:1px 5px;background:rgba(90,138,60,.3);color:var(--green2);"
          data-tip="${posT.desc}">${posT.icon} ${posT.name}</span>` : ''}
        ${negT ? `<span style="font-size:8px;padding:1px 5px;background:rgba(139,32,32,.3);color:#e06060;"
          data-tip="${negT.desc}">${negT.icon} ${negT.name}</span>` : ''}
      </div>

      ${si ? skillRarityBadge(si) : ''}
      <div class="xp-row" data-tip="${xpTip}">
        <span class="xp-label">Lv.${w.level}</span>
        <div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${w.xp_progress_pct}%"></div></div>
        <span class="xp-label">${w.experience}xp</span>
      </div>
      ${courseHtml}
      ${controls}
    </div>
    <button class="btn btn-danger btn-sm" style="align-self:flex-start;flex-shrink:0"
            onclick="openFireModal(${w.id},'${w.name}')">✕</button>
  </div>`;
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

  let hireSection = el.querySelector('.hire-btn-section');
  if (!hireSection) {
    hireSection = document.createElement('div');
    hireSection.className = 'hire-btn-section';
    hireSection.innerHTML = `<button class="btn btn-success btn-full" onclick="openHireModal()">➕ Hire Staff</button>`;
    el.appendChild(hireSection);
  }

  const recipeOpts=(G.recipes||[]).filter(r=>r.is_unlocked).map(r=>`<option value="${r.id}">${r.emoji} ${r.name}</option>`).join('');
  const ovenOpts=(G.ovens||[]).map(o=>`<option value="${o.id}">${o.name}</option>`).join('');

  let emptyEl = el.querySelector('.staff-empty');
  if (!G.workers?.length) {
    el.querySelectorAll('.worker-card-new').forEach(c=>c.remove());
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state staff-empty';
      emptyEl.innerHTML = `<div class="empty-icon">👥</div>No staff hired yet.`;
      el.insertBefore(emptyEl, hireSection);
    }
    return;
  }
  emptyEl?.remove();

  G.workers?.forEach(w=>{
    if(lockedWorkers.has(w.id)) return;
    const existing=$(`wcard-${w.id}`);
    const newCard=buildWorkerCard(w,recipeOpts,ovenOpts);
    if(!existing){
      const tmp=document.createElement('div');
      tmp.innerHTML=newCard;
      el.insertBefore(tmp.firstElementChild, hireSection);
    } else {
      existing.outerHTML=newCard;
    }
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
        ${!u.owned?`<button class="btn btn-info btn-sm" onclick="buyUpgrade('${u.id}')">Buy</button>`:''}
      </div>
    </div>`).join('');
}

// ── Recipe Shop (Issue 2: waits for G.recipes) ────────────────────────────────
function renderRecipeShop() {
  const el=$('panel-recipe-shop');
  if(!el) return;

  // Issue 2: guard — render nothing until data arrives
  if(!G.recipes) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📖</div>Loading…</div>`;
    return;
  }

  if(!G.recipes.length) {
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📖</div>No recipes found. Run <code>seed_recipes</code>.</div>`;
    return;
  }

  const state=G.state||{};

  el.innerHTML = G.recipes.map(r => {
    const locked   = !r.is_unlocked;
    const canBuy   = r.can_purchase && r.shop_price;
    const price    = r.shop_price;
    const affordable = price && Number(state.money) >= price;

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
    <div class="recipe-shop-card ${locked?'locked':''}" id="rshop-${r.id}">
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
          <div class="price-tag"><span class="sz">S</span><span class="pr">$${r.prices.Small}</span></div>
          <div class="price-tag"><span class="sz">M</span><span class="pr">$${r.prices.Medium}</span></div>
          <div class="price-tag"><span class="sz">L</span><span class="pr">$${r.prices.Large}</span></div>
        </div>`}
      </div>
      ${canBuy?`<button class="btn ${affordable?'btn-success':'btn-secondary'} btn-sm"
        style="flex-shrink:0;align-self:center"
        ${!affordable?'disabled':''}
        onclick="buyRecipe(${r.id})">
        ${affordable?`🔓 ${fmt(price)}`:`🔒 ${fmt(price)}`}
      </button>`:''}
    </div>`;
  }).join('');
}

// ── Reports ───────────────────────────────────────────────────────────────────
function renderReportsTab() {
  const el=$('panel-history');
  if(!G.reports?.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📊</div>No reports yet.</div>`;return;}
  const rows=G.reports.map(r=>{const c=r.net_profit>=0?'var(--green)':'var(--accent)';return`<tr>
    <td>Day ${r.day}</td><td style="color:var(--accent2)">${fmt(r.revenue)}</td>
    <td style="color:${c}">${fmt(r.net_profit)}</td>
    <td>${r.orders_fulfilled}</td><td style="color:var(--accent)">${r.orders_expired}</td>
    <td>${r.customer_satisfaction}%</td>
    <td style="color:var(--muted);font-size:0.75rem">${r.best_seller?`${r.best_seller}×${r.best_seller_count}`:'-'}</td>
  </tr>`;}).join('');
  el.innerHTML=`<table class="history-table"><thead><tr><th>Day</th><th>Rev</th><th>Net</th><th>✔</th><th>✘</th><th>😊</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Notifications ─────────────────────────────────────────────────────────────
let _lastReadEventId = parseInt(sessionStorage.getItem('lastReadEventId') || '0');

function renderNotificationBadge(){
  const badge=$('notif-badge');
  if (!badge) return;
  const unread = (G.event_log||[]).filter(e =>
    e.id > _lastReadEventId && ['success','warning','error'].includes(e.log_type)
  ).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
function toggleNotifications(){
  const panel=$('notif-panel'); if(!panel) return;
  const open=panel.classList.toggle('open');
  if(open&&G.event_log){
    const maxId = Math.max(0, ...(G.event_log.map(e=>e.id)));
    _lastReadEventId = maxId;
    sessionStorage.setItem('lastReadEventId', maxId);
    renderNotificationBadge();
    panel.innerHTML=`<div class="notif-header"><strong>Activity Log</strong>
      <button class="btn btn-secondary btn-sm" onclick="toggleNotifications()">✕</button></div>
      <div class="notif-list">${G.event_log.map(e=>`<div class="notif-item ${e.log_type}">
        <span class="notif-icon">${e.icon}</span>
        <span class="notif-msg">${e.message}</span>
        <span class="notif-day">D${e.day}</span></div>`).join('')}</div>`;
  }
}

// ── Fire Modal ────────────────────────────────────────────────────────────────
let _fireId=null;
function openFireModal(id,name){
  _fireId=id;
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
  const w = G.workers?.find(w => w.id === workerId); if (!w) return;
  const si = w.skill_info;
  const [bg] = AVATAR_COLORS[w.id % AVATAR_COLORS.length];
  const morale = w.morale ?? 70;
  const moraleColor = morale >= 80 ? 'var(--green2)' : morale >= 50 ? 'var(--gold2)' : 'var(--red)';
  const posT = w.positive_trait ? POSITIVE_TRAITS[w.positive_trait] : null;
  const negT = w.negative_trait ? NEGATIVE_TRAITS[w.negative_trait] : null;
  const mastery = w.skill_mastery || {};
  const roleSkills = ROLE_SKILLS[w.role] || [];

  $('worker-detail-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
      <div style="width:56px;height:56px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">${workerRoleIcon(w.role)}</div>
      <div>
        <div style="font-size:1.1rem;font-weight:800;">${w.name}</div>
        <div style="font-size:0.8rem;color:var(--muted);text-transform:capitalize;">${w.role} · ${fmt(w.salary_per_day)}/day</div>
        <div style="font-size:0.8rem;color:${moraleColor};margin-top:2px;">Morale ${morale}/100</div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-label">Personality Traits</div>
      ${posT ? `<div class="detail-row" style="color:var(--green2);">${posT.icon} <strong>${posT.name}</strong> — ${posT.desc}</div>` : '<div class="detail-row" style="color:var(--muted);">No trait assigned yet</div>'}
      ${negT ? `<div class="detail-row" style="color:#e06060;">${negT.icon} <strong>${negT.name}</strong> — ${negT.desc}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-label">Skill Mastery</div>
      ${roleSkills.map(sk => {
        const lvl = mastery[sk] || 0;
        const name = sk.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
        const mastName = SKILL_MASTERY_NAMES[lvl] || 'Locked';
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:9px;width:120px;color:var(--muted);">${name}</span>
          <div style="flex:1;height:5px;background:var(--border-dark);">
            <div style="width:${lvl*20}%;height:100%;background:var(--gold2);"></div>
          </div>
          <span style="font-size:8px;color:${lvl>=5?'var(--gold)':'var(--muted)'};width:64px;">${mastName}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="detail-section">
      <div class="detail-label">Level & XP</div>
      <div class="xp-row">
        <span class="xp-label">Lv.${w.level}</span>
        <div class="xp-bar-wrap" style="flex:1"><div class="xp-bar-fill" style="width:${w.xp_progress_pct}%"></div></div>
        <span class="xp-label">Lv.${Math.min(w.level+1,10)}</span>
      </div>
      ${si ? `<div style="margin-top:4px;">${skillRarityBadge(si)}</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="detail-label">Minigame Bonus (baker only)</div>
      ${w.role==='baker' ? (() => {
        const lvl = mastery['oven_instinct'] || 0;
        const slowPct = [0,5,15,30,45][lvl] || 0;
        const widePct = [0,10,25,40,60][lvl] || 0;
        return `<div class="detail-row">🕐 Clock speed: <strong style="color:var(--gold);">−${slowPct}% slower</strong></div>
                <div class="detail-row">🎯 Perfect zone: <strong style="color:var(--gold);">+${widePct}% wider</strong></div>
                ${lvl>=5?'<div class="detail-row" style="color:var(--green2);">⭐ Auto-pull cake at perfect!</div>':''}`;
      })() : '<div class="detail-row" style="color:var(--muted);">N/A</div>'}
    </div>`;

  $('worker-detail-modal').classList.add('open');
}
function closeWorkerDetail(){$('worker-detail-modal').classList.remove('open');}

// ── Hire Modal ────────────────────────────────────────────────────────────────
function openHireModal(){
  const pool=G.hire_pool||[];
  const body=$('hire-modal-body');
  if(!pool.length){
    body.innerHTML=`<div class="empty-state"><div class="empty-icon">😴</div>No workers available.</div>`;
  } else {
    body.innerHTML=pool.map(hw=>{
      const stars=Array.from({length:3},(_,i)=>`<span style="color:${i<hw.skill_level?'#f5a623':'#2a2a4a'}">★</span>`).join('');
      const icon=workerRoleIcon(hw.role);
      const si=hw.skill_info;
      const posT = hw.positive_trait ? POSITIVE_TRAITS[hw.positive_trait] : null;
      const negT = hw.negative_trait ? NEGATIVE_TRAITS[hw.negative_trait] : null;
      const daysLeft=hw.expires_on_day-(G.state?.day||1);
      const [bg]=AVATAR_COLORS[hw.id%AVATAR_COLORS.length];
      const rarityColor=si?si.rarity_color:'#888';
      return `<div class="hire-pool-card">
        <div class="worker-avatar-circle" style="background:${bg};cursor:default;flex-shrink:0;width:52px;height:52px">
          <span class="avatar-role-emoji">${icon}</span>
          <div class="avatar-star-badge">${'★'.repeat(hw.skill_level)}</div>
        </div>
        <div class="hire-pool-info">
          <div class="hire-pool-name">${hw.name}</div>
          <div style="font-size:0.75rem;color:var(--muted);text-transform:capitalize;margin-bottom:0.2rem">${hw.role}</div>
          <div class="skill-tags">
            ${posT ? `<span style="font-size:8px;padding:1px 4px;background:rgba(90,138,60,.3);color:var(--green2);" data-tip="${posT.desc}">${posT.icon} ${posT.name}</span>` : ''}
            ${negT ? `<span style="font-size:8px;padding:1px 4px;background:rgba(139,32,32,.3);color:#e06060;" data-tip="${negT.desc}">${negT.icon} ${negT.name}</span>` : ''}
            ${hw.role==='baker'?`<span class="skill-tag base">⚡ Bake ${hw.bake_speed}</span>`:''}
            <span class="skill-tag base">🤝 Svc ${hw.service_speed}</span>
            ${si?`<span class="skill-tag" style="background:${rarityColor}22;color:${rarityColor};border:1px solid ${rarityColor}44"
              data-tip="${si.rarity_label}: ${si.desc}">${si.name}</span>`:'<span class="skill-tag base">No skill</span>'}
          </div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:0.3rem">
            ${fmt(hw.salary_per_day)}/day &nbsp;·&nbsp; ${daysLeft}d left in pool
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.5rem;flex-shrink:0">
          <div style="font-weight:800;color:var(--accent2);font-size:0.95rem">${fmt(hw.hire_cost)}</div>
          <div style="font-size:0.68rem;color:var(--muted)">${stars}</div>
          <button class="btn btn-success btn-sm" onclick="hireFromPool(${hw.id},this)">Hire</button>
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

// ── Baking Minigame ───────────────────────────────────────────────────────────
let _bakeState = {};

function openBakeModal(ovenId) {
  const oven = G.ovens?.find(o => o.id === ovenId);
  if (!oven) return;

  // Option B: worker already baking — show clock only
  if (oven.is_busy && oven.current_cake) {
    openOvenClock(ovenId, oven.current_cake);
    return;
  }

  // Option A: free oven — full minigame
  const unlocked = (G.recipes || []).filter(r => r.is_unlocked);
  if (!unlocked.length) { toast('No recipes unlocked yet.', 'error'); return; }

  _bakeState = {
    ovenId, step: 1,
    recipe: unlocked[0],
    size: 'Medium',
    shape: null,
    decos: [],
    mixAdded: [],
    bonuses: { mix: false, shape: 0, deco: 0, oven: null },
  };

  showPopup(buildBakePopupHtml());
  setupMixStep();
}

function buildBakePopupHtml() {
  const r = _bakeState.recipe;
  const unlocked = (G.recipes || []).filter(r => r.is_unlocked);
  return `
  <div style="background:var(--surface);width:560px;display:flex;flex-direction:column;" id="bake-popup">
    <div style="background:var(--gold2);padding:6px 12px;font-size:11px;font-weight:700;color:#1a0f06;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--border-dark);">
      🔥 Bake — ${G.ovens?.find(o=>o.id===_bakeState.ovenId)?.name||'Oven'}
      <button class="btn btn-danger btn-sm" onclick="closePopup()">✕</button>
    </div>

    <!-- Step tabs -->
    <div style="display:flex;border-bottom:2px solid var(--border-dark);" id="bake-steps">
      ${[['1','🍫','Mix'],['2','🔵','Shape'],['3','🎨','Deco'],['4','🔥','Oven']].map(([n,ic,lb])=>`
        <div id="bstep-${n}" style="flex:1;text-align:center;padding:5px 2px;font-size:8px;text-transform:uppercase;
          background:${n==='1'?'var(--gold)':'var(--surface2)'};color:${n==='1'?'#1a0f06':'var(--cream-dim)'};
          font-weight:${n==='1'?'700':'400'};border-right:1px solid var(--border-dark);">${ic} ${lb}</div>`).join('')}
    </div>

    <div style="display:flex;height:280px;">
      <!-- LEFT: ingredients/status -->
      <div style="width:140px;background:var(--panel);border-right:2px solid var(--border-dark);padding:7px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;" id="bake-left">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--cream-dim);font-weight:700;">Recipe</div>
        <select id="bake-recipe-sel" onchange="onBakeRecipeChange(this)" style="background:var(--surface2);border:none;color:var(--cream);font-size:9px;padding:3px;font-family:inherit;width:100%;">
          ${unlocked.map(r=>`<option value="${r.id}">${r.emoji} ${r.name}</option>`).join('')}
        </select>
        <select id="bake-size-sel" onchange="onBakeSizeChange(this)" style="background:var(--surface2);border:none;color:var(--cream);font-size:9px;padding:3px;font-family:inherit;width:100%;">
          <option value="Small">Small (4 slices)</option>
          <option value="Medium" selected>Medium (8 slices)</option>
          <option value="Large">Large (12 slices)</option>
        </select>
        <div style="border-top:1px solid var(--border-dark);padding-top:4px;margin-top:2px;">
          <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--cream-dim);font-weight:700;margin-bottom:3px;">Ingredients</div>
          <div id="bake-ingr-list"></div>
        </div>
      </div>

      <!-- CENTER -->
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px;" id="bake-center">
        <div id="bake-step-content"></div>
      </div>

      <!-- RIGHT: bonuses -->
      <div style="width:130px;background:var(--panel);border-left:2px solid var(--border-dark);padding:7px;display:flex;flex-direction:column;gap:5px;">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:var(--cream-dim);font-weight:700;">Bonuses</div>
        <div id="bake-bonus-mix"  style="font-size:8px;padding:2px 5px;background:var(--surface2);font-weight:700;">Mix: pending</div>
        <div id="bake-bonus-shape" style="font-size:8px;padding:2px 5px;background:var(--surface2);font-weight:700;">Shape: ?</div>
        <div id="bake-bonus-deco"  style="font-size:8px;padding:2px 5px;background:var(--surface2);font-weight:700;">Deco: +0%</div>
        <div id="bake-bonus-oven"  style="font-size:8px;padding:2px 5px;background:var(--surface2);font-weight:700;">Oven: ?</div>
        <div style="border-top:1px solid var(--border-dark);padding-top:4px;margin-top:auto;">
          <div style="font-size:8px;color:var(--cream-dim);">Base price:</div>
          <div style="font-size:10px;font-weight:700;color:var(--gold);" id="bake-base-price">-</div>
        </div>
      </div>
    </div>
  </div>`;
}

function updateBakeRecipeInfo() {
  const r = _bakeState.recipe;
  const size = _bakeState.size;
  if (!r) return;
  const price = r.prices?.[size] ?? r[`price_${size.toLowerCase()}`] ?? 0;
  const el = document.getElementById('bake-base-price');
  if (el) el.textContent = fmt(price);
}

function onBakeRecipeChange(sel) {
  const r = G.recipes?.find(r => r.id === parseInt(sel.value));
  if (r) { _bakeState.recipe = r; _bakeState.mixAdded = []; setupMixStep(); updateBakeRecipeInfo(); }
}

function onBakeSizeChange(sel) {
  _bakeState.size = sel.value;
  updateBakeRecipeInfo();
}

// ── Step 1: Mix ───────────────────────────────────────────────────────────────
function setupMixStep() {
  setBakeStep(1);
  const r = _bakeState.recipe;
  const ingrs = r?.ingredients || [];
  _bakeState.mixAdded = [];

  const listEl = document.getElementById('bake-ingr-list');
  if (listEl) {
    listEl.innerHTML = ingrs.map((ing, i) =>
      `<div id="mingr-${i}" onclick="addIngredient(${i})" style="background:var(--surface2);padding:3px 5px;margin-bottom:2px;font-size:9px;cursor:pointer;transition:filter .1s;"
        data-tip="Tap to add">${ing}</div>`).join('');
  }

  const center = document.getElementById('bake-step-content');
  if (center) {
    center.innerHTML = `
      <canvas id="mix-bowl" width="130" height="80" style="image-rendering:pixelated;"></canvas>
      <div style="font-size:9px;color:var(--cream-dim);text-align:center;" id="mix-hint">Tap ingredients in order to add them</div>
      <button class="btn btn-warning btn-sm" id="mix-next-btn" disabled onclick="goToStep(2)" style="font-size:10px;">Next: Shape →</button>`;
  }
  drawMixBowl();
  updateBakeRecipeInfo();
}

function drawMixBowl() {
  const c = document.getElementById('mix-bowl'); if (!c) return;
  const x = c.getContext('2d');
  const ingrs = _bakeState.recipe?.ingredients || [];
  x.clearRect(0,0,130,80);
  x.fillStyle='#5c3a1e'; x.fillRect(15,30,100,42);
  x.fillStyle='#3d2512'; x.fillRect(10,24,110,12);
  const cols=['#3d1a0a','#d4c070','#ffd5aa','#f0e060','#ffffff88','#c07820'];
  _bakeState.mixAdded.forEach((idx,i) => {
    x.fillStyle=cols[idx%cols.length]; x.fillRect(18+i*16,36,14,22);
  });
  if (_bakeState.mixAdded.length) {
    x.fillStyle='rgba(80,40,10,0.5)'; x.fillRect(16,36,98,28);
  }
  x.fillStyle='#f0c040'; x.font='7px "Segoe UI"'; x.textAlign='center';
  x.fillText(`${_bakeState.mixAdded.length}/${ingrs.length} added`, 65, 78);
}

function addIngredient(idx) {
  const ingrs = _bakeState.recipe?.ingredients || [];
  const expected = _bakeState.mixAdded.length;
  if (idx !== expected) {
    const el = document.getElementById(`mingr-${idx}`);
    if (el) { el.style.background='var(--red)'; setTimeout(()=>el.style.background='var(--surface2)',400); }
    const hint = document.getElementById('mix-hint');
    if (hint) hint.textContent = `⚠️ Wrong order! Need: ${ingrs[expected]}`;
    return;
  }
  _bakeState.mixAdded.push(idx);
  const el = document.getElementById(`mingr-${idx}`);
  if (el) { el.style.background='var(--green)'; el.style.opacity='0.7'; el.onclick=null; }
  const hint = document.getElementById('mix-hint');
  if (_bakeState.mixAdded.length === ingrs.length) {
    if (hint) hint.textContent = '✅ All mixed!';
    const btn = document.getElementById('mix-next-btn');
    if (btn) btn.disabled = false;
    const bonusEl = document.getElementById('bake-bonus-mix');
    if (bonusEl) { bonusEl.textContent='Mix: ✅ +0%'; bonusEl.style.background='var(--green)'; bonusEl.style.color='#fff'; }
    _bakeState.bonuses.mix = true;
  } else {
    if (hint) hint.textContent = `Added (${_bakeState.mixAdded.length}/${ingrs.length})`;
  }
  drawMixBowl();
}

// ── Step 2: Shape ─────────────────────────────────────────────────────────────
function setupShapeStep() {
  const center = document.getElementById('bake-step-content');
  if (!center) return;
  center.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:var(--gold);margin-bottom:4px;">Choose a shape</div>
    <div style="display:flex;gap:5px;justify-content:center;">
      ${[['round','🔵','+5%'],['square','🟫','+3%'],['heart','❤️','+8%'],['star','⭐','+10%']].map(([s,ic,b])=>
        `<div onclick="selectShape('${s}',this)" id="shape-${s}"
          style="font-size:20px;padding:6px 9px;background:var(--surface2);cursor:pointer;
          border-top:2px solid var(--border-light);border-left:2px solid var(--border-light);
          border-right:2px solid var(--border-dark);border-bottom:2px solid var(--border-dark);"
          data-tip="${ic} ${b} price bonus">${ic}</div>`).join('')}
    </div>
    <canvas id="shape-preview" width="120" height="70" style="image-rendering:pixelated;margin-top:6px;"></canvas>
    <div style="font-size:9px;color:var(--cream-dim);" id="shape-hint">Pick a shape for a bonus</div>
    <button class="btn btn-warning btn-sm" id="shape-next-btn" disabled onclick="goToStep(3)" style="font-size:10px;">Next: Decorate →</button>`;
}

function selectShape(shape, el) {
  _bakeState.shape = shape;
  document.querySelectorAll('[id^="shape-"]').forEach(e => e.style.background='var(--surface2)');
  el.style.background = 'var(--gold2)';
  const bonuses = {round:5, square:3, heart:8, star:10};
  const pct = bonuses[shape];
  document.getElementById('shape-hint').textContent = `${shape}: +${pct}% price bonus`;
  const bonusEl = document.getElementById('bake-bonus-shape');
  if (bonusEl) { bonusEl.textContent=`Shape: +${pct}%`; bonusEl.style.background='var(--gold2)'; bonusEl.style.color='#1a0f06'; }
  _bakeState.bonuses.shape = pct;
  document.getElementById('shape-next-btn').disabled = false;
  drawShapePreview(shape);
}

function drawShapePreview(shape) {
  const c = document.getElementById('shape-preview'); if (!c) return;
  const x = c.getContext('2d');
  x.clearRect(0,0,120,70);
  x.fillStyle='#6b3a1a';
  if (shape==='round') { x.beginPath(); x.ellipse(60,42,42,24,0,0,Math.PI*2); x.fill(); x.fillStyle='#8b5a2a'; x.beginPath(); x.ellipse(60,38,40,20,0,0,Math.PI*2); x.fill(); }
  else if (shape==='square') { x.fillRect(18,22,84,40); x.fillStyle='#8b5a2a'; x.fillRect(20,22,80,34); }
  else if (shape==='heart') { x.font='52px serif'; x.textAlign='center'; x.fillStyle='#8b2020'; x.fillText('❤',60,62); }
  else if (shape==='star') { x.font='52px serif'; x.textAlign='center'; x.fillStyle='#c07820'; x.fillText('⭐',60,62); }
}

// ── Step 3: Decorate ──────────────────────────────────────────────────────────
function setupDecoStep() {
  _bakeState.decos = [];
  const center = document.getElementById('bake-step-content');
  if (!center) return;
  center.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:var(--gold);margin-bottom:4px;">Add decorations (up to 2)</div>
    <canvas id="deco-preview" width="130" height="80" style="image-rendering:pixelated;margin-bottom:4px;"></canvas>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;width:200px;">
      ${['🍓','🍫','🌸','⭐','🍬','🥛','🍒','🌿'].map(d=>
        `<div onclick="toggleDeco('${d}',this)"
          style="font-size:16px;padding:5px;background:var(--surface2);cursor:pointer;text-align:center;
          border-top:2px solid var(--border-light);border-left:2px solid var(--border-light);
          border-right:2px solid var(--border-dark);border-bottom:2px solid var(--border-dark);">${d}</div>`).join('')}
    </div>
    <div style="font-size:9px;color:var(--cream-dim);margin-top:4px;" id="deco-hint">Each decoration +5% price</div>
    <button class="btn btn-success btn-sm" onclick="goToStep(4)" style="font-size:10px;margin-top:4px;">🔥 Send to Oven →</button>`;
  drawDecoPreview();
}

function toggleDeco(d, el) {
  if (_bakeState.decos.includes(d)) {
    _bakeState.decos = _bakeState.decos.filter(x=>x!==d);
    el.style.background='var(--surface2)';
  } else {
    if (_bakeState.decos.length >= 2) return;
    _bakeState.decos.push(d);
    el.style.background='var(--gold2)';
  }
  const pct = _bakeState.decos.length * 5;
  const hint = document.getElementById('deco-hint');
  if (hint) hint.textContent = `${_bakeState.decos.length}/2 selected — +${pct}% price bonus`;
  const bonusEl = document.getElementById('bake-bonus-deco');
  if (bonusEl) { bonusEl.textContent=`Deco: +${pct}%`; bonusEl.style.background='var(--blue)'; bonusEl.style.color='#fff'; }
  _bakeState.bonuses.deco = pct;
  drawDecoPreview();
}

function drawDecoPreview() {
  const c = document.getElementById('deco-preview'); if (!c) return;
  const x = c.getContext('2d');
  x.clearRect(0,0,130,80);
  x.fillStyle='#6b3a1a'; x.beginPath(); x.ellipse(65,48,52,26,0,0,Math.PI*2); x.fill();
  x.fillStyle='#8b5a2a'; x.beginPath(); x.ellipse(65,42,50,22,0,0,Math.PI*2); x.fill();
  x.fillStyle='#c07820'; x.beginPath(); x.ellipse(65,36,50,16,0,0,Math.PI*2); x.fill();
  _bakeState.decos.forEach((d,i) => { x.font='14px serif'; x.textAlign='center'; x.fillText(d,35+i*28,34); });
}

// ── Step 4: Oven clock ────────────────────────────────────────────────────────
let _clockEl=0, _clockTotal=180, _clockRunning=false, _clockDone=false, _clockRaf=null;
const CLOCK_PERFECT=[0.50,0.65], CLOCK_GOOD=[0.33,0.80];

function setupOvenStep() {
  const center = document.getElementById('bake-step-content');
  if (!center) return;

  // apply worker oven_instinct mastery
  const baker = G.ovens?.find(o=>o.id===_bakeState.ovenId)?.baker;
  const mastery = baker?.skill_mastery?.oven_instinct || 0;
  const speedMult = [1.0, 0.95, 0.85, 0.70, 0.55, 0][mastery];
  const zoneBonus = [0, 0.02, 0.05, 0.10, 0.15, 0.20][mastery];
  CLOCK_PERFECT[0] = Math.max(0.3, 0.50 - zoneBonus);
  CLOCK_PERFECT[1] = Math.min(0.85, 0.65 + zoneBonus);
  _clockTotal = Math.round(180 * speedMult);

  // auto-complete at mastery 5
  if (mastery >= 5) {
    _bakeState.bonuses.oven = 'perfect';
    updateOvenBonus('⭐ PERFECT! (Auto)', '#f0c040');
    finishBake('perfect'); return;
  }

  center.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:var(--gold);">Pull it out in the golden zone!</div>
    <canvas id="oven-clock" width="160" height="160" style="image-rendering:pixelated;"></canvas>
    <button class="btn btn-success btn-sm" id="pull-btn" onclick="pullCake()" style="font-size:12px;padding:6px 20px;">🫳 Pull Cake!</button>
    <div style="font-size:10px;font-weight:700;text-align:center;min-height:18px;" id="clock-result"></div>`;

  _clockEl=0; _clockRunning=true; _clockDone=false;
  if (_clockRaf) cancelAnimationFrame(_clockRaf);
  animateClock();
}

function animateClock() {
  if (_clockRunning && !_clockDone) {
    _clockEl++;
    if (_clockEl >= _clockTotal) _clockEl = _clockTotal;
  }
  drawClock(_clockEl / _clockTotal);
  if (!_clockDone) _clockRaf = requestAnimationFrame(animateClock);
}

function drawClock(p) {
  const c = document.getElementById('oven-clock'); if (!c) return;
  const x = c.getContext('2d');
  const cx=80,cy=80,r=68,s=-Math.PI/2;
  x.clearRect(0,0,160,160);
  x.fillStyle='#2d1b0e'; x.beginPath(); x.arc(cx,cy,r,0,Math.PI*2); x.fill();
  x.strokeStyle='#8b6340'; x.lineWidth=4; x.beginPath(); x.arc(cx,cy,r,0,Math.PI*2); x.stroke();
  // good zone
  x.fillStyle='rgba(90,138,60,0.35)'; x.beginPath(); x.moveTo(cx,cy);
  x.arc(cx,cy,r-6,s+CLOCK_GOOD[0]*Math.PI*2,s+CLOCK_GOOD[1]*Math.PI*2); x.fill();
  // perfect zone
  x.fillStyle='rgba(240,192,64,0.65)'; x.beginPath(); x.moveTo(cx,cy);
  x.arc(cx,cy,r-6,s+CLOCK_PERFECT[0]*Math.PI*2,s+CLOCK_PERFECT[1]*Math.PI*2); x.fill();
  // burnt sweep
  if (p>CLOCK_GOOD[1]) {
    const bp=(p-CLOCK_GOOD[1])/(1-CLOCK_GOOD[1]);
    x.fillStyle=`rgba(139,32,32,${0.3+0.6*bp})`; x.beginPath(); x.moveTo(cx,cy);
    x.arc(cx,cy,r-6,s+CLOCK_GOOD[1]*Math.PI*2,s+Math.min(p,1)*Math.PI*2); x.fill();
  }
  // ticks
  for(let i=0;i<12;i++){
    const a=s+i/12*Math.PI*2; x.strokeStyle='#6b4020'; x.lineWidth=2;
    x.beginPath(); x.moveTo(cx+Math.cos(a)*(r-10),cy+Math.sin(a)*(r-10));
    x.lineTo(cx+Math.cos(a)*(r-4),cy+Math.sin(a)*(r-4)); x.stroke();
  }
  // hand
  const angle=s+p*Math.PI*2;
  const hc=p>CLOCK_GOOD[1]?'#e94560':p>=CLOCK_PERFECT[0]&&p<=CLOCK_PERFECT[1]?'#f0c040':'#f5e6c8';
  x.strokeStyle=hc; x.lineWidth=4;
  x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx+Math.cos(angle)*(r-10),cy+Math.sin(angle)*(r-10)); x.stroke();
  x.fillStyle=hc; x.beginPath(); x.arc(cx,cy,6,0,Math.PI*2); x.fill();
  // center label
  x.textAlign='center';
  if(p>=CLOCK_PERFECT[0]&&p<=CLOCK_PERFECT[1]){x.fillStyle='#f0c040';x.font='bold 11px "Segoe UI"';x.fillText('⭐ NOW!',cx,cy+4);}
  else if(p>CLOCK_GOOD[1]){x.fillStyle='#e94560';x.font='bold 10px "Segoe UI"';x.fillText('🔥 BURNT!',cx,cy+4);}
  else{const f=Math.max(0,Math.floor((CLOCK_PERFECT[0]-p)*_clockTotal));x.fillStyle='#c4a882';x.font='8px "Segoe UI"';x.fillText(f>0?`~${f}f to ⭐`:'Almost!',cx,cy+4);}
}

function pullCake() {
  if (_clockDone) return;
  _clockDone=true; _clockRunning=false;
  const p=_clockEl/_clockTotal;
  let result;
  if(p<CLOCK_GOOD[0]) result='underbaked';
  else if(p<CLOCK_PERFECT[0]) result='good';
  else if(p<=CLOCK_PERFECT[1]) result='perfect';
  else if(p<=CLOCK_GOOD[1]) result='good';
  else result='burnt';
  document.getElementById('pull-btn').disabled=true;
  finishBake(result);
}

function updateOvenBonus(text, color) {
  const el=document.getElementById('bake-bonus-oven');
  if(el){el.textContent=`Oven: ${text}`;el.style.background=color;el.style.color=color==='#f0c040'?'#1a0f06':'#fff';}
}

async function finishBake(result) {
  const msgs={perfect:'⭐ PERFECT! +15%',good:'✅ Good bake!',underbaked:'❄️ Underbaked −10%',burnt:'🔥 Burnt! −30%'};
  const colors={perfect:'#f0c040',good:'var(--green2)',underbaked:'#3498db',burnt:'#e94560'};
  const resultEl=document.getElementById('clock-result');
  if(resultEl){resultEl.textContent=msgs[result];resultEl.style.color=colors[result];}
  updateOvenBonus(msgs[result], colors[result]);

  await new Promise(r=>setTimeout(r,800));

  const r=await api('/api/bake/',{
    recipe_id:_bakeState.recipe.id,
    size:_bakeState.size,
    oven_id:_bakeState.ovenId,
    manual_result:result,
  });
  if(r.ok){toast(r.message,'success');closePopup();fetchState();}
  else{toast(r.message,'error');}
}

// ── Step navigation ────────────────────────────────────────────────────────────
function goToStep(n) {
  setBakeStep(n);
  if(n===2) setupShapeStep();
  else if(n===3) setupDecoStep();
  else if(n===4) setupOvenStep();
}

function renderDrinksTab() {
  const el = $('panel-drinks'); if (!el) return;
  const drinks = G.drink_recipes || [];
  const hasStation = (G.brew_stations||[]).length > 0;

  if (!drinks.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">☕</div>No drinks yet. Run seed_recipes.</div>`;
    return;
  }

  el.innerHTML = (!hasStation ? `
    <div style="background:var(--surface2);padding:8px;font-size:9px;color:var(--cream-dim);border-left:3px solid var(--gold2);">
      ☕ Buy a <strong style="color:var(--gold2);">Brew Station</strong> from Upgrades to unlock drinks!
    </div>` : '') +
  drinks.map(d => {
    const locked = !d.is_unlocked;
    return `
    <div style="background:var(--surface);padding:7px;display:flex;align-items:center;gap:8px;
      border-top:2px solid ${locked?'var(--border-dark)':'var(--border-light)'};
      border-left:2px solid ${locked?'var(--border-dark)':'var(--border-light)'};
      border-right:2px solid var(--border-dark);border-bottom:2px solid var(--border-dark);
      opacity:${locked?'0.6':'1'};">
      <span style="font-size:1.4rem;">${d.emoji}</span>
      <div style="flex:1;">
        <div style="font-size:10px;font-weight:700;">${locked?'???':d.name}</div>
        <div style="font-size:8px;color:var(--muted);">
          ${locked ? (d.unlock_day?`📅 Day ${d.unlock_day}`:'Locked') : `${d.brew_time_sec}s · ${fmt(d.price)} · ${Math.round(d.ingredient_cost_pct*100)}% cost`}
        </div>
      </div>
      ${!locked && hasStation ? `<button class="btn btn-info btn-sm" style="font-size:9px;"
        onclick="brewDrink(${d.id})">☕ Brew</button>` : ''}
    </div>`;
  }).join('');
}

async function brewDrink(drinkId) {
  const r = await api('/api/brew/', {drink_id: drinkId});
  toast(r.message, r.ok ? 'success' : 'error');
  if (r.ok) fetchState();
}

function setBakeStep(n) {
  [1,2,3,4].forEach(i=>{
    const el=document.getElementById(`bstep-${i}`);
    if(!el)return;
    if(i<n){el.style.background='var(--green)';el.style.color='#fff';el.style.fontWeight='400';}
    else if(i===n){el.style.background='var(--gold)';el.style.color='#1a0f06';el.style.fontWeight='700';}
    else{el.style.background='var(--surface2)';el.style.color='var(--cream-dim)';el.style.fontWeight='400';}
  });
  _bakeState.step=n;
}

// ── Option B: Clock only popup ─────────────────────────────────────────────────
function openOvenClock(ovenId, cake) {
  const secsLeft = Math.max(0, (new Date(cake.bake_finish_at) - Date.now())/1000);
  const pStart = 1 - (secsLeft / cake.bake_duration_sec);

  showPopup(`
  <div style="background:var(--surface);width:320px;display:flex;flex-direction:column;">
    <div style="background:var(--gold2);padding:6px 12px;font-size:11px;font-weight:700;color:#1a0f06;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--border-dark);">
      🔥 Worker Baking — Take over timing
      <button class="btn btn-danger btn-sm" onclick="closePopup()">✕</button>
    </div>
    <div style="padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:9px;color:var(--cream-dim);text-align:center;">Pull at the right moment for a bonus!</div>
      <canvas id="oven-clock" width="160" height="160" style="image-rendering:pixelated;"></canvas>
      <button class="btn btn-success btn-sm" id="pull-btn" onclick="pullCake()" style="font-size:12px;padding:6px 20px;">🫳 Pull Cake!</button>
      <div style="font-size:10px;font-weight:700;text-align:center;min-height:18px;" id="clock-result"></div>
    </div>
  </div>`);

  _bakeState = { ovenId, recipe: {id: cake.recipe_id}, size: cake.size };
  _clockEl = Math.round(pStart * _clockTotal);
  _clockRunning = true; _clockDone = false;
  if(_clockRaf) cancelAnimationFrame(_clockRaf);
  animateClock();
}

// ── Report ────────────────────────────────────────────────────────────────────
function showReport(r){
  if(!r){fetchState();showScreen('screen-briefing');return;}
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
  if(r.ok){
    _dayEndAt = r.day_end_at || null;
    if(r.active_event)toast(`${r.active_event.icon} ${r.active_event.title}: ${r.active_event.msg}`,'warn');
    toast(r.message,'success');fetchState();
  } else toast(r.message,'error');
}
async function endDay(){
  const r=await api('/api/end-day/',{});
  _dayEndAt=null;
  if(r.ok){showReport(r.report);if(r.game_over)setTimeout(()=>toast('💸 Game Over!','error'),400);}
  else toast(r.message,'error');
}
function continueFromReport(){showBriefing();}
async function fulfillOrder(id,btn){
  const card=$(`order-card-${id}`);if(card)card.style.opacity='0.3';btn.disabled=true;
  const r=await api('/api/fulfill/',{order_id:id});
  if(r.ok){
  toast(r.message,'success');
  if(card)card.remove();
  if(typeof PhaserBridge!=='undefined') PhaserBridge.fulfillPopup(r.revenue||0);
  fetchState();
  }
  else{toast(r.message,'error');if(card)card.style.opacity='1';btn.disabled=false;}
}

async function buyOven(tier){
const r=await api('/api/buy-oven/',{tier});
toast(r.message,r.ok?'success':'error');
if(r.ok){
if(typeof PhaserBridge!=='undefined' && r.oven) PhaserBridge.ovenBought(r.oven);
fetchState();
}
}
async function buyUpgrade(id){
const r=await api('/api/buy-upgrade/',{upgrade_id:id});
toast(r.message,r.ok?'success':'error');
if(r.ok){
const cfg=(G.upgrades||[]).find(u=>u.id===id);
if(typeof PhaserBridge!=='undefined') PhaserBridge.upgradeBought(id, cfg?.name||id);
fetchState();
}

}async function buyRecipe(id){
  const r=await api('/api/buy-recipe/',{recipe_id:id});
  if(r.ok){
    toast(r.message,'success');
    const card=$(`rshop-${id}`);
    if(card){card.classList.add('unlocking');setTimeout(()=>card.classList.remove('unlocking'),600);}
    fetchState();
  } else toast(r.message,'error');
}
async function startCourse(workerId){
  const r=await api('/api/start-course/',{worker_id:workerId});
  toast(r.message,r.ok?'success':'error');if(r.ok)fetchState();
}

// ── Boot (Issue 6: only show start screen when game_started=false) ────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await api('/api/state/');
    G = data;
    if (G.state?.day_end_at) _dayEndAt = G.state.day_end_at;

    if (data.state?.game_started) {
    showScreen('screen-game');
    startPolling();
    // Phaser boots inside showScreen now
    } else {
      // Issue 6: always show start screen when no game running
      showScreen('screen-start');
    }
  } catch {
    showScreen('screen-start');
  }
  $('input-store-name')?.addEventListener('keydown', e => { if(e.key==='Enter') startGame(); });
});
