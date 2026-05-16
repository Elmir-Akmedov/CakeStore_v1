'use strict';
/**
 * OverlayScene — runs in parallel with CafeScene.
 * Draws HUD elements, day timer bar, open/closed banner,
 * event banner, and floating coin/rep popups.
 */
class OverlayScene extends Phaser.Scene {
  constructor() { super({ key: 'OverlayScene' }); }

  create() {
    const W = this.scale.width;

    // Open/closed banner at top of scene
    this.statusBanner = this.add.text(W / 2, 4, '🔴 STORE CLOSED', {
      fontSize: '10px', fontFamily: 'Segoe UI', color: '#e94560',
      backgroundColor: '#1a0f06cc', padding: { x: 10, y: 3 },
    }).setOrigin(0.5, 0).setDepth(30);

    // Day timer bar (bottom of café canvas)
    this.timerBg = this.add.graphics().setDepth(30);
    this.timerFill = this.add.graphics().setDepth(31);
    this.timerText = this.add.text(W / 2, this.scale.height - 14, '', {
      fontSize: '9px', fontFamily: 'Segoe UI', color: '#f5e6c8',
    }).setOrigin(0.5, 1).setDepth(32);

    // Event banner
    this.eventBanner = this.add.text(W / 2, 22, '', {
      fontSize: '9px', fontFamily: 'Segoe UI', color: '#f5a623',
      backgroundColor: '#1a0f06cc', padding: { x: 8, y: 3 },
    }).setOrigin(0.5, 0).setDepth(30).setVisible(false);

    // Queue count label
    this.queueLabel = this.add.text(10, this.scale.height - 14, '', {
      fontSize: '8px', fontFamily: 'Segoe UI', color: '#c4a882',
    }).setOrigin(0, 1).setDepth(30);

    // FPS (debug, can be hidden)
    this.fpsText = this.add.text(W - 4, 4, '', {
      fontSize: '7px', fontFamily: 'monospace', color: '#555544',
    }).setOrigin(1, 0).setDepth(30);

    // Listen for state updates
    this.game.events.on('server-state', this._onServerState, this);
    this.game.events.on('fulfill-popup', this._showFulfillPopup, this);

    this._dayEndAt = null;
    this._dayDuration = 300;
  }

  _onServerState(G) {
    const state = G.state || {};
    const W = this.scale.width;
    const H = this.scale.height;

    // Status banner
    const isOpen = state.is_open;
    this.statusBanner.setText(isOpen ? '🟢 STORE OPEN' : '🔴 STORE CLOSED');
    this.statusBanner.setStyle({ color: isOpen ? '#2ecc71' : '#e94560' });

    // Day timer
    if (state.day_end_at) this._dayEndAt = new Date(state.day_end_at);
    else this._dayEndAt = null;

    // Event banner
    const ev = state.active_event;
    if (ev) {
      this.eventBanner.setText(`${ev.icon} ${ev.title}: ${ev.msg}`);
      this.eventBanner.setVisible(true);
      const colors = { positive: '#2ecc71', negative: '#e94560', challenge: '#3498db', info: '#f5a623' };
      this.eventBanner.setStyle({ color: colors[ev.type] || '#f5a623' });
    } else {
      this.eventBanner.setVisible(false);
    }

    // Queue count
    const pending = (G.orders || []).length;
    this.queueLabel.setText(pending > 0 ? `🛎 ${pending} in queue` : '');
  }

  _showFulfillPopup(data) {
    // Floating "+$X.XX" label at cashier position
    const label = this.add.text(160, 230, `+$${Number(data.revenue).toFixed(2)}`, {
      fontSize: '13px', fontFamily: 'Segoe UI', color: '#2ecc71', fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(40).setAlpha(0);

    this.tweens.add({
      targets: label, y: label.y - 40, alpha: 1,
      duration: 300, ease: 'Power2',
      onComplete: () => {
        this.tweens.add({
          targets: label, alpha: 0, duration: 400, delay: 500,
          onComplete: () => label.destroy(),
        });
      },
    });

    // Happy icon burst
    const happy = this.add.image(160, 200, 'happy_icon').setDepth(40).setScale(0).setAlpha(0);
    this.tweens.add({
      targets: happy, scaleX: 1.5, scaleY: 1.5, alpha: 1,
      duration: 200, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: happy, alpha: 0, duration: 300, delay: 400,
          onComplete: () => happy.destroy(),
        });
      },
    });
  }

  update() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Timer bar
    this.timerBg.clear();
    this.timerFill.clear();

    if (this._dayEndAt) {
      const secsLeft = Math.max(0, (this._dayEndAt - Date.now()) / 1000);
      const pct = Math.min(1, secsLeft / this._dayDuration);

      this.timerBg.fillStyle(0x2a1a0a); this.timerBg.fillRect(0, H - 8, W, 8);
      const col = secsLeft > 60 ? 0x2ecc71 : secsLeft > 20 ? 0xf5a623 : 0xe94560;
      this.timerFill.fillStyle(col); this.timerFill.fillRect(0, H - 8, W * pct, 8);

      const m = Math.floor(secsLeft / 60);
      const s = Math.floor(secsLeft % 60);
      this.timerText.setText(`⏰ ${m}:${String(s).padStart(2, '0')}`);
      this.timerText.setVisible(true);
    } else {
      this.timerText.setVisible(false);
    }

    // FPS counter
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)}fps`);
  }
}
