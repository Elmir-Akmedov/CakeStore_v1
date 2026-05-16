'use strict';
/**
 * CafeScene — authoritative visual restaurant.
 * Server is source of truth. Client only animates toward server state.
 * Every visible entity maps to a real server object.
 */
class CafeScene extends Phaser.Scene {
  constructor() { super({ key: 'CafeScene' }); }

  // ── Layout constants ──────────────────────────────────────────────────────
  static get LAYOUT() {
    return {
      FLOOR_Y:       100,
      WALL_H:        100,
      QUEUE_X:       160,
      QUEUE_START_Y: 340,
      QUEUE_SPACING: 38,
      CASHIER_X:     160,
      CASHIER_Y:     260,
      KITCHEN_X:     520,
      KITCHEN_Y:     110,
      BREW_X:        520,
      BREW_Y:        300,
      TABLE_SLOTS: [
        { x: 260, y: 220 }, { x: 380, y: 220 },
        { x: 260, y: 320 }, { x: 380, y: 320 },
        { x: 260, y: 420 }, { x: 380, y: 420 },
      ],
      OVEN_SLOTS: [
        { x: 530, y: 120 }, { x: 610, y: 120 }, { x: 690, y: 120 },
      ],
      PLANT_POSITIONS: [{ x: 20, y: 108 }, { x: 740, y: 108 }],
      WINDOW_POSITIONS: [{ x: 50, y: 20 }, { x: 160, y: 20 }, { x: 360, y: 20 }, { x: 470, y: 20 }],
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this.serverState    = null;
    this.customerSprites = {};   // id → CustomerSprite
    this.workerSprites   = {};   // id → WorkerSprite
    this.ovenSprites     = {};   // id → OvenSprite
    this.tableSlots      = [];   // tracks occupancy
    this.queueSlots      = [];   // tracks queue positions
    this.steamEmitters   = [];
    this.upgradeInProgress = false;
  }

  // ── Create ────────────────────────────────────────────────────────────────
  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const L = CafeScene.LAYOUT;

    // Groups — depth ordered
    this.floorGroup    = this.add.group();
    this.wallGroup     = this.add.group();
    this.furnitureGroup= this.add.group();
    this.entityGroup   = this.add.group();
    this.fxGroup       = this.add.group();
    this.uiGroup       = this.add.group();

    this._buildRoom(W, H, L);
    this._buildFurniture(L);
    this._buildAnimations();
    this._buildParticles();
    this._setupInput();

    // Listen for events from OverlayScene / game.js bridge
    this.game.events.on('server-state', this._onServerState, this);
    this.game.events.on('upgrade-bought', this._onUpgradeBought, this);
    this.game.events.on('oven-bought', this._onOvenBought, this);

    // Anims loop
    this.time.addEvent({ delay: 500, callback: this._tickAnimations, callbackScope: this, loop: true });
  }

  // ── Room background ───────────────────────────────────────────────────────
  _buildRoom(W, H, L) {
    // Sky/exterior gradient behind windows
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x87ceeb, 0x87ceeb, 0xddeeff, 0xddeeff, 1);
    sky.fillRect(0, 0, W, L.WALL_H);
    sky.setDepth(0);

    // Wall panels
    for (let x = 0; x < W; x += 32) {
      this.add.image(x, 0, 'wall_panel').setOrigin(0, 0).setDepth(1);
    }

    // Windows
    L.WINDOW_POSITIONS.forEach(pos => {
      this.add.image(pos.x, pos.y, 'window').setOrigin(0, 0).setDepth(2);
    });

    // Store sign
    const sign = this.add.image(W / 2, 14, 'sign').setOrigin(0.5, 0).setDepth(3);
    this.signText = this.add.text(W / 2, 19, '🎂 CAFÉ', {
      fontSize: '11px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(4);

    // Floor tiles
    for (let y = L.FLOOR_Y; y < H; y += 32) {
      for (let x = 0; x < W; x += 32) {
        const tile = this.add.image(x, y, 'floor_tile').setOrigin(0, 0).setDepth(1);
        // subtle checkerboard tint variation
        if (((x / 32) + (y / 32)) % 2 === 0) tile.setTint(0xddaa66);
      }
    }

    // Kitchen divider wall
    const divider = this.add.graphics().setDepth(5);
    divider.fillStyle(0x3d2512); divider.fillRect(510, L.FLOOR_Y, 10, H - L.FLOOR_Y);
    divider.fillStyle(0xc07820); divider.fillRect(510, L.FLOOR_Y, 10, 5);

    // Kitchen floor (darker)
    const kitchenFloor = this.add.graphics().setDepth(1);
    kitchenFloor.fillStyle(0x9a7a50, 0.5);
    kitchenFloor.fillRect(520, L.FLOOR_Y, 280, H - L.FLOOR_Y);

    // Kitchen label
    this.add.text(630, L.FLOOR_Y + 8, '— KITCHEN —', {
      fontSize: '9px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(6);

    // Plants
    L.PLANT_POSITIONS.forEach(pos => {
      this.add.image(pos.x, pos.y, 'plant').setOrigin(0, 0).setDepth(4);
    });

    // Queue rope/line indicator
    this.queueLine = this.add.graphics().setDepth(3);
    this._drawQueueLine(L);
  }

  _drawQueueLine(L) {
    this.queueLine.clear();
    this.queueLine.lineStyle(2, 0xc07820, 0.5);
    this.queueLine.beginPath();
    this.queueLine.moveTo(L.CASHIER_X, L.CASHIER_Y + 40);
    this.queueLine.lineTo(L.QUEUE_X, L.QUEUE_START_Y + L.QUEUE_SPACING * 5);
    this.queueLine.strokePath();
  }

  // ── Furniture ─────────────────────────────────────────────────────────────
  _buildFurniture(L) {
    // Cashier stand
    this.cashierStandSprite = this.add.image(L.CASHIER_X, L.CASHIER_Y, 'cashier_stand')
      .setOrigin(0.5, 0).setDepth(10);

    // Counter
    this.counter = this.add.image(160, 380, 'counter').setOrigin(0.5, 0).setDepth(10);

    // Display case (hidden until upgrade bought)
    this.displayCase = this.add.image(160, 290, 'display_case')
      .setOrigin(0.5, 0).setDepth(10).setVisible(false).setAlpha(0);

    // Tables — start with 2 visible
    this.tableObjects = [];
    L.TABLE_SLOTS.forEach((slot, i) => {
      const visible = i < 2;
      const tbl = this.add.image(slot.x, slot.y, 'table')
        .setOrigin(0.5, 0.5).setDepth(8).setVisible(visible).setAlpha(visible ? 1 : 0);
      // chairs around table
      const chairN = this.add.image(slot.x, slot.y - 28, 'chair')
        .setOrigin(0.5, 0.5).setDepth(7).setVisible(visible).setAlpha(visible ? 1 : 0);
      const chairS = this.add.image(slot.x, slot.y + 28, 'chair')
        .setOrigin(0.5, 0.5).setDepth(9).setVisible(visible).setAlpha(visible ? 1 : 0);
      this.tableObjects.push({ sprite: tbl, chairN, chairS, slot, occupied: false, visible });
    });

    // Oven slots (start with 1 basic oven shown)
    this.ovenObjects = [];
    L.OVEN_SLOTS.forEach((slot, i) => {
      const ov = this.add.image(slot.x, slot.y, 'oven_idle')
        .setOrigin(0.5, 0).setDepth(10).setVisible(i === 0).setAlpha(i === 0 ? 1 : 0);
      this.ovenObjects.push({ sprite: ov, slot, serverId: null, tier: 'basic', baking: false });
    });

    // Brew station (hidden until bought)
    this.brewStationSprite = this.add.image(L.BREW_X + 36, L.BREW_Y, 'brew_station')
      .setOrigin(0.5, 0).setDepth(10).setVisible(false).setAlpha(0);

    // Table-full indicators (one per table slot, hidden by default)
    this.tableFullIcons = L.TABLE_SLOTS.map(slot =>
      this.add.image(slot.x + 26, slot.y - 26, 'table_full')
        .setDepth(20).setVisible(false).setScale(0.8)
    );
  }

  // ── Animations ────────────────────────────────────────────────────────────
  _buildAnimations() {
    const roles = ['baker', 'cashier', 'waiter', 'manager', 'barista'];
    roles.forEach(role => {
      const key = `worker_${role}`;
      if (!this.anims.exists(`${key}_walk`)) {
        this.anims.create({
          key: `${key}_walk`,
          // FIX: Explicitly list the frames we sliced
          frames: [
            { key: key, frame: 0 },
            { key: key, frame: 1 },
            { key: key, frame: 2 },
            { key: key, frame: 3 }
          ],
          frameRate: 6, repeat: -1,
        });
      }
      if (!this.anims.exists(`${key}_idle`)) {
        this.anims.create({
          key: `${key}_idle`,
          frames: [{ key: key, frame: 0 }], // FIX
          frameRate: 1, repeat: -1,
        });
      }
    });

    for (let i = 0; i < 8; i++) {
      const key = `customer_${i}`;
      if (!this.anims.exists(`${key}_walk`)) {
        this.anims.create({
          key: `${key}_walk`,
          // FIX: Explicitly list the frames we sliced
          frames: [
            { key: key, frame: 0 },
            { key: key, frame: 1 },
            { key: key, frame: 2 },
            { key: key, frame: 3 }
          ],
          frameRate: 6, repeat: -1,
        });
      }
      if (!this.anims.exists(`${key}_idle`)) {
        this.anims.create({
          key: `${key}_idle`,
          frames: [{ key: key, frame: 0 }], // FIX
          frameRate: 1, repeat: -1,
        });
      }
    }
  }

  // ── Particles ────────────────────────────────────────────────────────────
  _buildParticles() {
    // Steam particle emitter (for ovens)
    this.steamParticles = this.add.particles(0, 0, 'steam', {
      x: { min: -5, max: 5 },
      y: { min: -5, max: 5 },
      speedY: { min: -30, max: -60 },
      speedX: { min: -5, max: 5 },
      alpha: { start: 0.6, end: 0 },
      scale: { start: 0.8, end: 0.2 },
      lifespan: { min: 800, max: 1400 },
      frequency: 400,
      quantity: 1,
    }).setDepth(25).stop();
  }

  // ── Input ────────────────────────────────────────────────────────────────
  _setupInput() {
    // Clicking an oven triggers bake modal via event
    this.input.on('gameobjectdown', (pointer, obj) => {
      if (obj.ovenIndex !== undefined) {
        const ov = this.ovenObjects[obj.ovenIndex];
        if (ov && ov.serverId !== null) {
          this.game.events.emit('oven-clicked', ov.serverId);
        }
      }
      if (obj.tableIndex !== undefined) {
        const slot = this.tableObjects[obj.tableIndex];
        if (slot?.occupied) {
          this.game.events.emit('table-clicked', obj.tableIndex);
        }
      }
    });
  }

  // ── Server state handler ─────────────────────────────────────────────────
  _onServerState(G) {
    if (this.upgradeInProgress) return;
    this.serverState = G;
    const state = G.state || {};

    // Update sign text
    if (this.signText) this.signText.setText(`🎂 ${state.store_name || 'CAFÉ'}`);

    // Sync ovens
    this._syncOvens(G.ovens || []);

    // Sync workers
    this._syncWorkers(G.workers || []);

    // Sync customers (orders = visible customers)
    this._syncCustomers(G.orders || []);

    // Brew station visibility
    if (state.owned_upgrades?.includes('brew_station') && !this.brewStationSprite.visible) {
      this._revealBrewStation();
    }

    // Display case
    if (state.owned_upgrades?.includes('display_case') && !this.displayCase.visible) {
      this.displayCase.setVisible(true);
      this.tweens.add({ targets: this.displayCase, alpha: 1, duration: 600, ease: 'Power2' });
    }

    // Tables from upgrades
    this._syncTables(state);

    // Steam emitters for baking ovens
    this._syncSteam(G.ovens || []);

    // Table-full icons
    this._updateTableFullIcons(G.orders || []);
  }

  // ── Oven sync ─────────────────────────────────────────────────────────────
  _syncOvens(ovens) {
    const L = CafeScene.LAYOUT;
    ovens.forEach((ov, i) => {
      if (i >= this.ovenObjects.length) return;
      const obj = this.ovenObjects[i];
      obj.serverId = ov.id;
      obj.tier     = ov.tier;
      obj.baking   = ov.is_busy;

      const textureKey = ov.is_busy
        ? (ov.tier === 'industrial' ? 'oven_ind_baking' : ov.tier === 'pro' ? 'oven_pro_baking' : 'oven_baking')
        : (ov.tier === 'industrial' ? 'oven_ind_idle'   : ov.tier === 'pro' ? 'oven_pro_idle'   : 'oven_idle');

      if (!obj.sprite.visible) {
        obj.sprite.setVisible(true);
        this.tweens.add({ targets: obj.sprite, alpha: 1, duration: 400, ease: 'Power2' });
      }
      obj.sprite.setTexture(textureKey).setInteractive();
      obj.sprite.ovenIndex = i;
    });
  }

  // ── Worker sync ───────────────────────────────────────────────────────────
  _syncWorkers(workers) {
    const activeIds = new Set(workers.map(w => w.id));

    // Remove departed workers
    Object.keys(this.workerSprites).forEach(id => {
      if (!activeIds.has(parseInt(id))) {
        const ws = this.workerSprites[id];
        this.tweens.add({
          targets: ws.sprite, alpha: 0, duration: 300,
          onComplete: () => ws.sprite.destroy(),
        });
        delete this.workerSprites[id];
      }
    });

    workers.forEach(w => {
      if (!this.workerSprites[w.id]) {
        this.workerSprites[w.id] = this._createWorkerSprite(w);
      } else {
        this._updateWorkerSprite(this.workerSprites[w.id], w);
      }
    });
  }

  _createWorkerSprite(w) {
    const startPos = this._workerHomePosition(w);
    const key = `worker_${w.role}`;
    const sprite = this.add.sprite(startPos.x, startPos.y, key)
      .setDepth(15).setScale(1.4).setAlpha(0).setInteractive();

    this.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
    sprite.play(`${key}_idle`);

    // Name label
    const label = this.add.text(startPos.x, startPos.y - 22, w.name.split(' ')[0], {
      fontSize: '8px', fontFamily: 'Segoe UI', color: '#f5e6c8',
      backgroundColor: '#1a0f0688', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setDepth(16);

    // Morale indicator
    const moraleBar = this.add.graphics().setDepth(16);

    return { sprite, label, moraleBar, data: w, targetX: startPos.x, targetY: startPos.y };
  }

  _updateWorkerSprite(ws, w) {
    ws.data = w;
    const home = this._workerHomePosition(w);

    // Animate to home if not already there
    const dist = Phaser.Math.Distance.Between(ws.sprite.x, ws.sprite.y, home.x, home.y);
    if (dist > 8) {
      const key = `worker_${w.role}`;
      ws.sprite.play(`${key}_walk`);
      ws.sprite.setFlipX(home.x < ws.sprite.x);
      this.tweens.add({
        targets: ws.sprite, x: home.x, y: home.y,
        duration: Math.min(dist * 5, 1200), ease: 'Linear',
        onComplete: () => {
          ws.sprite.play(`${key}_idle`);
          ws.label.setPosition(home.x, home.y - 22);
        },
      });
    } else {
      ws.label.setPosition(ws.sprite.x, ws.sprite.y - 22);
    }

    // Morale bar
    ws.moraleBar.clear();
    const morale = w.morale ?? 70;
    const barX = ws.sprite.x - 10, barY = ws.sprite.y + 14;
    ws.moraleBar.fillStyle(0x333333); ws.moraleBar.fillRect(barX, barY, 20, 3);
    const col = morale >= 70 ? 0x2ecc71 : morale >= 40 ? 0xf5a623 : 0xe94560;
    ws.moraleBar.fillStyle(col); ws.moraleBar.fillRect(barX, barY, morale * 0.2, 3);
  }

  _workerHomePosition(w) {
    const L = CafeScene.LAYOUT;
    switch (w.role) {
      case 'cashier': return { x: L.CASHIER_X, y: L.CASHIER_Y + 44 };
      case 'waiter':  return { x: 320, y: 300 };
      case 'manager': return { x: 80, y: 350 };
      case 'barista': return { x: L.BREW_X + 36, y: L.BREW_Y + 54 };
      case 'baker': {
        const idx = Object.values(this.workerSprites)
          .filter(ws => ws.data.role === 'baker')
          .findIndex(ws => ws.data.id === w.id);
        const slot = L.OVEN_SLOTS[Math.max(0, idx)] || L.OVEN_SLOTS[0];
        return { x: slot.x + 32, y: slot.y + 90 };
      }
      default: return { x: 200, y: 350 };
    }
  }

  // ── Customer sync ─────────────────────────────────────────────────────────
  _syncCustomers(orders) {
    const activeIds = new Set(orders.map(o => o.id));

    // Remove served/expired customers
    Object.keys(this.customerSprites).forEach(id => {
      if (!activeIds.has(parseInt(id))) {
        const cs = this.customerSprites[id];
        this._animateCustomerLeave(cs);
        delete this.customerSprites[id];
      }
    });

    // Add/update customers
    orders.forEach((order, qIdx) => {
      if (!this.customerSprites[order.id]) {
        this.customerSprites[order.id] = this._createCustomerSprite(order, qIdx);
      } else {
        this._updateCustomerSprite(this.customerSprites[order.id], order, qIdx);
      }
    });
  }

  _createCustomerSprite(order, qIdx) {
    const L = CafeScene.LAYOUT;
    const colorIdx = order.id % 8;
    const key = `customer_${colorIdx}`;

    // Enter from left edge
    const sprite = this.add.sprite(-20, L.QUEUE_START_Y, key)
      .setDepth(15).setScale(1.3).setAlpha(0);
    sprite.play(`${key}_walk`);

    const target = this._queuePosition(qIdx, L);

    this.tweens.add({ targets: sprite, alpha: 1, duration: 300 });
    this.tweens.add({
      targets: sprite, x: target.x, y: target.y,
      duration: 800, ease: 'Power2',
      onComplete: () => sprite.play(`${key}_idle`),
    });

    // Order bubble
    const bubble = this.add.image(target.x, target.y - 42, 'order_bubble')
      .setDepth(20).setScale(0).setAlpha(0);
    this.tweens.add({ targets: bubble, scaleX: 1, scaleY: 1, alpha: 1, duration: 300, delay: 900 });

    // Item icon inside bubble
    const iconKey = order.recipe_name ? 'cake_icon' : 'drink_icon';
    const iconImg = this.add.image(target.x, target.y - 46, iconKey)
      .setDepth(21).setScale(0).setAlpha(0);
    this.tweens.add({ targets: iconImg, scaleX: 1, scaleY: 1, alpha: 1, duration: 300, delay: 900 });

    // Impatience clock (shown when <60s remain)
    const impatience = this.add.image(target.x + 18, target.y - 50, 'impatience')
      .setDepth(22).setVisible(false).setScale(0.7);

    return { sprite, bubble, iconImg, impatience, data: order, qIdx, colorIdx, key };
  }

  _updateCustomerSprite(cs, order, qIdx) {
    cs.data = order;
    const L = CafeScene.LAYOUT;
    const target = this._queuePosition(qIdx, L);

    // Move if queue position changed
    if (cs.qIdx !== qIdx) {
      cs.qIdx = qIdx;
      cs.sprite.play(`${cs.key}_walk`);
      cs.sprite.setFlipX(target.x < cs.sprite.x);
      this.tweens.add({
        targets: [cs.sprite, cs.bubble, cs.iconImg, cs.impatience],
        x: target.x, y: { value: target.y, offset: -42 },
        duration: 500, ease: 'Power2',
        onComplete: () => cs.sprite.play(`${cs.key}_idle`),
      });
      this.tweens.add({ targets: cs.bubble, x: target.x, y: target.y - 42, duration: 500 });
      this.tweens.add({ targets: cs.iconImg, x: target.x, y: target.y - 46, duration: 500 });
      this.tweens.add({ targets: cs.impatience, x: target.x + 18, y: target.y - 50, duration: 500 });
    }

    // Impatience indicator
    const secs = order.seconds_remaining ?? order.patience ?? 999;
    cs.impatience.setVisible(secs < 60);
    if (secs < 30) {
      cs.impatience.setTint(0xe94560);
    } else if (secs < 60) {
      cs.impatience.setTint(0xf5a623);
    }
  }

  _queuePosition(idx, L) {
    // First customer at cashier, rest queue behind
    if (idx === 0) return { x: L.CASHIER_X, y: L.CASHIER_Y + 80 };
    return { x: L.QUEUE_X, y: L.QUEUE_START_Y + idx * L.QUEUE_SPACING };
  }

  _animateCustomerLeave(cs) {
    const direction = Math.random() > 0.5 ? 800 : -20;
    this.tweens.add({
      targets: [cs.sprite, cs.bubble, cs.iconImg, cs.impatience],
      x: direction, alpha: 0, duration: 600, ease: 'Power2',
      onComplete: () => {
        cs.sprite.destroy();
        cs.bubble.destroy();
        cs.iconImg.destroy();
        cs.impatience.destroy();
      },
    });
  }

  // ── Table sync ────────────────────────────────────────────────────────────
  _syncTables(state) {
    // Count tables from upgrades (base 2, each table upgrade +2)
    const upgrades = state.owned_upgrades || [];
    const tableCount = 2 + (upgrades.filter(u => u === 'second_counter' || u === 'loyalty_board').length * 2);
    const visibleCount = Math.min(tableCount, this.tableObjects.length);

    this.tableObjects.forEach((tbl, i) => {
      const shouldBeVisible = i < visibleCount;
      if (shouldBeVisible && !tbl.visible) {
        tbl.visible = true;
        tbl.sprite.setVisible(true);
        tbl.chairN.setVisible(true);
        tbl.chairS.setVisible(true);
        this.tweens.add({
          targets: [tbl.sprite, tbl.chairN, tbl.chairS],
          alpha: 1, duration: 600, ease: 'Back.easeOut',
        });
      }
    });
  }

  // ── Steam emitters ────────────────────────────────────────────────────────
  _syncSteam(ovens) {
    const L = CafeScene.LAYOUT;
    this.steamParticles.stop();
    ovens.forEach((ov, i) => {
      if (ov.is_busy && i < L.OVEN_SLOTS.length) {
        const slot = L.OVEN_SLOTS[i];
        this.steamParticles.setPosition(slot.x + 32, slot.y - 4);
        this.steamParticles.start();
      }
    });
  }

  // ── Table-full icons ──────────────────────────────────────────────────────
  _updateTableFullIcons(orders) {
    const occupiedSlots = new Set();
    orders.forEach((_, i) => { if (i >= 0 && i < this.tableFullIcons.length) occupiedSlots.add(i); });
    this.tableFullIcons.forEach((icon, i) => {
      const tbl = this.tableObjects[i];
      const full = tbl && tbl.visible && !occupiedSlots.has(i) && orders.length >= 3;
      icon.setVisible(false); // simplified: hide for now
    });
  }

  // ── Brew station reveal ───────────────────────────────────────────────────
  _revealBrewStation() {
    this.brewStationSprite.setVisible(true);
    this.tweens.add({ targets: this.brewStationSprite, alpha: 1, y: '-=10', duration: 700, ease: 'Back.easeOut' });
    this._spawnUpgradeSparkles(this.brewStationSprite.x, this.brewStationSprite.y);
    this.game.events.emit('show-brew-tab');
  }

  // ── Upgrade cinematic ─────────────────────────────────────────────────────
  _onUpgradeBought(data) {
    const target = this._getUpgradeTarget(data.upgrade_id);
    if (!target) return;
    this._playCinematic(target.x, target.y, data.name);
  }

  _onOvenBought(data) {
    const idx = this.ovenObjects.findIndex(o => o.serverId === null);
    if (idx < 0) return;
    const slot = CafeScene.LAYOUT.OVEN_SLOTS[idx];
    this.ovenObjects[idx].serverId = data.id;
    this.ovenObjects[idx].tier = data.tier;
    const textureKey = data.tier === 'industrial' ? 'oven_ind_idle' : data.tier === 'pro' ? 'oven_pro_idle' : 'oven_idle';
    this.ovenObjects[idx].sprite.setTexture(textureKey).setVisible(true);
    this.tweens.add({ targets: this.ovenObjects[idx].sprite, alpha: 1, y: '-=8', duration: 600, ease: 'Back.easeOut' });
    this._playCinematic(slot.x + 32, slot.y + 40, data.name || 'New Oven!');
  }

  _getUpgradeTarget(uid) {
    const L = CafeScene.LAYOUT;
    const map = {
      'display_case':        { x: 160, y: 290 },
      'commercial_fridge':   { x: 160, y: 340 },
      'second_counter':      { x: L.CASHIER_X, y: L.CASHIER_Y },
      'premium_ingredients': { x: 630, y: 160 },
      'industrial_mixer':    { x: 630, y: 200 },
      'recipe_book':         { x: 630, y: 240 },
      'loyalty_board':       { x: 380, y: 220 },
      'music_system':        { x: 200, y: 140 },
      'brew_station':        { x: L.BREW_X + 36, y: L.BREW_Y + 30 },
    };
    return map[uid] || null;
  }

  _playCinematic(x, y, label) {
    this.upgradeInProgress = true;

    // Darken overlay
    const overlay = this.add.graphics().setDepth(50);
    overlay.fillStyle(0x000000, 0); overlay.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({ targets: overlay, fillAlpha: 0.6, duration: 400 });

    // Zoom camera to target
    this.cameras.main.zoomTo(2.2, 600, 'Power2');
    this.cameras.main.pan(x, y, 600, 'Power2');

    // Sparkles burst
    this._spawnUpgradeSparkles(x, y);

    // Label
    const txt = this.add.text(x, y - 40, `✨ ${label}`, {
      fontSize: '14px', fontFamily: 'Segoe UI', color: '#f0c040', fontStyle: 'bold',
      backgroundColor: '#1a0f06cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(55).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 400, delay: 300 });

    // Hold, then zoom back
    this.time.delayedCall(1800, () => {
      this.cameras.main.zoomTo(1, 500, 'Power2');
      this.cameras.main.pan(this.scale.width / 2, this.scale.height / 2, 500, 'Power2');
      this.tweens.add({ targets: [overlay, txt], alpha: 0, duration: 400, delay: 200,
        onComplete: () => { overlay.destroy(); txt.destroy(); this.upgradeInProgress = false; }
      });
    });
  }

  _spawnUpgradeSparkles(x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist  = Phaser.Math.Between(20, 60);
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      const sp = this.add.image(x, y, 'sparkle').setDepth(56).setScale(0.3).setAlpha(0);
      this.tweens.add({
        targets: sp, x: sx, y: sy, scaleX: 1.2, scaleY: 1.2, alpha: 1,
        duration: 300, delay: i * 40, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({
            targets: sp, alpha: 0, scaleX: 0, scaleY: 0, duration: 400,
            onComplete: () => sp.destroy(),
          });
        },
      });
    }

    // Coin rain
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(x + Phaser.Math.Between(-30, 30), y, 'coin')
        .setDepth(56).setAlpha(0).setScale(0.8);
      this.tweens.add({
        targets: coin, y: y - Phaser.Math.Between(40, 80), alpha: 1,
        duration: 200, delay: i * 80,
        onComplete: () => {
          this.tweens.add({
            targets: coin, y: coin.y + 30, alpha: 0, duration: 400,
            onComplete: () => coin.destroy(),
          });
        },
      });
    }
  }

  // ── Periodic animation tick ────────────────────────────────────────────────
  _tickAnimations() {
    // Workers idle bob
    Object.values(this.workerSprites).forEach(ws => {
      if (ws.sprite.active) {
        this.tweens.add({
          targets: ws.sprite, y: ws.sprite.y - 2, duration: 250,
          yoyo: true, ease: 'Sine.easeInOut',
        });
      }
    });
  }

  // ── Update (per frame) ─────────────────────────────────────────────────────
  update(time, delta) {
    // Update worker morale bars to follow sprites
    Object.values(this.workerSprites).forEach(ws => {
      if (!ws.moraleBar || !ws.sprite.active) return;
      const morale = ws.data?.morale ?? 70;
      const bx = ws.sprite.x - 10, by = ws.sprite.y + 16;
      ws.moraleBar.clear();
      ws.moraleBar.fillStyle(0x333333); ws.moraleBar.fillRect(bx, by, 20, 3);
      const col = morale >= 70 ? 0x2ecc71 : morale >= 40 ? 0xf5a623 : 0xe94560;
      ws.moraleBar.fillStyle(col); ws.moraleBar.fillRect(bx, by, morale * 0.2, 3);
    });
  }
}
