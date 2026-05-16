'use strict';
/**
 * PhaserInit — replaces the old canvas-based cafe-scene.js.
 * Call window.initPhaserGame() once after DOM is ready.
 * The Phaser game renders into #phaser-container inside the café tab.
 */

let _phaserGame = null;

window.initPhaserGame = function () {
  if (_phaserGame) return _phaserGame;

  const container = document.getElementById('phaser-container');
  if (!container) { console.warn('PhaserInit: #phaser-container not found'); return null; }

  const w = container.clientWidth  || 760;
  const h = container.clientHeight || 460;

  const config = {
    type: Phaser.AUTO,
    width:  w,
    height: h,
    parent: 'phaser-container',
    backgroundColor: '#1a0f06',
    antialias: false,   // pixel-art style
    pixelArt: true,
    roundPixels: true,
    scene: [PreloadScene, BootScene, CafeScene, OverlayScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
  };

  _phaserGame = new Phaser.Game(config);
  PhaserBridge.init(_phaserGame);

  // Resize handler
  window.addEventListener('resize', () => {
    if (_phaserGame) {
      const c = document.getElementById('phaser-container');
      if (c) _phaserGame.scale.resize(c.clientWidth, c.clientHeight);
    }
  });

  return _phaserGame;
};

window.destroyPhaserGame = function () {
  if (_phaserGame) { _phaserGame.destroy(true); _phaserGame = null; }
};
