'use strict';
/**
 * PreloadScene — generates all pixel-art textures procedurally.
 * CRITICAL FIX: after generateTexture we manually register each frame
 * so Phaser's animation system can index them correctly.
 */
class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  create() {
    this._makeFloor();
    this._makeWall();
    this._makeTable();
    this._makeChair();
    this._makeCounter();
    this._makeOven('oven_idle',         0x4a3020, 0x2a1a0a, false);
    this._makeOven('oven_baking',       0x5a3a20, 0xff8c00, true);
    this._makeOvenPro('oven_pro_idle',  false);
    this._makeOvenPro('oven_pro_baking',true);
    this._makeOvenInd('oven_ind_idle',  false);
    this._makeOvenInd('oven_ind_baking',true);
    this._makeBrewStation('brew_station_idle',   false);
    this._makeBrewStation('brew_station_active', true);
    this._makeCashierStand();
    this._makeDisplayCase();
    this._makeSign();
    this._makePlant();
    this._makeWindow();
    this._makeDoor();

    // Workers 4-frame walk spritesheet + frame registration
    this._makeWorker('worker_baker',   0xffffff, 0xffd59a, 'toque');
    this._makeWorker('worker_cashier', 0x1a6b9a, 0xffd59a, 'cap');
    this._makeWorker('worker_waiter',  0x2d2d2d, 0xffd59a, 'none');
    this._makeWorker('worker_manager', 0x6b3a8a, 0xffd59a, 'manager');
    this._makeWorker('worker_barista', 0x1a5a2a, 0xffd59a, 'bandana');

    // Customers 4-frame walk spritesheet + frame registration
    this._makeCustomer('customer_0', 0xe94560, 0x2d1a0e);
    this._makeCustomer('customer_1', 0x3498db, 0x1a2a3a);
    this._makeCustomer('customer_2', 0x2ecc71, 0x1a3a20);
    this._makeCustomer('customer_3', 0xf5a623, 0x3a2a00);
    this._makeCustomer('customer_4', 0x9b59b6, 0x2a1a3a);
    this._makeCustomer('customer_5', 0x1abc9c, 0x0a2a28);
    this._makeCustomer('customer_6', 0xe67e22, 0x3a1a00);
    this._makeCustomer('customer_7', 0xe91e8c, 0x3a0a28);

    // FX + UI
    this._makeOrderBubble();
    this._makeSparkle();
    this._makeStar();
    this._makeCoin();
    this._makeSteam();
    this._makeSmoke();
    this._makeAngryIcon();
    this._makeHappyIcon();
    this._makeHeartIcon();
    this._makeTableFull();
    this._makeImpatience();
    this._makeCakeIcon();
    this._makeDrinkIcon();
    this._makeKitchenTicket();

    this.scene.start('CafeScene');
    this.scene.launch('OverlayScene');
  }

  // ── Helper: register N equal-width frames on a generated texture ──────────
  _registerFrames(key, frameCount, totalW, h) {
    const fw = Math.floor(totalW / frameCount);
    const tex = this.textures.get(key);
    for (let i = 0; i < frameCount; i++) {
      tex.add(i, 0, i * fw, 0, fw, h);
    }
  }

  // ── Environment ───────────────────────────────────────────────────────────
  _makeFloor() {
    const g = this.add.graphics();
    g.fillStyle(0xd4a96a); g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xb8905a); g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle(0xe0bc80, 0.4); g.fillRect(2, 2, 12, 12);
    g.generateTexture('floor_tile', 32, 32); g.destroy();
  }

  _makeWall() {
    const g = this.add.graphics();
    g.fillStyle(0x6b4a2a); g.fillRect(0, 0, 32, 80);
    g.fillStyle(0x8b6340); g.fillRect(0, 0, 32, 6);
    g.fillStyle(0xc07820); g.fillRect(0, 38, 32, 3);
    g.fillStyle(0x3d2512); g.fillRect(0, 74, 32, 6);
    g.generateTexture('wall_panel', 32, 80); g.destroy();
  }

  _makeTable() {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18); g.fillEllipse(32, 47, 58, 10);
    g.fillStyle(0x7a5230); g.fillRect(6, 34, 6, 14); g.fillRect(52, 34, 6, 14);
    g.fillStyle(0x5a3a18); g.fillRect(0, 18, 64, 20);
    g.fillStyle(0xd4a030); g.fillRect(2, 16, 60, 18);
    g.lineStyle(1, 0xa07828, 0.5);
    [8, 20, 44, 56].forEach(lx => { g.beginPath(); g.moveTo(lx, 17); g.lineTo(lx, 33); g.strokePath(); });
    g.fillStyle(0xf0c040, 0.3); g.fillRect(2, 16, 60, 2);
    g.generateTexture('table', 64, 48); g.destroy();
  }

  _makeChair() {
    const g = this.add.graphics();
    g.fillStyle(0x9b6e4a); g.fillRect(2, 12, 20, 12);
    g.fillStyle(0x7a4e2a); g.fillRect(2, 0, 20, 14);
    g.fillStyle(0xb08060, 0.4); g.fillRect(4, 2, 16, 4);
    g.fillStyle(0x5a2e0c); g.fillRect(2, 22, 5, 6); g.fillRect(17, 22, 5, 6);
    g.generateTexture('chair', 24, 28); g.destroy();
  }

  _makeCounter() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 120, 52);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 120, 8);
    g.fillStyle(0xd4960e); g.fillRect(0, 0, 120, 2);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 8, 116, 42);
    g.fillStyle(0x8b6340); g.fillRect(0, 26, 120, 2);
    g.fillStyle(0xf0c040); g.fillRect(10, 12, 20, 10);
    g.fillStyle(0xe94560); g.fillRect(90, 12, 20, 10);
    g.generateTexture('counter', 120, 52); g.destroy();
  }

  _makeSign() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 80, 28);
    g.fillStyle(0xc07820); g.fillRect(2, 2, 76, 24);
    g.fillStyle(0x3d2512); g.fillRect(4, 4, 72, 20);
    g.fillStyle(0xc07820); g.fillCircle(8, 8, 2); g.fillCircle(72, 8, 2); g.fillCircle(8, 20, 2); g.fillCircle(72, 20, 2);
    g.generateTexture('sign', 80, 28); g.destroy();
  }

  _makePlant() {
    const g = this.add.graphics();
    g.fillStyle(0x8b4513); g.fillRect(7, 24, 10, 12);
    g.fillStyle(0x6b3010); g.fillRect(5, 22, 14, 4);
    g.fillStyle(0x3a2008); g.fillRect(8, 24, 8, 3);
    g.fillStyle(0x3a7a20); g.fillEllipse(12, 12, 22, 18);
    g.fillStyle(0x2a6010); g.fillEllipse(4, 20, 14, 10); g.fillEllipse(20, 20, 14, 10);
    g.fillStyle(0x2a5010); g.fillRect(11, 12, 2, 14);
    g.fillStyle(0x5aaa30, 0.4); g.fillEllipse(10, 10, 10, 8);
    g.generateTexture('plant', 26, 36); g.destroy();
  }

  _makeWindow() {
    const g = this.add.graphics();
    g.fillStyle(0x4a2a10); g.fillRect(0, 0, 48, 52);
    g.fillStyle(0x87ceeb); g.fillRect(4, 4, 40, 44);
    g.fillStyle(0xadd8e6, 0.3); g.fillRect(4, 4, 40, 20);
    g.fillStyle(0xffffff, 0.15); g.fillRect(6, 6, 14, 18);
    g.fillStyle(0x4a2a10); g.fillRect(22, 4, 4, 44); g.fillRect(4, 26, 40, 4);
    g.fillStyle(0x8b2020); g.fillRect(0, 0, 7, 52); g.fillRect(41, 0, 7, 52);
    g.fillStyle(0xa03030, 0.5); g.fillRect(1, 0, 3, 52); g.fillRect(44, 0, 3, 52);
    g.generateTexture('window', 48, 52); g.destroy();
  }

  _makeDoor() {
    const g = this.add.graphics();
    g.fillStyle(0x5c3a1e); g.fillRect(0, 0, 40, 72);
    g.fillStyle(0x7a4e28); g.fillRect(4, 4, 32, 64);
    g.fillStyle(0x8b6340); g.fillRect(6, 6, 28, 28); g.fillRect(6, 38, 28, 28);
    g.fillStyle(0xc07820); g.fillCircle(32, 38, 4);
    g.generateTexture('door', 40, 72); g.destroy();
  }

  // ── Ovens ─────────────────────────────────────────────────────────────────
  _makeOven(key, bodyCol, doorCol, active) {
    const g = this.add.graphics();
    g.fillStyle(bodyCol); g.fillRect(0, 0, 64, 80);
    g.fillStyle(0x2a1a0a); g.fillRect(0, 0, 64, 10);
    g.fillStyle(active ? 0x00ff44 : 0x444444); g.fillCircle(54, 5, 3);
    g.fillStyle(0x1a0a00); g.fillRect(6, 12, 52, 48);
    g.fillStyle(doorCol); g.fillRect(8, 14, 48, 44);
    if (active) {
      g.fillStyle(0xff8800, 0.7); g.fillRect(10, 16, 44, 8);
      g.fillStyle(0xff5500, 0.5); g.fillRect(10, 28, 44, 8);
      g.fillStyle(0xff2200, 0.4); g.fillRect(10, 40, 44, 8);
      g.fillStyle(0xff9900, 0.3); g.fillRect(10, 50, 44, 6);
    }
    g.fillStyle(0xaaaaaa); g.fillRect(18, 56, 28, 5);
    g.fillStyle(0x888888); [14, 28, 42, 56].forEach(kx => g.fillCircle(kx, 68, 5));
    g.fillStyle(0x444444); [14, 28, 42, 56].forEach(kx => g.fillCircle(kx, 68, 3));
    g.fillStyle(0xf0c040); [14, 28].forEach(kx => g.fillRect(kx - 1, 64, 2, 3));
    g.generateTexture(key, 64, 80); g.destroy();
  }

  _makeOvenPro(key, active) {
    const g = this.add.graphics();
    g.fillStyle(0x2a3a5a); g.fillRect(0, 0, 64, 80);
    g.fillStyle(0x1a2a4a); g.fillRect(0, 0, 64, 10);
    g.fillStyle(active ? 0x00aaff : 0x334466); g.fillCircle(54, 5, 3);
    g.fillStyle(0x0a1a2a); g.fillRect(6, 12, 52, 48);
    g.fillStyle(active ? 0xff8c00 : 0x1a2a3a); g.fillRect(8, 14, 48, 44);
    if (active) {
      g.fillStyle(0xff6600, 0.7); g.fillRect(10, 16, 44, 8);
      g.fillStyle(0xff4400, 0.5); g.fillRect(10, 28, 44, 8);
      g.fillStyle(0xff2200, 0.4); g.fillRect(10, 40, 44, 8);
    }
    g.fillStyle(0x3a6b9a); g.fillRect(0, 76, 64, 4);
    g.fillStyle(0x888888); [14, 28, 42, 56].forEach(kx => g.fillCircle(kx, 68, 5));
    g.fillStyle(0x3a9aff); [14, 28, 42, 56].forEach(kx => g.fillCircle(kx, 68, 2));
    g.fillStyle(0xaaaaaa); g.fillRect(18, 56, 28, 5);
    g.generateTexture(key, 64, 80); g.destroy();
  }

  _makeOvenInd(key, active) {
    const g = this.add.graphics();
    g.fillStyle(0x2a1a3a); g.fillRect(0, 0, 72, 88);
    g.fillStyle(0x1a0a28); g.fillRect(0, 0, 72, 10);
    g.fillStyle(active ? 0xaa44ff : 0x443355); g.fillCircle(62, 5, 3);
    g.fillStyle(0x0a0014); g.fillRect(6, 12, 60, 54);
    g.fillStyle(active ? 0xff8c00 : 0x1a0a2a); g.fillRect(8, 14, 56, 50);
    if (active) {
      g.fillStyle(0xff7700, 0.8); g.fillRect(10, 16, 52, 10);
      g.fillStyle(0xff5500, 0.6); g.fillRect(10, 30, 52, 10);
      g.fillStyle(0xff3300, 0.5); g.fillRect(10, 44, 52, 10);
    }
    g.fillStyle(0x6b3a8a); g.fillRect(0, 84, 72, 4);
    g.fillStyle(0x888888); [16, 32, 48, 64].forEach(kx => g.fillCircle(kx, 75, 6));
    g.fillStyle(0x9b59b6); [16, 32, 48, 64].forEach(kx => g.fillCircle(kx, 75, 3));
    g.fillStyle(0xaaaaaa); g.fillRect(20, 64, 32, 5);
    g.generateTexture(key, 72, 88); g.destroy();
  }

  _makeBrewStation(key, active) {
    const g = this.add.graphics();
    g.fillStyle(0x1a0f06); g.fillRect(0, 0, 72, 68);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 72, 6);
    g.fillStyle(0x4a3020); g.fillRect(4, 8, 64, 48);
    g.fillStyle(0x3a2010); g.fillRect(4, 8, 64, 4);
    g.fillStyle(0x001800); g.fillRect(8, 12, 32, 22);
    g.fillStyle(active ? 0x00ee44 : 0x004422, 0.9); g.fillRect(9, 13, 30, 20);
    if (active) {
      g.fillStyle(0x00ff88, 0.6);
      g.fillRect(11, 16, 20, 2); g.fillRect(11, 20, 14, 2); g.fillRect(11, 24, 22, 2);
    }
    g.fillStyle(0x2a1808); g.fillRect(44, 20, 22, 28);
    g.fillStyle(0x1a0f04); g.fillRect(46, 22, 18, 24);
    if (active) {
      g.fillStyle(0xeeddcc); g.fillRect(48, 30, 14, 14);
      g.fillStyle(0x8b4513, 0.8); g.fillRect(49, 31, 12, 12);
      g.fillStyle(0xffffff, 0.3); g.fillRect(49, 31, 4, 4);
    }
    g.fillStyle(0xe94560); g.fillCircle(12, 44, 4);
    g.fillStyle(active ? 0x00ff44 : 0x2ecc71); g.fillCircle(24, 44, 4);
    g.fillStyle(0xf5a623); g.fillCircle(36, 44, 4);
    g.fillStyle(0x888888); g.fillRect(50, 46, 5, 10);
    g.fillStyle(0x666666); g.fillRect(51, 55, 3, 4);
    if (active) { g.fillStyle(0xccbbaa, 0.6); g.fillCircle(52, 60, 2); g.fillCircle(54, 63, 1.5); }
    g.fillStyle(0x2a1a0a); g.fillRect(0, 58, 72, 10);
    g.fillStyle(0x666655); g.fillRect(4, 60, 64, 6);
    g.generateTexture(key, 72, 68); g.destroy();
  }

  _makeCashierStand() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 8, 80, 48);
    g.fillStyle(0xc07820); g.fillRect(0, 8, 80, 7);
    g.fillStyle(0xd4960e); g.fillRect(0, 8, 80, 2);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 15, 76, 40);
    g.fillStyle(0x1a1a1a); g.fillRect(22, 9, 36, 24);
    g.fillStyle(0x001800); g.fillRect(24, 11, 32, 16);
    g.fillStyle(0x00cc66); g.fillRect(25, 12, 30, 14);
    g.fillStyle(0xffffff, 0.15); g.fillRect(25, 12, 10, 6);
    g.fillStyle(0x333333); g.fillRect(24, 27, 32, 5);
    g.fillStyle(0x2a1a0a); g.fillRect(0, 36, 80, 2);
    g.fillStyle(0x888888); g.fillRect(64, 12, 8, 14);
    g.fillStyle(0x00aaff); g.fillRect(65, 14, 6, 3);
    g.generateTexture('cashier_stand', 80, 56); g.destroy();
  }

  _makeDisplayCase() {
    const g = this.add.graphics();
    g.fillStyle(0x5c3a1e); g.fillRect(0, 0, 80, 56);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 80, 6);
    g.fillStyle(0x87ceeb, 0.35); g.fillRect(4, 8, 72, 38);
    g.lineStyle(1.5, 0xaaaaaa, 0.9); g.strokeRect(4, 8, 72, 38);
    g.fillStyle(0xffffff, 0.12); g.fillRect(6, 10, 20, 34);
    g.fillStyle(0xe94560); g.fillEllipse(18, 32, 22, 14);
    g.fillStyle(0xf5a623); g.fillEllipse(40, 32, 22, 14);
    g.fillStyle(0x9b59b6); g.fillEllipse(62, 32, 22, 14);
    g.fillStyle(0x8b6340); g.fillRect(4, 44, 72, 2);
    g.generateTexture('display_case', 80, 56); g.destroy();
  }

  // ── Workers — 4-frame walk spritesheet with frame registration ────────────
  _makeWorker(key, bodyCol, skinCol, hatType) {
    const FW = 20, FH = 34, FRAMES = 4;
    const g = this.add.graphics();

    for (let f = 0; f < FRAMES; f++) {
      const ox = f * FW;
      const lLegOff = (f % 2 === 0) ? 0 : 4;
      const rLegOff = (f % 2 === 0) ? 4 : 0;

      g.fillStyle(0x000000, 0.14); g.fillEllipse(ox + 10, 33, 14, 4);
      // Legs
      g.fillStyle(0x2a1a0a);
      g.fillRect(ox + 4, 23, 4, 6 + lLegOff);
      g.fillRect(ox + 12, 23, 4, 6 + rLegOff);
      // Shoes
      g.fillStyle(0x111111);
      g.fillRect(ox + 3, 28 + lLegOff, 6, 3);
      g.fillRect(ox + 11, 28 + rLegOff, 6, 3);
      // Body
      g.fillStyle(bodyCol); g.fillRect(ox + 3, 13, 14, 12);
      g.fillStyle(0xffffff, 0.18); g.fillRect(ox + 7, 13, 6, 12);
      g.fillStyle(0xffffff, 0.4); g.fillRect(ox + 8, 13, 4, 3);
      // Neck + head
      g.fillStyle(skinCol); g.fillRect(ox + 8, 10, 4, 4);
      g.fillStyle(skinCol); g.fillRect(ox + 5, 2, 10, 10);
      g.fillStyle(skinCol); g.fillRect(ox + 4, 5, 2, 4); g.fillRect(ox + 14, 5, 2, 4);
      // Eyes
      g.fillStyle(0x2a1a0a);
      if (f < 3) { g.fillRect(ox + 7, 5, 2, 2); g.fillRect(ox + 11, 5, 2, 2); }
      else { g.fillRect(ox + 7, 6, 2, 1); g.fillRect(ox + 11, 6, 2, 1); }
      g.fillStyle(0x1a0a00); g.fillRect(ox + 8, 9, 4, 1);
      // Hat
      if (hatType === 'toque') {
        g.fillStyle(0xffffff); g.fillRect(ox + 5, 0, 10, 6);
        g.fillStyle(0xeeeeee); g.fillRect(ox + 4, 5, 12, 2);
      } else if (hatType === 'cap') {
        g.fillStyle(0x1a4a8a); g.fillRect(ox + 5, 0, 10, 5);
        g.fillStyle(0x0a2a6a); g.fillRect(ox + 3, 4, 14, 2);
      } else if (hatType === 'manager') {
        g.fillStyle(0x4a2060); g.fillRect(ox + 5, 0, 10, 5);
        g.fillStyle(0x6a30a0); g.fillRect(ox + 4, 4, 12, 2);
      } else if (hatType === 'bandana') {
        g.fillStyle(0xcc2200); g.fillRect(ox + 5, 1, 10, 4);
        g.fillStyle(0xff4422, 0.5); g.fillRect(ox + 6, 2, 8, 2);
      }
    }

    g.generateTexture(key, FW * FRAMES, FH); g.destroy();
    this._registerFrames(key, FRAMES, FW * FRAMES, FH);
  }

  // ── Customers — 4-frame walk spritesheet with frame registration ──────────
  _makeCustomer(key, shirtCol, pantsCol) {
    const FW = 18, FH = 30, FRAMES = 4;
    const g = this.add.graphics();

    for (let f = 0; f < FRAMES; f++) {
      const ox = f * FW;
      const lLegOff = (f % 2 === 0) ? 0 : 4;
      const rLegOff = (f % 2 === 0) ? 4 : 0;

      g.fillStyle(0x000000, 0.12); g.fillEllipse(ox + 9, 29, 13, 4);
      g.fillStyle(pantsCol);
      g.fillRect(ox + 3, 19, 4, 6 + lLegOff);
      g.fillRect(ox + 11, 19, 4, 6 + rLegOff);
      g.fillStyle(0x333333);
      g.fillRect(ox + 2, 24 + lLegOff, 6, 3);
      g.fillRect(ox + 10, 24 + rLegOff, 6, 3);
      g.fillStyle(shirtCol); g.fillRect(ox + 2, 10, 14, 11);
      g.fillStyle(0xffffff, 0.15); g.fillRect(ox + 4, 11, 6, 8);
      g.fillStyle(0xffd59a); g.fillRect(ox + 7, 8, 4, 3);
      g.fillStyle(0xffd59a); g.fillRect(ox + 4, 0, 10, 10);
      const hairCol = (shirtCol & 0xff) > 0x80 ? 0x2a1a0a : 0xc8a870;
      g.fillStyle(hairCol); g.fillRect(ox + 4, 0, 10, 3);
      g.fillStyle(0x2a1a0a);
      if (f < 3) { g.fillRect(ox + 6, 4, 2, 2); g.fillRect(ox + 10, 4, 2, 2); }
      else { g.fillRect(ox + 6, 5, 2, 1); g.fillRect(ox + 10, 5, 2, 1); }
    }

    g.generateTexture(key, FW * FRAMES, FH); g.destroy();
    this._registerFrames(key, FRAMES, FW * FRAMES, FH);
  }

  // ── FX textures ───────────────────────────────────────────────────────────
  _makeOrderBubble() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.96); g.fillRoundedRect(0, 0, 48, 32, 6);
    g.fillTriangle(14, 32, 24, 42, 34, 32);
    g.lineStyle(1.5, 0xbbbbbb, 0.9); g.strokeRoundedRect(0, 0, 48, 32, 6);
    g.generateTexture('order_bubble', 48, 44); g.destroy();
  }

  _makeSparkle() {
    const g = this.add.graphics();
    const cx = 16, cy = 16;
    [[0,-15],[4,-4],[15,0],[4,4],[0,15],[-4,4],[-15,0],[-4,-4]].forEach(([dx, dy]) => {
      g.fillStyle(0xf0c040, 0.9); g.fillCircle(cx + dx * 0.85, cy + dy * 0.85, 2.5);
    });
    g.fillStyle(0xffffff, 0.9); g.fillCircle(cx, cy, 5);
    g.fillStyle(0xf0c040); g.fillCircle(cx, cy, 3);
    g.generateTexture('sparkle', 32, 32); g.destroy();
  }

  _makeStar() {
    const g = this.add.graphics();
    g.fillStyle(0xf0c040);
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      const b = ((i * 72 + 36) - 90) * Math.PI / 180;
      g.fillTriangle(16, 16, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 16 + Math.cos(b) * 5, 16 + Math.sin(b) * 5);
    }
    g.generateTexture('star', 32, 32); g.destroy();
  }

  _makeCoin() {
    const g = this.add.graphics();
    g.fillStyle(0xf0c040); g.fillCircle(8, 8, 8);
    g.fillStyle(0xc07820); g.fillCircle(8, 8, 6);
    g.fillStyle(0xf0e060); g.fillRect(6, 4, 4, 8);
    g.fillStyle(0xfff0a0, 0.4); g.fillRect(4, 4, 3, 8);
    g.generateTexture('coin', 16, 16); g.destroy();
  }

  _makeSteam() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.45); g.fillCircle(5, 5, 5);
    g.generateTexture('steam', 10, 10); g.destroy();
  }

  _makeSmoke() {
    const g = this.add.graphics();
    g.fillStyle(0x888888, 0.3); g.fillCircle(6, 6, 6);
    g.generateTexture('smoke', 12, 12); g.destroy();
  }

  _makeAngryIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xe94560); g.fillCircle(11, 11, 11);
    g.fillStyle(0xffffff);
    g.fillRect(4, 5, 5, 2); g.fillRect(13, 5, 5, 2);
    g.fillRect(5, 8, 3, 3); g.fillRect(14, 8, 3, 3);
    g.lineStyle(2, 0xffffff);
    g.beginPath(); g.arc(11, 16, 4, 0.2, Math.PI - 0.2, true); g.strokePath();
    g.generateTexture('angry_icon', 22, 22); g.destroy();
  }

  _makeHappyIcon() {
    const g = this.add.graphics();
    g.fillStyle(0x2ecc71); g.fillCircle(11, 11, 11);
    g.fillStyle(0x1a0f06); g.fillCircle(7, 9, 2); g.fillCircle(15, 9, 2);
    g.lineStyle(2, 0x1a0f06); g.beginPath(); g.arc(11, 11, 5, 0.1, Math.PI - 0.1); g.strokePath();
    g.generateTexture('happy_icon', 22, 22); g.destroy();
  }

  _makeHeartIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xe94560);
    g.fillCircle(8, 8, 6); g.fillCircle(16, 8, 6);
    g.fillTriangle(2, 10, 24, 10, 12, 22);
    g.generateTexture('heart_icon', 24, 22); g.destroy();
  }

  _makeTableFull() {
    const g = this.add.graphics();
    g.fillStyle(0xe94560); g.fillCircle(12, 12, 12);
    g.lineStyle(3, 0xffffff);
    g.beginPath(); g.moveTo(6, 6); g.lineTo(18, 18); g.strokePath();
    g.beginPath(); g.moveTo(18, 6); g.lineTo(6, 18); g.strokePath();
    g.generateTexture('table_full', 24, 24); g.destroy();
  }

  _makeImpatience() {
    const g = this.add.graphics();
    g.fillStyle(0xf5a623); g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff); g.fillCircle(12, 12, 9);
    g.fillStyle(0x888888);
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      g.fillRect(12 + Math.cos(a) * 7 - 0.5, 12 + Math.sin(a) * 7 - 0.5, 1, 1);
    }
    g.lineStyle(2, 0x1a0f06);
    g.beginPath(); g.moveTo(12, 12); g.lineTo(12, 5); g.strokePath();
    g.beginPath(); g.moveTo(12, 12); g.lineTo(17, 14); g.strokePath();
    g.fillStyle(0xe94560); g.fillCircle(12, 12, 2);
    g.generateTexture('impatience', 24, 24); g.destroy();
  }

  _makeCakeIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xf5a623); g.fillRect(2, 10, 16, 10);
    g.fillStyle(0xffffff); g.fillRect(2, 8, 16, 4);
    g.fillStyle(0xe94560); g.fillRect(2, 5, 16, 5);
    g.fillStyle(0xf0c040); g.fillRect(9, 2, 2, 5);
    g.fillStyle(0xff8800); g.fillCircle(10, 2, 2);
    g.fillStyle(0xffdd00, 0.7); g.fillCircle(10, 2, 1);
    g.generateTexture('cake_icon', 20, 20); g.destroy();
  }

  _makeDrinkIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xeeddcc, 0.9); g.fillRect(3, 5, 10, 14);
    g.fillStyle(0x8b4513, 0.95); g.fillRect(4, 7, 8, 10);
    g.fillStyle(0xfff5e6); g.fillRect(3, 5, 10, 3);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 4, 12, 3);
    g.fillStyle(0xffffff, 0.4); g.fillRect(5, 1, 1, 3); g.fillRect(8, 0, 1, 3);
    g.generateTexture('drink_icon', 16, 20); g.destroy();
  }

  _makeKitchenTicket() {
    const g = this.add.graphics();
    g.fillStyle(0xfffde7); g.fillRect(0, 0, 32, 22);
    g.fillStyle(0xf5a623); g.fillRect(0, 0, 32, 4);
    g.fillStyle(0x666666);
    g.fillRect(4, 7, 24, 2); g.fillRect(4, 11, 18, 2); g.fillRect(4, 15, 20, 2);
    g.generateTexture('kitchen_ticket', 32, 22); g.destroy();
  }
}