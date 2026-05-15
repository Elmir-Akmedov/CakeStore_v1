'use strict';
/**
 * PhaserBridge — thin adapter between game.js (Django polling)
 * and the Phaser game instance. Call PhaserBridge.init(phaserGame)
 * once after Phaser boots, then call PhaserBridge.push(G) on every
 * server state update.
 */
const PhaserBridge = (() => {
  let _game = null;

  return {
    init(game) {
      _game = game;
    },

    /** Push full server state to Phaser scenes */
    push(G) {
      if (!_game) return;
      _game.events.emit('server-state', G);
    },

    /** Notify Phaser that an upgrade was bought */
    upgradeBought(upgradeId, name) {
      if (!_game) return;
      _game.events.emit('upgrade-bought', { upgrade_id: upgradeId, name });
    },

    /** Notify Phaser that an oven was bought */
    ovenBought(ovenData) {
      if (!_game) return;
      _game.events.emit('oven-bought', ovenData);
    },

    /** Show floating revenue popup at cashier */
    fulfillPopup(revenue) {
      if (!_game) return;
      _game.events.emit('fulfill-popup', { revenue });
    },

    /** Expose oven-clicked handler registration */
    onOvenClicked(callback) {
      if (!_game) return;
      _game.events.on('oven-clicked', callback);
    },

    /** Expose brew-tab show */
    onShowBrewTab(callback) {
      if (!_game) return;
      _game.events.on('show-brew-tab', callback);
    },
  };
})();
