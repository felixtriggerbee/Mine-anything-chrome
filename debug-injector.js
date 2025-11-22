// Debug commands injector - runs in page context to bypass content script isolation
window.MineAnythingDebug = {
  forceCreeper: () => window.postMessage({ type: 'DEBUG_FORCE_CREEPER' }, '*'),
  forceZombie: () => window.postMessage({ type: 'DEBUG_FORCE_ZOMBIE' }, '*'),
  forceVillager: () => window.postMessage({ type: 'DEBUG_FORCE_VILLAGER' }, '*'),
  forcePet: (petName) => window.postMessage({ type: 'DEBUG_FORCE_PET', petName }, '*'),
  forceChest: () => window.postMessage({ type: 'DEBUG_FORCE_CHEST' }, '*'),
  forceWarden: () => window.postMessage({ type: 'DEBUG_FORCE_WARDEN' }, '*'),
  forceEnchantment: (enchantName) => window.postMessage({ type: 'DEBUG_FORCE_ENCHANTMENT', enchantName }, '*'),
  listPets: () => window.postMessage({ type: 'DEBUG_LIST_PETS' }, '*'),
  listEnchantments: () => window.postMessage({ type: 'DEBUG_LIST_ENCHANTMENTS' }, '*'),
  listResources: () => window.postMessage({ type: 'DEBUG_LIST_RESOURCES' }, '*'),
  resetPets: () => window.postMessage({ type: 'DEBUG_RESET_PETS' }, '*'),
  addXP: (amount) => window.postMessage({ type: 'DEBUG_ADD_XP', amount }, '*'),
  getDiamonds: () => window.postMessage({ type: 'DEBUG_GET_DIAMONDS' }, '*'),
  addDiamonds: (count) => window.postMessage({ type: 'DEBUG_ADD_DIAMONDS', count }, '*'),
  resetDiamonds: () => window.postMessage({ type: 'DEBUG_RESET_DIAMONDS' }, '*'),
  addResource: (resourceName, amount) => window.postMessage({ type: 'DEBUG_ADD_RESOURCE', resourceName, amount }, '*'),
  showInventory: () => window.postMessage({ type: 'DEBUG_SHOW_INVENTORY' }, '*'),
  clearInventory: () => window.postMessage({ type: 'DEBUG_CLEAR_INVENTORY' }, '*'),
  addEnchantment: (enchantName) => window.postMessage({ type: 'DEBUG_ADD_ENCHANTMENT', enchantName }, '*'),
  showEnchantments: () => window.postMessage({ type: 'DEBUG_SHOW_ENCHANTMENTS' }, '*'),
  activateEnchantment: (index) => window.postMessage({ type: 'DEBUG_ACTIVATE_ENCHANTMENT', index }, '*'),
  help: () => {
    console.log(`🐛 Mine Anything Debug Commands:

SPAWNS:
  MineAnythingDebug.forceCreeper()          - Force creeper on next mine
  MineAnythingDebug.forceZombie()           - Force zombie on next mine
  MineAnythingDebug.forceVillager()         - Force villager on next mine
  MineAnythingDebug.forcePet('allay')       - Force pet on next mine
  MineAnythingDebug.forceChest()            - Force chest on next mine
  MineAnythingDebug.forceWarden()           - Force warden on next footer mine
  MineAnythingDebug.forceEnchantment()      - Force random enchantment
  MineAnythingDebug.forceEnchantment('fortune') - Force specific enchantment

PETS:
  MineAnythingDebug.listPets()              - List available pets
  MineAnythingDebug.resetPets()             - Reset all collected pets

RESOURCES & INVENTORY:
  MineAnythingDebug.listResources()         - List available resources
  MineAnythingDebug.addResource('iron', 10) - Add resources to inventory
  MineAnythingDebug.showInventory()         - Display current inventory
  MineAnythingDebug.clearInventory()        - Clear all resources

ENCHANTMENTS:
  MineAnythingDebug.listEnchantments()      - List available enchantments
  MineAnythingDebug.addEnchantment('fortune') - Add enchantment to inventory
  MineAnythingDebug.showEnchantments()      - Display enchantment inventory
  MineAnythingDebug.activateEnchantment(0)  - Activate enchantment by index

XP & PROGRESSION:
  MineAnythingDebug.addXP(1000)             - Add XP
  MineAnythingDebug.getDiamonds()           - Show diamond/sword status
  MineAnythingDebug.addDiamonds(3)          - Add diamonds (max 3)
  MineAnythingDebug.resetDiamonds()         - Reset diamonds and sword

HELP:
  MineAnythingDebug.help()                  - Show this help`);
  }
};

console.log('🐛 Mine Anything Debug commands available. Type MineAnythingDebug.help() for commands');
