'use strict';
/**
 * BootScene — entry point. Immediately launches CafeScene + OverlayScene in parallel.
 */
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create() {
    this.scene.launch('CafeScene');
    this.scene.launch('OverlayScene');
    this.scene.stop('BootScene');
  }
}
