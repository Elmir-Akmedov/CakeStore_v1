'use strict';
/**
 * PreloadScene — generates all pixel-art textures procedurally using Phaser Graphics.
 * No external image files needed. Each texture is drawn once and cached.
 */
class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  create() {
    this._makeFloor();
    this._makeWall();
    this._makeTable();
    this._makeChair();
    this._makeCounter();
    this._makeOven('oven_idle', 0x4a3020, 0x2a1a0a, false);
    this._makeOven('oven_baking', 0x5a3a20, 0xff8c00, true);
    this._makeOvenPro('oven_pro_idle', false);
    this._makeOvenPro('oven_pro_baking', true);
    this._makeOvenIndustrial('oven_ind_idle', false);
    this._makeOvenIndustrial('oven_ind_baking', true);
    this._makeBrewStation();
    this._makeCashierStand();
    this._makeDisplayCase();
    this._makeWorker('worker_baker',   0xffffff, 0xffd59a);
    this._makeWorker('worker_cashier', 0x1a6b9a, 0xffd59a);
    this._makeWorker('worker_waiter',  0x2d2d2d, 0xffd59a);
    this._makeWorker('worker_manager', 0x6b3a8a, 0xffd59a);
    this._makeWorker('worker_barista', 0x1a4a2a, 0xffd59a);
    this._makeCustomer('customer_0', 0xe94560);
    this._makeCustomer('customer_1', 0x3498db);
    this._makeCustomer('customer_2', 0x2ecc71);
    this._makeCustomer('customer_3', 0xf5a623);
    this._makeCustomer('customer_4', 0x9b59b6);
    this._makeCustomer('customer_5', 0x1abc9c);
    this._makeCustomer('customer_6', 0xe67e22);
    this._makeCustomer('customer_7', 0xe91e8c);
    this._makeOrderBubble();
    this._makeSparkle();
    this._makeCoin();
    this._makeSteam();
    this._makeAngryIcon();
    this._makeHappyIcon();
    this._makeTableFull();
    this._makeImpatience();
    this._makePlant();
    this._makeWindow();
    this._makeCakeIcon();
    this._makeDrinkIcon();
    this._makeSign();

    this.scene.start('CafeScene');
    this.scene.launch('OverlayScene');
  }

  // ── Floor tile 32×32 checkerboard ──────────────────────────────────────────
  _makeFloor() {
    const g = this.add.graphics();
    g.fillStyle(0xc8a46e); g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xb8944e); g.fillRect(0, 0, 16, 16);
    g.fillStyle(0xb8944e); g.fillRect(16, 16, 16, 16);
    g.generateTexture('floor_tile', 32, 32); g.destroy();
  }

  // ── Wall panel 32×80 ───────────────────────────────────────────────────────
  _makeWall() {
    const g = this.add.graphics();
    g.fillStyle(0x5c3a1e); g.fillRect(0, 0, 32, 80);
    g.fillStyle(0x7a4e28); g.fillRect(0, 0, 32, 6);
    g.fillStyle(0x3d2512); g.fillRect(0, 74, 32, 6);
    g.generateTexture('wall_panel', 32, 80); g.destroy();
  }

  // ── Table 64×48 ────────────────────────────────────────────────────────────
  _makeTable() {
    const g = this.add.graphics();
    // shadow
    g.fillStyle(0x000000, 0.2); g.fillEllipse(32, 46, 56, 10);
    // legs
    g.fillStyle(0x8b6340);
    g.fillRect(6, 36, 6, 12); g.fillRect(52, 36, 6, 12);
    // tabletop dark border
    g.fillStyle(0x6b4820); g.fillRect(0, 16, 64, 24);
    // tabletop surface
    g.fillStyle(0xc8a030); g.fillRect(2, 18, 60, 20);
    // grain lines
    g.lineStyle(1, 0xa07828, 0.6);
    g.beginPath(); g.moveTo(8, 20); g.lineTo(8, 36); g.strokePath();
    g.beginPath(); g.moveTo(20, 20); g.lineTo(20, 36); g.strokePath();
    g.beginPath(); g.moveTo(44, 20); g.lineTo(44, 36); g.strokePath();
    g.generateTexture('table', 64, 48); g.destroy();
  }

  // ── Chair 24×28 ───────────────────────────────────────────────────────────
  _makeChair() {
    const g = this.add.graphics();
    g.fillStyle(0x8b5e3c); g.fillRect(2, 10, 20, 14);
    g.fillStyle(0x6b3e1c); g.fillRect(2, 0, 20, 12);
    g.fillStyle(0x5a2e0c); g.fillRect(2, 22, 6, 6); g.fillRect(16, 22, 6, 6);
    g.generateTexture('chair', 24, 28); g.destroy();
  }

  // ── Counter 120×52 ────────────────────────────────────────────────────────
  _makeCounter() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 120, 52);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 120, 10);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 10, 116, 40);
    // decorative stripe
    g.fillStyle(0x8b6340); g.fillRect(0, 28, 120, 3);
    // items
    g.fillStyle(0xf0c040); g.fillRect(10, 14, 20, 12);
    g.fillStyle(0xe94560); g.fillRect(90, 14, 20, 12);
    g.generateTexture('counter', 120, 52); g.destroy();
  }

  // ── Oven base 64×80 ───────────────────────────────────────────────────────
  _makeOven(key, bodyCol, doorCol, active) {
    const g = this.add.graphics();
    // body
    g.fillStyle(bodyCol); g.fillRect(0, 0, 64, 80);
    // top bar
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 64, 8);
    // door
    g.fillStyle(doorCol); g.fillRect(8, 12, 48, 44);
    if (active) {
      // glow lines
      g.fillStyle(0xff6600, 0.6); g.fillRect(10, 14, 44, 6);
      g.fillStyle(0xff4400, 0.5); g.fillRect(10, 24, 44, 6);
      g.fillStyle(0xff2200, 0.4); g.fillRect(10, 34, 44, 6);
      g.fillStyle(0xffaa00, 0.3); g.fillRect(10, 44, 44, 6);
    }
    // knobs
    g.fillStyle(0x888888);
    g.fillCircle(16, 68, 5); g.fillCircle(32, 68, 5); g.fillCircle(48, 68, 5);
    g.fillStyle(0x555555);
    g.fillCircle(16, 68, 3); g.fillCircle(32, 68, 3); g.fillCircle(48, 68, 3);
    // handle
    g.fillStyle(0x888888); g.fillRect(20, 54, 24, 4);
    g.generateTexture(key, 64, 80); g.destroy();
  }

  // ── Pro oven 64×80 (blue trim) ────────────────────────────────────────────
  _makeOvenPro(key, active) {
    const g = this.add.graphics();
    g.fillStyle(0x2a3a5a); g.fillRect(0, 0, 64, 80);
    g.fillStyle(0x3a6b9a); g.fillRect(0, 0, 64, 8);
    g.fillStyle(active ? 0xff8c00 : 0x1a2a3a); g.fillRect(8, 12, 48, 44);
    if (active) {
      g.fillStyle(0xff6600, 0.7); g.fillRect(10, 14, 44, 8);
      g.fillStyle(0xff4400, 0.5); g.fillRect(10, 26, 44, 8);
      g.fillStyle(0xff2200, 0.4); g.fillRect(10, 38, 44, 8);
    }
    g.fillStyle(0x3a6b9a); g.fillRect(0, 76, 64, 4);
    g.fillStyle(0x888888);
    g.fillCircle(16, 68, 5); g.fillCircle(32, 68, 5); g.fillCircle(48, 68, 5);
    g.fillStyle(0x3a9aff); g.fillCircle(16, 68, 2); g.fillCircle(32, 68, 2); g.fillCircle(48, 68, 2);
    g.fillStyle(0x888888); g.fillRect(20, 54, 24, 4);
    g.generateTexture(key, 64, 80); g.destroy();
  }

  // ── Industrial oven 72×88 (purple trim) ──────────────────────────────────
  _makeOvenIndustrial(key, active) {
    const g = this.add.graphics();
    g.fillStyle(0x2a1a3a); g.fillRect(0, 0, 72, 88);
    g.fillStyle(0x6b3a8a); g.fillRect(0, 0, 72, 8);
    g.fillStyle(active ? 0xff8c00 : 0x1a0a2a); g.fillRect(8, 12, 56, 52);
    if (active) {
      g.fillStyle(0xff7700, 0.8); g.fillRect(10, 14, 52, 10);
      g.fillStyle(0xff5500, 0.6); g.fillRect(10, 28, 52, 10);
      g.fillStyle(0xff3300, 0.5); g.fillRect(10, 42, 52, 10);
    }
    g.fillStyle(0x6b3a8a); g.fillRect(0, 84, 72, 4);
    g.fillStyle(0x888888);
    g.fillCircle(18, 74, 6); g.fillCircle(36, 74, 6); g.fillCircle(54, 74, 6);
    g.fillStyle(0x9b59b6); g.fillCircle(18, 74, 3); g.fillCircle(36, 74, 3); g.fillCircle(54, 74, 3);
    g.fillStyle(0x888888); g.fillRect(22, 62, 28, 5);
    g.generateTexture(key, 72, 88); g.destroy();
  }

  // ── Brew station 72×64 ────────────────────────────────────────────────────
  _makeBrewStation() {
    const g = this.add.graphics();
    g.fillStyle(0x2a1a0a); g.fillRect(0, 0, 72, 64);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 72, 8);
    // machine body
    g.fillStyle(0x4a3020); g.fillRect(8, 10, 56, 40);
    // screen
    g.fillStyle(0x001a00); g.fillRect(12, 14, 28, 18);
    g.fillStyle(0x00cc44, 0.8); g.fillRect(13, 15, 26, 16);
    // cup area
    g.fillStyle(0x3d2512); g.fillRect(44, 24, 16, 22);
    g.fillStyle(0xffffff, 0.3); g.fillRect(46, 26, 12, 18);
    // buttons
    g.fillStyle(0xe94560); g.fillCircle(16, 42, 4);
    g.fillStyle(0x2ecc71); g.fillCircle(28, 42, 4);
    g.fillStyle(0xf5a623); g.fillCircle(40, 42, 4);
    // nozzle
    g.fillStyle(0x888888); g.fillRect(50, 44, 4, 10);
    g.generateTexture('brew_station', 72, 64); g.destroy();
  }

  // ── Cashier stand 80×56 ───────────────────────────────────────────────────
  _makeCashierStand() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 8, 80, 48);
    g.fillStyle(0xc07820); g.fillRect(0, 8, 80, 8);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 16, 76, 38);
    // register
    g.fillStyle(0x1a1a1a); g.fillRect(20, 10, 40, 22);
    g.fillStyle(0x001a00); g.fillRect(22, 12, 36, 14);
    g.fillStyle(0x00cc66); g.fillRect(23, 13, 34, 12);
    // drawer line
    g.fillStyle(0x3d2512); g.fillRect(0, 38, 80, 3);
    g.generateTexture('cashier_stand', 80, 56); g.destroy();
  }

  // ── Display case 80×56 ────────────────────────────────────────────────────
  _makeDisplayCase() {
    const g = this.add.graphics();
    g.fillStyle(0x5c3a1e); g.fillRect(0, 0, 80, 56);
    g.fillStyle(0xc07820); g.fillRect(0, 0, 80, 6);
    // glass
    g.fillStyle(0x87ceeb, 0.4); g.fillRect(4, 8, 72, 36);
    g.lineStyle(2, 0xaaaaaa, 0.8);
    g.strokeRect(4, 8, 72, 36);
    // cakes inside
    g.fillStyle(0xe94560); g.fillCircle(20, 28, 10);
    g.fillStyle(0xf5a623); g.fillCircle(40, 28, 10);
    g.fillStyle(0x9b59b6); g.fillCircle(60, 28, 10);
    g.generateTexture('display_case', 80, 56); g.destroy();
  }

  // ── Worker sprite 20×32 (hat on bakers) ──────────────────────────────────
  _makeWorker(key, bodyCol, skinCol) {
    // 4-frame walk spritesheet: 20×32 each, 80×32 total
    const g = this.add.graphics();
    const offsets = [0, 20, 40, 60]; // x offset per frame
    offsets.forEach((ox, frame) => {
      const legL = frame % 2 === 0 ? 2 : 6;
      const legR = frame % 2 === 0 ? 10 : 6;
      // shadow
      g.fillStyle(0x000000, 0.15); g.fillEllipse(ox + 10, 30, 16, 5);
      // legs
      g.fillStyle(0x2a1a0a);
      g.fillRect(ox + 4, 22, 5, legL);
      g.fillRect(ox + 11, 22, 5, legR);
      // body
      g.fillStyle(bodyCol); g.fillRect(ox + 3, 12, 14, 12);
      // apron line
      g.fillStyle(0xffffff, 0.15); g.fillRect(ox + 6, 12, 8, 12);
      // head
      g.fillStyle(skinCol); g.fillRect(ox + 5, 3, 10, 10);
      // eyes
      g.fillStyle(0x2a1a0a);
      g.fillRect(ox + 7, 6, 2, 2); g.fillRect(ox + 11, 6, 2, 2);
      // hat (baker gets white toque)
      if (key === 'worker_baker') {
        g.fillStyle(0xffffff); g.fillRect(ox + 5, 0, 10, 5);
      } else if (key === 'worker_manager') {
        g.fillStyle(0x4a2060); g.fillRect(ox + 5, 0, 10, 4);
      } else if (key === 'worker_barista') {
        g.fillStyle(0x1a3a1a); g.fillRect(ox + 4, 0, 12, 4);
      }
    });
    g.generateTexture(key, 80, 32); g.destroy();
  }

  // ── Customer sprite 18×30, 4-frame walk ──────────────────────────────────
  _makeCustomer(key, col) {
    const g = this.add.graphics();
    const offsets = [0, 18, 36, 54];
    offsets.forEach((ox, frame) => {
      const legL = frame % 2 === 0 ? 4 : 8;
      const legR = frame % 2 === 0 ? 8 : 4;
      g.fillStyle(0x000000, 0.12); g.fillEllipse(ox + 9, 29, 14, 5);
      g.fillStyle(0x333333);
      g.fillRect(ox + 3, 21, 5, legL);
      g.fillRect(ox + 10, 21, 5, legR);
      g.fillStyle(col); g.fillRect(ox + 2, 11, 14, 12);
      g.fillStyle(0xffd59a); g.fillRect(ox + 4, 2, 10, 10);
      g.fillStyle(0x2a1a0a);
      g.fillRect(ox + 6, 5, 2, 2); g.fillRect(ox + 10, 5, 2, 2);
    });
    g.generateTexture(key, 72, 30); g.destroy();
  }

  // ── Order speech bubble 48×40 ────────────────────────────────────────────
  _makeOrderBubble() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.95);
    g.fillRoundedRect(0, 0, 48, 32, 6);
    g.fillStyle(0xffffff, 0.95);
    g.fillTriangle(16, 32, 24, 40, 32, 32);
    g.lineStyle(1.5, 0xaaaaaa);
    g.strokeRoundedRect(0, 0, 48, 32, 6);
    g.generateTexture('order_bubble', 48, 42); g.destroy();
  }

  // ── Sparkle 32×32 ────────────────────────────────────────────────────────
  _makeSparkle() {
    const g = this.add.graphics();
    const cx = 16, cy = 16;
    const arms = [[0,-14],[5,-5],[14,0],[5,5],[0,14],[-5,5],[-14,0],[-5,-5]];
    arms.forEach(([dx, dy]) => {
      g.fillStyle(0xf0c040, 0.9);
      g.fillCircle(cx + dx * 0.9, cy + dy * 0.9, 3);
    });
    g.fillStyle(0xffffff); g.fillCircle(cx, cy, 5);
    g.fillStyle(0xf0c040); g.fillCircle(cx, cy, 3);
    g.generateTexture('sparkle', 32, 32); g.destroy();
  }

  // ── Coin 16×16 ───────────────────────────────────────────────────────────
  _makeCoin() {
    const g = this.add.graphics();
    g.fillStyle(0xf0c040); g.fillCircle(8, 8, 8);
    g.fillStyle(0xc07820); g.fillCircle(8, 8, 6);
    g.fillStyle(0xf0c040);
    g.fillRect(6, 4, 4, 8);
    g.generateTexture('coin', 16, 16); g.destroy();
  }

  // ── Steam particle 8×8 ───────────────────────────────────────────────────
  _makeSteam() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.5); g.fillCircle(4, 4, 4);
    g.generateTexture('steam', 8, 8); g.destroy();
  }

  // ── Angry icon 20×20 ─────────────────────────────────────────────────────
  _makeAngryIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xe94560); g.fillCircle(10, 10, 10);
    g.fillStyle(0xffffff);
    g.fillRect(4, 7, 4, 3); g.fillRect(12, 7, 4, 3);
    g.lineStyle(2, 0xffffff); g.beginPath();
    g.arc(10, 14, 4, 0, Math.PI); g.strokePath();
    g.generateTexture('angry_icon', 20, 20); g.destroy();
  }

  // ── Happy icon 20×20 ─────────────────────────────────────────────────────
  _makeHappyIcon() {
    const g = this.add.graphics();
    g.fillStyle(0x2ecc71); g.fillCircle(10, 10, 10);
    g.fillStyle(0x2a1a0a);
    g.fillCircle(6, 8, 2); g.fillCircle(14, 8, 2);
    g.lineStyle(2, 0x2a1a0a); g.beginPath();
    g.arc(10, 10, 4, 0.2, Math.PI - 0.2); g.strokePath();
    g.generateTexture('happy_icon', 20, 20); g.destroy();
  }

  // ── Table-full X icon 24×24 ──────────────────────────────────────────────
  _makeTableFull() {
    const g = this.add.graphics();
    g.fillStyle(0xe94560); g.fillCircle(12, 12, 12);
    g.lineStyle(3, 0xffffff);
    g.beginPath(); g.moveTo(6, 6); g.lineTo(18, 18); g.strokePath();
    g.beginPath(); g.moveTo(18, 6); g.lineTo(6, 18); g.strokePath();
    g.generateTexture('table_full', 24, 24); g.destroy();
  }

  // ── Impatience clock 24×24 ───────────────────────────────────────────────
  _makeImpatience() {
    const g = this.add.graphics();
    g.fillStyle(0xf5a623); g.fillCircle(12, 12, 12);
    g.fillStyle(0xffffff); g.fillCircle(12, 12, 9);
    g.lineStyle(2, 0x1a0f06);
    g.beginPath(); g.moveTo(12, 12); g.lineTo(12, 5); g.strokePath();
    g.beginPath(); g.moveTo(12, 12); g.lineTo(17, 14); g.strokePath();
    g.generateTexture('impatience', 24, 24); g.destroy();
  }

  // ── Decorative plant 24×36 ───────────────────────────────────────────────
  _makePlant() {
    const g = this.add.graphics();
    g.fillStyle(0x8b4513); g.fillRect(7, 22, 10, 14);
    g.fillStyle(0x3a6b20);
    g.fillEllipse(12, 10, 20, 16);
    g.fillEllipse(4, 18, 12, 10);
    g.fillEllipse(20, 18, 12, 10);
    g.fillStyle(0x2a5010); g.fillRect(11, 10, 2, 20);
    g.generateTexture('plant', 24, 36); g.destroy();
  }

  // ── Window 48×52 ─────────────────────────────────────────────────────────
  _makeWindow() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 48, 52);
    g.fillStyle(0x87ceeb); g.fillRect(4, 4, 40, 44);
    g.fillStyle(0xadd8e6, 0.4); g.fillRect(6, 6, 16, 18);
    g.fillStyle(0x3d2512);
    g.fillRect(22, 4, 4, 44);
    g.fillRect(4, 26, 40, 4);
    // curtains
    g.fillStyle(0x8b2020); g.fillRect(0, 0, 8, 52); g.fillRect(40, 0, 8, 52);
    g.generateTexture('window', 48, 52); g.destroy();
  }

  // ── Cake icon 20×20 ──────────────────────────────────────────────────────
  _makeCakeIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xf5a623); g.fillRect(2, 10, 16, 10);
    g.fillStyle(0xffffff); g.fillRect(2, 8, 16, 4);
    g.fillStyle(0xe94560); g.fillRect(2, 6, 16, 4);
    g.fillStyle(0xf0c040); g.fillRect(9, 2, 2, 6);
    g.fillStyle(0xe94560); g.fillCircle(10, 2, 2);
    g.generateTexture('cake_icon', 20, 20); g.destroy();
  }

  // ── Drink icon 16×22 ─────────────────────────────────────────────────────
  _makeDrinkIcon() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.8); g.fillRect(3, 4, 10, 14);
    g.fillStyle(0x8b4513, 0.9); g.fillRect(4, 6, 8, 10);
    g.fillStyle(0x5c3a1e); g.fillRect(2, 4, 12, 3);
    g.fillStyle(0xaaaaaa); g.fillRect(8, 2, 2, 4);
    g.generateTexture('drink_icon', 16, 22); g.destroy();
  }

  // ── Store sign 80×28 ─────────────────────────────────────────────────────
  _makeSign() {
    const g = this.add.graphics();
    g.fillStyle(0x3d2512); g.fillRect(0, 0, 80, 28);
    g.fillStyle(0xc07820); g.fillRect(2, 2, 76, 24);
    g.fillStyle(0x3d2512); g.fillRect(4, 4, 72, 20);
    g.generateTexture('sign', 80, 28); g.destroy();
  }
}
