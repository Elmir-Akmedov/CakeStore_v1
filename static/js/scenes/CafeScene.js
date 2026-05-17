'use strict';
/**
 * CafeScene — Phase 2 full replacement.
 *
 * KEY FIXES vs old version:
 *  - Animations use explicit frame objects {key,frame} not generateFrameNumbers,
 *    because our textures are hand-drawn and frames registered manually.
 *  - Customers only spawn when server sends a real order. Zero ghost sprites.
 *  - Workers walk to their home position then idle-bob; they do NOT wander.
 *  - Upgrade cinematic pauses all input, zooms camera, plays sparkles, resumes.
 *  - Steam only emits on actually-baking ovens.
 *  - All tween targets are destroyed when server entity disappears.
 */
class CafeScene extends Phaser.Scene {
  constructor() { super({ key: 'CafeScene' }); }

  // ── Layout ────────────────────────────────────────────────────────────────
  static get L() {
    return {
      W: 760, H: 460,
      FLOOR_Y: 100,
      // Cashier stand
      CASHIER_X: 140, CASHIER_Y: 250,
      // Queue line (customers waiting)
      QUEUE_X: 140, QUEUE_START_Y: 340, QUEUE_STEP: 40,
      // Tables (front of house)
      TABLES: [
        { x: 280, y: 220 }, { x: 400, y: 220 },
        { x: 280, y: 330 }, { x: 400, y: 330 },
        { x: 280, y: 420 }, { x: 400, y: 420 },
      ],
      // Kitchen ovens
      OVENS: [
        { x: 545, y: 118 }, { x: 625, y: 118 }, { x: 705, y: 118 },
      ],
      // Brew station
      BREW: { x: 545, y: 290 },
      // Plants, windows
      PLANTS: [{ x: 18, y: 104 }, { x: 726, y: 104 }],
      WINDOWS: [{ x: 50, y: 16 }, { x: 160, y: 16 }, { x: 360, y: 16 }, { x: 470, y: 16 }],
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this._customers = {};    // orderId → { sprite, bubble, icon, impatience, key, qIdx }
    this._workers   = {};    // workerId → { sprite, label, moraleGfx, data }
    this._ovens     = [];    // array mirroring L.OVENS slots
    this._tableObjs = [];
    this._upgradeRunning = false;
    this._lastState = null;
  }

  // ── Create ────────────────────────────────────────────────────────────────
  create() {
    const { W, H, L: _ } = { W: CafeScene.L.W, H: CafeScene.L.H, L: CafeScene.L };
    const L = CafeScene.L;

    this._buildRoom();
    this._buildFurniture();
    this._buildAnimations();
    this._buildParticles();
    this._buildInput();

    this.game.events.on('server-state',   this._onState,   this);
    this.game.events.on('upgrade-bought', this._onUpgrade, this);
    this.game.events.on('oven-bought',    this._onOvenBought, this);

    // Idle-bob tick every 600 ms
    this.time.addEvent({
      delay: 600, loop: true,
      callback: this._idleBob, callbackScope: this,
    });
  }

  // ── Room ──────────────────────────────────────────────────────────────────
  _buildRoom() {
    const L = CafeScene.L;
    const W = L.W, H = L.H;

    // Sky strip
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x87ceeb, 0x87ceeb, 0xddeeff, 0xddeeff, 1);
    sky.fillRect(0, 0, W, L.FLOOR_Y);

    // Walls
    for (let x = 0; x < W; x += 32)
      this.add.image(x, 0, 'wall_panel').setOrigin(0, 0).setDepth(1);

    // Windows
    L.WINDOWS.forEach(p => this.add.image(p.x, p.y, 'window').setOrigin(0, 0).setDepth(2));

    // Store sign (text set later from server state)
    this.add.image(W / 2, 12, 'sign').setOrigin(0.5, 0).setDepth(3);
    this._signText = this.add.text(W / 2, 17, '🎂 CAFÉ', {
      fontSize: '11px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(4);

    // Floor tiles
    for (let y = L.FLOOR_Y; y < H; y += 32)
      for (let x = 0; x < W; x += 32) {
        const t = this.add.image(x, y, 'floor_tile').setOrigin(0, 0).setDepth(1);
        if (((x / 32) + (y / 32)) % 2 === 0) t.setTint(0xddaa66);
      }

    // Kitchen divider
    const div = this.add.graphics().setDepth(5);
    div.fillStyle(0x3d2512); div.fillRect(520, L.FLOOR_Y, 8, H - L.FLOOR_Y);
    div.fillStyle(0xc07820); div.fillRect(520, L.FLOOR_Y, 8, 4);
    // Kitchen label
    this.add.text(630, L.FLOOR_Y + 6, '— KITCHEN —', {
      fontSize: '8px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(6);

    // Kitchen floor tint
    const kFloor = this.add.graphics().setDepth(1);
    kFloor.fillStyle(0x9a7a50, 0.4);
    kFloor.fillRect(528, L.FLOOR_Y, W - 528, H - L.FLOOR_Y);

    // Plants
    L.PLANTS.forEach(p => this.add.image(p.x, p.y, 'plant').setOrigin(0, 0).setDepth(4));

    // Queue rope
    this._queueGfx = this.add.graphics().setDepth(3);
    this._drawQueueRope();
  }

  _drawQueueRope() {
    const L = CafeScene.L;
    this._queueGfx.clear();
    this._queueGfx.lineStyle(2, 0xc07820, 0.4);
    this._queueGfx.beginPath();
    this._queueGfx.moveTo(L.CASHIER_X, L.CASHIER_Y + 50);
    this._queueGfx.lineTo(L.QUEUE_X, L.QUEUE_START_Y + L.QUEUE_STEP * 5);
    this._queueGfx.strokePath();
  }

  // ── Furniture ─────────────────────────────────────────────────────────────
  _buildFurniture() {
    const L = CafeScene.L;

    // Cashier stand
    this.add.image(L.CASHIER_X, L.CASHIER_Y, 'cashier_stand').setOrigin(0.5, 0).setDepth(10);
    // Counter
    this.add.image(L.CASHIER_X, L.CASHIER_Y + 120, 'counter').setOrigin(0.5, 0).setDepth(10);
    // Display case (hidden until bought)
    this._displayCase = this.add.image(L.CASHIER_X, L.CASHIER_Y + 70, 'display_case')
      .setOrigin(0.5, 0).setDepth(10).setVisible(false).setAlpha(0);

    // Tables — start 2 visible
    this._tableObjs = L.TABLES.map((slot, i) => {
      const vis = i < 2;
      const tbl  = this.add.image(slot.x, slot.y, 'table').setOrigin(0.5, 0.5).setDepth(8).setVisible(vis).setAlpha(vis ? 1 : 0);
      const cn   = this.add.image(slot.x, slot.y - 30, 'chair').setOrigin(0.5, 0.5).setDepth(7).setVisible(vis).setAlpha(vis ? 1 : 0);
      const cs_  = this.add.image(slot.x, slot.y + 30, 'chair').setOrigin(0.5, 0.5).setDepth(9).setVisible(vis).setAlpha(vis ? 1 : 0);
      const full = this.add.image(slot.x + 28, slot.y - 28, 'table_full').setDepth(20).setVisible(false);
      return { tbl, cn, cs_, full, slot, visible: vis };
    });

    // Ovens — slot 0 visible by default (starter oven)
    this._ovenObjs = L.OVENS.map((slot, i) => {
      const spr = this.add.image(slot.x, slot.y, 'oven_idle')
        .setOrigin(0.5, 0).setDepth(10)
        .setVisible(i === 0).setAlpha(i === 0 ? 1 : 0)
        .setInteractive();
      spr._slotIdx = i;
      return { spr, slot, serverId: null, tier: 'basic', baking: false };
    });

    // Brew station hidden until bought
    this._brewSpr = this.add.image(L.BREW.x, L.BREW.y, 'brew_station_idle')
      .setOrigin(0.5, 0).setDepth(10).setVisible(false).setAlpha(0);
  }

  // ── Animations ────────────────────────────────────────────────────────────
  _buildAnimations() {
    // Use explicit frame objects because frames were manually registered in PreloadScene
    const roles = ['baker', 'cashier', 'waiter', 'manager', 'barista'];
    roles.forEach(role => {
      const key = `worker_${role}`;
      if (!this.anims.exists(`${key}_walk`)) {
        this.anims.create({
          key: `${key}_walk`,
          frames: [
            { key, frame: 0 }, { key, frame: 1 },
            { key, frame: 2 }, { key, frame: 3 },
          ],
          frameRate: 7, repeat: -1,
        });
      }
      if (!this.anims.exists(`${key}_idle`)) {
        this.anims.create({
          key: `${key}_idle`,
          frames: [{ key, frame: 0 }],
          frameRate: 1, repeat: -1,
        });
      }
    });

    for (let i = 0; i < 8; i++) {
      const key = `customer_${i}`;
      if (!this.anims.exists(`${key}_walk`)) {
        this.anims.create({
          key: `${key}_walk`,
          frames: [
            { key, frame: 0 }, { key, frame: 1 },
            { key, frame: 2 }, { key, frame: 3 },
          ],
          frameRate: 7, repeat: -1,
        });
      }
      if (!this.anims.exists(`${key}_idle`)) {
        this.anims.create({
          key: `${key}_idle`,
          frames: [{ key, frame: 0 }],
          frameRate: 1, repeat: -1,
        });
      }
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  _buildParticles() {
    this._steamEmitter = this.add.particles(0, 0, 'steam', {
      x: { min: -6, max: 6 },
      speedY: { min: -35, max: -65 },
      speedX: { min: -4, max: 4 },
      alpha: { start: 0.55, end: 0 },
      scale: { start: 0.9, end: 0.2 },
      lifespan: { min: 900, max: 1600 },
      frequency: 350,
      quantity: 1,
    }).setDepth(26).stop();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  _buildInput() {
    this.input.on('gameobjectdown', (_ptr, obj) => {
      if (obj._slotIdx !== undefined) {
        const ov = this._ovenObjs[obj._slotIdx];
        if (ov?.serverId != null)
          this.game.events.emit('oven-clicked', ov.serverId);
      }
    });
  }

  // ── Server state ──────────────────────────────────────────────────────────
  _onState(G) {
    if (this._upgradeRunning) return;
    this._lastState = G;
    const st = G.state || {};

    // Sign
    if (this._signText) this._signText.setText(`🎂 ${st.store_name || 'CAFÉ'}`);

    // Brew station
    if (st.owned_upgrades?.includes('brew_station') && !this._brewSpr.visible)
      this._revealBrewStation();

    // Display case
    if (st.owned_upgrades?.includes('display_case') && !this._displayCase.visible) {
      this._displayCase.setVisible(true);
      this.tweens.add({ targets: this._displayCase, alpha: 1, duration: 500, ease: 'Power2' });
    }

    // Sync everything
    this._syncOvens(G.ovens || []);
    this._syncTables(st);
    this._syncWorkers(G.workers || []);
    this._syncCustomers(G.orders || []);
    this._syncSteam(G.ovens || []);
    this._syncTableFull(G.orders || [], st);
  }

  // ── Ovens ──────────────────────────────────────────────────────────────────
  _syncOvens(ovens) {
    ovens.forEach((ov, i) => {
      if (i >= this._ovenObjs.length) return;
      const obj = this._ovenObjs[i];
      obj.serverId = ov.id;
      obj.tier     = ov.tier;
      obj.baking   = ov.is_busy;

      const texKey = ov.is_busy
        ? (ov.tier === 'industrial' ? 'oven_ind_baking' : ov.tier === 'pro' ? 'oven_pro_baking' : 'oven_baking')
        : (ov.tier === 'industrial' ? 'oven_ind_idle'   : ov.tier === 'pro' ? 'oven_pro_idle'   : 'oven_idle');

      if (!obj.spr.visible) {
        obj.spr.setVisible(true);
        this.tweens.add({ targets: obj.spr, alpha: 1, duration: 400, ease: 'Back.easeOut' });
      }
      obj.spr.setTexture(texKey);
    });
  }

  // ── Tables ─────────────────────────────────────────────────────────────────
  _syncTables(state) {
    const upgrades = state.owned_upgrades || [];
    // base 2 + extra_table upgrades
    const count = state.tables_count ?? (2 + upgrades.filter(u => u === 'extra_table').length);
    const visible = Math.min(count, this._tableObjs.length);
    this._tableObjs.forEach((t, i) => {
      if (i < visible && !t.visible) {
        t.visible = true;
        t.tbl.setVisible(true); t.cn.setVisible(true); t.cs_.setVisible(true);
        this.tweens.add({
          targets: [t.tbl, t.cn, t.cs_],
          alpha: 1, y: '-=6', duration: 500, ease: 'Back.easeOut',
          onComplete: () => { t.tbl.y += 6; t.cn.y += 6; t.cs_.y += 6; },
        });
      }
    });
  }

  _syncTableFull(orders, state) {
    const tables = state.tables_count ?? 2;
    const seated = orders.filter(o =>
      o.lifecycle_state === 'waiting_for_food' || o.lifecycle_state === 'seated').length;
    this._tableObjs.forEach((t, i) => {
      if (!t.visible) { t.full.setVisible(false); return; }
      t.full.setVisible(i < tables && seated >= tables);
    });
  }

  // ── Workers ────────────────────────────────────────────────────────────────
  _syncWorkers(workers) {
    const activeIds = new Set(workers.map(w => w.id));

    // Remove gone workers
    Object.keys(this._workers).forEach(id => {
      if (!activeIds.has(+id)) {
        const ws = this._workers[id];
        this.tweens.add({
          targets: [ws.sprite, ws.label],
          alpha: 0, duration: 400,
          onComplete: () => {
            ws.sprite.destroy();
            ws.label.destroy();
            ws.moraleGfx.destroy();
          },
        });
        delete this._workers[id];
      }
    });

    workers.forEach(w => {
      if (!this._workers[w.id]) {
        this._spawnWorker(w);
      } else {
        this._moveWorker(this._workers[w.id], w);
      }
    });
  }

  _spawnWorker(w) {
    const home = this._workerHome(w);
    const key  = `worker_${w.role}`;
    const spr  = this.add.sprite(home.x, home.y + 20, key)
      .setDepth(15).setScale(1.5).setAlpha(0);
    spr.play(`${key}_idle`);

    this.tweens.add({ targets: spr, alpha: 1, y: home.y, duration: 400, ease: 'Back.easeOut' });

    const label = this.add.text(home.x, home.y - 18, w.name.split(' ')[0], {
      fontSize: '8px', fontFamily: 'Segoe UI', color: '#f5e6c8',
      backgroundColor: '#1a0f0699', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(16).setAlpha(0);
    this.tweens.add({ targets: label, alpha: 1, duration: 400, delay: 200 });

    const moraleGfx = this.add.graphics().setDepth(16);

    this._workers[w.id] = { sprite: spr, label, moraleGfx, data: w };
  }

  _moveWorker(ws, w) {
    ws.data = w;
    const home = this._workerHome(w);
    const dist = Phaser.Math.Distance.Between(ws.sprite.x, ws.sprite.y, home.x, home.y);
    const key  = `worker_${w.role}`;

    if (dist > 10) {
      ws.sprite.play(`${key}_walk`);
      ws.sprite.setFlipX(home.x < ws.sprite.x);
      this.tweens.killTweensOf(ws.sprite);
      this.tweens.add({
        targets: ws.sprite, x: home.x, y: home.y,
        duration: Math.min(dist * 6, 1400), ease: 'Linear',
        onComplete: () => {
          if (ws.sprite.active) {
            ws.sprite.play(`${key}_idle`);
            ws.sprite.setFlipX(false);
          }
        },
      });
    }

    // Reposition label
    ws.label.setPosition(ws.sprite.x, ws.sprite.y - 18);
  }

  _workerHome(w) {
    const L = CafeScene.L;
    switch (w.role) {
      case 'cashier': return { x: L.CASHIER_X,      y: L.CASHIER_Y + 50 };
      case 'waiter':  return { x: 340,               y: 300 };
      case 'manager': return { x: 72,                y: 350 };
      case 'barista': return { x: L.BREW.x + 36,     y: L.BREW.y + 60 };
      case 'baker': {
        // Distribute bakers across oven slots
        const bakerIds = Object.values(this._workers)
          .filter(ws => ws.data.role === 'baker')
          .map(ws => ws.data.id)
          .sort((a, b) => a - b);
        const idx = bakerIds.indexOf(w.id);
        const slot = L.OVENS[Math.max(0, Math.min(idx, L.OVENS.length - 1))];
        return { x: slot.x + 32, y: slot.y + 95 };
      }
      default: return { x: 200, y: 360 };
    }
  }

  // ── Customers — server-backed only ────────────────────────────────────────
  _syncCustomers(orders) {
    const activeIds = new Set(orders.map(o => o.id));

    // Remove served/expired
    Object.keys(this._customers).forEach(id => {
      if (!activeIds.has(+id)) {
        this._leaveCustomer(this._customers[id]);
        delete this._customers[id];
      }
    });

    // Add/update
    orders.forEach((order, qIdx) => {
      if (!this._customers[order.id]) {
        this._spawnCustomer(order, qIdx);
      } else {
        this._updateCustomer(this._customers[order.id], order, qIdx);
      }
    });
  }

  _spawnCustomer(order, qIdx) {
    const L   = CafeScene.L;
    const idx = order.id % 8;
    const key = `customer_${idx}`;
    const dst = this._queuePos(qIdx);

    // Enter from the left door
    const spr = this.add.sprite(-24, dst.y, key).setDepth(15).setScale(1.4).setAlpha(0);
    spr.play(`${key}_walk`);

    this.tweens.add({ targets: spr, alpha: 1, duration: 250 });
    this.tweens.add({
      targets: spr, x: dst.x, y: dst.y,
      duration: 700, ease: 'Power2',
      onComplete: () => { if (spr.active) spr.play(`${key}_idle`); },
    });

    // Speech bubble
    const bubble = this.add.image(dst.x, dst.y - 44, 'order_bubble')
      .setDepth(20).setScale(0).setAlpha(0);
    this.tweens.add({ targets: bubble, scaleX: 1, scaleY: 1, alpha: 1, duration: 280, delay: 750 });

    // Order icon inside bubble
    const iconKey = order.recipe_name ? 'cake_icon' : 'drink_icon';
    const icon = this.add.image(dst.x, dst.y - 48, iconKey)
      .setDepth(21).setScale(0).setAlpha(0);
    this.tweens.add({ targets: icon, scaleX: 1, scaleY: 1, alpha: 1, duration: 280, delay: 780 });

    // Impatience clock
    const imp = this.add.image(dst.x + 18, dst.y - 52, 'impatience')
      .setDepth(22).setVisible(false).setScale(0.75);

    this._customers[order.id] = { spr, bubble, icon, imp, key, qIdx, data: order };
  }

  _updateCustomer(cs, order, qIdx) {
    cs.data = order;
    const dst = this._queuePos(qIdx);

    // Shuffle in queue
    if (cs.qIdx !== qIdx) {
      cs.qIdx = qIdx;
      cs.spr.play(`${cs.key}_walk`);
      cs.spr.setFlipX(dst.x < cs.spr.x);
      this.tweens.killTweensOf(cs.spr);
      this.tweens.add({
        targets: cs.spr, x: dst.x, y: dst.y, duration: 450, ease: 'Power2',
        onComplete: () => { if (cs.spr.active) { cs.spr.play(`${cs.key}_idle`); cs.spr.setFlipX(false); } },
      });
      // Move bubble + icon with customer
      [cs.bubble, cs.icon].forEach(obj => {
        this.tweens.killTweensOf(obj);
        this.tweens.add({ targets: obj, x: dst.x, duration: 450, ease: 'Power2' });
      });
      this.tweens.add({ targets: cs.imp, x: dst.x + 18, duration: 450, ease: 'Power2' });
      cs.bubble.y = dst.y - 44; cs.icon.y = dst.y - 48; cs.imp.y = dst.y - 52;
    }

    // Impatience indicator
    const secs = order.seconds_remaining ?? 999;
    cs.imp.setVisible(secs < 60);
    cs.imp.setTint(secs < 25 ? 0xe94560 : 0xf5a623);
  }

  _leaveCustomer(cs) {
    // Walk out to the right (or left if near door)
    const exitX = cs.spr.x < 200 ? -30 : 820;
    cs.spr.play(`${cs.key}_walk`);
    cs.spr.setFlipX(exitX < cs.spr.x);
    const targets = [cs.spr, cs.bubble, cs.icon, cs.imp];
    this.tweens.add({
      targets, x: exitX, alpha: 0, duration: 550, ease: 'Power2',
      onComplete: () => targets.forEach(t => t.destroy()),
    });
  }

  _queuePos(idx) {
    const L = CafeScene.L;
    if (idx === 0) return { x: L.CASHIER_X, y: L.CASHIER_Y + 82 };
    return { x: L.QUEUE_X, y: L.QUEUE_START_Y + idx * L.QUEUE_STEP };
  }

  // ── Steam ──────────────────────────────────────────────────────────────────
  _syncSteam(ovens) {
    const L = CafeScene.L;
    this._steamEmitter.stop();
    const baking = ovens.find((ov, i) => ov.is_busy && i < L.OVENS.length);
    if (baking) {
      const idx  = ovens.findIndex(o => o.is_busy);
      const slot = L.OVENS[Math.min(idx, L.OVENS.length - 1)];
      this._steamEmitter.setPosition(slot.x + 32, slot.y - 6);
      this._steamEmitter.start();
    }
  }

  // ── Brew station reveal ────────────────────────────────────────────────────
  _revealBrewStation() {
    this._brewSpr.setVisible(true);
    this.tweens.add({
      targets: this._brewSpr, alpha: 1, y: '-=10',
      duration: 700, ease: 'Back.easeOut',
    });
    this._spawnSparkles(this._brewSpr.x, this._brewSpr.y + 30);
    this.game.events.emit('show-brew-tab');
  }

  // ── Upgrade cinematic ──────────────────────────────────────────────────────
  _onUpgrade(data) {
    const pos = this._upgradePos(data.upgrade_id);
    if (!pos) return;
    this._playCinematic(pos.x, pos.y, data.name || data.upgrade_id);
  }

  _onOvenBought(data) {
    const idx = this._ovenObjs.findIndex(o => o.serverId == null);
    if (idx < 0) return;
    const obj = this._ovenObjs[idx];
    const texKey = data.tier === 'industrial' ? 'oven_ind_idle'
                 : data.tier === 'pro'        ? 'oven_pro_idle' : 'oven_idle';
    obj.serverId = data.id; obj.tier = data.tier;
    obj.spr.setTexture(texKey).setVisible(true);
    this.tweens.add({ targets: obj.spr, alpha: 1, y: '-=8', duration: 600, ease: 'Back.easeOut',
      onComplete: () => { obj.spr.y += 8; } });
    this._playCinematic(obj.slot.x + 32, obj.slot.y + 40, data.name || 'New Oven!');
  }

  _upgradePos(uid) {
    const L = CafeScene.L;
    return ({
      display_case:        { x: L.CASHIER_X, y: L.CASHIER_Y + 70 },
      commercial_fridge:   { x: L.CASHIER_X, y: L.CASHIER_Y + 110 },
      second_counter:      { x: L.CASHIER_X, y: L.CASHIER_Y },
      premium_ingredients: { x: 600, y: 160 },
      industrial_mixer:    { x: 600, y: 200 },
      recipe_book:         { x: 600, y: 240 },
      loyalty_board:       { x: 340, y: 220 },
      music_system:        { x: 200, y: 140 },
      brew_station:        { x: L.BREW.x + 36, y: L.BREW.y + 30 },
      extra_table:         { x: 280, y: 330 },
      cashier_stand_2:     { x: L.CASHIER_X + 90, y: L.CASHIER_Y },
    })[uid] || null;
  }

  _playCinematic(x, y, label) {
    this._upgradeRunning = true;

    // Dark overlay
    const ov = this.add.graphics().setDepth(50);
    ov.fillStyle(0x000000, 0); ov.fillRect(0, 0, CafeScene.L.W, CafeScene.L.H);
    this.tweens.add({ targets: ov, fillAlpha: 0.65, duration: 350 });

    // Zoom + pan
    this.cameras.main.zoomTo(2.4, 550, 'Power2');
    this.cameras.main.pan(x, y, 550, 'Power2');

    // Sparkles
    this._spawnSparkles(x, y);

    // Label pop
    const txt = this.add.text(x, y - 44, `✨ ${label}`, {
      fontSize: '13px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
      backgroundColor: '#1a0f06cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(56).setAlpha(0).setScale(0.4);
    this.tweens.add({ targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 380, delay: 320, ease: 'Back.easeOut' });

    // Coin rain
    this._spawnCoins(x, y);

    // Zoom back after 2 s
    this.time.delayedCall(2000, () => {
      this.cameras.main.zoomTo(1, 500, 'Power2');
      this.cameras.main.pan(CafeScene.L.W / 2, CafeScene.L.H / 2, 500, 'Power2');
      this.tweens.add({
        targets: [ov, txt], alpha: 0, duration: 380, delay: 180,
        onComplete: () => {
          ov.destroy(); txt.destroy();
          this._upgradeRunning = false;
        },
      });
    });
  }

  _spawnSparkles(x, y) {
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const dist  = Phaser.Math.Between(22, 70);
      const tx = x + Math.cos(angle) * dist;
      const ty = y + Math.sin(angle) * dist;
      const sp = this.add.image(x, y, 'sparkle').setDepth(57).setScale(0.2).setAlpha(0);
      this.tweens.add({
        targets: sp, x: tx, y: ty, scaleX: 1.4, scaleY: 1.4, alpha: 1,
        duration: 320, delay: i * 35, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({
            targets: sp, alpha: 0, scaleX: 0.1, scaleY: 0.1, duration: 380,
            onComplete: () => sp.destroy(),
          });
        },
      });
    }
  }

  _spawnCoins(x, y) {
    for (let i = 0; i < 8; i++) {
      const coin = this.add.image(x + Phaser.Math.Between(-40, 40), y, 'coin')
        .setDepth(57).setAlpha(0).setScale(0.9);
      this.tweens.add({
        targets: coin,
        y: y - Phaser.Math.Between(50, 100),
        alpha: 1, duration: 220, delay: i * 70,
        onComplete: () => {
          this.tweens.add({
            targets: coin, y: coin.y + 40, alpha: 0, duration: 380,
            onComplete: () => coin.destroy(),
          });
        },
      });
    }
  }

  // ── Idle bob ──────────────────────────────────────────────────────────────
  _idleBob() {
    Object.values(this._workers).forEach(ws => {
      if (!ws.sprite.active || ws.sprite.anims?.currentAnim?.key?.endsWith('_walk')) return;
      const baseY = ws.sprite.y;
      this.tweens.add({
        targets: ws.sprite, y: baseY - 2, duration: 280, ease: 'Sine.easeInOut',
        yoyo: true, onComplete: () => { if (ws.sprite.active) ws.sprite.y = baseY; },
      });
    });
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update() {
    // Sync morale bars and labels to sprite positions each frame
    Object.values(this._workers).forEach(ws => {
      if (!ws.sprite.active) return;
      const x = ws.sprite.x, y = ws.sprite.y;

      ws.label.setPosition(x, y - 20);

      const morale = ws.data?.morale ?? 70;
      const gfx = ws.moraleGfx;
      gfx.clear();
      gfx.fillStyle(0x222222, 0.8); gfx.fillRect(x - 11, y + 16, 22, 4);
      const col = morale >= 70 ? 0x2ecc71 : morale >= 40 ? 0xf5a623 : 0xe94560;
      gfx.fillStyle(col); gfx.fillRect(x - 11, y + 16, morale * 0.22, 4);
    });
  }
}