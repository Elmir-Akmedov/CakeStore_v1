/* cafe-scene.js — Pixel café scene renderer
   Called from game.js via updateCafeScene(G)
   Draws: floor, walls, tables, chairs, counter, kitchen, ovens, workers, customers
*/
'use strict';

(function() {

const PAL = {
  floorA:    '#c8a46e', floorB:    '#b8944e',
  wall:      '#5c3a1e', wallTop:   '#7a4e28',
  win:       '#87ceeb', winFr:     '#5c3a1e',
  curtain:   '#8b2020',
  table:     '#c8a030', tableDark: '#8b6340',
  chair:     '#8b5e3c', chairDark: '#6b3e1c',
  counter:   '#5c3a1e', counterTop:'#c07820',
  kitchen:   '#8b6340',
  oven:      '#4a3020', ovenDoor:  '#2a1a0a',
  plant:     '#3a6b20', plantPot:  '#8b4513',
  sign:      '#3d2512',
};

const CUST_COLORS = [
  '#e94560','#3498db','#2ecc71','#f5a623',
  '#9b59b6','#1abc9c','#e67e22','#e91e8c',
];

// ── Canvas setup ──────────────────────────────────────────────────────────────
let canvas, ctx, W, H;
let ovenGlow = 0;
let frameCount = 0;

function init() {
  canvas = document.getElementById('cafe-canvas');
  if (!canvas) return false;
  ctx = canvas.getContext('2d');
  W = canvas.width;
  H = canvas.height;
  return true;
}

// ── Scene elements ─────────────────────────────────────────────────────────────
const TABLES = [
  {x:170,y:170}, {x:280,y:170}, {x:390,y:170},
  {x:170,y:290}, {x:280,y:290}, {x:390,y:290},
];

const CHAIRS = TABLES.map(t => ([
  {x:t.x+2,  y:t.y-28}, {x:t.x+32, y:t.y-28},
  {x:t.x+2,  y:t.y+38}, {x:t.x+32, y:t.y+38},
]));

// ── Drawing helpers ────────────────────────────────────────────────────────────
function drawFloor() {
  const tileW = 22, tileH = 22;
  const startY = 72;
  for (let r = 0; r < Math.ceil((H - startY) / tileH) + 1; r++) {
    for (let c = 0; c < Math.ceil(W / tileW) + 1; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? PAL.floorA : PAL.floorB;
      ctx.fillRect(c * tileW, startY + r * tileH, tileW, tileH);
    }
  }
}

function drawWalls() {
  // back wall
  ctx.fillStyle = PAL.wallTop;
  ctx.fillRect(0, 0, W, 80);
  ctx.fillStyle = PAL.wall;
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, 72, W, 4);

  // windows
  [[60,8],[180,8],[290,8],[390,8]].forEach(([x,y]) => {
    ctx.fillStyle = PAL.win;
    ctx.fillRect(x, y, 60, 55);
    ctx.fillStyle = PAL.winFr;
    ctx.fillRect(x-3, y-3, 66, 61);
    ctx.fillRect(x+28, y-3, 4, 61);
    ctx.fillRect(x-3, y+24, 66, 4);
    ctx.fillStyle = PAL.curtain;
    ctx.fillRect(x-3, y-3, 10, 61);
    ctx.fillRect(x+53, y-3, 10, 61);
  });

  // sign
  ctx.fillStyle = PAL.sign;
  ctx.fillRect(230, 10, 100, 26);
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 9px "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.fillText('☕ CAFÉ', 280, 28);
}

function drawTable(x, y) {
  ctx.fillStyle = PAL.tableDark;
  ctx.fillRect(x-2, y-2, 64, 44);
  ctx.fillStyle = PAL.table;
  ctx.fillRect(x, y, 60, 40);
  ctx.fillStyle = '#a07828';
  ctx.fillRect(x+4, y+4, 52, 32);
  ctx.fillStyle = PAL.chairDark;
  ctx.fillRect(x+8, y+36, 8, 12);
  ctx.fillRect(x+44, y+36, 8, 12);
}

function drawChair(x, y) {
  ctx.fillStyle = PAL.chair;
  ctx.fillRect(x, y, 26, 20);
  ctx.fillStyle = PAL.chairDark;
  ctx.fillRect(x, y+16, 26, 6);
  ctx.fillRect(x+2, y+20, 6, 10);
  ctx.fillRect(x+18, y+20, 6, 10);
}

function drawPlant(x, y) {
  ctx.fillStyle = PAL.plantPot;
  ctx.fillRect(x+4, y+18, 20, 14);
  ctx.fillStyle = PAL.plant;
  ctx.fillRect(x, y+8, 12, 14);
  ctx.fillRect(x+12, y, 14, 20);
  ctx.fillRect(x+22, y+6, 12, 14);
  ctx.fillStyle = '#2a5010';
  ctx.fillRect(x+12, y+8, 4, 24);
}

function drawCounter() {
  ctx.fillStyle = PAL.counter;
  ctx.fillRect(30, 130, 140, 48);
  ctx.fillStyle = PAL.counterTop;
  ctx.fillRect(28, 128, 144, 8);
  // register
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(100, 114, 36, 18);
  ctx.fillStyle = 'rgba(0,200,100,0.8)';
  ctx.fillRect(102, 116, 32, 12);
  ctx.fillStyle = '#00cc66';
  ctx.font = '6px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('OPEN', 106, 124);
  // items
  ctx.font = '12px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🎂', 55, 138);
  ctx.fillText('🍰', 165, 138);
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 7px "Segoe UI"';
  ctx.fillText('CHECKOUT', 100, 186);
}

function drawKitchen(activeOvenCount) {
  // divider
  ctx.fillStyle = '#3d2512';
  ctx.fillRect(490, 72, 8, H);
  ctx.fillStyle = PAL.counterTop;
  ctx.fillRect(490, 72, 8, 4);
  // kitchen floor
  ctx.fillStyle = PAL.kitchen;
  ctx.fillRect(498, 76, W - 498, H);
  // label
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(498, 76, W - 498, 14);
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 7px "Segoe UI"';
  ctx.textAlign = 'center';
  ctx.fillText('— KITCHEN —', 498 + (W - 498) / 2, 87);

  // ovens (up to 3)
  [[510,100],[510,200],[510,300]].forEach(([x, y], i) => {
    const active = i < activeOvenCount;
    ctx.fillStyle = PAL.oven;
    ctx.fillRect(x, y, 70, 78);
    if (active) {
      const g = 0.6 + 0.4 * Math.sin(ovenGlow + i);
      ctx.fillStyle = `rgba(255,140,0,${0.08 * g})`;
      ctx.fillRect(x - 6, y - 4, 82, 88);
      ctx.fillStyle = `rgba(255,${80 + Math.floor(100 * g)},0,${0.75 + 0.25 * g})`;
      ctx.fillRect(x + 8, y + 10, 54, 50);
      for (let r = 0; r < 3; r++) {
        ctx.fillStyle = `rgba(255,200,0,${0.3 * g})`;
        ctx.fillRect(x + 10, y + 14 + r * 12, 50, 4);
      }
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(x + 8, y + 10, 54, 50);
    }
    [x+18, x+34, x+50].forEach(dx => {
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(dx, y + 72, 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = active ? '#f0c040' : '#555';
    ctx.font = '7px "Segoe UI"';
    ctx.textAlign = 'left';
    ctx.fillText(active ? '🔥 Baking' : 'Idle', x + 6, y + 5);
  });

  // prep counter
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(W - 34, 100, 30, 300);
  ctx.fillStyle = PAL.counterTop;
  ctx.fillRect(W - 34, 100, 30, 6);
}

// ── Pixel sprites ─────────────────────────────────────────────────────────────
function drawHumanoid(cx, cy, bodyColor, isWorker, indicator) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(cx - 7, cy + 14, 14, 4);
  // body
  ctx.fillStyle = isWorker ? '#fff' : bodyColor;
  ctx.fillRect(cx - 5, cy + 2, 10, 12);
  // head
  ctx.fillStyle = '#ffd5aa';
  ctx.fillRect(cx - 5, cy - 8, 10, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 5, cy - 8, 10, 10);
  // legs
  ctx.fillStyle = isWorker ? '#2a1a0a' : '#333';
  ctx.fillRect(cx - 5, cy + 14, 5, 7);
  ctx.fillRect(cx, cy + 14, 5, 7);
  // hat for worker
  if (isWorker) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 5, cy - 14, 10, 7);
  }
  // floating indicator
  if (indicator) {
    ctx.font = '9px serif';
    ctx.textAlign = 'center';
    ctx.fillText(indicator, cx, cy - 12);
  }
}

// ── Customer state machine ─────────────────────────────────────────────────────
const STATES = {
  ENTERING: 'entering', ORDERING: 'ordering', WAITING: 'waiting',
  EATING: 'eating', PAYING: 'paying', LEAVING: 'leaving',
};

class Customer {
  constructor(id, tableIdx) {
    this.id       = id;
    this.color    = CUST_COLORS[id % CUST_COLORS.length];
    this.state    = STATES.ENTERING;
    this.x        = -10;
    this.y        = 200 + (id % 3) * 30;
    this.targetX  = 100;
    this.targetY  = 165;
    this.timer    = 0;
    this.tableIdx = tableIdx % TABLES.length;
    this.food     = ['🍫','🍓','🍰','☕','🎂'][id % 5];
    this.bob      = Math.random() * Math.PI * 2;
  }

  update() {
    this.bob   += 0.08;
    this.timer += 1;

    switch (this.state) {
      case STATES.ENTERING:
        this.moveTo(100, 165);
        if (this.near(100, 165)) { this.state = STATES.ORDERING; this.timer = 0; }
        break;
      case STATES.ORDERING:
        if (this.timer > 90) { this.state = STATES.WAITING; this.timer = 0; }
        break;
      case STATES.WAITING: {
        const t = TABLES[this.tableIdx];
        this.moveTo(t.x + 10, t.y - 32);
        if (this.timer > 110) { this.state = STATES.EATING; this.timer = 0; }
        break;
      }
      case STATES.EATING:
        if (this.timer > 220) { this.state = STATES.PAYING; this.timer = 0; }
        break;
      case STATES.PAYING:
        this.moveTo(100, 165);
        if (this.timer > 70) { this.state = STATES.LEAVING; this.timer = 0; }
        break;
      case STATES.LEAVING:
        this.moveTo(-20, this.y);
        break;
    }
  }

  moveTo(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    if (d > 1.5) { this.x += dx / d * 1.5; this.y += dy / d * 1.5; }
  }

  near(tx, ty) {
    return Math.abs(this.x - tx) < 4 && Math.abs(this.y - ty) < 4;
  }

  draw() {
    const by = Math.sin(this.bob) * 1.5;
    const cx = Math.round(this.x);
    const cy = Math.round(this.y + by);
    const indicator =
      this.state === STATES.ORDERING ? '💬' :
      this.state === STATES.EATING   ? this.food :
      this.state === STATES.PAYING   ? '💳' : null;
    drawHumanoid(cx, cy, this.color, false, indicator);
  }

  isDone() { return this.state === STATES.LEAVING && this.x < -15; }
}

// ── Worker sprites ─────────────────────────────────────────────────────────────
class WorkerSprite {
  constructor(x, y, role) {
    this.x    = x; this.y = y; this.role = role;
    this.bob  = Math.random() * Math.PI * 2;
    this.patX = x; this.patDir = 1; this.patTimer = 0;
  }

  update() {
    this.bob += 0.05;
    if (this.role === 'baker') {
      this.patTimer++;
      const target = this.patTimer % 120 < 60 ? this.x - 20 : this.x + 20;
      this.patX += (target - this.patX) * 0.08;
    }
  }

  draw() {
    const by = Math.sin(this.bob) * 1.5;
    const cx = Math.round(this.role === 'baker' ? this.patX : this.x);
    const cy = Math.round(this.y + by);
    const emoji = this.role === 'baker' ? '👨‍🍳' : '👩';
    drawHumanoid(cx, cy, '#3498db', true, emoji);
  }
}

// ── State ──────────────────────────────────────────────────────────────────────
let customers    = [];
let workerSprites = [];
let spawnTimer   = 0;
let custIdSeq    = 0;
let tableUsed    = [];
let gameState    = {};
let animRunning  = false;
let rafId        = null;

function spawnCustomer() {
  if (customers.length >= 5) return;
  const freeTable = [0,1,2,3,4,5].find(i => !tableUsed.includes(i));
  if (freeTable === undefined) return;
  tableUsed.push(freeTable);
  customers.push(new Customer(custIdSeq++, freeTable));
}

function syncWorkers(G) {
  const workers = G.workers || [];
  const bakers  = workers.filter(w => w.role === 'baker' && w.is_active !== false);
  const cashiers = workers.filter(w => w.role === 'cashier' && w.is_active !== false);

  workerSprites = [];
  // cashier at counter
  if (cashiers.length > 0) workerSprites.push(new WorkerSprite(100, 168, 'cashier'));
  // bakers in kitchen
  bakers.slice(0, 2).forEach((_, i) => workerSprites.push(new WorkerSprite(540, 130 + i * 100, 'baker')));
}

// ── Main draw ──────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  ovenGlow += 0.06;

  const activeOvens = (gameState.ovens || []).filter(o => o.is_busy).length;

  drawFloor();
  drawWalls();

  // back chairs
  TABLES.forEach((_, i) => CHAIRS[i].slice(0, 2).forEach(c => drawChair(c.x, c.y)));
  TABLES.forEach(t => drawTable(t.x, t.y));
  // front chairs
  TABLES.forEach((_, i) => CHAIRS[i].slice(2).forEach(c => drawChair(c.x, c.y)));

  drawPlant(6, 78);
  drawPlant(460, 78);
  drawCounter();
  drawKitchen(activeOvens);

  // workers
  workerSprites.forEach(w => { w.update(); w.draw(); });

  // spawn & update customers
  spawnTimer++;
  if (spawnTimer > 160) { spawnCustomer(); spawnTimer = 0; }
  customers = customers.filter(c => {
    if (c.isDone()) {
      tableUsed = tableUsed.filter(i => i !== c.tableIdx);
      return false;
    }
    return true;
  });
  customers.forEach(c => { c.update(); c.draw(); });

  // HUD overlay (pending orders)
  const pending = customers.filter(c => c.state === STATES.ORDERING || c.state === STATES.WAITING);
  if (pending.length > 0) {
    ctx.fillStyle = 'rgba(20,10,5,0.82)';
    ctx.fillRect(8, H - 46, 200, 38);
    ctx.fillStyle = '#8b6340';
    ctx.fillRect(8, H - 46, 200, 3);
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 8px "Segoe UI"';
    ctx.textAlign = 'left';
    ctx.fillText(`🛎 ${pending.length} customer(s) waiting`, 14, H - 30);
    ctx.fillStyle = '#c4a882';
    ctx.font = '7px "Segoe UI"';
    const wCount = workerSprites.length;
    ctx.fillText(`${wCount} staff on duty`, 14, H - 16);
  }

  // is_open indicator
  if (gameState.state?.is_open) {
    ctx.fillStyle = 'rgba(90,138,60,0.85)';
    ctx.fillRect(W - 80, H - 28, 72, 20);
    ctx.fillStyle = '#7ab850';
    ctx.font = 'bold 8px "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.fillText('🟢 OPEN', W - 44, H - 14);
  }

  frameCount++;
  rafId = requestAnimationFrame(draw);
}

// ── Public API ─────────────────────────────────────────────────────────────────

window.initCafeScene = function() {
  if (!init()) return;
  if (animRunning) return;
  animRunning = true;
  spawnCustomer();
  setTimeout(spawnCustomer, 600);
  setTimeout(spawnCustomer, 1400);
  draw();
};

window.updateCafeScene = function(G) {
  gameState = G;
  syncWorkers(G);

  // sync customer count loosely with order count
  const orderCount = (G.orders || []).length;
  if (orderCount > customers.length && customers.length < 5) {
    spawnCustomer();
  }
};

window.stopCafeScene = function() {
  if (rafId) cancelAnimationFrame(rafId);
  animRunning = false;
};

})();