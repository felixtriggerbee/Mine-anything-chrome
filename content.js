// Mine Anything - Content Script
// This script runs on every webpage and handles the mining mechanics

// Don't run in sandboxed iframes or if we don't have proper access
if (window !== window.top || document.documentElement === null) {
  // Skip execution in iframes or invalid contexts
  debugLog('Mine Anything: Skipping execution in iframe/invalid context');
} else {

// Production mode flag - set to false to enable debug logging
const PRODUCTION_MODE = false; // Changed to false to enable debugging

// Debug logger - only logs in development mode
const debugLog = (...args) => {
  if (!PRODUCTION_MODE) {
    console.log(...args);
  }
};

const debugWarn = (...args) => {
  if (!PRODUCTION_MODE) {
    console.warn(...args);
  }
};

let miningEnabled = false; // Start disabled
let currentlyMining = null;
let miningProgress = 0;
let miningInterval = null;
let playerData = null;
let minedElements = new Set(); // Track mined elements for restoration
let keepStylesHidden = false; // Track if we should keep elements hidden after deactivating
let toggleButton = null;
let inventoryUI = null; // On-page inventory UI
let inventoryVisible = false; // Track inventory visibility
let inventoryUpdateInterval = null; // Timer for updating active item durations
let activeNotifications = []; // Track active notifications for stacking
let useSVGCracks = false; // Will be set to true if SVG crack files are available
let isToggledOn = false; // Track if mining was toggled on via button (not just Alt key)
let miningKeys = ['Alt']; // Customizable shortcut keys
let currentlyPressedKeys = new Set();

// Track spawned items per page to prevent duplicates
let pageSpawnedItems = {
  enchantment: false,
  pet: false,
  chest: false,
  villager: false
};

// Warden warning system
let wardenWarningState = {
  triggered: false, // Has the warning sequence been triggered on this page?
  stage: 0, // 0: not triggered, 1: approaches, 2: advances, 3: draws close, 4: emerges
  messagesShown: []
};

// Overlay Management System - prevents multiple overlays from stacking
let activeOverlay = {
  element: null,
  type: null, // 'warden', 'villager', 'chest', 'pet', 'enchantment'
  priority: 0 // Higher priority overlays can dismiss lower priority ones
};

const OVERLAY_PRIORITIES = {
  warden: 100,      // Highest - game-critical
  villager: 50,     // Medium - interactive trade
  chest: 30,        // Medium-low - reward collection
  enchantment: 20,  // Low - auto-collects
  pet: 10           // Lowest - auto-collects
};

// Dismiss current overlay if new one has higher or equal priority
function dismissCurrentOverlay(newType, newPriority) {
  if (activeOverlay.element && activeOverlay.element.parentNode) {
    const currentPriority = activeOverlay.priority || 0;
    
    // New overlay has equal or higher priority - dismiss current
    if (newPriority >= currentPriority) {
      debugLog(`Mine Anything: Dismissing ${activeOverlay.type} overlay for ${newType}`);
      
      // Smooth fade out
      activeOverlay.element.style.transition = 'opacity 0.2s ease-out';
      activeOverlay.element.style.opacity = '0';
      
      setTimeout(() => {
        if (activeOverlay.element && activeOverlay.element.parentNode) {
          activeOverlay.element.remove();
        }
      }, 200);
      
      activeOverlay.element = null;
      activeOverlay.type = null;
      activeOverlay.priority = 0;
      return true;
    }
    
    // Current overlay has higher priority - don't dismiss
    return false;
  }
  
  return true; // No current overlay, can proceed
}

// Register a new overlay
function registerOverlay(element, type) {
  const priority = OVERLAY_PRIORITIES[type] || 0;
  
  // Try to dismiss current overlay
  if (!dismissCurrentOverlay(type, priority)) {
    debugLog(`Mine Anything: Cannot spawn ${type} - ${activeOverlay.type} has higher priority`);
    return false;
  }
  
  activeOverlay.element = element;
  activeOverlay.type = type;
  activeOverlay.priority = priority;
  
  // Add automatic cleanup when element is removed
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === element) {
          if (activeOverlay.element === element) {
            activeOverlay.element = null;
            activeOverlay.type = null;
            activeOverlay.priority = 0;
          }
          observer.disconnect();
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true });
  
  return true;
}

// Debug mode for testing easter eggs
let debugMode = {
  enabled: false,
  forceCreeper: false,
  forceZombie: false,
  forceVillager: false,
  forceEnchantment: false, // Can be true (random) or enchantment key
  forcePet: null, // Set to pet key to force spawn
  forceChest: false,
  forceWarden: false
};

// Helper function to check if mining shortcut is currently pressed
function isShortcutPressed() {
  return miningKeys.every(key => currentlyPressedKeys.has(key));
}

// Detect platform for keyboard shortcut
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Check if SVG cracks are available
async function checkSVGCracks() {
  try {
    const testUrl = chrome.runtime.getURL('assets/cracks/crack_1.svg');
    const response = await fetch(testUrl);
    useSVGCracks = response.ok;
    debugLog('Mine Anything: SVG cracks available:', useSVGCracks);
  } catch (e) {
    useSVGCracks = false;
    debugLog('Mine Anything: SVG cracks not available, using CSS fallback');
  }
}

// Tool progression system
const TOOLS = {
  hand: { name: 'Hand', speed: 5000, xpRequired: 0, icon: '✋', file: 'hand.svg', particleColor: '#8B7355' },
  wooden_axe: { name: 'Wooden Axe', speed: 4000, xpRequired: 100, icon: '🪓', file: 'wood.svg', particleColor: '#8B4513' },
  copper_axe: { name: 'Copper Axe', speed: 3000, xpRequired: 500, icon: '⛏️', file: 'copper.svg', particleColor: '#CD7F32' },
  iron_axe: { name: 'Iron Axe', speed: 2000, xpRequired: 1500, icon: '⚒️', file: 'iron.svg', particleColor: '#A8A8A8' },
  golden_axe: { name: 'Golden Axe', speed: 1500, xpRequired: 5000, icon: '👑', file: 'gold.svg', particleColor: '#FFD700' },
  diamond_axe: { name: 'Diamond Axe', speed: 1000, xpRequired: 20000, icon: '💎', file: 'diamond.svg', particleColor: '#00FFFF' },
  netherite_axe: { name: 'Netherite Axe', speed: 500, xpRequired: 100000, icon: '🔥', file: 'netherite.svg', particleColor: '#4B0082' }
};

// Display icons for toggle button (from pickaxe levels folder)
const TOOLS_DISPLAY = {
  hand: 'hand.png',
  wooden_axe: 'wood.png',
  copper_axe: 'copper.png',
  iron_axe: 'iron.png',
  golden_axe: 'gold.png',
  diamond_axe: 'diamond.png',
  netherite_axe: 'netherite.gif'
};

// Pet system
const PETS = {
  allay: { 
    name: 'Allay', 
    spawnRate: 0.025, 
    maxSpawns: 1, 
    file: 'Allay.gif',
    ability: '+1 XP per mine (100 uses)',
    xpBonus: 1,
    usageLimit: 100
  },
  axolotl: { 
    name: 'Axolotl', 
    spawnRate: 0.022, 
    maxSpawns: 1, 
    file: 'Axolotl.gif',
    ability: '+1 XP per mine (100 uses)',
    xpBonus: 1,
    usageLimit: 100
  },
  dennis: { 
    name: 'Dennis', 
    spawnRate: 0.024, 
    maxSpawns: 1, 
    file: 'Dennis.gif',
    ability: 'Defuses 3 creepers (+1 XP)',
    defusesCreepers: true,
    usageLimit: 3
  },
  cat: { 
    name: 'Cat', 
    spawnRate: 0.026, 
    maxSpawns: 1, 
    file: 'cat.webp',
    ability: 'Defuses 3 creepers (+1 XP each)',
    defusesCreepers: true,
    usageLimit: 3
  },
  toad: { 
    name: 'Toad', 
    spawnRate: 0.028, 
    maxSpawns: 1, 
    file: 'Toad.gif',
    ability: '-0.1s mining time (200 uses)',
    speedBonus: 100,
    usageLimit: 200
  },
  white_toad: { 
    name: 'White Toad', 
    spawnRate: 0.015, 
    maxSpawns: 1, 
    file: 'white toad.gif',
    ability: '-0.5s mining time (50 uses)',
    speedBonus: 500,
    usageLimit: 50
  }
};

const ENCHANTMENTS = {
  fortune: {
    name: 'Fortune',
    description: '+50% XP from mining',
    spawnRate: 0.0005, // 0.05% - very rare
    xpMultiplier: 1.5,
    durability: 100 // 100 uses
  },
  efficiency: {
    name: 'Efficiency',
    description: '-30% mining time',
    spawnRate: 0.0005, // 0.05% - very rare
    speedBonus: 0.7, // Multiplier
    durability: 100 // 100 uses
  },
  unbreaking: {
    name: 'Unbreaking',
    description: 'Protects tool from 3 Warden steals',
    spawnRate: 0.0003, // 0.03% - extremely rare
    protectionUses: 3,
    durability: 50 // 50 uses (fewer because of powerful effect)
  },
  mending: {
    name: 'Mending',
    description: '30% chance to recover stolen tool per mine',
    spawnRate: 0.0003, // 0.03% - extremely rare
    recoveryBoost: 0.3, // Adds to base 20%
    durability: 50 // 50 uses
  },
  looting: {
    name: 'Looting',
    description: 'Double pet spawn rates',
    spawnRate: 0.0002, // 0.02% - ultra rare
    petSpawnMultiplier: 2,
    durability: 150 // 150 uses (more since pet spawns are rare)
  },
  silk_touch: {
    name: 'Silk Touch',
    description: 'Mined ads give 3x XP instead of 2x',
    spawnRate: 0.0003, // 0.03% - extremely rare
    adXpMultiplier: 3,
    durability: 75 // 75 uses
  },
  haste: {
    name: 'Haste',
    description: '50% faster mining for 20 mines',
    spawnRate: 0.33, // 33% for hand/wood/copper (modified in code)
    speedMultiplier: 0.5, // 50% faster (multiply time by 0.5)
    mineCount: 20 // Lasts 20 mines
  }
};

// Achievement system
const ACHIEVEMENTS = {
  first_mine: {
    name: 'Getting Started',
    description: 'Mine your first element',
    requirement: { type: 'totalMined', value: 1 },
    icon: 'first_mine.png'
  },
  mining_veteran: {
    name: 'Mining Veteran',
    description: 'Mine 100 elements',
    requirement: { type: 'totalMined', value: 100 },
    icon: 'mining_veteran.png'
  },
  mining_master: {
    name: 'Mining Master',
    description: 'Mine 1000 elements',
    requirement: { type: 'totalMined', value: 1000 },
    icon: 'mining_master.png'
  },
  first_upgrade: {
    name: 'Tool Upgrade',
    description: 'Upgrade to Wooden Axe',
    requirement: { type: 'tool', value: 'wooden_axe' },
    icon: 'first_upgrade.png'
  },
  iron_age: {
    name: 'Iron Age',
    description: 'Upgrade to Iron Axe',
    requirement: { type: 'tool', value: 'iron_axe' },
    icon: 'iron_age.png'
  },
  diamond_miner: {
    name: 'Diamond Miner',
    description: 'Upgrade to Diamond Axe',
    requirement: { type: 'tool', value: 'diamond_axe' },
    icon: 'diamond_miner.png'
  },
  netherite_legend: {
    name: 'Netherite Legend',
    description: 'Upgrade to Netherite Axe',
    requirement: { type: 'tool', value: 'netherite_axe' },
    icon: 'netherite_legend.png'
  },
  pet_collector: {
    name: 'Pet Collector',
    description: 'Collect your first pet',
    requirement: { type: 'pets', value: 1 },
    icon: 'pet_collector.png'
  },
  treasure_hunter: {
    name: 'Treasure Hunter',
    description: 'Find your first diamond',
    requirement: { type: 'diamonds', value: 1 },
    icon: 'treasure_hunter.png'
  },
  warden_slayer: {
    name: 'Warden Slayer',
    description: 'Craft the Diamond Sword',
    requirement: { type: 'hasDiamondSword', value: true },
    icon: 'warden_slayer.png'
  },
  enchanter: {
    name: 'Enchanter',
    description: 'Apply your first enchantment',
    requirement: { type: 'hasEnchantment', value: true },
    icon: 'enchanter.png'
  },
  deep_diver: {
    name: 'Deep Diver',
    description: 'Mine 50 elements in the deep zone',
    requirement: { type: 'deepMining', value: 50 },
    icon: 'deep_diver.png'
  },
  xp_collector: {
    name: 'XP Collector',
    description: 'Reach 500 XP',
    requirement: { type: 'xp', value: 500 },
    icon: 'xp_collector.png'
  },
  xp_master: {
    name: 'XP Master',
    description: 'Reach 5000 XP',
    requirement: { type: 'xp', value: 5000 },
    icon: 'xp_master.png'
  },
  challenge_complete: {
    name: 'Challenge Accepted',
    description: 'Complete your first daily challenge',
    requirement: { type: 'challengesCompleted', value: 1 },
    icon: 'award_generic.png'
  }
};

// Resource collection system - color-based resources with HSL ranges
const RESOURCES = {
  coal: {
    name: 'Coal',
    file: 'coal',
    colorRange: { hueMin: 0, hueMax: 360, satMin: 0, satMax: 20, lightMin: 0, lightMax: 30 }, // Very dark, any hue, low saturation
    dropRate: 0.4
  },
  iron: {
    name: 'Iron',
    file: 'iron',
    colorRange: { hueMin: 0, hueMax: 360, satMin: 0, satMax: 25, lightMin: 35, lightMax: 80 }, // Gray/silver (desaturated, medium light)
    dropRate: 0.3
  },
  gold: {
    name: 'Gold',
    file: 'gold',
    colorRange: { hueMin: 35, hueMax: 65, satMin: 35, satMax: 100, lightMin: 40, lightMax: 90 }, // Yellow/gold (wide range)
    dropRate: 0.25
  },
  redstone: {
    name: 'Redstone',
    file: 'redstone',
    colorRange: { hueMin: 340, hueMax: 20, satMin: 30, satMax: 100, lightMin: 25, lightMax: 98 }, // Red/pink (wraps around 0, includes very light pink)
    dropRate: 0.3
  },
  lapis: {
    name: 'Lapis',
    file: 'lapis',
    colorRange: { hueMin: 200, hueMax: 250, satMin: 35, satMax: 100, lightMin: 25, lightMax: 80 }, // Blue (wide range)
    dropRate: 0.25
  },
  emerald: {
    name: 'Emerald',
    file: 'emerald',
    colorRange: { hueMin: 110, hueMax: 170, satMin: 30, satMax: 100, lightMin: 25, lightMax: 75 }, // Green
    dropRate: 0.2
  },
  diamond: {
    name: 'Diamond Ore',
    file: 'diamond',
    colorRange: { hueMin: 165, hueMax: 200, satMin: 35, satMax: 100, lightMin: 40, lightMax: 90 }, // Cyan/light blue
    dropRate: 0.15
  },
  netherite: {
    name: 'Ancient Debris',
    file: 'netherite',
    colorRange: { hueMin: 260, hueMax: 320, satMin: 25, satMax: 100, lightMin: 20, lightMax: 75 }, // Purple/magenta
    dropRate: 0.1
  }
};

// Craftable items
const CRAFTABLE_ITEMS = {
  torch: {
    name: 'Torch',
    file: 'torch',
    folder: 'items',
    description: '50% less mob spawns (25 mines)',
    recipe: { coal: 8, gold: 2 },
    mineCount: 25, // Lasts for 25 mined elements
    effect: 'safe_zone'
  },
  redstone_lamp: {
    name: 'Redstone Lamp',
    file: 'redstone_lamp',
    folder: 'items',
    description: '+100% XP for 2 minutes',
    recipe: { redstone: 12, gold: 4 },
    duration: 120000, // 2 minutes
    effect: 'xp_boost',
    multiplier: 2.0
  },
  beacon: {
    name: 'Beacon',
    file: 'beacon',
    folder: 'items',
    description: '2x resource drops (50 mines)',
    recipe: { diamond: 2, iron: 10, gold: 5 },
    mineCount: 50, // Lasts for 50 mined elements
    effect: 'double_drops'
  },
  golden_apple: {
    name: 'Golden Apple',
    file: 'golden_apple',
    folder: 'items',
    description: 'Instant +50 XP boost',
    recipe: { gold: 8, emerald: 1 },
    effect: 'instant_xp',
    xpAmount: 50
  },
  diamond_sword: {
    name: 'Diamond Sword',
    file: 'diamond_sword',
    folder: 'items',
    description: 'Defeat the Warden (3 uses)',
    recipe: { diamond: 15 },
    uses: 3, // Consumed after 3 warden kills
    effect: 'warden_slayer'
  }
};

// Curated websites for Nether Portal
// Villager trade pool - trades that villagers can offer
const VILLAGER_TRADES = {
  // Resource trades (give resources, get other resources or XP)
  coal_for_iron: {
    type: 'resource',
    give: { resource: 'coal', amount: 10 },
    receive: { resource: 'iron', amount: 3 },
    label: '10 Coal → 3 Iron'
  },
  iron_for_gold: {
    type: 'resource',
    give: { resource: 'iron', amount: 5 },
    receive: { resource: 'gold', amount: 2 },
    label: '5 Iron → 2 Gold'
  },
  gold_for_diamond: {
    type: 'resource',
    give: { resource: 'gold', amount: 8 },
    receive: { resource: 'diamond', amount: 1 },
    label: '8 Gold → 1 Diamond'
  },
  redstone_for_xp: {
    type: 'resource',
    give: { resource: 'redstone', amount: 15 },
    receive: { xp: 100 },
    label: '15 Redstone → 100 XP'
  },
  lapis_for_xp: {
    type: 'resource',
    give: { resource: 'lapis', amount: 10 },
    receive: { xp: 75 },
    label: '10 Lapis → 75 XP'
  },
  emerald_for_diamond: {
    type: 'resource',
    give: { resource: 'emerald', amount: 3 },
    receive: { resource: 'diamond', amount: 2 },
    label: '3 Emerald → 2 Diamond'
  },
  // Enchantment trades (give resources, get enchantment)
  fortune_trade: {
    type: 'enchantment',
    give: { resource: 'diamond', amount: 3 },
    receive: { enchantment: 'fortune' },
    label: '3 Diamond → Fortune'
  },
  efficiency_trade: {
    type: 'enchantment',
    give: { resource: 'emerald', amount: 5 },
    receive: { enchantment: 'efficiency' },
    label: '5 Emerald → Efficiency'
  },
  silk_touch_trade: {
    type: 'enchantment',
    give: { resource: 'diamond', amount: 5 },
    receive: { enchantment: 'silk_touch' },
    label: '5 Diamond → Silk Touch'
  },
  looting_trade: {
    type: 'enchantment',
    give: { resource: 'emerald', amount: 8 },
    receive: { enchantment: 'looting' },
    label: '8 Emerald → Looting'
  }
};

// Helper function to get asset URL with fallback for different extensions
function getAssetUrl(path, filename, extensions = ['png', 'gif', 'webp', 'jpg', 'svg']) {
  // If filename already has extension, use it directly
  if (filename.includes('.')) {
    try {
      return chrome.runtime.getURL(`${path}/${filename}`);
    } catch (e) {
      debugWarn('Extension context invalidated');
      return '';
    }
  }
  // Return first extension as default, browser will handle if it exists
  try {
    return chrome.runtime.getURL(`${path}/${filename}.${extensions[0]}`);
  } catch (e) {
    debugWarn('Extension context invalidated');
    return '';
  }
}

// Helper to create image with fallback extensions
function createImageWithFallback(path, filename, callback) {
  // Use different extension priorities based on path
  let extensions;
  if (path.includes('resources')) {
    // Resources are PNGs
    extensions = ['png', 'gif', 'webp', 'jpg', 'jpeg', 'svg'];
  } else if (path.includes('mobs')) {
    // Mobs are GIFs
    extensions = ['gif', 'png', 'webp', 'jpg', 'jpeg', 'svg'];
  } else {
    // Default priority
    extensions = ['png', 'gif', 'webp', 'jpg', 'jpeg', 'svg'];
  }
  
  let attemptIndex = 0;
  
  function tryLoad() {
    if (attemptIndex >= extensions.length) {
      debugWarn(`Could not load image: ${path}/${filename}`);
      callback(null);
      return;
    }
    
    const img = new Image();
    const ext = extensions[attemptIndex];
    
    try {
      img.src = chrome.runtime.getURL(`${path}/${filename}.${ext}`);
    } catch (e) {
      // Extension context invalidated (extension was reloaded)
      debugWarn('Extension context invalidated');
      callback(null);
      return;
    }
    
    img.onload = () => callback(img.src);
    img.onerror = () => {
      // Silently try next extension
      attemptIndex++;
      tryLoad();
    };
  }
  
  tryLoad();
}

// Setup debug functions (after PETS is defined)
window.MineAnythingDebug = {
  forceCreeper: () => {
    debugMode.forceCreeper = true;
    debugLog('🐛 Debug: Next mine will spawn a creeper');
  },
  forcePet: (petName) => {
    const petKey = petName.toLowerCase().replace(' ', '_');
    if (PETS[petKey]) {
      debugMode.forcePet = petKey;
      debugLog(`🐛 Debug: Next mine will spawn ${PETS[petKey].name}`);
    } else {
      debugLog('🐛 Debug: Invalid pet. Available:', Object.keys(PETS).join(', '));
    }
  },
  listPets: () => {
    debugLog('🐛 Available pets:', Object.keys(PETS).map(key => PETS[key].name).join(', '));
  },
  resetPets: async () => {
    playerData.pets = {};
    await savePlayerData();
    debugLog('🐛 Debug: All pets reset');
  },
  addXP: async (amount) => {
    playerData.xp += amount;
    await savePlayerData();
    debugLog(`🐛 Debug: Added ${amount} XP. Total: ${playerData.xp}`);
  },
  forceChest: () => {
    debugMode.forceChest = true;
    debugLog('🐛 Debug: Next mine will spawn a chest');
  },
  getDiamonds: () => {
    const diamondCount = playerData.inventory?.diamond || 0;
    const swordUses = playerData.diamond_sword || 0;
    debugLog(`🐛 Debug: Diamonds: ${diamondCount}, Diamond Sword: ${swordUses} uses`);
  },
  addDiamonds: async (count = 10) => {
    if (!playerData.inventory) playerData.inventory = {};
    playerData.inventory.diamond = (playerData.inventory.diamond || 0) + count;
    await savePlayerData();
    if (typeof updateInventoryUI === 'function') updateInventoryUI();
    debugLog(`🐛 Debug: Added ${count} diamonds. Total: ${playerData.inventory.diamond}`);
    return playerData.inventory.diamond;
  },
  giveSword: async () => {
    playerData.diamond_sword = 3;
    await savePlayerData();
    debugLog('🐛 Debug: Diamond Sword granted! (3 uses) You can now defeat the Warden.');
  },
  resetDiamonds: async () => {
    if (playerData.inventory) playerData.inventory.diamond = 0;
    playerData.diamond_sword = 0;
    await savePlayerData();
    debugLog('🐛 Debug: Diamonds and sword reset');
  },
  forceWarden: () => {
    debugMode.forceWarden = true;
    debugLog('🐛 Debug: Next footer mine will spawn warden');
  },
  forceZombie: () => {
    debugMode.forceZombie = true;
    debugLog('🐛 Debug: Next mine will spawn a zombie');
  },
  forceVillager: () => {
    debugMode.forceVillager = true;
    debugLog('🐛 Debug: Next mine will spawn a villager');
  },
  forceEnchantment: (enchantName) => {
    const enchantKey = enchantName ? enchantName.toLowerCase().replace(' ', '_') : null;
    if (!enchantName) {
      // Random enchantment
      debugMode.forceEnchantment = true;
      debugLog('🐛 Debug: Next mine will spawn a random enchantment');
    } else if (ENCHANTMENTS[enchantKey]) {
      debugMode.forceEnchantment = enchantKey;
      debugLog(`🐛 Debug: Next mine will spawn ${ENCHANTMENTS[enchantKey].name}`);
    } else {
      debugLog('🐛 Debug: Invalid enchantment. Available:', Object.keys(ENCHANTMENTS).join(', '));
    }
  },
  listEnchantments: () => {
    debugLog('🐛 Available enchantments:', Object.keys(ENCHANTMENTS).map(key => ENCHANTMENTS[key].name).join(', '));
  },
  addResource: async (resourceName, amount = 10) => {
    const resourceKey = resourceName.toLowerCase();
    if (RESOURCES[resourceKey]) {
      if (!playerData.inventory) playerData.inventory = {};
      if (!playerData.inventory[resourceKey]) playerData.inventory[resourceKey] = 0;
      playerData.inventory[resourceKey] += amount;
      await savePlayerData();
      debugLog(`🐛 Debug: Added ${amount} ${RESOURCES[resourceKey].name}. Total: ${playerData.inventory[resourceKey]}`);
    } else {
      debugLog('🐛 Debug: Invalid resource. Available:', Object.keys(RESOURCES).join(', '));
    }
  },
  listResources: () => {
    debugLog('🐛 Available resources:', Object.keys(RESOURCES).map(key => RESOURCES[key].name).join(', '));
  },
  showInventory: () => {
    if (!playerData.inventory || Object.keys(playerData.inventory).length === 0) {
      debugLog('🐛 Inventory is empty');
      return;
    }
    debugLog('🐛 Current inventory:');
    Object.entries(playerData.inventory).forEach(([key, amount]) => {
      const resource = RESOURCES[key];
      if (resource && amount > 0) {
        debugLog(`  ${resource.name}: ${amount}`);
      }
    });
  },
  clearInventory: async () => {
    playerData.inventory = {};
    await savePlayerData();
    debugLog('🐛 Debug: Inventory cleared');
  },
  addEnchantment: async (enchantName) => {
    const enchantKey = enchantName.toLowerCase().replace(' ', '_');
    if (ENCHANTMENTS[enchantKey]) {
      if (!playerData.enchantmentInventory) playerData.enchantmentInventory = [];
      const enchant = ENCHANTMENTS[enchantKey];
      playerData.enchantmentInventory.push({
        type: enchantKey,
        durability: enchant.durability,
        maxDurability: enchant.durability
      });
      await savePlayerData();
      debugLog(`🐛 Debug: Added ${enchant.name} to enchantment inventory (${enchant.durability} uses)`);
    } else {
      debugLog('🐛 Debug: Invalid enchantment. Use listEnchantments() to see available options');
    }
  },
  showEnchantments: () => {
    if (!playerData.enchantmentInventory || playerData.enchantmentInventory.length === 0) {
      debugLog('🐛 No enchantments in inventory');
      return;
    }
    debugLog('🐛 Enchantment inventory:');
    playerData.enchantmentInventory.forEach((enchantData, index) => {
      const enchant = ENCHANTMENTS[enchantData.type];
      const active = playerData.activeEnchantmentIndex === index ? ' ⚡ ACTIVE' : '';
      debugLog(`  [${index}] ${enchant.name}: ${enchantData.durability}/${enchant.durability} uses${active}`);
    });
  },
  activateEnchantment: async (index) => {
    if (!playerData.enchantmentInventory || !playerData.enchantmentInventory[index]) {
      debugLog('🐛 Debug: Invalid enchantment index');
      return;
    }
    playerData.activeEnchantmentIndex = index;
    playerData.toolEnchantment = playerData.enchantmentInventory[index].type;
    await savePlayerData();
    const enchant = ENCHANTMENTS[playerData.toolEnchantment];
    debugLog(`🐛 Debug: Activated ${enchant.name}`);
  },
  help: () => {
    debugLog(`
🐛 Mine Anything Debug Commands:

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
  MineAnythingDebug.addDiamonds(3)          - Add diamonds (max 15)
  MineAnythingDebug.resetDiamonds()         - Reset diamonds and sword

HELP:
  MineAnythingDebug.help()                  - Show this help
    `);
  }
};

debugLog('🐛 Mine Anything Debug enabled. Type MineAnythingDebug.help() for commands');

// Setup debug commands accessible from console via custom events (bypasses CSP)
// Inject via world: MAIN approach
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('debug-injector.js');
  (document.head || document.documentElement).prepend(script);
  script.onload = () => script.remove();
} catch (e) {
  debugLog('🐛 Debug injection blocked by CSP. Use chrome.storage to enable debug mode instead.');
}

// Listen for debug messages from page context
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  const { type, petName, enchantName, resourceName, amount, count, index } = event.data;
  
  switch (type) {
    case 'DEBUG_FORCE_CREEPER':
      debugMode.forceCreeper = true;
      debugLog('🐛 Debug: Next mine will spawn a creeper');
      break;
    case 'DEBUG_FORCE_ZOMBIE':
      debugMode.forceZombie = true;
      debugLog('🐛 Debug: Next mine will spawn a zombie');
      break;
    case 'DEBUG_FORCE_VILLAGER':
      debugMode.forceVillager = true;
      debugLog('🐛 Debug: Next mine will spawn a villager');
      break;
    case 'DEBUG_FORCE_PET':
      const petKey = petName.toLowerCase().replace(' ', '_');
      if (PETS[petKey]) {
        debugMode.forcePet = petKey;
        debugLog(`🐛 Debug: Next mine will spawn ${PETS[petKey].name}`);
      } else {
        debugLog('🐛 Debug: Invalid pet. Available:', Object.keys(PETS).join(', '));
      }
      break;
    case 'DEBUG_FORCE_CHEST':
      debugMode.forceChest = true;
      debugLog('🐛 Debug: Next mine will spawn a chest');
      break;
    case 'DEBUG_FORCE_WARDEN':
      debugMode.forceWarden = true;
      debugLog('🐛 Debug: Next footer mine will spawn warden');
      break;
    case 'DEBUG_FORCE_ENCHANTMENT':
      const enchantKey = enchantName ? enchantName.toLowerCase().replace(' ', '_') : null;
      if (!enchantName) {
        debugMode.forceEnchantment = true;
        debugLog('🐛 Debug: Next mine will spawn a random enchantment');
      } else if (ENCHANTMENTS[enchantKey]) {
        debugMode.forceEnchantment = enchantKey;
        debugLog(`🐛 Debug: Next mine will spawn ${ENCHANTMENTS[enchantKey].name}`);
      } else {
        debugLog('🐛 Debug: Invalid enchantment. Available:', Object.keys(ENCHANTMENTS).join(', '));
      }
      break;
    case 'DEBUG_LIST_PETS':
      debugLog('🐛 Available pets:', Object.keys(PETS).map(key => PETS[key].name).join(', '));
      break;
    case 'DEBUG_LIST_ENCHANTMENTS':
      debugLog('🐛 Available enchantments:', Object.keys(ENCHANTMENTS).map(key => ENCHANTMENTS[key].name).join(', '));
      break;
    case 'DEBUG_LIST_RESOURCES':
      debugLog('🐛 Available resources:', Object.keys(RESOURCES).map(key => RESOURCES[key].name).join(', '));
      break;
    case 'DEBUG_RESET_PETS':
      playerData.pets = {};
      await savePlayerData();
      debugLog('🐛 Debug: All pets reset');
      break;
    case 'DEBUG_ADD_XP':
      playerData.xp += amount;
      await savePlayerData();
      debugLog(`🐛 Debug: Added ${amount} XP. Total: ${playerData.xp}`);
      await savePlayerData();
      debugLog('🐛 Debug: Diamonds and sword reset');
      break;
    case 'DEBUG_ADD_RESOURCE':
      const resourceKey = resourceName.toLowerCase();
      if (RESOURCES[resourceKey]) {
        if (!playerData.inventory) playerData.inventory = {};
        if (!playerData.inventory[resourceKey]) playerData.inventory[resourceKey] = 0;
        playerData.inventory[resourceKey] += (amount || 10);
        await savePlayerData();
        debugLog(`🐛 Debug: Added ${amount || 10} ${RESOURCES[resourceKey].name}. Total: ${playerData.inventory[resourceKey]}`);
      } else {
        debugLog('🐛 Debug: Invalid resource. Available:', Object.keys(RESOURCES).join(', '));
      }
      break;
    case 'DEBUG_SHOW_INVENTORY':
      if (!playerData.inventory || Object.keys(playerData.inventory).length === 0) {
        debugLog('🐛 Inventory is empty');
        return;
      }
      debugLog('🐛 Current inventory:');
      Object.entries(playerData.inventory).forEach(([key, amount]) => {
        const resource = RESOURCES[key];
        if (resource && amount > 0) {
          debugLog(`  ${resource.name}: ${amount}`);
        }
      });
      break;
    case 'DEBUG_CLEAR_INVENTORY':
      playerData.inventory = {};
      await savePlayerData();
      debugLog('🐛 Debug: Inventory cleared');
      break;
    case 'DEBUG_ADD_ENCHANTMENT':
      const addEnchantKey = enchantName.toLowerCase().replace(' ', '_');
      if (ENCHANTMENTS[addEnchantKey]) {
        if (!playerData.enchantmentInventory) playerData.enchantmentInventory = [];
        const enchant = ENCHANTMENTS[addEnchantKey];
        playerData.enchantmentInventory.push({
          type: addEnchantKey,
          durability: enchant.durability,
          maxDurability: enchant.durability
        });
        await savePlayerData();
        debugLog(`🐛 Debug: Added ${enchant.name} to enchantment inventory (${enchant.durability} uses)`);
      } else {
        debugLog('🐛 Debug: Invalid enchantment. Use listEnchantments() to see available options');
      }
      break;
    case 'DEBUG_SHOW_ENCHANTMENTS':
      if (!playerData.enchantmentInventory || playerData.enchantmentInventory.length === 0) {
        debugLog('🐛 No enchantments in inventory');
        return;
      }
      debugLog('🐛 Enchantment inventory:');
      playerData.enchantmentInventory.forEach((enchantData, idx) => {
        const enchant = ENCHANTMENTS[enchantData.type];
        const active = playerData.activeEnchantmentIndex === idx ? ' ⚡ ACTIVE' : '';
        debugLog(`  [${idx}] ${enchant.name}: ${enchantData.durability}/${enchant.durability} uses${active}`);
      });
      break;
    case 'DEBUG_ACTIVATE_ENCHANTMENT':
      if (!playerData.enchantmentInventory || !playerData.enchantmentInventory[index]) {
        debugLog('🐛 Debug: Invalid enchantment index');
        return;
      }
      playerData.activeEnchantmentIndex = index;
      playerData.toolEnchantment = playerData.enchantmentInventory[index].type;
      await savePlayerData();
      const activeEnchant = ENCHANTMENTS[playerData.toolEnchantment];
      debugLog(`🐛 Debug: Activated ${activeEnchant.name}`);
      break;
  }
});

// Check if current domain is blocked
async function isDomainBlocked() {
  try {
    const hostname = window.location.hostname;
    const result = await chrome.storage.local.get(['blockedDomains']);
    const blockedDomains = result.blockedDomains || [];
    return blockedDomains.includes(hostname);
  } catch (e) {
    return false;
  }
}

// Initialize player data
async function initPlayerData() {
  const result = await chrome.storage.local.get(['playerData']);
  if (result.playerData) {
    playerData = result.playerData;
    // Ensure pets object exists (for backward compatibility)
    if (!playerData.pets) {
      playerData.pets = {};
      await savePlayerData();
    }
    // Ensure diamond sword tracking exists (new system)
    if (playerData.diamond_sword === undefined) {
      playerData.diamond_sword = 0;
      await savePlayerData();
    }
    // Ensure stolen tool tracking exists
    if (playerData.stolenTool === undefined) {
      playerData.stolenTool = null;
      await savePlayerData();
    }
    // Ensure enchantments tracking exists
    if (playerData.enchantments === undefined) {
      playerData.enchantments = {};
      playerData.toolEnchantment = null;
      playerData.unbreakingUses = 0;
      await savePlayerData();
    }
    // Ensure highestToolUnlocked exists (permanent tool progression)
    if (playerData.highestToolUnlocked === undefined) {
      // Set to current tool or hand if undefined
      playerData.highestToolUnlocked = playerData.currentTool || 'hand';
      await savePlayerData();
    }
    // Ensure unbreakingUses exists
    if (playerData.unbreakingUses === undefined) {
      playerData.unbreakingUses = 0;
      await savePlayerData();
    }
    // Ensure daily challenges exist
    if (playerData.dailyChallenges === undefined) {
      playerData.dailyChallenges = {
        lastReset: new Date().toDateString(),
        challenges: [],
        completed: []
      };
      await savePlayerData();
    }
    // Ensure cat deflections tracking exists
    if (playerData.catDeflections === undefined) {
      playerData.catDeflections = 0;
      await savePlayerData();
    }
  } else {
    playerData = {
      totalMined: 0,
      currentTool: 'hand',
      highestToolUnlocked: 'hand', // Track best tool ever achieved (permanent)
      xp: 0,
      pets: {}, // Track collected pets and spawn counts
      achievements: {}, // Track unlocked achievements
      deepMiningCount: 0, // Track deep zone mining for achievement
      challengesCompleted: 0, // Track completed challenges
      inventory: {}, // Track collected resources
      craftedItems: {}, // Track crafted items
      placedTorches: [], // Track placed torches with timestamps
      autoMining: null // Track auto-mining state { endTime, intervalId }
    };
    await savePlayerData();
  }
  
  // Recalculate tool level based on current XP (in case XP requirements changed)
  checkToolUpgrade();
  
  initDailyChallenges(); // Initialize/reset daily challenges
  debugLog('Mine Anything: Player data initialized', playerData);
}

async function savePlayerData() {
  try {
    await chrome.storage.local.set({ playerData });
  } catch (e) {
    // Extension context invalidated - happens when extension reloads
    // Safe to ignore as data will be reinitialized on next load
    if (!e.message.includes('Extension context invalidated')) {
      console.error('Mine Anything: Error saving player data', e);
    }
  }
}

// Enforce XP floor - XP can never go below number of blocks mined
function enforceXPFloor() {
  const minXP = playerData.totalMined || 0;
  if (playerData.xp < minXP) {
    playerData.xp = minXP;
  }
}

// Calculate XP based on element position on page
function calculatePositionXP(element) {
  const rect = element.getBoundingClientRect();
  const elementTop = rect.top + window.scrollY;
  
  // Use centralized dynamic depth calculation
  const depthInfo = getCurrentDepthInfo(elementTop);
  
  // Return XP value based on depth zone
  return depthInfo.xpValue;
}

// Helper function to get current document height dynamically
function getCurrentDocumentHeight() {
  return Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
    document.body.scrollHeight,
    document.body.offsetHeight
  );
}

// Calculate current depth info based on scroll position and CURRENT page height
// Updates dynamically as page content loads (perfect for infinite scroll)
function getCurrentDepthInfo(customScrollY = null) {
  const pageHeight = getCurrentDocumentHeight();
  const currentScroll = customScrollY !== null ? customScrollY : (window.scrollY + window.innerHeight / 2);
  const scrollPercentage = Math.min(currentScroll / pageHeight, 1);
  
  // Map to Y coordinates: 0 (top) to -64 (current bottom)
  const yCoord = Math.floor(0 - (scrollPercentage * 64));
  
  let depthName = '';
  let xpValue = 1;
  let zone = 'surface';
  
  // Depth zones based on Y coordinate
  if (yCoord === 0) {
    depthName = 'Surface';
    xpValue = 1;
    zone = 'surface';
  } else if (yCoord >= -26) { // Y: -1 to -26
    depthName = 'Surface';
    xpValue = 1;
    zone = 'surface';
  } else if (yCoord >= -38) { // Y: -26 to -38
    depthName = 'Underground';
    xpValue = 2;
    zone = 'underground';
  } else if (yCoord >= -45) { // Y: -38 to -45
    depthName = 'Caves';
    xpValue = 3;
    zone = 'caves';
  } else { // Y: -45 to -64 (Deep Dark - bottom 30%)
    depthName = 'Deep Dark';
    xpValue = 5;
    zone = 'deepdark';
  }
  
  return {
    yCoord,
    depthName,
    xpValue,
    zone,
    pageHeight,
    scrollPercentage
  };
}

// Check if element is in deep zone (bottom 30% of CURRENT page height)
function isInDeepZone(element) {
  const rect = element.getBoundingClientRect();
  const elementTop = rect.top + window.scrollY;
  const depthInfo = getCurrentDepthInfo(elementTop);
  
  // Deep zone is Y: -45 to -64 (Deep Dark)
  return depthInfo.zone === 'deepdark';
}

// Daily Challenges System
const DAILY_CHALLENGES = [
  // Easy Challenges (1-2 difficulty)
  {
    id: 'mine_blocks_easy',
    name: 'Casual Miner',
    description: 'Mine 25 blocks',
    target: 25,
    difficulty: 1,
    reward: { type: 'xp', amount: 50 },
    rewardText: '+50 XP'
  },
  {
    id: 'mine_blocks',
    name: 'Active Miner',
    description: 'Mine 50 blocks',
    target: 50,
    difficulty: 2,
    reward: { type: 'xp', amount: 100 },
    rewardText: '+100 XP'
  },
  {
    id: 'mine_ads',
    name: 'Ad Destroyer',
    description: 'Mine 10 ads',
    target: 10,
    difficulty: 2,
    reward: { type: 'xp', amount: 150 },
    rewardText: '+150 XP'
  },
  {
    id: 'mine_images',
    name: 'Image Breaker',
    description: 'Mine 15 images',
    target: 15,
    difficulty: 2,
    reward: { type: 'xp', amount: 80 },
    rewardText: '+80 XP'
  },
  
  // Medium Challenges (3-4 difficulty)
  {
    id: 'mine_blocks_medium',
    name: 'Dedicated Miner',
    description: 'Mine 100 blocks',
    target: 100,
    difficulty: 3,
    reward: { type: 'xp', amount: 200 },
    rewardText: '+200 XP'
  },
  {
    id: 'collect_resources',
    name: 'Resource Gatherer',
    description: 'Collect 20 resources',
    target: 20,
    difficulty: 3,
    reward: { type: 'xp', amount: 150 },
    rewardText: '+150 XP'
  },
  {
    id: 'collect_coal',
    name: 'Coal Collector',
    description: 'Collect 10 coal',
    target: 10,
    difficulty: 2,
    reward: { type: 'xp', amount: 75 },
    rewardText: '+75 XP'
  },
  {
    id: 'collect_iron',
    name: 'Iron Seeker',
    description: 'Collect 5 iron',
    target: 5,
    difficulty: 3,
    reward: { type: 'xp', amount: 100 },
    rewardText: '+100 XP'
  },
  {
    id: 'collect_gold',
    name: 'Gold Rush',
    description: 'Collect 3 gold',
    target: 3,
    difficulty: 3,
    reward: { type: 'xp', amount: 125 },
    rewardText: '+125 XP'
  },
  {
    id: 'deep_mining',
    name: 'Deep Diver',
    description: 'Mine 20 blocks in deep zone',
    target: 20,
    difficulty: 3,
    reward: { type: 'xp', amount: 150 },
    rewardText: '+150 XP'
  },
  {
    id: 'xp_gain',
    name: 'XP Hunter',
    description: 'Earn 100 XP in one session',
    target: 100,
    difficulty: 3,
    reward: { type: 'xp', amount: 75 },
    rewardText: '+75 XP'
  },
  
  // Hard Challenges (5-6 difficulty)
  {
    id: 'mine_blocks_hard',
    name: 'Mining Marathon',
    description: 'Mine 200 blocks',
    target: 200,
    difficulty: 5,
    reward: { type: 'xp', amount: 400 },
    rewardText: '+400 XP'
  },
  {
    id: 'mine_ads_hard',
    name: 'Ad Annihilator',
    description: 'Mine 25 ads',
    target: 25,
    difficulty: 4,
    reward: { type: 'xp', amount: 300 },
    rewardText: '+300 XP'
  },
  {
    id: 'collect_emerald',
    name: 'Emerald Hunter',
    description: 'Collect 2 emeralds',
    target: 2,
    difficulty: 5,
    reward: { type: 'diamond', amount: 1 },
    rewardText: '+1 Diamond'
  },
  {
    id: 'collect_diamond',
    name: 'Diamond Seeker',
    description: 'Collect 1 diamond',
    target: 1,
    difficulty: 6,
    reward: { type: 'xp', amount: 500 },
    rewardText: '+500 XP'
  },
  {
    id: 'deep_mining_hard',
    name: 'Abyss Explorer',
    description: 'Mine 50 blocks in deep zone',
    target: 50,
    difficulty: 5,
    reward: { type: 'diamond', amount: 1 },
    rewardText: '+1 Diamond'
  },
  
  // Expert Challenges (7-8 difficulty)
  {
    id: 'collect_pets',
    name: 'Pet Hunter',
    description: 'Collect any pet',
    target: 1,
    difficulty: 7,
    reward: { type: 'diamond', amount: 2 },
    rewardText: '+2 Diamonds'
  },
  {
    id: 'collect_enchantments',
    name: 'Enchanter',
    description: 'Collect an enchantment book',
    target: 1,
    difficulty: 7,
    reward: { type: 'xp', amount: 350 },
    rewardText: '+350 XP'
  },
  {
    id: 'survive_warden',
    name: 'Warden Survivor',
    description: 'Encounter the Warden and survive',
    target: 1,
    difficulty: 8,
    reward: { type: 'chest', amount: 1 },
    rewardText: 'Guaranteed Chest Spawn'
  },
  {
    id: 'defeat_warden',
    name: 'Warden Slayer',
    description: 'Defeat the Warden',
    target: 1,
    difficulty: 9,
    reward: { type: 'diamond', amount: 3 },
    rewardText: '+3 Diamonds'
  }
];

function initDailyChallenges() {
  const today = new Date().toDateString();
  
  // Reset if new day
  if (!playerData.dailyChallenges || playerData.dailyChallenges.lastReset !== today) {
    // Select 3 challenges with varied difficulty: 1 easy (1-2), 1 medium (3-4), 1 hard (5-9)
    const easyChallenges = DAILY_CHALLENGES.filter(c => c.difficulty <= 2);
    const mediumChallenges = DAILY_CHALLENGES.filter(c => c.difficulty >= 3 && c.difficulty <= 4);
    const hardChallenges = DAILY_CHALLENGES.filter(c => c.difficulty >= 5);
    
    const selectedChallenges = [
      easyChallenges[Math.floor(Math.random() * easyChallenges.length)],
      mediumChallenges[Math.floor(Math.random() * mediumChallenges.length)],
      hardChallenges[Math.floor(Math.random() * hardChallenges.length)]
    ].map(challenge => ({
      ...challenge,
      progress: 0,
      completed: false
    }));
    
    // Calculate next reset time (midnight UTC)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const nextResetTime = tomorrow.getTime();
    
    playerData.dailyChallenges = {
      lastReset: today,
      nextResetTime: nextResetTime,
      challenges: selectedChallenges,
      completed: []
    };
    
    savePlayerData();
  }
}

function updateDailyChallengeProgress(challengeId, amount = 1) {
  if (!playerData.dailyChallenges || !playerData.dailyChallenges.challenges) return;
  
  // Find challenges that match the ID (exact match or pattern match)
  const matchingChallenges = playerData.dailyChallenges.challenges.filter(c => {
    if (c.completed) return false;
    // Exact match
    if (c.id === challengeId) return true;
    // Pattern matches for variants (e.g., 'mine_blocks' matches 'mine_blocks_easy', 'mine_blocks_medium', etc.)
    if (c.id.startsWith(challengeId + '_')) return true;
    return false;
  });
  
  matchingChallenges.forEach(challenge => {
    challenge.progress += amount;
    
    // Check if completed
    if (challenge.progress >= challenge.target && !challenge.completed) {
      challenge.completed = true;
      playerData.dailyChallenges.completed.push(challenge.id);
      
      // Track completed challenges for achievement
      if (!playerData.challengesCompleted) playerData.challengesCompleted = 0;
      playerData.challengesCompleted++;
      
      // Give reward
      applyDailyChallengeReward(challenge);
      
      // Check achievements after completing challenge
      checkAchievements();
      
      showNotification(`🎉 Challenge Complete: ${challenge.name}! ${challenge.rewardText}`, 4000);
    }
  });
  
  if (matchingChallenges.length > 0) {
    savePlayerData();
  }
}

async function applyDailyChallengeReward(challenge) {
  const reward = challenge.reward;
  
  switch (reward.type) {
    case 'xp':
      playerData.xp += reward.amount;
      checkToolUpgrade();
      break;
    case 'diamond':
      playerData.diamonds = Math.min(15, playerData.diamonds + reward.amount);
      if (playerData.inventory.diamond >= 15) {
        setTimeout(() => {
          showNotification('💎 Diamond Sword Crafted! 💎', 4000);
        }, 2000);
      }
      break;
    case 'chest':
      // Flag for guaranteed chest spawn on next mine
      playerData.guaranteedChestSpawn = true;
      break;
  }
  
  await savePlayerData();
}


function checkToolUpgrade() {
  const toolKeys = Object.keys(TOOLS);
  const previousTool = playerData.currentTool;
  
  // Find the highest tool the player can afford based on XP
  let affordableTool = 'hand';
  for (let i = toolKeys.length - 1; i >= 0; i--) {
    if (playerData.xp >= TOOLS[toolKeys[i]].xpRequired) {
      affordableTool = toolKeys[i];
      break;
    }
  }
  
  // Get tool indices for comparison
  const getToolIndex = (tool) => toolKeys.indexOf(tool);
  const currentIndex = getToolIndex(playerData.currentTool || 'hand');
  const affordableIndex = getToolIndex(affordableTool);
  const highestIndex = getToolIndex(playerData.highestToolUnlocked || 'hand');
  
  // Update highestToolUnlocked if affordable tool is better
  if (affordableIndex > highestIndex) {
    playerData.highestToolUnlocked = affordableTool;
  }
  
  // Current tool should be the best of: affordable tool OR highest unlocked
  // This means tools never downgrade - once unlocked, they're permanent
  const bestToolIndex = Math.max(affordableIndex, highestIndex);
  playerData.currentTool = toolKeys[bestToolIndex];
  
  // Check achievements if tool changed
  if (previousTool !== playerData.currentTool) {
    checkAchievements();
  }
}

// Find the best element to mine (skip overlays, pseudo-elements, small elements)
function findMineableElement(element) {
  let current = element;
  let attempts = 0;
  const maxAttempts = 5; // Reduced - don't traverse as far up
  
  // List of specific extension UI class names to exclude
  const extensionClasses = [
    'mine-toggle-container', 'mine-toggle-btn', 'mine-reset-btn',
    'mine-inventory-container', 'mine-inventory-grid', 'mine-inventory-slot',
    'mine-crafting-menu', 'mine-crafting-overlay',
    'mine-villager-container', 'mine-villager-modal',
    'mine-zombie-container', 'mine-creeper-container',
    'mine-chest-container', 'mine-pet-container',
    'mine-enchant-container', 'mine-warden-image',
    'mine-notification', 'mine-xp-notification', 'mine-xp-orb',
    'mine-particle', 'mine-explosion-container',
    'mine-overlay', 'mine-floating-cursor',
    'mine-torch', 'mine-redstone-block', 'mine-craft-button',
    'mine-depth-indicator'
  ];
  
  // Never mine body, html, or any extension UI elements
  if (!element || 
      element === document.body || 
      element === document.documentElement ||
      element.id === 'mine-warden-overlay' ||
      element.id === 'mine-toggle-host' ||
      extensionClasses.some(cls => element.classList?.contains(cls)) ||
      extensionClasses.some(cls => element.closest(`.${cls}`))) {
    return null;
  }
  
  // First, try to mine the exact element clicked if it's valid
  if (isElementMineable(element)) {
    const rect = element.getBoundingClientRect();
    // Accept smaller elements now - only skip truly tiny things like icons
    if (rect.width >= 20 && rect.height >= 20) {
      // Skip SVG and paths, but allow their containers
      if (element.tagName !== 'svg' && element.tagName !== 'SVG' && 
          element.tagName !== 'path' && element.tagName !== 'PATH') {
        return element;
      }
    }
  }
  
  // If the exact element isn't good, traverse up but not far
  while (current && current !== document.body && current !== document.documentElement && attempts < maxAttempts) {
    attempts++;
    
    // Skip SVG elements and paths
    if (current.tagName === 'svg' || current.tagName === 'SVG' || 
        current.tagName === 'path' || current.tagName === 'PATH') {
      current = current.parentElement;
      continue;
    }
    
    const rect = current.getBoundingClientRect();
    
    // Skip only very small elements (reduced from 50px to 20px)
    if (rect.width < 20 || rect.height < 20) {
      current = current.parentElement;
      continue;
    }
    
    // Skip obvious overlays (very high z-index with small size)
    const style = window.getComputedStyle(current);
    const position = style.position;
    const zIndex = parseInt(style.zIndex) || 0;
    
    if ((position === 'absolute' || position === 'fixed') && zIndex > 1000 && (rect.width < 100 || rect.height < 100)) {
      current = current.parentElement;
      continue;
    }
    
    // Check if this element is mineable
    if (isElementMineable(current)) {
      return current;
    }
    
    current = current.parentElement;
  }
  
  // Return null if we couldn't find a valid element
  return null;
}

// Check if element is an ad
function isAdElement(element) {
  const adSelectors = [
    '[class*="ad-"]',
    '[class*="ads-"]',
    '[id*="ad-"]',
    '[id*="ads-"]',
    '[class*="advertisement"]',
    '[data-ad]',
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    '.adsbygoogle'
  ];
  
  for (const selector of adSelectors) {
    if (element.matches(selector) || element.querySelector(selector)) {
      return true;
    }
  }
  return false;
}

// Check if element is mineable (not too large or a major container)
function isElementMineable(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return false;
  }
  
  // Check element height - block if > 600px
  const rect = element.getBoundingClientRect();
  if (rect.height > 600) {
    return false;
  }
  
  // Block common large container elements
  const tagName = element.tagName.toLowerCase();
  const elementId = element.id?.toLowerCase() || '';
  const elementClasses = (typeof element.className === 'string' ? element.className : element.className?.baseVal || '').toLowerCase();
  
  const blockedPatterns = [
    'main', 'content', 'container', 'wrapper', 'page', 
    'site', 'layout', 'body', 'app', 'root'
  ];
  
  for (const pattern of blockedPatterns) {
    if (elementId.includes(pattern) || elementClasses.includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

// Add hover effect to elements
function addHoverListeners() {
  document.addEventListener('mouseover', (e) => {
    // Check if shortcut keys are being held OR if mining is enabled via toggle button
    if ((!miningEnabled && !isShortcutPressed()) || !playerData) {
      return;
    }
    
    // Always show cursor when mining is enabled
    if (miningEnabled || isShortcutPressed()) {
      showToolCursor();
    }
    
    const element = e.target;
    // Don't highlight toggle button, reset button, body, or html
    if (element && 
        element !== document.body && 
        element !== document.documentElement &&
        !element.classList.contains('mine-toggle-btn') && 
        !element.classList.contains('mine-reset-btn') &&
        !element.classList.contains('mine-toggle-container') &&
        !element.closest('.mine-toggle-container')) {
      
      // Find what element would actually be mined
      const mineableElement = findMineableElement(element);
      
      // Remove hover from all elements first
      document.querySelectorAll('.mine-hoverable').forEach(el => {
        el.classList.remove('mine-hoverable');
      });
      
      // Add hover effect to the element that will actually be mined
      if (mineableElement && isElementMineable(mineableElement)) {
        mineableElement.classList.add('mine-hoverable');
      }
    }
  });

  // Remove hover effect when mouse leaves
  document.addEventListener('mouseout', (e) => {
    const element = e.target;
    if (element) {
      element.classList.remove('mine-hoverable');
    }
  });
}

// Start mining an element
async function startMining(element) {
  if (currentlyMining || !element) return;
  
  // Check if element is mineable (this should have been checked already, but safety first)
  if (!isElementMineable(element)) {
    debugWarn('Mine Anything: Element is not mineable - blocking');
    return;
  }
  
  currentlyMining = element;
  miningProgress = 0;
  let isPaused = false; // Start mining immediately (mouse is already down when this is called)
  
  // Add animation to cursor immediately
  if (toolCursorElement) {
    toolCursorElement.classList.add('mining-active');
    debugLog('Mine Anything: Added mining-active class to cursor');
  } else {
    debugWarn('Mine Anything: toolCursorElement not found for animation');
  }
  
  // Listen for mouseup to pause mining
  const mouseUpHandler = (e) => {
    if (e.button === 0) {
      isPaused = true;
      // Remove animation from cursor
      if (toolCursorElement) {
        toolCursorElement.classList.remove('mining-active');
      }
    }
  };
  
  // Listen for mousedown to resume mining on same element
  const mouseDownHandler = (e) => {
    if (e.button === 0) {
      // Check if we're clicking on the element being mined or its children
      if (e.target === element || element.contains(e.target)) {
        isPaused = false;
        // Add animation to cursor
        if (toolCursorElement) {
          toolCursorElement.classList.add('mining-active');
        }
      }
    }
  };
  
  document.addEventListener('mouseup', mouseUpHandler);
  document.addEventListener('mousedown', mouseDownHandler);
  
  // Store original position if not already set
  const computedPosition = window.getComputedStyle(element).position;
  if (computedPosition === 'static') {
    element.style.position = 'relative';
  }
  
  // For images, we need special handling since they can't have relative position properly
  let targetElement = element;
  let overlayContainer = null;
  
  if (element.tagName === 'IMG') {
    // Don't modify the image at all - create an absolute positioned overlay container
    overlayContainer = document.createElement('div');
    overlayContainer.className = 'mine-image-overlay-container';
    overlayContainer.dataset.isImageWrapper = 'true';
    
    // Position it exactly over the image using absolute positioning
    const rect = element.getBoundingClientRect();
    overlayContainer.style.cssText = `
      position: absolute !important;
      left: ${rect.left + window.scrollX}px !important;
      top: ${rect.top + window.scrollY}px !important;
      width: ${rect.width}px !important;
      height: ${rect.height}px !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      overflow: hidden !important;
    `;
    
    document.body.appendChild(overlayContainer);
    targetElement = overlayContainer;
    
    // Store reference to the original image
    overlayContainer.dataset.originalImage = element;
    element.dataset.miningOverlay = 'true';
  } else {
    // Add overflow hidden to contain cracks for non-images
    const originalOverflow = targetElement.style.overflow;
    targetElement.style.overflow = 'hidden';
    targetElement.dataset.originalOverflow = originalOverflow;
  }

  // Add mining overlay with immediate crack feedback
  const overlay = document.createElement('div');
  overlay.className = 'mine-overlay';
  
  // Use SVG crack if available, otherwise use CSS class
  if (useSVGCracks) {
    try {
      const crackUrl = chrome.runtime.getURL('assets/cracks/crack_1.svg');
      const elementWidth = element.getBoundingClientRect().width;
      const elementHeight = element.getBoundingClientRect().height;
      const aspectRatio = elementWidth / elementHeight;
      
      // Determine repeat count based on aspect ratio
      let repeatCount = 1;
      if (aspectRatio >= 1.8) {
        repeatCount = 2;
      }
      
      overlay.innerHTML = `<div class="mine-crack-svg" data-repeat="${repeatCount}" style="background-image: url('${crackUrl}');"></div>`;
      debugLog('Mine Anything: Using SVG crack overlay');
    } catch (e) {
      // Extension context invalidated, fall back to CSS
      overlay.innerHTML = `<div class="mine-crack mine-crack-1"></div>`;
      useSVGCracks = false;
    }
  } else {
    overlay.innerHTML = `<div class="mine-crack mine-crack-1"></div>`;
    debugLog('Mine Anything: Using CSS crack overlay');
  }
  
  targetElement.appendChild(overlay);
  
  // Calculate mining time with pet bonuses
  let miningTime = TOOLS[playerData.currentTool].speed;
  
  // Apply Toad speed bonus (-0.1s) with usage tracking
  if (playerData.pets && playerData.pets.toad && playerData.pets.toad.collected) {
    if (!playerData.pets.toad.uses) playerData.pets.toad.uses = 0;
    if (playerData.pets.toad.uses < PETS.toad.usageLimit) {
      miningTime -= PETS.toad.speedBonus;
      playerData.pets.toad.uses++;
      if (playerData.pets.toad.uses >= PETS.toad.usageLimit) {
        playerData.pets.toad.collected = false;
        showNotification('🐸 Your Toad hopped away after helping 200 times!', 3000);
      }
    }
  }
  
  // Apply White Toad speed bonus (-0.5s) with usage tracking
  if (playerData.pets && playerData.pets.white_toad && playerData.pets.white_toad.collected) {
    if (!playerData.pets.white_toad.uses) playerData.pets.white_toad.uses = 0;
    if (playerData.pets.white_toad.uses < PETS.white_toad.usageLimit) {
      miningTime -= PETS.white_toad.speedBonus;
      playerData.pets.white_toad.uses++;
      if (playerData.pets.white_toad.uses >= PETS.white_toad.usageLimit) {
        playerData.pets.white_toad.collected = false;
        showNotification('🤍 Your White Toad hopped away after helping 50 times!', 3000);
      }
    }
  }
  
  // Apply zombie slowdown if active (doubles mining time - 100% increase)
  if (playerData.zombieSlowdown && Date.now() < playerData.zombieSlowdown.endTime) {
    miningTime *= 2; // Double the mining time
  } else if (playerData.zombieSlowdown) {
    // Slowdown expired, clear it
    delete playerData.zombieSlowdown;
    await savePlayerData();
  }
  
  // Apply Haste effect if active (50% faster mining - multiply by 0.5)
  // NOTE: Haste multiplies AFTER zombie slowdown, so effects stack multiplicatively:
  // - Zombie alone: 2x slower (5s → 10s)
  // - Haste alone: 2x faster (5s → 2.5s)
  // - Both active: 2 × 0.5 = 1x (back to normal 5s)
  // This is intentional - haste provides 50% speed boost from your current state
  if (playerData.hasteEffect && playerData.hasteEffect.remainingMines > 0) {
    miningTime *= ENCHANTMENTS.haste.speedMultiplier; // 0.5x = 50% faster
  }
  
  // Ensure minimum mining time
  miningTime = Math.max(100, miningTime);
  
  // Save pet usage updates
  await savePlayerData();
  
  const updateInterval = 100; // Update every 100ms
  const totalSteps = miningTime / updateInterval;
  let step = 0;
  
  miningInterval = setInterval(() => {
    // Only progress if mouse is held down (not paused)
    if (!isPaused) {
      step++;
      miningProgress = (step / totalSteps) * 100;
    } else {
      // Reverse progress when mouse is released
      if (step > 0) {
        step -= 2; // Decrease faster than mining to encourage holding
        if (step < 0) step = 0;
        miningProgress = (step / totalSteps) * 100;
      }
    }
    
    // Update crack stage (1-9 for CSS, 1-7 for SVG)
    if (useSVGCracks) {
      // Map progress to 7 SVG stages - centered, adapts to element
      const crackStage = Math.max(1, Math.min(7, Math.ceil((miningProgress / 100) * 7)));
      const crack = overlay.querySelector('.mine-crack-svg');
      if (crack && crack.dataset.stage != crackStage) {
        crack.dataset.stage = crackStage;
        try {
          const crackUrl = chrome.runtime.getURL(`assets/cracks/crack_${crackStage}.svg`);
          crack.style.backgroundImage = `url('${crackUrl}')`;
          
          // Apply horizontal repeating based on stored repeat count
          const repeatCount = parseInt(crack.dataset.repeat) || 1;
          if (repeatCount > 1) {
            crack.style.setProperty('background-repeat', 'repeat-x', 'important');
            crack.style.setProperty('background-size', `${100 / repeatCount}% 100%`, 'important');
            crack.style.setProperty('background-position', 'left center', 'important');
          } else {
            crack.style.setProperty('background-repeat', 'no-repeat', 'important');
            crack.style.setProperty('background-size', 'contain', 'important');
            crack.style.setProperty('background-position', 'center center', 'important');
          }
        } catch (e) {
          // Extension context invalidated, do nothing
        }
      }
    } else {
      // Use CSS crack stages (1-9)
      const crackStage = Math.max(1, Math.min(9, Math.floor((miningProgress / 100) * 10)));
      const crack = overlay.querySelector('.mine-crack');
      if (crack) {
        crack.className = `mine-crack mine-crack-${crackStage}`;
      }
    }
    
    if (miningProgress >= 100) {
      document.removeEventListener('mouseup', mouseUpHandler);
      document.removeEventListener('mousedown', mouseDownHandler);
      // Remove animation from cursor
      if (toolCursorElement) {
        toolCursorElement.classList.remove('mining-active');
      }
      completeMining(element, overlay);
    }
  }, updateInterval);
}

// Complete mining
async function completeMining(element, overlay) {
  clearInterval(miningInterval);
  miningInterval = null;
  
  // Check if this is an image overlay container
  const isImageWrapper = element.dataset.isImageWrapper === 'true';
  let actualElement = element;
  
  if (isImageWrapper) {
    // Get the actual image that was being mined
    const img = element.dataset.originalImage;
    if (img) {
      actualElement = document.querySelector(`[data-mining-overlay="true"]`);
      if (actualElement) {
        delete actualElement.dataset.miningOverlay;
      }
    }
  }
  
  // Check if it's an ad for double XP
  const isAd = isAdElement(actualElement || element);
  
  // Calculate base XP from position on page
  let xpGain = calculatePositionXP(element);
  
  // Double XP for ads (or 3x with Silk Touch enchantment)
  if (isAd) {
    const adMultiplier = (playerData.toolEnchantment === 'silk_touch') ? 
      ENCHANTMENTS.silk_touch.adXpMultiplier : 2;
    xpGain *= adMultiplier;
  }
  
  // Apply Fortune enchantment
  if (playerData.toolEnchantment === 'fortune') {
    xpGain *= ENCHANTMENTS.fortune.xpMultiplier;
  }
  
  // Apply pet XP bonuses with usage tracking
  if (playerData.pets && playerData.pets.allay && playerData.pets.allay.collected) {
    if (!playerData.pets.allay.uses) playerData.pets.allay.uses = 0;
    if (playerData.pets.allay.uses < PETS.allay.usageLimit) {
      xpGain += PETS.allay.xpBonus;
      playerData.pets.allay.uses++;
      if (playerData.pets.allay.uses >= PETS.allay.usageLimit) {
        playerData.pets.allay.collected = false;
        showNotification('🔵 Your Allay flew away after helping 100 times!', 3000);
      }
    }
  }
  if (playerData.pets && playerData.pets.axolotl && playerData.pets.axolotl.collected) {
    if (!playerData.pets.axolotl.uses) playerData.pets.axolotl.uses = 0;
    if (playerData.pets.axolotl.uses < PETS.axolotl.usageLimit) {
      xpGain += PETS.axolotl.xpBonus;
      playerData.pets.axolotl.uses++;
      if (playerData.pets.axolotl.uses >= PETS.axolotl.usageLimit) {
        playerData.pets.axolotl.collected = false;
        showNotification('💙 Your Axolotl swam away after helping 100 times!', 3000);
      }
    }
  }
  
  // Update player data
  playerData.totalMined++;
  
  // Apply XP boost if active
  if (playerData.xpBoost && Date.now() < playerData.xpBoost.endTime) {
    xpGain = Math.floor(xpGain * playerData.xpBoost.multiplier);
  }
  
  playerData.xp += xpGain;
  
  // Consume enchantment durability if active
  if (playerData.activeEnchantmentIndex !== null && playerData.activeEnchantmentIndex !== undefined) {
    const enchantData = playerData.enchantmentInventory[playerData.activeEnchantmentIndex];
    if (enchantData && enchantData.durability > 0) {
      enchantData.durability--;
      if (enchantData.durability <= 0) {
        // Enchantment broken
        const enchant = ENCHANTMENTS[enchantData.type];
        showNotification(`💔 ${enchant.name} enchantment broke!`, 3000);
        playerData.enchantmentInventory.splice(playerData.activeEnchantmentIndex, 1);
        playerData.activeEnchantmentIndex = null;
        playerData.toolEnchantment = null;
      }
    }
  }
  
  checkToolUpgrade();
  await savePlayerData();
  
  // Update daily challenge progress
  updateDailyChallengeProgress('mine_blocks', 1);
  if (isAd) {
    updateDailyChallengeProgress('mine_ads', 1);
  }
  // Track image mining
  if (element.tagName === 'IMG') {
    updateDailyChallengeProgress('mine_images', 1);
  }
  // Track XP gain
  updateDailyChallengeProgress('xp_gain', xpGain);
  // Check if in warden zone using dynamic calculation
  if (isInDeepZone(element)) {
    updateDailyChallengeProgress('deep_mining', 1);
    // Track deep mining for achievement
    if (!playerData.deepMiningCount) playerData.deepMiningCount = 0;
    playerData.deepMiningCount++;
  }
  
  // Check achievements after mining
  await checkAchievements();
  
  // Show XP gain (use the visual element position)
  showXPGain(actualElement || element, xpGain);
  
  // Create mining particles
  createMiningParticles(actualElement || element);
  
  // Detect and collect resources
  await detectAndCollectResource(actualElement || element);
  
  // Remove overlay
  if (overlay) {
    overlay.remove();
  }
  
  // Remove the overlay container if it's an image
  if (isImageWrapper && element.parentNode) {
    element.remove();
  }
  
  // Restore original overflow for non-images
  if (!isImageWrapper && element.dataset.originalOverflow !== undefined) {
    element.style.overflow = element.dataset.originalOverflow;
    delete element.dataset.originalOverflow;
  }
  
  // Store and hide the element
  if (actualElement) {
    minedElements.add(actualElement);
    if (!actualElement.dataset.originalDisplay) {
      const currentDisplay = window.getComputedStyle(actualElement).display;
      actualElement.dataset.originalDisplay = actualElement.style.display || currentDisplay;
    }
    actualElement.style.display = 'none';
    
    // Try to spawn easter egg (pet or creeper, not both)
    trySpawnEasterEgg(actualElement);
  }
  
  currentlyMining = null;
  
  // Show cursor again if mining is still active
  if (miningEnabled) {
    showToolCursor();
  }
}

// Try to spawn easter egg (pet or creeper)
async function trySpawnEasterEgg(minedElement) {
  // Ensure pets object exists
  if (!playerData.pets) {
    playerData.pets = {};
  }
  
  // Check debug mode first
  if (debugMode.forcePet) {
    const petKey = debugMode.forcePet;
    debugMode.forcePet = null; // Reset after use
    spawnPet(minedElement, petKey);
    return;
  }
  
  if (debugMode.forceCreeper) {
    debugMode.forceCreeper = false; // Reset after use
    // Check if Dennis defuses creepers
    if (playerData.pets.dennis && playerData.pets.dennis.collected) {
      defuseCreeperWithDennis(minedElement);
    } else {
      spawnCreeper(minedElement);
    }
    return;
  }
  
  if (debugMode.forceChest) {
    debugMode.forceChest = false;
    spawnChest(minedElement);
    return;
  }
  
  if (debugMode.forceWarden) {
    debugMode.forceWarden = false;
    spawnWarden(minedElement);
    return;
  }
  
  if (debugMode.forceZombie) {
    debugMode.forceZombie = false;
    spawnZombie(minedElement);
    return;
  }
  
  if (debugMode.forceVillager) {
    debugMode.forceVillager = false;
    spawnVillager(minedElement);
    return;
  }
  
  if (debugMode.forceEnchantment) {
    const enchantKey = typeof debugMode.forceEnchantment === 'string' 
      ? debugMode.forceEnchantment 
      : Object.keys(ENCHANTMENTS)[Math.floor(Math.random() * Object.keys(ENCHANTMENTS).length)];
    debugMode.forceEnchantment = false;
    pageSpawnedItems.enchantment = true; // Prevent natural spawn
    spawnEnchantmentBook(minedElement, enchantKey);
    return;
  }
  
  // Check for warden warning progression in deep zone (dynamic bottom 20%)
  const isDeepZone = isInDeepZone(minedElement);
  
  if (isDeepZone) {
    // Check if safe zone is active (reduces chance by 50%)
    const wardenChanceReduction = (playerData.safeZone?.remainingMines > 0) ? 0.5 : 1.0;
    
    // First time mining in deep zone on this page - 50% chance to trigger warning sequence (or 25% with safe zone)
    if (!wardenWarningState.triggered && Math.random() < (0.50 * wardenChanceReduction)) {
      wardenWarningState.triggered = true;
      wardenWarningState.stage = 1;
      showWardenWarning('Warden approaches...');
      return; // Don't spawn anything else
    }
    // Warning sequence already triggered - advance through stages
    else if (wardenWarningState.triggered && wardenWarningState.stage < 4) {
      wardenWarningState.stage++;
      
      if (wardenWarningState.stage === 2) {
        showWardenWarning('Warden advances...');
        return;
      } else if (wardenWarningState.stage === 3) {
        showWardenWarning('Warden draws close...');
        return;
      } else if (wardenWarningState.stage === 4) {
        showWardenWarning('Warden emerges...');
        // Actually spawn the Warden after a delay
        setTimeout(() => {
          spawnWarden(minedElement);
        }, 2000);
        return;
      }
    }
  }
  
  // Try to spawn enchantment book - only if none spawned on this page
  if (!pageSpawnedItems.enchantment) {
    // Check for Haste enchantment first (tool-tier-based spawn rate)
    const earlyGameTools = ['hand', 'wooden_axe', 'copper_axe'];
    const isEarlyGame = earlyGameTools.includes(playerData.currentTool);
    const hasteSpawnRate = isEarlyGame ? 0.33 : 0.10; // 33% for early, 10% for iron+
    
    if (Math.random() < hasteSpawnRate) {
      pageSpawnedItems.enchantment = true;
      spawnEnchantmentBook(minedElement, 'haste');
      return; // Haste spawned, nothing else can spawn
    }
    
    // Check for other enchantments (original cumulative spawn logic)
    const enchantKeys = Object.keys(ENCHANTMENTS).filter(key => key !== 'haste'); // Exclude haste
    const enchantRandom = Math.random();
    let cumulativeEnchantRate = 0;
    
    for (const enchantKey of enchantKeys) {
      const enchant = ENCHANTMENTS[enchantKey];
      cumulativeEnchantRate += enchant.spawnRate;
      if (enchantRandom < cumulativeEnchantRate) {
        pageSpawnedItems.enchantment = true;
        spawnEnchantmentBook(minedElement, enchantKey);
        return; // Enchantment spawned, nothing else can spawn
      }
    }
  }
  
  // Try to spawn chest (0.5-1.5% chance OR guaranteed from challenge) - only if none spawned on this page
  if (!pageSpawnedItems.chest) {
    const chestSpawnRate = 0.005 + (Math.random() * 0.01); // 0.5% to 1.5%
    const guaranteedChest = playerData.guaranteedChestSpawn;
    
    if (playerData.diamonds < 15 && (guaranteedChest || Math.random() < chestSpawnRate)) {
      if (guaranteedChest) {
        playerData.guaranteedChestSpawn = false;
        await savePlayerData();
      }
      pageSpawnedItems.chest = true;
      spawnChest(minedElement);
      return; // Chest spawned, nothing else can spawn
    }
  }
  
  // Normal spawn logic
  // Try mob spawn first (15% chance for either creeper or zombie, reduced by safe zone)
  const mobSpawnChance = (playerData.safeZone?.remainingMines > 0) ? 0.075 : 0.15;
  if (Math.random() < mobSpawnChance) {
    const mobType = Math.random() < 0.65 ? 'creeper' : 'zombie'; // 65% creeper, 35% zombie
    
    if (mobType === 'zombie') {
      spawnZombie(minedElement);
      return;
    } else {
      // Check if Dennis or Cat defuses creepers
      const hasDennis = playerData.pets.dennis && playerData.pets.dennis.collected;
      const hasCat = playerData.pets.cat && playerData.pets.cat.collected;
      
      if (hasDennis || hasCat) {
        defuseCreeperWithDennis(minedElement);
      } else {
        spawnCreeper(minedElement);
      }
      return;
    }
  }
  
  // Try villager spawn (5% chance) - only if none spawned on this page
  if (!pageSpawnedItems.villager && Math.random() < 0.05) {
    pageSpawnedItems.villager = true;
    spawnVillager(minedElement);
    return;
  }
  
  // Check for pet spawns (they take priority and are rarer) - only if none spawned on this page
  if (!pageSpawnedItems.pet) {
    const petKeys = Object.keys(PETS);
    const random = Math.random();
    let cumulativeRate = 0;
    
    // Looting enchantment doubles pet spawn rates
    const petSpawnMultiplier = (playerData.toolEnchantment === 'looting') ? 
      ENCHANTMENTS.looting.petSpawnMultiplier : 1;
    
    for (const petKey of petKeys) {
      const pet = PETS[petKey];
      const petData = playerData.pets[petKey] || { count: 0, collected: false };
      
      // Check if this pet can still spawn
      if (petData.count < pet.maxSpawns) {
        cumulativeRate += (pet.spawnRate * petSpawnMultiplier);
        if (random < cumulativeRate) {
          pageSpawnedItems.pet = true;
          spawnPet(minedElement, petKey);
          return; // Pet spawned, don't spawn creeper
        }
      }
    }
  }
}

// Spawn a zombie
function spawnZombie(minedElement) {
  // Show the mined element temporarily
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  // Get element position including scroll offset for absolute positioning
  const rect = minedElement.getBoundingClientRect();
  
  // Create zombie container with absolute positioning (stays with element on scroll)
  const zombieContainer = document.createElement('div');
  zombieContainer.className = 'mine-zombie-container';
  zombieContainer.style.cssText = `
    position: absolute !important;
    top: ${rect.top + window.scrollY}px !important;
    left: ${rect.left + window.scrollX}px !important;
    width: ${rect.width}px !important;
    height: ${rect.height}px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0, 100, 0, 0.8) !important;
    z-index: 2147483647 !important;
    pointer-events: all !important;
    animation: mine-zombie-appear 0.5s ease-out !important;
  `;
  
  // Load zombie image
  createImageWithFallback('assets/mobs', 'zombie', (zombieImgSrc) => {
    const imgHTML = zombieImgSrc ? `<img src="${zombieImgSrc}" style="width: auto !important; height: 120px !important; image-rendering: pixelated !important;">` : '';
    
    zombieContainer.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
        ${imgHTML}
      </div>
      <div style="color: white !important; font-family: 'Minecraft', monospace !important; font-size: 14px !important; text-align: center !important; padding: 8px !important; background: rgba(0, 0, 0, 0.9) !important; border-radius: 5px !important; margin: 10px !important; width: calc(100% - 20px) !important;">
        💀 ZOMBIE! 💀<br>
        <span style="font-size: 12px;">-100 XP • Click to defend and recover 50 XP!</span>
      </div>
    `;
  });
  
  // Append to body instead of element
  document.body.appendChild(zombieContainer);
  
  // Apply zombie effect: steal 100 XP and slow mining
  playerData.xp = Math.max(0, playerData.xp - 100);
  
  // Enforce XP floor - XP can't drop below totalMined
  enforceXPFloor();
  
  // Apply mining slowdown
  if (!playerData.zombieSlowdown) {
    playerData.zombieSlowdown = { endTime: Date.now() + 60000 }; // 1 minute
    showNotification('🐌 Zombie doubled your mining time for 1 minute!', 3000);
  }
  
  // Track if zombie was clicked
  let zombieClicked = false;
  
  // Add click handler for defense
  zombieContainer.style.cursor = 'crosshair';
  zombieContainer.addEventListener('click', async (e) => {
    if (zombieClicked) return;
    zombieClicked = true;
    
    e.stopPropagation();
    
    // Recover 50 XP
    playerData.xp += 50;
    enforceXPFloor(); // Ensure XP doesn't go below floor
    await checkToolUpgrade(); // Check if recovered XP allows tool upgrade
    await savePlayerData();
    
    // Visual feedback
    zombieContainer.style.background = 'rgba(100, 0, 0, 0.8) !important';
    showNotification('⚔️ Defended against zombie! Recovered 50 XP!', 3000);
    
    // Remove immediately
    setTimeout(() => {
      zombieContainer.remove();
      minedElement.style.display = 'none';
    }, 500);
  });
  
  savePlayerData();
  
  // Remove zombie and hide element after delay (if not clicked)
  setTimeout(() => {
    if (!zombieClicked) {
      showNotification('💀 Zombie escaped with your XP!', 2000);
    }
    zombieContainer.remove();
    minedElement.style.display = 'none';
  }, 4000);
}

// Spawn a villager with trades
function spawnVillager(minedElement) {
  // Generate 3-5 random trades for this villager
  const tradeKeys = Object.keys(VILLAGER_TRADES);
  const numTrades = 3 + Math.floor(Math.random() * 3); // 3-5 trades
  const villagerTrades = [];
  const usedTrades = new Set();
  
  while (villagerTrades.length < numTrades && usedTrades.size < tradeKeys.length) {
    const randomTrade = tradeKeys[Math.floor(Math.random() * tradeKeys.length)];
    if (!usedTrades.has(randomTrade)) {
      usedTrades.add(randomTrade);
      villagerTrades.push({ key: randomTrade, ...VILLAGER_TRADES[randomTrade] });
    }
  }
  
  // Create villager container as fixed centered modal
  const villagerContainer = document.createElement('div');
  villagerContainer.className = 'mine-villager-container';
  // Store trades array on the container so buttons can access it
  villagerContainer.villagerTrades = villagerTrades;
  
  // Register this overlay - will dismiss lower priority overlays
  if (!registerOverlay(villagerContainer, 'villager')) {
    debugLog('Mine Anything: Villager spawn blocked by higher priority overlay');
    return; // Don't spawn if blocked
  }
  
  villagerContainer.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: auto !important;
    max-width: 550px !important;
    max-height: 80vh !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    background: #8B6F47 !important;
    z-index: 2147483648 !important;
    pointer-events: all !important;
    animation: mine-villager-appear 0.5s ease-out !important;
    overflow-y: auto !important;
    padding: 20px !important;
    border-top: 4px solid #A0826D !important;
    border-left: 4px solid #A0826D !important;
    border-right: 4px solid #5C4033 !important;
    border-bottom: 4px solid #5C4033 !important;
    box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.3), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 8px 30px rgba(0, 0, 0, 0.8) !important;
  `;
  
  // Load villager image
  createImageWithFallback('assets/mobs', 'villager', (villagerImgSrc) => {
    // Create villager image with speech bubble
    const villagerSection = `
      <div style="position: relative; display: inline-block; margin-bottom: 12px;">
        ${villagerImgSrc ? `<img src="${villagerImgSrc}" style="width: auto !important; height: 120px !important; image-rendering: pixelated !important; display: block;">` : ''}
        <div class="mine-villager-speech-bubble" style="position: absolute; top: 20px; left: -80px; background: #000000; color: #ffffff; padding: 6px 10px; border-radius: 8px; font-family: 'Minecraft', monospace; font-size: 11px; white-space: nowrap; text-shadow: none;">
          Hmmm.
          <div style="position: absolute; top: 50%; right: -8px; transform: translateY(-50%); width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 8px solid #000000;"></div>
        </div>
      </div>
    `;
    
    let tradesHTML = '';
    villagerTrades.forEach((trade, index) => {
      const canAfford = canAffordTrade(trade);
      const buttonClass = canAfford ? 'mine-villager-trade-btn' : 'mine-villager-trade-btn-disabled';
      
      // Build icon-based trade display
      let giveIconHTML = '';
      let receiveIconHTML = '';
      
      // Give side
      if (trade.give.resource) {
        const resource = RESOURCES[trade.give.resource];
        if (resource) {
          const iconUrl = chrome.runtime.getURL(`assets/resources/${resource.file}.png`);
          giveIconHTML = `
            <div class="mine-trade-icon-slot" title="${resource.name}">
              <img src="${iconUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;">
              <div class="mine-trade-icon-count">${trade.give.amount}</div>
            </div>
          `;
        }
      }
      
      // Receive side
      if (trade.receive.resource) {
        const resource = RESOURCES[trade.receive.resource];
        if (resource) {
          const iconUrl = chrome.runtime.getURL(`assets/resources/${resource.file}.png`);
          receiveIconHTML = `
            <div class="mine-trade-icon-slot" title="${resource.name}">
              <img src="${iconUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;">
              <div class="mine-trade-icon-count">${trade.receive.amount}</div>
            </div>
          `;
        }
      } else if (trade.receive.enchantment) {
        const enchant = ENCHANTMENTS[trade.receive.enchantment];
        if (enchant) {
          const bookUrl = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
          receiveIconHTML = `
            <div class="mine-trade-icon-slot" title="${enchant.name} Enchantment">
              <img src="${bookUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;">
            </div>
          `;
        }
      } else if (trade.receive.xp) {
        const xpOrbUrl = chrome.runtime.getURL('assets/other/xp-orb.png');
        receiveIconHTML = `
          <div class="mine-trade-icon-slot" title="Experience Points" style="position: relative;">
            <img src="${xpOrbUrl}" style="width: 32px; height: 32px; image-rendering: pixelated;">
            <div style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); font-family: 'Minecraft', monospace; font-size: 11px; color: #7CFC00; font-weight: bold; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; white-space: nowrap;">+${trade.receive.xp}</div>
          </div>
        `;
      }
      
      tradesHTML += `
        <div class="mine-villager-trade" data-trade-index="${index}" title="${trade.label}">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${giveIconHTML}
            <span style="color: #ffffff; font-size: 18px;">→</span>
            ${receiveIconHTML}
          </div>
          <button class="${buttonClass}" data-trade-index="${index}" ${!canAfford ? 'disabled' : ''} style="min-width: 70px; padding: 6px 12px; font-size: 14px; font-weight: bold; font-family: 'Minecraft', monospace; background: ${canAfford ? '#4CAF50' : '#555'}; color: white; border: none; border-top: 2px solid ${canAfford ? '#66BB6A' : '#777'}; border-left: 2px solid ${canAfford ? '#66BB6A' : '#777'}; border-right: 2px solid ${canAfford ? '#2E7D32' : '#333'}; border-bottom: 2px solid ${canAfford ? '#2E7D32' : '#333'}; cursor: ${canAfford ? 'pointer' : 'not-allowed'}; text-shadow: 1px 1px 0 rgba(0,0,0,0.5);">
            ${canAfford ? 'TRADE' : 'TRADE'}
          </button>
        </div>
      `;
    });
    
    const emeraldIconUrl = chrome.runtime.getURL('assets/resources/emerald.png');
    
    villagerContainer.innerHTML = `
      ${villagerSection}
      <div style="color: #2a2a2a !important; font-family: 'Minecraft', monospace !important; font-size: 16px !important; text-align: center !important; margin-bottom: 12px !important; font-weight: bold !important; text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.5) !important; display: flex; align-items: center; gap: 6px; justify-content: center;">
        <img src="${emeraldIconUrl}" style="width: 20px; height: 20px; image-rendering: pixelated;"> TRADES <img src="${emeraldIconUrl}" style="width: 20px; height: 20px; image-rendering: pixelated;">
      </div>
      <div class="mine-villager-trades-container" style="width: 100%; max-width: 400px;">
        ${tradesHTML}
      </div>
      <button class="mine-villager-close" style="margin-top: 12px !important; background: #ff4444 !important; color: white !important; border-top: 2px solid #ff6666 !important; border-left: 2px solid #ff6666 !important; border-right: 2px solid #cc0000 !important; border-bottom: 2px solid #cc0000 !important; padding: 8px 16px !important; font-family: 'Minecraft', monospace !important; font-size: 14px !important; cursor: pointer !important; font-weight: bold !important;">X Close</button>
    `;
    
    // Add trade button listeners
    villagerContainer.querySelectorAll('.mine-villager-trade-btn:not(.mine-villager-trade-btn-disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tradeIndex = parseInt(btn.dataset.tradeIndex);
        const trades = villagerContainer.villagerTrades;
        if (trades && trades[tradeIndex]) {
          executeTrade(trades[tradeIndex], villagerContainer, minedElement);
        }
      });
    });
    
    // Add close button listener
    villagerContainer.querySelector('.mine-villager-close').addEventListener('click', () => {
      villagerContainer.remove();
    });
  });
  
  document.body.appendChild(villagerContainer);
}

// Check if player can afford a trade
function canAffordTrade(trade) {
  if (trade.give.resource) {
    const currentAmount = playerData.inventory[trade.give.resource] || 0;
    return currentAmount >= trade.give.amount;
  }
  return false;
}

// Execute a villager trade
async function executeTrade(trade, villagerContainer, minedElement) {
  debugLog('🔄 Executing trade:', trade);
  
  // Deduct resources
  if (trade.give.resource) {
    playerData.inventory[trade.give.resource] -= trade.give.amount;
  }
  
  // Give rewards
  if (trade.receive.resource) {
    if (!playerData.inventory[trade.receive.resource]) {
      playerData.inventory[trade.receive.resource] = 0;
    }
    playerData.inventory[trade.receive.resource] += trade.receive.amount;
    
    // Create a dummy element for notification positioning (center screen)
    const dummyElement = document.createElement('div');
    dummyElement.style.cssText = 'position: fixed; top: 40%; left: 50%; width: 1px; height: 1px;';
    document.body.appendChild(dummyElement);
    
    const resource = RESOURCES[trade.receive.resource];
    showResourceNotification(dummyElement, resource, trade.receive.amount);
    
    setTimeout(() => dummyElement.remove(), 3000);
  }
  
  if (trade.receive.xp) {
    playerData.xp += trade.receive.xp;
    showNotification(`+${trade.receive.xp} XP from trade!`, 2000);
  }
  
  if (trade.receive.enchantment) {
    if (!playerData.enchantmentInventory) playerData.enchantmentInventory = [];
    const enchant = ENCHANTMENTS[trade.receive.enchantment];
    playerData.enchantmentInventory.push({
      type: trade.receive.enchantment,
      durability: enchant.durability,
      maxDurability: enchant.durability
    });
    const enchantName = enchant.name;
    showNotification(`✨ Received ${enchantName} enchantment!`, 3000);
  }
  
  await savePlayerData();
  
  // Close villager and show success message
  showNotification('✓ Trade completed!', 2000);
  villagerContainer.remove();
  
  // Update inventory UI if open
  if (inventoryVisible) {
    updateInventoryUI();
  }
}

// Spawn a pet
function spawnPet(minedElement, petKey) {
  const pet = PETS[petKey];
  
  // Show the mined element temporarily
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  // Make sure element has relative positioning
  const computedPosition = window.getComputedStyle(minedElement).position;
  if (computedPosition === 'static') {
    minedElement.style.position = 'relative';
  }
  
  // Get element position for fixed positioning
  const rect = minedElement.getBoundingClientRect();
  
  // Create pet container
  const petContainer = document.createElement('div');
  petContainer.className = 'mine-pet-container';
  
  // Register this overlay - will dismiss lower priority overlays
  if (!registerOverlay(petContainer, 'pet')) {
    debugLog('Mine Anything: Pet spawn blocked by higher priority overlay');
    return; // Don't spawn if blocked
  }
  
  petContainer.style.cssText = `
    position: fixed !important;
    top: ${rect.top}px !important;
    left: ${rect.left}px !important;
    width: ${rect.width}px !important;
    height: ${rect.height}px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0, 200, 100, 0.8) !important;
    z-index: 2147483647 !important;
    pointer-events: all !important;
  `;
  
  // Create pet image
  const petImg = document.createElement('img');
  petImg.src = chrome.runtime.getURL('assets/Pets/' + pet.file);
  petImg.style.cssText = `
    width: auto !important;
    height: 150px !important;
    image-rendering: pixelated !important;
  `;
  
  // Create pet info text
  const petInfo = document.createElement('div');
  petInfo.style.cssText = `
    color: white !important;
    font-family: 'Minecraft', monospace !important;
    text-align: center !important;
    padding: 10px !important;
    background: rgba(0, 0, 0, 0.9) !important;
    border-radius: 5px !important;
    margin: 10px !important;
    width: calc(100% - 20px) !important;
  `;
  petInfo.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 5px; color: #FFD700;">${pet.name} found!</div>
    <div style="font-size: 12px;">${pet.ability}</div>
    <div style="font-size: 11px; margin-top: 5px; color: #88FF88;">Collecting...</div>
  `;
  
  // Add image wrapper for proper centering
  const imageWrapper = document.createElement('div');
  imageWrapper.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center;';
  imageWrapper.appendChild(petImg);
  
  petContainer.appendChild(imageWrapper);
  petContainer.appendChild(petInfo);
  document.body.appendChild(petContainer);
  
  // Auto-collect pet after brief display (no click required - fixes complex sites like YouTube)
  setTimeout(() => {
    collectPet(petKey, minedElement, petContainer);
  }, 1500);
}

// Collect a pet
async function collectPet(petKey, minedElement, petContainer) {
  // Update pet data
  if (!playerData.pets[petKey]) {
    playerData.pets[petKey] = { count: 0, collected: false };
  }
  playerData.pets[petKey].count++;
  playerData.pets[petKey].collected = true;
  
  await savePlayerData();
  
  // Check achievements after collecting pet
  await checkAchievements();
  
  // Remove pet container and hide element
  petContainer.remove();
  minedElement.style.display = 'none';
  
  // Show notification
  showPetCollectedNotification(petKey);
}

// Show pet collected notification
function showPetCollectedNotification(petKey) {
  const pet = PETS[petKey];
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: rgba(0, 200, 100, 0.95) !important;
    color: white !important;
    padding: 20px 40px !important;
    border-radius: 10px !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 24px !important;
    z-index: 2147483648 !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
    text-align: center !important;
  `;
  notification.innerHTML = `
    ${pet.name} collected!<br>
    <span style="font-size: 16px;">${pet.ability}</span>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// General notification function for showing messages
function showNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  
  // Calculate vertical position based on existing notifications
  const baseTop = 20;
  const spacing = 80; // Space between notifications
  const notificationTop = baseTop + (activeNotifications.length * spacing);
  
  notification.style.cssText = `
    position: fixed !important;
    top: ${notificationTop}px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(0, 0, 0, 0.9) !important;
    color: #ffffff !important;
    padding: 15px 30px !important;
    border: 3px solid #ff0000 !important;
    border-radius: 10px !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 16px !important;
    z-index: 2147483648 !important;
    box-shadow: 0 4px 20px rgba(255, 0, 0, 0.5) !important;
    text-align: center !important;
    line-height: 1.4 !important;
    transition: top 0.3s ease, opacity 0.5s !important;
    max-width: 400px !important;
    min-width: 200px !important;
  `;
  notification.innerHTML = message;
  
  document.body.appendChild(notification);
  
  // Track this notification
  activeNotifications.push(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
      
      // Remove from active notifications
      const index = activeNotifications.indexOf(notification);
      if (index > -1) {
        activeNotifications.splice(index, 1);
        
        // Reposition remaining notifications
        activeNotifications.forEach((notif, i) => {
          notif.style.top = `${baseTop + (i * spacing)}px`;
        });
      }
    }, 500);
  }, duration);
}

// Achievement notification (special styling)
function showAchievementNotification(achievement) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed !important;
    top: 25% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) scale(0.5) !important;
    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%) !important;
    color: #000000 !important;
    padding: 25px 45px !important;
    border: 4px solid #FFD700 !important;
    border-radius: 12px !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 22px !important;
    z-index: 2147483649 !important;
    box-shadow: 0 8px 30px rgba(255, 215, 0, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.3) !important;
    text-align: center !important;
    line-height: 1.8 !important;
    opacity: 0 !important;
    transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
    font-weight: bold !important;
    text-shadow: 2px 2px 0px rgba(255, 255, 255, 0.5) !important;
  `;
  
  const iconUrl = chrome.runtime.getURL(`assets/achievements/${achievement.icon}`);
  notification.innerHTML = `
    <div style="margin-bottom: 10px;"><img src="${iconUrl}" style="width: 64px; height: 64px; image-rendering: pixelated;"></div>
    <div style="font-size: 24px; margin-bottom: 5px;">Achievement Unlocked!</div>
    <div style="font-size: 20px; color: #333;">${achievement.name}</div>
    <div style="font-size: 14px; color: #555; margin-top: 5px;">${achievement.description}</div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Animate out
  setTimeout(() => {
    notification.style.transform = 'translate(-50%, -50%) scale(0.8)';
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 400);
  }, 4000);
}

// Check and unlock achievements
async function checkAchievements() {
  if (!playerData.achievements) {
    playerData.achievements = {};
  }
  
  for (const [achievementId, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Skip if already unlocked
    if (playerData.achievements[achievementId]) continue;
    
    let unlocked = false;
    const req = achievement.requirement;
    
    switch (req.type) {
      case 'totalMined':
        unlocked = playerData.totalMined >= req.value;
        break;
      case 'tool':
        unlocked = playerData.currentTool === req.value;
        break;
      case 'pets':
        const collectedPets = Object.values(playerData.pets || {}).filter(p => p.collected).length;
        unlocked = collectedPets >= req.value;
        break;
      case 'diamonds':
        unlocked = (playerData.diamonds || 0) >= req.value;
        break;
      case 'hasDiamondSword':
        unlocked = (playerData.diamond_sword || 0) > 0;
        break;
      case 'hasEnchantment':
        unlocked = playerData.toolEnchantment !== null && playerData.toolEnchantment !== undefined;
        break;
      case 'deepMining':
        unlocked = (playerData.deepMiningCount || 0) >= req.value;
        break;
      case 'xp':
        unlocked = playerData.xp >= req.value;
        break;
      case 'challengesCompleted':
        unlocked = (playerData.challengesCompleted || 0) >= req.value;
        break;
    }
    
    if (unlocked) {
      playerData.achievements[achievementId] = true;
      await savePlayerData();
      showAchievementNotification(achievement);
    }
  }
}

// Dennis defuses creeper
async function defuseCreeperWithDennis(minedElement) {
  // Check if cat is defusing and increment usage counter
  const hasCat = playerData.pets.cat && playerData.pets.cat.collected;
  if (hasCat) {
    if (!playerData.pets.cat.uses) playerData.pets.cat.uses = 0;
    playerData.pets.cat.uses++;
    
    // Check if cat has reached its limit
    if (playerData.pets.cat.uses >= PETS.cat.usageLimit) {
      playerData.pets.cat.collected = false;
      await savePlayerData();
      showNotification(`🐱 Your cat ran away after defusing ${PETS.cat.usageLimit} creepers!`, 3000);
    } else {
      await savePlayerData();
    }
  }
  
  // Check if dennis is defusing and increment usage counter
  const hasDennis = playerData.pets.dennis && playerData.pets.dennis.collected;
  if (hasDennis) {
    if (!playerData.pets.dennis.uses) playerData.pets.dennis.uses = 0;
    playerData.pets.dennis.uses++;
    
    // Check if dennis has reached its limit
    if (playerData.pets.dennis.uses >= PETS.dennis.usageLimit) {
      playerData.pets.dennis.collected = false;
      await savePlayerData();
      showNotification(`🦖 Dennis left after defusing ${PETS.dennis.usageLimit} creepers!`, 3000);
    } else {
      await savePlayerData();
    }
  }
  
  // Show the mined element temporarily
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  const computedPosition = window.getComputedStyle(minedElement).position;
  if (computedPosition === 'static') {
    minedElement.style.position = 'relative';
  }
  
  // Create creeper that fades out
  const creeperContainer = document.createElement('div');
  creeperContainer.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    animation: mine-creeper-defuse 2s forwards !important;
  `;
  
  const creeperImg = document.createElement('img');
  creeperImg.src = chrome.runtime.getURL('assets/explosion/creeper.gif');
  creeperImg.style.cssText = `
    width: 300px !important;
    height: 300px !important;
    image-rendering: pixelated !important;
  `;
  
  creeperContainer.appendChild(creeperImg);
  minedElement.appendChild(creeperContainer);
  
  // Fade out and give XP
  setTimeout(() => {
    creeperContainer.remove();
    minedElement.style.display = 'none';
    
    // Give 1 XP for defusing
    playerData.xp += 1;
    savePlayerData();
    
    const rect = minedElement.getBoundingClientRect();
    showXPGainWithRect(rect, 1);
  }, 2000);
}

// Warden system - spawns on footer elements
function isFooterElement(element) {
  // Check if element is a footer tag
  if (element.tagName === 'FOOTER') return true;
  
  // Check if element has footer-related classes or IDs (only 'footer', not 'bottom')
  const classId = (element.className + ' ' + element.id).toLowerCase();
  if (classId.includes('footer')) return true;
  
  // Check if it's a nav element at the bottom of the page
  if (element.tagName === 'NAV') {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // Check if element is in bottom 20% of page
    const elementTop = rect.top + window.scrollY;
    const bottomThreshold = documentHeight * 0.8;
    
    if (elementTop >= bottomThreshold) return true;
  }
  
  // Check if element contains many links and is at bottom
  const links = element.querySelectorAll('a');
  if (links.length >= 5) {
    const rect = element.getBoundingClientRect();
    const documentHeight = document.documentElement.scrollHeight;
    const elementTop = rect.top + window.scrollY;
    const bottomThreshold = documentHeight * 0.8;
    
    if (elementTop >= bottomThreshold) return true;
  }
  
  return false;
}

// Show Warden warning message
function showWardenWarning(message) {
  const warning = document.createElement('div');
  warning.style.cssText = `
    position: fixed !important;
    bottom: 30px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(0, 0, 0, 0.95) !important;
    color: #ff0000 !important;
    padding: 15px 30px !important;
    border: 3px solid #8b0000 !important;
    border-radius: 8px !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 24px !important;
    z-index: 2147483648 !important;
    text-align: center !important;
    text-shadow: 0 0 10px #ff0000 !important;
    box-shadow: 0 0 30px rgba(139, 0, 0, 0.8) !important;
    animation: warden-warning-pulse 0.5s ease-in-out !important;
  `;
  warning.textContent = message;
  
  document.body.appendChild(warning);
  
  // Remove after 3 seconds with fade out
  setTimeout(() => {
    warning.style.transition = 'opacity 0.5s';
    warning.style.opacity = '0';
    setTimeout(() => {
      warning.remove();
    }, 500);
  }, 3000);
}

function spawnWarden(minedElement) {
  // Apply Warden penalty - steal something from player
  applyWardenPenalty();
  
  // Update daily challenge
  updateDailyChallengeProgress('survive_warden', 1);
  
  // Hide the mined element immediately
  if (minedElement) {
    minedElement.style.display = 'none';
  }
  
  // Overlay is created in applyWardenPenalty() with penalty message
}

// Warden steals something from the player
async function applyWardenPenalty() {
  let penaltyMessage = '';
  
  // Priority 1: Steal diamonds if player has any (steals up to 4 diamonds)
  if (playerData.inventory?.diamond > 0) {
    const diamondsToSteal = Math.min(4, playerData.inventory?.diamond || 0);
    if (!playerData.inventory) playerData.inventory = {};
    playerData.inventory.diamond = Math.max(0, (playerData.inventory.diamond || 0) - diamondsToSteal);
    const diamondIcon = chrome.runtime.getURL('assets/resources/diamond.png');
    penaltyMessage = `The Warden stole your:<br><br><img src="${diamondIcon}" style="width: 40px; height: 40px; image-rendering: pixelated; vertical-align: middle;"> ${diamondsToSteal} Diamond${diamondsToSteal > 1 ? 's' : ''}<br><br>(${playerData.inventory.diamond} remaining)`;
  }
  // Priority 2: Steal a random pet
  else if (playerData.pets) {
    const collectedPets = Object.keys(playerData.pets).filter(key => 
      playerData.pets[key] && playerData.pets[key].collected
    );
    
    if (collectedPets.length > 0) {
      const randomPet = collectedPets[Math.floor(Math.random() * collectedPets.length)];
      playerData.pets[randomPet].collected = false;
      playerData.pets[randomPet].count = Math.max(0, playerData.pets[randomPet].count - 1);
      const petIcon = chrome.runtime.getURL(`assets/Pets/${PETS[randomPet].file}`);
      penaltyMessage = `The Warden stole your:<br><br><img src="${petIcon}" style="width: 60px; height: 60px; image-rendering: pixelated; vertical-align: middle;"> ${PETS[randomPet].name}`;
    }
  }
  // Priority 3: Downgrade tool (store current for recovery)
  else if (playerData.currentTool !== 'hand') {
    // Unbreaking enchantment protects tool 3 times
    if (playerData.toolEnchantment === 'unbreaking' && playerData.unbreakingUses < ENCHANTMENTS.unbreaking.protectionUses) {
      playerData.unbreakingUses++;
      const usesRemaining = ENCHANTMENTS.unbreaking.protectionUses - playerData.unbreakingUses;
      const toolIcon = chrome.runtime.getURL(`assets/pickaxe-levels/${TOOLS_DISPLAY[playerData.currentTool]}`);
      penaltyMessage = `The Warden stole your:<br><br><img src="${toolIcon}" style="width: 50px; height: 50px; image-rendering: pixelated; vertical-align: middle;"> Unbreaking protected your ${TOOLS[playerData.currentTool].name}!<br><br>(${usesRemaining} protection${usesRemaining !== 1 ? 's' : ''} remaining)`;
    } else {
      // Warden steals enchantment only (tools are now permanent)
      if (playerData.toolEnchantment) {
        const enchantmentName = ENCHANTMENTS[playerData.toolEnchantment].name;
        const enchantIcon = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
        
        // Lose enchantment and reset uses when stolen
        playerData.toolEnchantment = null;
        playerData.unbreakingUses = 0;
        
        penaltyMessage = `The Warden stole your:<br><br><img src="${enchantIcon}" style="width: 40px; height: 40px; image-rendering: pixelated; vertical-align: middle;"> ${enchantmentName} Enchantment`;
      } else {
        penaltyMessage = 'The Warden emerges...<br><br>But your tools are safe!';
      }
    }
  }
  // Priority 3: Steal 500 XP if player has at least that much
  else if (playerData.xp >= 500) {
    playerData.xp -= 500;
    enforceXPFloor(); // Can't drop below totalMined
    const xpIcon = chrome.runtime.getURL('assets/other/xp-orb.png');
    penaltyMessage = `The Warden stole your:<br><br><img src="${xpIcon}" style="width: 40px; height: 40px; image-rendering: pixelated; vertical-align: middle;"> 500 XP`;
  }
  // Priority 4: Take 20% XP if less than 500 XP
  else if (playerData.xp > 0) {
    const xpLost = Math.floor(playerData.xp * 0.2);
    playerData.xp -= xpLost;
    enforceXPFloor(); // Can't drop below totalMined
    const xpIcon = chrome.runtime.getURL('assets/other/xp-orb.png');
    penaltyMessage = `The Warden stole your:<br><br><img src="${xpIcon}" style="width: 40px; height: 40px; image-rendering: pixelated; vertical-align: middle;"> ${xpLost} XP`;
  }
  else {
    penaltyMessage = 'The Warden emerges...<br><br>But you have nothing to lose!';
  }
  
  // After applying penalty, check if player can upgrade to better tool based on XP
  await checkToolUpgrade();
  
  await savePlayerData();
  
  // Show penalty notification (ensure message is not empty)
  if (penaltyMessage) {
    // Pass penalty message to warden overlay
    createWardenOverlay(penaltyMessage);
  } else {
    createWardenOverlay();
  }
}

// Create persistent warden overlay that requires diamond sword to defeat
function createWardenOverlay(penaltyMessage = null) {
  // Check if overlay already exists - prevent duplicates
  if (document.getElementById('mine-warden-overlay')) {
    debugLog('Warden overlay already exists, skipping creation');
    return;
  }
  
  // Create fullscreen black overlay
  const overlay = document.createElement('div');
  overlay.id = 'mine-warden-overlay';
  
  // Register warden overlay with highest priority - will dismiss ANY other overlay
  registerOverlay(overlay, 'warden');
  
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background: rgba(0, 0, 0, 0) !important;
    z-index: 2147483646 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    pointer-events: auto !important;
    transition: background 1s !important;
    gap: 20px !important;
  `;
  
  // Content container for all centered elements
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 20px !important;
    max-width: 90% !important;
    z-index: 2147483648 !important;
    margin-top: 10vh !important;
    padding-bottom: 50px !important;
  `;
  
  // Warning text
  const warningText = document.createElement('div');
  warningText.style.cssText = `
    color: #ff0000 !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 36px !important;
    text-align: center !important;
    text-shadow: 0 0 20px #ff0000 !important;
    opacity: 0 !important;
    transition: opacity 1s !important;
  `;
  warningText.textContent = 'THE WARDEN HAS EMERGED';
  
  // Penalty message (if provided) - horizontal compact design
  let penaltyDiv = null;
  if (penaltyMessage) {
    penaltyDiv = document.createElement('div');
    penaltyDiv.style.cssText = `
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 12px 20px !important;
      background: rgba(139, 0, 0, 0.4) !important;
      border: 2px solid #ff0000 !important;
      border-radius: 6px !important;
      opacity: 0 !important;
      transition: opacity 1s !important;
      max-width: 600px !important;
      font-family: 'Minecraft', monospace !important;
      font-size: 14px !important;
      color: #ffaa00 !important;
      text-shadow: 1px 1px 2px #000 !important;
    `;
    
    // Parse the penalty message to extract icon and text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = penaltyMessage;
    const img = tempDiv.querySelector('img');
    const textContent = tempDiv.textContent.replace('The Warden stole your:', '').trim();
    
    if (img) {
      penaltyDiv.innerHTML = `
        <span style="color: #ff6b6b; font-weight: bold; white-space: nowrap;">⚠️ Warden Stole:</span>
        <img src="${img.src}" style="width: 32px; height: 32px; image-rendering: pixelated; flex-shrink: 0;">
        <span style="flex: 1;">${textContent}</span>
      `;
    } else {
      penaltyDiv.textContent = penaltyMessage;
    }
  }
  
  // Instructions (hide if player already has diamond sword)
  const hasSword = playerData.diamond_sword && playerData.diamond_sword > 0;
  const instructions = document.createElement('div');
  instructions.style.cssText = `
    color: #ffffff !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 18px !important;
    text-align: center !important;
    opacity: 0 !important;
    transition: opacity 1s !important;
    display: ${hasSword ? 'none' : 'block'} !important;
  `;
  instructions.innerHTML = 'Find a <span style="color: #00ffff;">Diamond Sword</span> to defeat the Warden';
  
  // Escape button (always visible, even without diamond sword)
  const escapeButton = document.createElement('div');
  escapeButton.style.cssText = `
    padding: 12px 25px !important;
    background: rgba(139, 0, 0, 0.3) !important;
    border: 2px solid #8B0000 !important;
    color: #FF6B6B !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 16px !important;
    cursor: pointer !important;
    text-shadow: 1px 1px 0 #000 !important;
    transition: all 0.3s !important;
    opacity: 0 !important;
  `;
  escapeButton.textContent = 'Retreat to Surface';
  
  escapeButton.addEventListener('mouseenter', () => {
    escapeButton.style.background = 'rgba(139, 0, 0, 0.5) !important';
    escapeButton.style.transform = 'scale(1.05)';
  });
  
  escapeButton.addEventListener('mouseleave', () => {
    escapeButton.style.background = 'rgba(139, 0, 0, 0.3) !important';
    escapeButton.style.transform = 'scale(1)';
  });
  
  escapeButton.addEventListener('click', () => {
    window.location.reload();
  });
  
  // Warden GIF container (part of flex layout)
  const wardenContainer = document.createElement('div');
  wardenContainer.style.cssText = `
    width: 400px !important;
    height: 400px !important;
    flex-shrink: 0 !important;
    position: relative !important;
  `;
  
  // Create spawning warden gif
  const spawnWardenImg = document.createElement('img');
  spawnWardenImg.src = chrome.runtime.getURL('assets/world-items/warden-minecraft.gif');
  spawnWardenImg.style.cssText = `
    width: 100% !important;
    height: 100% !important;
    image-rendering: pixelated !important;
    opacity: 0 !important;
    transition: opacity 1s !important;
  `;
  
  wardenContainer.appendChild(spawnWardenImg);
  
  // Add all content to container in order
  contentContainer.appendChild(warningText);
  if (penaltyDiv) {
    contentContainer.appendChild(penaltyDiv);
  }
  contentContainer.appendChild(instructions);
  contentContainer.appendChild(escapeButton);
  // Add warden gif at the end of the flex container
  contentContainer.appendChild(wardenContainer);
  
  // Add content container to overlay
  overlay.appendChild(contentContainer);
  
  // Add overlay to body
  document.body.appendChild(overlay);
  
  // Fade in overlay and spawn animation
  setTimeout(() => {
    overlay.style.background = 'rgba(0, 0, 0, 0.9)';
    spawnWardenImg.style.opacity = '1';
    warningText.style.opacity = '1';
    if (penaltyDiv) {
      penaltyDiv.style.opacity = '1';
    }
    instructions.style.opacity = '1';
    escapeButton.style.opacity = '1';
  }, 10);
  
  // After 4 seconds, fade out spawn gif and fade in spawned gif
  setTimeout(() => {
    spawnWardenImg.style.transition = 'opacity 1s';
    spawnWardenImg.style.opacity = '0';
    
    setTimeout(() => {
      // Replace with spawned warden gif
      spawnWardenImg.src = chrome.runtime.getURL('assets/world-items/warden-spawned.gif');
      
      // Fade in spawned gif
      setTimeout(() => {
        spawnWardenImg.style.opacity = '1';
      }, 10);
    }, 1000);
  }, 4000);
  
  // Check if player has diamond sword - if so, show attack button
  if (hasSword) {
    const killButton = document.createElement('div');
    killButton.style.cssText = `
      padding: 15px 30px !important;
      background: rgba(0, 200, 255, 0.3) !important;
      border: 3px solid #00ffff !important;
      color: #00ffff !important;
      font-family: 'Minecraft', monospace !important;
      font-size: 20px !important;
      cursor: pointer !important;
      text-shadow: 0 0 10px #00ffff !important;
      transition: all 0.3s !important;
    `;
    killButton.textContent = '⚔️ ATTACK WARDEN ⚔️';
    
    killButton.addEventListener('mouseenter', () => {
      killButton.style.background = 'rgba(0, 200, 255, 0.5) !important';
      killButton.style.transform = 'scale(1.1)';
    });
    
    killButton.addEventListener('mouseleave', () => {
      killButton.style.background = 'rgba(0, 200, 255, 0.3) !important';
      killButton.style.transform = 'scale(1)';
    });
    
    killButton.addEventListener('click', async () => {
      // Prevent spam clicking
      if (killButton.dataset.attacking === 'true') return;
      killButton.dataset.attacking = 'true';
      killButton.style.opacity = '0.5';
      killButton.style.pointerEvents = 'none';
      
      // Consume one sword use
      playerData.diamond_sword = (playerData.diamond_sword || 0) - 1;
      if (playerData.diamond_sword <= 0) {
        playerData.diamond_sword = 0;
        showNotification('Diamond Sword broke!', 2000);
      }
      await savePlayerData();
      
      // Simple fade out animation
      overlay.style.transition = 'opacity 1s';
      overlay.style.opacity = '0';
      
      setTimeout(() => {
        overlay.remove();
        showNotification('Warden Defeated! +1000 XP', 3000);
        playerData.xp += 1000;
        // Track warden defeat for daily challenge
        updateDailyChallengeProgress('defeat_warden', 1);
        savePlayerData();
        updateInventoryUI();
      }, 1000);
    });
    
    contentContainer.appendChild(killButton);
  }
}

// Spawn an enchantment book
function spawnEnchantmentBook(minedElement, enchantKey) {
  const enchant = ENCHANTMENTS[enchantKey];
  
  // Show the mined element temporarily
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  const computedPosition = window.getComputedStyle(minedElement).position;
  if (computedPosition === 'static') {
    minedElement.style.position = 'relative';
  }
  
  // Get element position for fixed positioning
  const rect = minedElement.getBoundingClientRect();
  
  // Create enchantment container
  const enchantContainer = document.createElement('div');
  enchantContainer.className = 'mine-enchant-container';
  
  // Register this overlay - will dismiss lower priority overlays
  if (!registerOverlay(enchantContainer, 'enchantment')) {
    debugLog('Mine Anything: Enchantment spawn blocked by higher priority overlay');
    return; // Don't spawn if blocked
  }
  
  enchantContainer.style.cssText = `
    position: fixed !important;
    top: ${rect.top}px !important;
    left: ${rect.left}px !important;
    width: ${rect.width}px !important;
    height: ${rect.height}px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(138, 43, 226, 0.8) !important;
    z-index: 2147483647 !important;
    pointer-events: all !important;
  `;
  
  // Create enchantment book image
  const bookImg = document.createElement('img');
  bookImg.src = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
  bookImg.style.cssText = `
    width: auto !important;
    height: 80px !important;
    image-rendering: pixelated !important;
  `;
  
  // Create text container at bottom
  const textContainer = document.createElement('div');
  textContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.9) !important;
    padding: 10px !important;
    border-radius: 5px !important;
    margin: 10px !important;
    width: calc(100% - 20px) !important;
  `;
  
  // Create enchantment text
  const enchantText = document.createElement('div');
  enchantText.style.cssText = `
    color: #FFD700 !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 16px !important;
    text-align: center !important;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8) !important;
    margin-bottom: 5px !important;
  `;
  enchantText.textContent = enchant.name;
  
  // Create description text
  const descText = document.createElement('div');
  descText.style.cssText = `
    color: #ddd !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 11px !important;
    text-align: center !important;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8) !important;
  `;
  descText.textContent = enchant.description + ' - Collecting...';
  
  textContainer.appendChild(enchantText);
  textContainer.appendChild(descText);
  
  // Add image at top, text at bottom
  const imageWrapper = document.createElement('div');
  imageWrapper.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center;';
  imageWrapper.appendChild(bookImg);
  
  enchantContainer.appendChild(imageWrapper);
  enchantContainer.appendChild(textContainer);
  
  // Append to body for universal compatibility
  document.body.appendChild(enchantContainer);
  
  // Auto-collect after brief display
  setTimeout(() => {
    collectEnchantment(minedElement, enchantContainer, enchantKey);
  }, 1500);
}

// Collect an enchantment book
async function collectEnchantment(minedElement, enchantContainer, enchantKey) {
  const enchant = ENCHANTMENTS[enchantKey];
  
  // Special handling for Haste - activate immediately instead of adding to inventory
  if (enchantKey === 'haste') {
    activateHaste(enchant.mineCount);
    await savePlayerData();
    
    // Remove enchantment and hide element
    enchantContainer.remove();
    minedElement.style.display = 'none';
    
    updateInventoryUI();
    return;
  }
  
  // Add enchantment to inventory (for all other enchantments)
  if (!playerData.enchantmentInventory) {
    playerData.enchantmentInventory = [];
  }
  
  playerData.enchantmentInventory.push({
    type: enchantKey,
    durability: enchant.durability,
    maxDurability: enchant.durability
  });
  
  // Keep legacy enchantments tracking for backward compatibility
  if (!playerData.enchantments[enchantKey]) {
    playerData.enchantments[enchantKey] = 0;
  }
  playerData.enchantments[enchantKey]++;
  
  await savePlayerData();
  
  // Check achievements
  await checkAchievements();
  
  showNotification(`✨ ${enchant.name} book added to inventory!`, 3000);
  
  // Remove enchantment and hide element
  enchantContainer.remove();
  minedElement.style.display = 'none';
  
  // Update daily challenge progress
  updateDailyChallengeProgress('collect_enchantments', 1);
}

// Spawn a chest that drops a diamond
function spawnChest(minedElement) {
  // Show the mined element temporarily
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  const computedPosition = window.getComputedStyle(minedElement).position;
  if (computedPosition === 'static') {
    minedElement.style.position = 'relative';
  }
  
  // Create chest container
  const chestContainer = document.createElement('div');
  chestContainer.className = 'mine-chest-container';
  
  // Register this overlay - will dismiss lower priority overlays
  if (!registerOverlay(chestContainer, 'chest')) {
    debugLog('Mine Anything: Chest spawn blocked by higher priority overlay');
    return; // Don't spawn if blocked
  }
  
  chestContainer.style.cssText = `
    position: fixed !important;
    top: ${minedElement.getBoundingClientRect().top}px !important;
    left: ${minedElement.getBoundingClientRect().left}px !important;
    width: ${minedElement.getBoundingClientRect().width}px !important;
    height: ${minedElement.getBoundingClientRect().height}px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(139, 69, 19, 0.8) !important;
    z-index: 2147483647 !important;
    cursor: pointer !important;
    pointer-events: all !important;
  `;
  
  // Create chest image
  const chestImg = document.createElement('img');
  chestImg.src = chrome.runtime.getURL('assets/world-items/chest-still.gif');
  chestImg.style.cssText = `
    width: auto !important;
    height: 120px !important;
    image-rendering: pixelated !important;
  `;
  
  // Create click prompt
  const promptText = document.createElement('div');
  promptText.style.cssText = `
    color: #FFD700 !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 14px !important;
    text-align: center !important;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8) !important;
    background: rgba(0, 0, 0, 0.9) !important;
    padding: 8px !important;
    border-radius: 5px !important;
    margin: 10px !important;
    width: calc(100% - 20px) !important;
  `;
  promptText.textContent = '💎 Click to open! 💎';
  
  // Add image wrapper for proper centering
  const imageWrapper = document.createElement('div');
  imageWrapper.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center;';
  imageWrapper.appendChild(chestImg);
  
  chestContainer.appendChild(imageWrapper);
  chestContainer.appendChild(promptText);
  
  // Click to collect diamond
  chestContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    collectDiamond(minedElement, chestContainer);
  });
  
  // Append to body for better z-index control across all sites
  document.body.appendChild(chestContainer);
}

// Collect a diamond from chest
async function collectDiamond(minedElement, chestContainer) {
  // Show diamond popping out
  const diamondImg = document.createElement('img');
  diamondImg.src = chrome.runtime.getURL('assets/world-items/diamond.png');
  diamondImg.style.cssText = `
    position: absolute !important;
    width: auto !important;
    height: 80px !important;
    image-rendering: pixelated !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) scale(0) !important;
    z-index: 2147483648 !important;
    pointer-events: none !important;
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  `;
  
  chestContainer.appendChild(diamondImg);
  
  // Animate diamond
  setTimeout(() => {
    diamondImg.style.transform = 'translate(-50%, -50%) scale(1.5)';
  }, 10);
  
  // Update player data - use inventory.diamond
  if (!playerData.inventory) playerData.inventory = {};
  const diamondsFound = Math.floor(Math.random() * 2) + 1; // 1-2 diamonds
  playerData.inventory.diamond = (playerData.inventory.diamond || 0) + diamondsFound;
  await savePlayerData();
  updateInventoryUI();
  
  // Check achievements after collecting diamond
  await checkAchievements();
  
  // Show notification with current total
  const currentDiamonds = playerData.inventory.diamond;
  let message = `${diamondsFound} Diamond${diamondsFound > 1 ? 's' : ''} found! (${currentDiamonds} total)`;
  
  showNotification(message, 2000);
  
  // Remove chest and hide element after animation
  setTimeout(() => {
    chestContainer.remove();
    minedElement.style.display = 'none';
  }, 1000);
}

// Sculk block system - add sculk blocks to bottom 20% of page
let sculkBlocksAdded = false;

function addSculkBlocks() {
  // Only generate once
  if (sculkBlocksAdded) return;
  sculkBlocksAdded = true;
  
  const documentHeight = getCurrentDocumentHeight();
  const windowHeight = window.innerHeight;
  
  // Only add sculk if page is tall enough (at least 2 viewports)
  if (documentHeight < windowHeight * 2) {
    sculkBlocksAdded = false;
    return;
  }
  
  // Find footer or bottom containers to attach sculk to
  const footerCandidates = [
    ...document.querySelectorAll('footer'),
    ...document.querySelectorAll('[class*="footer" i]'),
    ...document.querySelectorAll('[id*="footer" i]'),
    ...document.querySelectorAll('[class*="bottom" i]'),
    ...document.querySelectorAll('main'),
    ...document.querySelectorAll('body > div')
  ];
  
  // Filter out extension UI elements and only use elements in bottom 30% of page
  const bottomThreshold = documentHeight * 0.7;
  const bottomElements = Array.from(footerCandidates).filter(el => {
    // Skip any extension UI elements
    if (el.classList.contains('mine-inventory-container') ||
        el.classList.contains('mine-toggle-container') ||
        el.classList.contains('mine-crafting-overlay') ||
        el.closest('.mine-inventory-container') ||
        el.closest('.mine-toggle-container') ||
        el.closest('.mine-crafting-overlay')) {
      return false;
    }
    
    const rect = el.getBoundingClientRect();
    const elementTop = rect.top + window.scrollY;
    return elementTop > bottomThreshold && rect.height > 50; // Must have some height
  }).slice(0, 8); // Limit to 8 containers
  
  // If no suitable containers found, don't spawn sculk at all
  if (bottomElements.length === 0) {
    sculkBlocksAdded = false;
    return;
  }
  
  const targetContainers = bottomElements;
  
  // Distribute sculk blocks across bottom containers
  const numBlocks = 15 + Math.floor(Math.random() * 21);
  const blocksPerContainer = Math.ceil(numBlocks / targetContainers.length);
  
  targetContainers.forEach((container, containerIndex) => {
    const containerRect = container.getBoundingClientRect();
    const blocksForThisContainer = Math.min(blocksPerContainer, numBlocks - (containerIndex * blocksPerContainer));
    
    for (let i = 0; i < blocksForThisContainer; i++) {
      const sculkBlock = document.createElement('div');
      sculkBlock.className = 'mine-sculk-block';
      
      // Position relative to container
      const left = Math.random() * Math.max(containerRect.width - 50, 50);
      const top = Math.random() * Math.max(containerRect.height, 100);
      
      sculkBlock.style.cssText = `
        position: absolute !important;
        left: ${left}px !important;
        top: ${top}px !important;
        width: 50px !important;
        height: 50px !important;
        background-image: url('${chrome.runtime.getURL('assets/Blocks/sculk.svg')}') !important;
        background-size: 50px 50px !important;
        background-repeat: repeat !important;
        z-index: 2147483645 !important;
        pointer-events: none !important;
        opacity: 0.8 !important;
      `;
      
      // Make sure container can contain absolute positioned children
      const containerPosition = window.getComputedStyle(container).position;
      if (containerPosition === 'static') {
        container.style.position = 'relative';
      }
      
      container.appendChild(sculkBlock);
    }
  });
}

// No longer need updateSculkPositions - blocks are element-relative now

// Creeper Easter Egg
function spawnCreeper(minedElement) {
  // Always show the mined element temporarily for creeper spawn
  minedElement.style.display = minedElement.dataset.originalDisplay || 'block';
  
  // Get element position including scroll offset for absolute positioning
  const rect = minedElement.getBoundingClientRect();
  
  // Create creeper container with absolute positioning (stays with element on scroll)
  const creeperContainer = document.createElement('div');
  creeperContainer.className = 'mine-creeper-container';
  creeperContainer.style.cssText = `
    position: absolute !important;
    top: ${rect.top + window.scrollY}px !important;
    left: ${rect.left + window.scrollX}px !important;
    width: ${rect.width}px !important;
    height: ${rect.height}px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent !important;
    z-index: 2147483647 !important;
    pointer-events: all !important;
  `;
  
  // Create creeper image
  const creeperImg = document.createElement('img');
  creeperImg.src = chrome.runtime.getURL('assets/explosion/creeper.gif');
  // Force reload to restart gif
  creeperImg.src = creeperImg.src + '?t=' + Date.now();
  creeperImg.style.cssText = `
    width: 300px !important;
    height: 300px !important;
    image-rendering: pixelated !important;
    cursor: pointer !important;
  `;
  
  let clickCount = 0;
  let exploded = false;
  
  // Click handler to defuse creeper
  const defuseCreeper = (e) => {
    e.stopPropagation();
    if (exploded) return;
    clickCount++;
    
    if (clickCount >= 2) {
      // Creeper defused!
      exploded = true;
      creeperContainer.remove();
      minedElement.style.display = 'none';
    }
  };
  
  creeperImg.addEventListener('click', defuseCreeper);
  creeperContainer.appendChild(creeperImg);
  document.body.appendChild(creeperContainer);
  
  // After 4 seconds, trigger explosion
  setTimeout(() => {
    if (exploded) return; // Already defused
    
    exploded = true;
    explodeCreeper(minedElement, creeperContainer);
  }, 4000);
}

function explodeCreeper(minedElement, creeperContainer) {
  // Get element rect BEFORE any modifications
  const minedRect = minedElement.getBoundingClientRect();
  
  // Remove creeper container
  creeperContainer.remove();
  
  // Get surrounding elements (8-15 random nearby elements) BEFORE hiding the center element
  const surroundingElements = getSurroundingElements(minedElement, 8 + Math.floor(Math.random() * 8));
  
  // Show explosion on the originally mined element
  const explosionOnMined = document.createElement('div');
  explosionOnMined.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483646 !important;
    pointer-events: none !important;
  `;
  
  const explosionImgMined = document.createElement('img');
  explosionImgMined.src = chrome.runtime.getURL('assets/explosion/creeper-explosion.gif');
  explosionImgMined.style.cssText = `
    width: 300px !important;
    height: 300px !important;
    image-rendering: pixelated !important;
  `;
  
  explosionOnMined.appendChild(explosionImgMined);
  minedElement.appendChild(explosionOnMined);
  
  // Show explosion on each surrounding element
  surroundingElements.forEach((element, index) => {
    setTimeout(() => {
      // Get rect before showing explosion
      const elemRect = element.getBoundingClientRect();
      showExplosion(element, elemRect);
    }, index * 100); // Stagger explosions slightly
  });
  
  // Hide the original mined element after explosion animation
  setTimeout(() => {
    explosionOnMined.remove();
    minedElement.style.display = 'none';
  }, 1000);
}

function getSurroundingElements(centerElement, count) {
  const allElements = Array.from(document.querySelectorAll('div, p, span, img, section, article, header, footer, aside, nav'));
  const centerRect = centerElement.getBoundingClientRect();
  const centerX = centerRect.left + centerRect.width / 2;
  const centerY = centerRect.top + centerRect.height / 2;
  
  // List of extension classes to protect from explosions
  const protectedClasses = [
    'mine-toggle-container', 'mine-toggle-btn', 'mine-reset-btn',
    'mine-inventory-container', 'mine-inventory-grid', 'mine-inventory-slot',
    'mine-crafting-menu', 'mine-crafting-overlay',
    'mine-villager-container', 'mine-villager-modal',
    'mine-zombie-container', 'mine-creeper-container',
    'mine-chest-container', 'mine-pet-container',
    'mine-enchant-container', 'mine-warden-image',
    'mine-notification', 'mine-xp-notification', 'mine-xp-orb',
    'mine-particle', 'mine-explosion-container',
    'mine-overlay', 'mine-floating-cursor',
    'mine-torch', 'mine-redstone-block', 'mine-craft-button',
    'mine-depth-indicator'
  ];
  
  // Filter out already mined elements, non-mineable elements, and extension UI
  const validElements = allElements.filter(el => {
    if (minedElements.has(el)) return false;
    if (!isElementMineable(el)) return false;
    if (el === centerElement) return false;
    // Check if element or any parent has protected class
    if (protectedClasses.some(cls => el.classList?.contains(cls) || el.closest(`.${cls}`))) return false;
    // Check if element has mine- prefix in class name (catch-all protection)
    if (el.className && typeof el.className === 'string' && el.className.includes('mine-')) return false;
    return true;
  });
  
  // Sort by distance from center
  const sortedByDistance = validElements.map(el => {
    const rect = el.getBoundingClientRect();
    const elX = rect.left + rect.width / 2;
    const elY = rect.top + rect.height / 2;
    const distance = Math.sqrt(Math.pow(elX - centerX, 2) + Math.pow(elY - centerY, 2));
    return { element: el, distance };
  }).sort((a, b) => a.distance - b.distance);
  
  // Return the closest elements up to count
  return sortedByDistance.slice(0, count).map(item => item.element);
}

function showExplosion(element, elemRect) {
  // Create explosion overlay
  const explosionContainer = document.createElement('div');
  explosionContainer.className = 'mine-explosion-container';
  explosionContainer.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483646 !important;
    pointer-events: none !important;
  `;
  
  const explosionImg = document.createElement('img');
  explosionImg.src = chrome.runtime.getURL('assets/explosion/creeper-explosion.gif');
  // Force reload gif
  explosionImg.src = explosionImg.src + '?t=' + Date.now();
  explosionImg.style.cssText = `
    width: 300px !important;
    height: 300px !important;
    image-rendering: pixelated !important;
  `;
  
  explosionContainer.appendChild(explosionImg);
  
  // Make sure element has relative positioning
  const computedPosition = window.getComputedStyle(element).position;
  if (computedPosition === 'static') {
    element.style.position = 'relative';
  }
  
  element.appendChild(explosionContainer);
  
  // After explosion plays once (assume ~1 second), hide the element
  setTimeout(() => {
    explosionContainer.remove();
    
    // Store and hide element (no XP for explosions)
    minedElements.add(element);
    if (!element.dataset.originalDisplay) {
      const currentDisplay = window.getComputedStyle(element).display;
      element.dataset.originalDisplay = element.style.display || currentDisplay;
    }
    element.style.display = 'none';
  }, 1000);
}

// Stop mining
function stopMining() {
  if (currentlyMining && miningInterval) {
    clearInterval(miningInterval);
    miningInterval = null;
    
    const overlay = currentlyMining.querySelector('.mine-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    // If it's an image overlay container, remove it
    if (currentlyMining.dataset.isImageWrapper === 'true') {
      currentlyMining.remove();
    }
    
    currentlyMining = null;
    miningProgress = 0;
  }
}

// Detect and collect resources based on element color
async function detectAndCollectResource(element) {
  // Get current depth for Deep Dark diamond override
  const depthInfo = getCurrentDepthInfo();
  const isDeepDark = depthInfo.zone === 'deepdark';
  
  // DEEP DARK OVERRIDE: 20% flat chance for diamonds regardless of color
  if (isDeepDark && Math.random() < 0.20) {
    const resource = RESOURCES.diamond;
    
    if (!playerData.inventory) playerData.inventory = {};
    if (!playerData.inventory.diamond) playerData.inventory.diamond = 0;
    
    let amount = 1 + (playerData.toolEnchantment === 'fortune' ? Math.floor(Math.random() * 2) : 0);
    
    // Apply double drops if active
    if (playerData.doubleDrops) {
      amount *= 2;
    }
    
    playerData.inventory.diamond += amount;
    
    await savePlayerData();
    
    debugLog('💎 Mined (Deep Dark diamond bonus):', 'diamond', 'x' + amount);
    
    // Show resource notification
    showResourceNotification(element, resource, amount);
    
    // Update inventory UI if visible
    if (inventoryVisible) {
      updateInventoryUI();
    }
    
    // Decrement torch/safe zone mine count if active
    if (playerData.safeZone?.remainingMines > 0) {
      playerData.safeZone.remainingMines--;
      if (playerData.safeZone.remainingMines <= 0) {
        playerData.safeZone = null;
        showNotification('🔥 Torch burned out!', 2000);
      }
      await savePlayerData();
    }
    
    // Decrement beacon mine count if active
    if (playerData.doubleDrops?.remainingMines > 0) {
      playerData.doubleDrops.remainingMines--;
      if (playerData.doubleDrops.remainingMines <= 0) {
        playerData.doubleDrops = null;
        // Consume the beacon item now that it's depleted
        if (playerData.craftedItems?.beacon > 0) {
          playerData.craftedItems.beacon--;
        }
        showNotification('🔷 Beacon depleted!', 2000);
        // Update inventory to remove the depleted beacon
        if (inventoryVisible) {
          updateInventoryUI();
        }
      }
      await savePlayerData();
    }
    
    // Decrement haste mine count if active
    if (playerData.hasteEffect?.remainingMines > 0) {
      playerData.hasteEffect.remainingMines--;
      if (playerData.hasteEffect.remainingMines <= 0) {
        playerData.hasteEffect = null;
        showNotification('⚡ Haste effect ended!', 2000);
      }
      await savePlayerData();
    }
    
    return; // Successfully mined diamond
  }
  
  // Normal color-based resource detection
  const elementColor = getDominantColor(element);
  if (!elementColor) return;
  
  // Convert hex to HSL
  const hsl = hexToHSL(elementColor);
  if (!hsl) return;
  
  debugLog('🎨 Mining color:', elementColor, 'HSL: h=' + hsl.h + '° s=' + hsl.s + '% l=' + hsl.l + '%');
  
  // Find ALL matching resources, then pick one based on drop rate
  const matchingResources = [];
  for (const [resourceKey, resource] of Object.entries(RESOURCES)) {
    // Skip diamond in Deep Dark (already handled above)
    if (resourceKey === 'diamond' && isDeepDark) continue;
    
    // Check if element color falls within the resource's color range
    const colorMatch = isColorInRange(hsl, resource.colorRange);
    
    if (colorMatch) {
      // Apply reduced diamond drop rate outside Deep Dark
      let effectiveDropRate = resource.dropRate;
      
      if (resourceKey === 'diamond' && !isDeepDark) {
        effectiveDropRate = 0.0065; // 0.65% elsewhere
      }
      
      matchingResources.push({ 
        key: resourceKey, 
        resource: resource,
        effectiveDropRate: effectiveDropRate
      });
      debugLog('✓ Color matches:', resourceKey);
    }
  }
  
  // If we have matching resources, pick one based on drop rate
  if (matchingResources.length > 0) {
    // Sort by effective drop rate ASCENDING (rarest first)
    matchingResources.sort((a, b) => a.effectiveDropRate - b.effectiveDropRate);
    
    debugLog('🎯 Matching resources (rarest first):', matchingResources.map(m => m.key + ' (' + (m.effectiveDropRate * 100) + '%)').join(', '));
    
    // Try each matching resource starting with the RAREST
    for (const { key: resourceKey, resource, effectiveDropRate } of matchingResources) {
      
      if (Math.random() < effectiveDropRate) {
        // Collect resource
        if (!playerData.inventory) playerData.inventory = {};
        if (!playerData.inventory[resourceKey]) playerData.inventory[resourceKey] = 0;
        
        let amount = 1 + (playerData.toolEnchantment === 'fortune' ? Math.floor(Math.random() * 2) : 0);
        
        // Apply double drops if active
        if (playerData.doubleDrops && Date.now() < playerData.doubleDrops.endTime) {
          amount *= 2;
        }
        
        playerData.inventory[resourceKey] += amount;
        
        await savePlayerData();
        
        debugLog('⛏️ Mined:', resourceKey, 'x' + amount);
        
        // Update daily challenge progress for resource collection
        updateDailyChallengeProgress('collect_resources', amount);
        updateDailyChallengeProgress(`collect_${resourceKey}`, amount);
        
        // Show resource notification
        showResourceNotification(element, resource, amount);
        
        // Update inventory UI if visible
        if (inventoryVisible) {
          updateInventoryUI();
        }
        
        return; // Successfully mined
      }
    }
    
    // If ALL random checks failed, give the RAREST matching resource as fallback
    // This ensures valuable resources like emeralds/diamonds have priority
    const fallback = matchingResources[0]; // First item = rarest (lowest drop rate)
    const resourceKey = fallback.key;
    const resource = fallback.resource;
    
    if (!playerData.inventory) playerData.inventory = {};
    if (!playerData.inventory[resourceKey]) playerData.inventory[resourceKey] = 0;
    
    let amount = 1 + (playerData.toolEnchantment === 'fortune' ? Math.floor(Math.random() * 2) : 0);
    
    // Apply double drops if active
    if (playerData.doubleDrops) {
      amount *= 2;
    }
    
    playerData.inventory[resourceKey] += amount;
    
    await savePlayerData();
    
    debugLog('⛏️ Mined (fallback):', resourceKey, 'x' + amount);
    
    // Update daily challenge progress for resource collection
    updateDailyChallengeProgress('collect_resources', amount);
    updateDailyChallengeProgress(`collect_${resourceKey}`, amount);
    
    // Show resource notification
    showResourceNotification(element, resource, amount);
    
    // Update inventory UI if visible
    if (inventoryVisible) {
      updateInventoryUI();
    }
  } else {
    debugLog('❌ No resource match for color');
  }
  
  // Decrement torch/safe zone mine count if active (applies to all mining attempts)
  if (playerData.safeZone?.remainingMines > 0) {
    playerData.safeZone.remainingMines--;
    if (playerData.safeZone.remainingMines <= 0) {
      playerData.safeZone = null;
      // Consume the torch item now that it's depleted
      if (playerData.craftedItems?.torch > 0) {
        playerData.craftedItems.torch--;
      }
      showNotification('🔥 Torch burned out!', 2000);
      // Update inventory to remove the depleted torch
      if (inventoryVisible) {
        updateInventoryUI();
      }
    }
    await savePlayerData();
  }
  
  // Decrement haste mine count if active (applies to all mining attempts)
  if (playerData.hasteEffect?.remainingMines > 0) {
    playerData.hasteEffect.remainingMines--;
    if (playerData.hasteEffect.remainingMines <= 0) {
      playerData.hasteEffect = null;
      showNotification('⚡ Haste effect ended!', 2000);
    }
    await savePlayerData();
  }
}

// Get dominant color from element with smart prioritization
function getDominantColor(element) {
  try {
    const style = window.getComputedStyle(element);
    
    let color = null;
    
    // PRIORITY 1: Always check background color first (most reliable)
    color = style.backgroundColor;
    if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
      debugLog('🎨 Using background color');
      return convertColorToHex(color);
    }
    
    // PRIORITY 2: Check for background gradient
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const gradientColor = extractColorFromGradient(bgImage);
      if (gradientColor) {
        debugLog('🎨 Using gradient color');
        return gradientColor;
      }
    }
    
    // PRIORITY 3: Detect if element is primarily textual or visual
    const isTextElement = isTextualElement(element);
    
    if (isTextElement) {
      // FOR TEXT ELEMENTS: prioritize text-related colors
      
      // Text decoration color (underlines, highlights)
      color = style.textDecorationColor;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' && color !== 'currentcolor') {
        debugLog('📝 Text element: using text-decoration-color');
        return convertColorToHex(color);
      }
      
      // Text color (main text)
      color = style.color;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        debugLog('📄 Text element: using text color');
        return convertColorToHex(color);
      }
    } else {
      // FOR VISUAL ELEMENTS: check border
      color = style.borderTopColor || style.borderColor;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        debugLog('🔲 Visual element: using border color');
        return convertColorToHex(color);
      }
    }
    
    // FALLBACK: Walk up DOM tree to find parent with color
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 3;
    
    while (parent && depth < maxDepth) {
      const parentStyle = window.getComputedStyle(parent);
      const parentBg = parentStyle.backgroundColor;
      
      if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
        debugLog('📦 Using parent background color (depth: ' + depth + ')');
        return convertColorToHex(parentBg);
      }
      
      parent = parent.parentElement;
      depth++;
    }
    
    // LAST RESORT: Use text color
    color = style.color;
    if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
      debugLog('📄 Last resort: using text color');
      return convertColorToHex(color);
    }
    
    return null;
  } catch (e) {
    console.error('Error getting color:', e);
    return null;
  }
}

// Detect if element is primarily textual
function isTextualElement(element) {
  // Check tag name
  const textTags = ['P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'BLOCKQUOTE', 'LI', 'LABEL', 'TD', 'TH', 'FIGCAPTION', 'CITE', 'Q', 'CODE', 'PRE', 'STRONG', 'EM', 'B', 'I', 'U', 'MARK', 'SMALL', 'DEL', 'INS', 'SUB', 'SUP'];
  if (textTags.includes(element.tagName)) {
    return true;
  }
  
  // Check if element has significant text content vs child elements
  const textContent = element.textContent?.trim() || '';
  const hasChildren = element.children.length > 0;
  
  // If it has text but few/no children, likely textual
  if (textContent.length > 10 && element.children.length <= 2) {
    return true;
  }
  
  return false;
}

// Convert any color format to hex
function convertColorToHex(color) {
  if (!color) return null;
  
  // Already hex
  if (color.startsWith('#')) {
    return color;
  }
  
  // Convert rgb/rgba to hex
  if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      const r = parseInt(matches[0]);
      const g = parseInt(matches[1]);
      const b = parseInt(matches[2]);
      return rgbToHex(r, g, b);
    }
  }
  
  return null;
}

// Extract first solid color from CSS gradient
function extractColorFromGradient(gradient) {
  // Match rgb/rgba colors in gradient
  const rgbMatch = gradient.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `rgb(${r}, ${g}, ${b})`;
  }
  
  // Match hex colors in gradient
  const hexMatch = gradient.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
  if (hexMatch) {
    return hexMatch[0];
  }
  
  return null;
}

// Convert RGB to Hex
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// Convert hex color to HSL
function hexToHSL(hex) {
  const r = parseInt(hex.substr(1, 2), 16) / 255;
  const g = parseInt(hex.substr(3, 2), 16) / 255;
  const b = parseInt(hex.substr(5, 2), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

// Check if HSL color is within a given range
function isColorInRange(hsl, range) {
  const { h, s, l } = hsl;
  const { hueMin, hueMax, satMin, satMax, lightMin, lightMax } = range;
  
  // Check saturation and lightness
  if (s < satMin || s > satMax) return false;
  if (l < lightMin || l > lightMax) return false;
  
  // Check hue (handle wraparound for red)
  if (hueMin > hueMax) {
    // Wraparound case (e.g., 345-15 for red)
    return h >= hueMin || h <= hueMax;
  } else {
    return h >= hueMin && h <= hueMax;
  }
}

// Show resource collection notification
function showResourceNotification(element, resource, amount) {
  const rect = element.getBoundingClientRect();
  const notification = document.createElement('div');
  
  notification.style.cssText = `
    position: fixed !important;
    left: ${rect.left + rect.width / 2}px !important;
    top: ${rect.top + 20}px !important;
    transform: translateX(-50%) !important;
    background: rgba(0, 150, 0, 0.95) !important;
    color: white !important;
    padding: 8px 16px !important;
    border-radius: 4px !important;
    font-family: 'Minecraft', monospace !important;
    font-size: 14px !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    border: 2px solid #00aa00 !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    animation: float-up 2s ease-out forwards !important;
  `;
  
  // Try to load resource image with fallback
  if (chrome.runtime?.id) {
    createImageWithFallback('assets/resources', resource.file, (imgSrc) => {
      if (imgSrc) {
        notification.innerHTML = `
          <img src="${imgSrc}" style="width: 20px; height: 20px; image-rendering: pixelated;">
          <span>+${amount} ${resource.name}</span>
        `;
      } else {
        notification.textContent = `+${amount} ${resource.name}`;
      }
    });
  } else {
    notification.textContent = `+${amount} ${resource.name}`;
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
}

// Create mining particles
function createMiningParticles(element) {
  const rect = element.getBoundingClientRect();
  const toolColor = TOOLS[playerData.currentTool]?.particleColor || '#8B7355';
  
  // Create 6-10 particles
  const numParticles = 6 + Math.floor(Math.random() * 5);
  
  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'mine-particle';
    
    // Random start position within element bounds
    const startX = rect.left + rect.width * (0.2 + Math.random() * 0.6);
    const startY = rect.top + rect.height * (0.2 + Math.random() * 0.6);
    
    // Random burst direction and distance
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance - 20; // Slight upward bias
    
    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;
    particle.style.backgroundColor = toolColor;
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.animation = `particle-burst ${0.6 + Math.random() * 0.4}s ease-out forwards`;
    
    document.body.appendChild(particle);
    
    // Remove after animation
    setTimeout(() => {
      particle.remove();
    }, 1000);
  }
}

// Show XP gain notification with XP orb animations
function showXPGain(element, xpGain) {
  const rect = element.getBoundingClientRect();
  showXPGainWithRect(rect, xpGain);
}

function showXPGainWithRect(rect, xpGain) {
  const notification = document.createElement('div');
  notification.className = 'mine-xp-notification';
  notification.textContent = `+${xpGain} XP`;
  
  notification.style.left = `${rect.left + rect.width / 2}px`;
  notification.style.top = `${rect.top}px`;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
  
  // Create 2-3 XP orbs that pop up from the element
  const numOrbs = 2 + Math.floor(Math.random() * 2); // 2 or 3 orbs
  
  for (let i = 0; i < numOrbs; i++) {
    setTimeout(() => {
      createXPOrb(rect);
    }, i * 100); // Stagger the orb creation
  }
}

// Create a single XP orb animation
function createXPOrb(rect) {
  const orb = document.createElement('div');
  orb.className = 'mine-xp-orb';
  
  // Start position within the element
  const startX = rect.left + rect.width * (0.3 + Math.random() * 0.4);
  const startY = rect.top + rect.height * 0.5;
  
  // Target: Extension icon area (top right, accounting for browser UI)
  // Chrome extensions are typically at ~right: 100px, top: 10px from viewport
  const targetX = window.innerWidth - 100;
  const targetY = 10;
  
  // Calculate the distance and angle
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  
  orb.style.left = `${startX}px`;
  orb.style.top = `${startY}px`;
  
  // Load XP orb image if available
  if (chrome.runtime?.id) {
    try {
      const orbImg = chrome.runtime.getURL('assets/other/xp-orb.png');
      orb.innerHTML = `<img src="${orbImg}" style="width: 100%; height: 100%; image-rendering: pixelated;">`;
    } catch (e) {
      orb.innerHTML = '⭐';
    }
  } else {
    orb.innerHTML = '⭐';
  }
  
  orb.style.setProperty('--target-x', `${deltaX}px`);
  orb.style.setProperty('--target-y', `${deltaY}px`);
  
  document.body.appendChild(orb);
  
  setTimeout(() => {
    orb.remove();
  }, 1500); // Longer duration for travel animation
}

// Block ALL clicks and interactions when mining is active
document.addEventListener('click', (e) => {
  // Allow clicks on toggle/reset buttons (check shadow host)
  if (e.target.closest('#mine-toggle-host')) {
    return;
  }
  
  if (miningEnabled || isShortcutPressed()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// Block mouseup to prevent link activation
document.addEventListener('mouseup', (e) => {
  // Allow clicks on toggle/reset buttons (check shadow host)
  if (e.target.closest('#mine-toggle-host')) {
    return;
  }
  
  if (miningEnabled || isShortcutPressed()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// Block auxclick (middle click, etc)
document.addEventListener('auxclick', (e) => {
  // Allow clicks on toggle/reset buttons (check shadow host)
  if (e.target.closest('#mine-toggle-host')) {
    return;
  }
  
  if (miningEnabled || isShortcutPressed()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// Block contextmenu when mining
document.addEventListener('contextmenu', (e) => {
  // Allow clicks on toggle/reset buttons (check shadow host)
  if (e.target.closest('#mine-toggle-host')) {
    return;
  }
  
  if (miningEnabled || isShortcutPressed()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// Add click listener for mining - REQUIRES Alt key (Option on Mac) OR toggle enabled
document.addEventListener('mousedown', (e) => {
  // Only allow left-click (button 0)
  if (e.button !== 0) {
    return;
  }
  
  // Must have shortcut keys held down OR mining enabled via toggle
  if (!miningEnabled && !isShortcutPressed()) {
    return;
  }
  
  // Allow clicks on toggle/reset buttons BEFORE blocking (check shadow host)
  if (e.target.closest('#mine-toggle-host')) {
    return; // Let the toggle button work normally
  }
  
  // Mining is active - block ALL default behaviors
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  
  // If already mining, don't start a new one (this prevents one-click to start)
  if (currentlyMining) {
    // Check if clicking on the currently mining element to resume
    if (currentlyMining === e.target || currentlyMining.contains(e.target)) {
      // This will be handled by the mouseDownHandler in startMining
      return;
    }
    // Clicking elsewhere while mining - do nothing
    return;
  }
  
  // Don't mine body or html
  if (e.target === document.body || e.target === document.documentElement) {
    debugWarn('Mine Anything: Cannot mine body/html element');
    return;
  }
  
  // Find the best element to mine (handles overlays)
  const targetElement = findMineableElement(e.target);
  
  // Don't mine if no valid element found
  if (!targetElement) {
    debugLog('Mine Anything: No valid mineable element found');
    return;
  }
  
  // Start mining - keep cursor visible
  startMining(targetElement);
}, true); // Use capture phase to catch events early

// Stop all clicks during mining
document.addEventListener('click', (e) => {
  if (currentlyMining) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }
}, true);

// Stop mouseup from triggering actions
document.addEventListener('mouseup', (e) => {
  if (currentlyMining && miningProgress < 100) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    stopMining();
    return false;
  }
}, true);

// Stop mouseleave from element
document.addEventListener('mouseleave', (e) => {
  if (currentlyMining === e.target && miningProgress < 100) {
    // Don't stop mining if mouse leaves the element, only if released
  }
});

// Create toggle button
async function createToggleButton() {
  // Check if body exists
  if (!document.body) {
    debugWarn('Mine Anything: Body not ready, retrying...');
    setTimeout(createToggleButton, 100);
    return;
  }
  
  // Check if already created
  if (document.querySelector('#mine-toggle-host')) {
    debugLog('Mine Anything: Toggle button already exists');
    const host = document.querySelector('#mine-toggle-host');
    toggleButton = host.shadowRoot.querySelector('.mine-toggle-container');
    await updateTogglePosition();
    return;
  }
  
  // Load settings
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || { showToggle: true, togglePosition: 'bottom-left' };
  
  // Create shadow host
  const shadowHost = document.createElement('div');
  shadowHost.id = 'mine-toggle-host';
  shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; pointer-events: none;';
  
  // Attach shadow DOM
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  
  // Create style element for shadow DOM
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Minecraft';
      src: url('${chrome.runtime.getURL('assets/fonts/Minecraft.ttf')}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    
    * {
      box-sizing: border-box;
    }
    
    .mine-toggle-container {
      position: fixed !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 0 !important;
      background: transparent !important;
      font-family: 'Minecraft', 'Press Start 2P', 'Courier New', monospace !important;
      font-size: 13px !important;
      color: #2a2a2a !important;
      user-select: none !important;
      width: auto !important;
      transition: all 0.2s ease !important;
      pointer-events: auto !important;
    }
    
    .mine-toggle-container.hidden {
      display: none !important;
    }
    
    .mine-toggle-main,
    .mine-inventory-toggle {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 6px 10px !important;
      background: #b8b8b8 !important;
      border-top: 3px solid #d8d8d8 !important;
      border-left: 3px solid #d8d8d8 !important;
      border-right: 3px solid #4a4a4a !important;
      border-bottom: 3px solid #4a4a4a !important;
      box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.2), inset -2px -2px 0 rgba(0, 0, 0, 0.2) !important;
      transition: all 0.2s ease !important;
      height: 100% !important;
    }
    
    .mine-inventory-toggle {
      cursor: pointer !important;
      padding: 8px 10px !important;
      justify-content: center !important;
      align-items: center !important;
      max-height: 43px !important;
    }
    
    .mine-inventory-toggle:hover {
      background: #c8c8c8 !important;
    }
    
    .mine-inventory-toggle.active {
      background: #90ee90 !important;
      border-top-color: #b8f0b8 !important;
      border-left-color: #b8f0b8 !important;
    }
    
    .mine-inventory-toggle img {
      width: 28px !important;
      height: 28px !important;
      image-rendering: pixelated !important;
    }
    
    .mine-depth-indicator {
      display: flex !important;
      align-items: center !important;
      gap: 0 !important;
      padding: 6px 10px !important;
      background: #b8b8b8 !important;
      border-top: 3px solid #d8d8d8 !important;
      border-left: 3px solid #d8d8d8 !important;
      border-right: 3px solid #4a4a4a !important;
      border-bottom: 3px solid #4a4a4a !important;
      box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.2), inset -2px -2px 0 rgba(0, 0, 0, 0.2) !important;
      max-height: 43px !important;
      min-height: 43px !important;
      white-space: nowrap !important;
      pointer-events: none !important;
    }
    
    .mine-toggle-drag-handle {
      font-size: 16px !important;
      color: #4a4a4a !important;
      cursor: grab !important;
      padding: 0 4px !important;
      opacity: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      transition: all 0.2s ease !important;
      line-height: 1 !important;
      flex-shrink: 0 !important;
    }
    
    .mine-toggle-main:hover .mine-toggle-drag-handle {
      opacity: 1 !important;
      width: auto !important;
      padding: 0 4px !important;
    }
    
    .mine-toggle-drag-handle:active {
      cursor: grabbing !important;
    }
    
    .mine-toggle-tool-icon {
      width: auto !important;
      height: 25px !important;
      display: flex !important;
      align-items: center !important;
      flex-shrink: 0 !important;
    }
    
    .mine-toggle-tool-icon img {
      width: auto !important;
      height: 100% !important;
      object-fit: contain !important;
      image-rendering: pixelated !important;
    }
    
    .mine-toggle-text {
      line-height: 1.5 !important;
      white-space: nowrap !important;
      font-weight: bold !important;
    }
    
    #mine-status {
      color: #8b0000 !important;
    }
    
    #mine-status.active {
      color: #006400 !important;
    }
    
    .mine-reset-btn {
      background: transparent !important;
      border: none !important;
      color: #2a2a2a !important;
      font-size: 16px !important;
      cursor: pointer !important;
      padding: 0 4px !important;
      font-family: 'Minecraft', 'Press Start 2P', 'Courier New', monospace !important;
      opacity: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      transition: all 0.2s ease !important;
    }
    
    .mine-toggle-main:hover .mine-reset-btn {
      opacity: 1 !important;
      width: auto !important;
      padding: 0 4px !important;
    }
    
    .mine-reset-btn:hover {
      color: #ff4444 !important;
    }
    
    .mine-toggle-switch {
      width: 40px !important;
      height: 20px !important;
      background: #8b0000 !important;
      border: 2px solid #4a4a4a !important;
      position: relative !important;
      cursor: pointer !important;
      flex-shrink: 0 !important;
      image-rendering: pixelated !important;
      box-shadow: inset 2px 2px 0 rgba(0, 0, 0, 0.3) !important;
    }
    
    .mine-toggle-switch.active {
      background: #006400 !important;
    }
    
    .mine-toggle-switch-knob {
      width: 16px !important;
      height: 16px !important;
      background: #d8d8d8 !important;
      border: 2px solid #4a4a4a !important;
      position: absolute !important;
      top: 0px !important;
      left: 0px !important;
      transition: left 0.2s ease !important;
      box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3) !important;
    }
    
    .mine-toggle-switch.active .mine-toggle-switch-knob {
      left: 20px !important;
    }
    
    .mine-toggle-instruction {
      font-size: 11px !important;
      color: #2a2a2a !important;
      text-align: center !important;
      white-space: nowrap !important;
      margin-top: 4px !important;
      width: 100% !important;
      font-family: 'Minecraft', 'Press Start 2P', 'Courier New', monospace !important;
    }
    
    .mine-key-box {
      display: inline-block !important;
      padding: 2px 6px !important;
      background: #d8d8d8 !important;
      border: 2px solid #4a4a4a !important;
      border-radius: 3px !important;
      font-weight: bold !important;
      margin: 0 2px !important;
      box-shadow: 0 2px 0 #4a4a4a !important;
    }
    
    .mine-toggle-top {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    
    .mine-toggle-container-inner {
      display: flex !important;
      align-items: center !important;
      height: 100% !important;
    }
    
    .pos-top-right {
      top: 20px !important;
      right: 20px !important;
    }
    
    .pos-top-left {
      top: 20px !important;
      left: 20px !important;
    }
    
    .pos-bottom-right {
      bottom: 20px !important;
      right: 20px !important;
    }
    
    .pos-bottom-left {
      bottom: 20px !important;
      left: 20px !important;
    }
  `;
  
  shadowRoot.appendChild(style);
  
  const buttonContainer = document.createElement('div');
  buttonContainer.className = `mine-toggle-container pos-${currentSettings.togglePosition}`;
  if (!currentSettings.showToggle) {
    buttonContainer.classList.add('hidden');
  }
  
  // Get current tool icon
  const currentTool = TOOLS[playerData?.currentTool || 'hand'];
  const displayFile = TOOLS_DISPLAY[playerData?.currentTool || 'hand'];
  let toolIconUrl = '';
  try {
    toolIconUrl = chrome.runtime?.id ? chrome.runtime.getURL('assets/pickaxe-levels/' + displayFile) : '';
    debugLog('Mine Anything: Toggle icon URL:', toolIconUrl);
  } catch (e) {
    console.error('Mine Anything: Error loading toggle icon:', e);
  }
  
  // Get keyboard shortcut key display
  const keyDisplay = isMac ? '⌥' : 'Alt';
  
  // Get inventory icon URL
  const inventoryIconUrl = chrome.runtime.getURL('assets/ui/inventory.png');
  
  // Determine button order based on position
  // Mining toggle should face outward, inventory should face inward
  const isLeft = currentSettings.togglePosition.includes('left');
  const miningToggle = `
    <div class="mine-toggle-main" title="Toggle mining (Hold ${keyDisplay} key)">
      <div class="mine-toggle-container-inner">
        <div class="mine-toggle-top">
          <div class="mine-toggle-drag-handle" title="Drag to move">⠿</div>
          <div class="mine-toggle-tool-icon" id="mineToggleIcon">
            ${toolIconUrl ? `<img src="${toolIconUrl}">` : currentTool.icon}
          </div>
          <div class="mine-toggle-switch" id="mineToggleSwitch" title="Toggle mining">
            <div class="mine-toggle-switch-knob"></div>
          </div>
          <button class="mine-reset-btn" id="mineResetBtn" title="Reset">↻</button>
        </div>
      </div>
    </div>
  `;
  const inventoryToggle = `
    <div class="mine-inventory-toggle" id="mineInventoryToggle" title="Toggle Inventory (I)">
      <img src="${inventoryIconUrl}" alt="Inventory">
    </div>
  `;
  
  const depthIndicator = `
    <div class="mine-depth-indicator" id="mineDepthIndicator" title="Current depth level">
      <span style="font-size: 12px; color: #2a2a2a; font-weight: bold;">Y: 0</span>
      <span style="font-size: 11px; color: #2a2a2a; margin-left: 6px;">Surface (+1 XP)</span>
    </div>
  `;
  
  // Order: if left side, mining first then inventory then depth. If right side, depth then inventory then mining
  buttonContainer.innerHTML = isLeft ? (miningToggle + inventoryToggle + depthIndicator) : (depthIndicator + inventoryToggle + miningToggle);
  
  buttonContainer.addEventListener('click', (e) => {
    // Don't toggle if clicking drag handle
    if (e.target.closest('.mine-toggle-drag-handle')) {
      return;
    }
    
    if (e.target.id === 'mineResetBtn' || e.target.closest('#mineResetBtn')) {
      resetMining();
      e.stopPropagation();
    } else if (e.target.id === 'mineInventoryToggle' || e.target.closest('#mineInventoryToggle')) {
      // Toggle inventory
      toggleInventory();
      e.stopPropagation();
    } else if (e.target.id === 'mineToggleSwitch' || e.target.closest('#mineToggleSwitch')) {
      // Only toggle if not dragging
      if (!buttonContainer.dataset.wasDragged) {
        toggleMining();
      }
      delete buttonContainer.dataset.wasDragged;
      e.stopPropagation();
    }
  });
  
  // Make main toggle section clickable
  const mainToggle = buttonContainer.querySelector('.mine-toggle-main');
  mainToggle.addEventListener('click', (e) => {
    // If clicking on container background (not on specific elements)
    if (e.target === mainToggle && !buttonContainer.dataset.wasDragged) {
      toggleMining();
    }
    delete buttonContainer.dataset.wasDragged;
  });
  
  shadowRoot.appendChild(buttonContainer);
  document.body.appendChild(shadowHost);
  
  toggleButton = buttonContainer;
  debugLog('Mine Anything: Toggle button created in shadow DOM');
  
  // Make draggable
  makeDraggable(buttonContainer);
  
  return buttonContainer;
}

// Make toggle draggable
function makeDraggable(element) {
  let isDragging = false;
  let hasMoved = false;
  let startX, startY, initialX, initialY;
  const dragThreshold = 5; // pixels to move before considering it a drag
  
  const mouseDownHandler = (e) => {
    // Only allow dragging from the drag handle
    if (!e.target.closest('.mine-toggle-drag-handle')) {
      return;
    }
    
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    
    // Get current position
    const rect = element.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    
    // Remove position classes when starting to drag
    element.className = 'mine-toggle-container';
    element.style.left = `${initialX}px`;
    element.style.top = `${initialY}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    
    // Disable transitions for smooth dragging
    element.style.transition = 'none';
    
    // Add cursor style
    document.body.style.cursor = 'grabbing';
    element.style.cursor = 'grabbing';
    
    e.preventDefault();
    e.stopPropagation();
  };
  
  const mouseMoveHandler = (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    // Check if moved beyond threshold
    if (!hasMoved && (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold)) {
      hasMoved = true;
      element.dataset.wasDragged = 'true';
    }
    
    if (hasMoved) {
      e.preventDefault();
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;
      
      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;
    }
  };
  
  const mouseUpHandler = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      element.style.cursor = '';
      
      // Re-enable transitions after dragging
      element.style.transition = '';
    }
  };
  
  element.addEventListener('mousedown', mouseDownHandler);
  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('mouseup', mouseUpHandler);
}

// Update toggle position from settings
async function updateTogglePosition() {
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || { showToggle: true, togglePosition: 'bottom-left', miningShortcut: ['Alt'] };
  
  // Update mining keys
  if (currentSettings.miningShortcut) {
    miningKeys = currentSettings.miningShortcut;
  }
  
  // Update instruction text in shadow DOM
  const shadowHost = document.querySelector('#mine-toggle-host');
  if (shadowHost && shadowHost.shadowRoot) {
    const instructionEl = shadowHost.shadowRoot.querySelector('.mine-toggle-instruction');
    if (instructionEl) {
      const displayKeys = miningKeys.map(k => {
        if (k === 'Alt') return isMac ? '⌥' : 'Alt';
        if (k === 'Control') return '⌃';
        if (k === 'Shift') return '⇧';
        if (k === 'Meta') return '⌘';
        return k.toUpperCase();
      });
      const keyDisplay = displayKeys.join('+');
      instructionEl.innerHTML = `Hold <span class="mine-key-box">${keyDisplay}</span> to mine`;
    }
  }
  
  if (toggleButton) {
    // Update visibility
    if (currentSettings.showToggle) {
      toggleButton.classList.remove('hidden');
    } else {
      toggleButton.classList.add('hidden');
    }
    
    // Update position
    toggleButton.className = `mine-toggle-container pos-${currentSettings.togglePosition}`;
    if (!currentSettings.showToggle) {
      toggleButton.classList.add('hidden');
    }
    
    // Clear inline styles if switching back to position classes
    toggleButton.style.left = '';
    toggleButton.style.top = '';
    toggleButton.style.right = '';
    toggleButton.style.bottom = '';
  }
}

// Update toggle tool icon
function updateToggleIcon() {
  if (!toggleButton || !playerData) return;
  
  const iconEl = toggleButton.querySelector('#mineToggleIcon');
  if (!iconEl) return;
  
  const currentTool = TOOLS[playerData.currentTool];
  const displayFile = TOOLS_DISPLAY[playerData.currentTool];
  if (chrome.runtime?.id) {
    try {
      const toolIconUrl = chrome.runtime.getURL(`assets/pickaxe-levels/${displayFile}`);
      iconEl.innerHTML = `<img src="${toolIconUrl}">`;
    } catch (e) {
      console.error('Mine Anything: Error updating toggle icon:', e);
      iconEl.textContent = currentTool.icon;
    }
  } else {
    iconEl.textContent = currentTool.icon;
  }
}

// Toggle mining mode
function toggleMining() {
  isToggledOn = !isToggledOn;
  miningEnabled = isToggledOn;
  
  // Access shadow DOM to get switch element
  const shadowHost = document.querySelector('#mine-toggle-host');
  if (!shadowHost || !shadowHost.shadowRoot) return;
  
  const toggleSwitch = shadowHost.shadowRoot.querySelector('#mineToggleSwitch');
  if (!toggleSwitch) return;
  
  if (miningEnabled) {
    toggleSwitch.classList.add('active');
    keepStylesHidden = false;
    showToolCursor();
  } else {
    toggleSwitch.classList.remove('active');
    hideToolCursor();
    keepStylesHidden = true;
  }
}

// Reset mining - restore all elements
function resetMining() {
  isToggledOn = false;
  miningEnabled = false;
  const statusText = document.getElementById('mine-status');
  if (statusText) {
    statusText.textContent = 'OFF';
    statusText.classList.remove('active');
  }
  hideToolCursor();
  keepStylesHidden = false;
  restoreMinedElements();
}

// Restore all mined elements when mining is disabled
function restoreMinedElements() {
  minedElements.forEach(element => {
    if (element.dataset.originalDisplay) {
      element.style.display = element.dataset.originalDisplay;
      delete element.dataset.originalDisplay;
    }
  });
  minedElements.clear();
}

// Show tool cursor with current tool - using floating element approach
let toolCursorElement = null;
let cursorLoadingPromise = null;
let cursorMouseMoveHandler = null;

async function showToolCursor() {
  if (!playerData || !playerData.currentTool) {
    return;
  }
  
  // If already loading, don't start another load
  if (cursorLoadingPromise) {
    return cursorLoadingPromise;
  }
  
  const currentTool = TOOLS[playerData.currentTool];
  
  cursorLoadingPromise = (async () => {
    try {
      // Create cursor element if it doesn't exist
      if (!toolCursorElement) {
        toolCursorElement = document.createElement('div');
        toolCursorElement.id = 'mine-floating-cursor';
        toolCursorElement.className = 'mine-floating-cursor';
        toolCursorElement.style.cssText = `
          position: fixed !important;
          width: 48px !important;
          height: 48px !important;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          transform: translateY(-50%) !important;
          display: block !important;
          opacity: 0 !important;
        `;
        document.body.appendChild(toolCursorElement);
        
        // Add mousemove listener to follow cursor
        cursorMouseMoveHandler = (e) => {
          if (toolCursorElement) {
            toolCursorElement.style.left = (e.clientX + 20) + 'px';
            toolCursorElement.style.top = e.clientY + 'px';
            toolCursorElement.style.opacity = '1';
          }
        };
        document.addEventListener('mousemove', cursorMouseMoveHandler);
      }
      
      // Load and display the tool image
      if (chrome.runtime?.id) {
        try {
          const imgUrl = chrome.runtime.getURL(`assets/tools/${currentTool.file}`);
          toolCursorElement.innerHTML = `<img src="${imgUrl}" style="width: 100%; height: 100%; display: block; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));" />`;
        } catch (e) {
          // Extension context invalidated, use fallback
          toolCursorElement.innerHTML = `<div style="font-size: 48px; text-align: center; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));">${currentTool.icon}</div>`;
        }
      } else {
        // Fallback to emoji
        toolCursorElement.innerHTML = `<div style="font-size: 48px; text-align: center; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));">${currentTool.icon}</div>`;
      }
      
      // Also set crosshair cursor on body
      document.body.style.cursor = 'crosshair';
      
    } catch (e) {
      console.error('Mine Anything: Error creating cursor element:', e);
      if (toolCursorElement) {
        // Fallback to iron pickaxe icon instead of emoji
        const ironPickaxeUrl = chrome.runtime.getURL('assets/pickaxe-levels/iron.svg');
        toolCursorElement.innerHTML = `<img src="${ironPickaxeUrl}" style="width: 48px; height: 48px; image-rendering: pixelated; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8));" />`;
      }
      document.body.style.cursor = 'crosshair';
    } finally {
      cursorLoadingPromise = null;
    }
  })();
  
  return cursorLoadingPromise;
}

// Hide tool cursor
function hideToolCursor() {
  if (toolCursorElement) {
    toolCursorElement.remove();
    toolCursorElement = null;
  }
  if (cursorMouseMoveHandler) {
    document.removeEventListener('mousemove', cursorMouseMoveHandler);
    cursorMouseMoveHandler = null;
  }
  document.body.style.cursor = '';
  cursorLoadingPromise = null;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPlayerData') {
    sendResponse(playerData);
  } else if (request.action === 'toggleMining') {
    miningEnabled = request.enabled;
    sendResponse({ success: true });
  } else if (request.action === 'updateSettings') {
    updateTogglePosition();
    sendResponse({ success: true });
  } else if (request.action === 'domainBlockChanged') {
    // Domain was blocked/unblocked, reload the page
    window.location.reload();
    sendResponse({ success: true });
  }
  return true;
});

// Create depth indicator UI (updates existing indicator in shadow DOM)
function createDepthIndicator() {
  function updateDepthIndicator() {
    // Get indicator from shadow DOM
    const shadowHost = document.querySelector('#mine-toggle-host');
    if (!shadowHost?.shadowRoot) return;
    
    const indicator = shadowHost.shadowRoot.querySelector('#mineDepthIndicator');
    if (!indicator) return;
    
    // Use centralized dynamic depth calculation
    const depthInfo = getCurrentDepthInfo();
    const { yCoord, depthName, xpValue } = depthInfo;
    
    // Don't show XP bonus at exact Y: 0
    const showXPBonus = yCoord !== 0;
    const xpText = showXPBonus ? ` (+${xpValue} XP)` : '';
    
    indicator.innerHTML = `
      <span style="font-size: 12px; color: #2a2a2a; font-weight: bold;">Y: ${yCoord}</span>
      <span style="font-size: 11px; color: #2a2a2a; margin-left: 6px;">${depthName}${xpText}</span>
    `;
  }
  
  // Initial update (with delay for shadow DOM to be ready)
  setTimeout(updateDepthIndicator, 100);
  
  // Update on scroll
  window.addEventListener('scroll', updateDepthIndicator);
}

// Create inventory UI
function createInventoryUI() {
  if (inventoryUI) return; // Already created
  
  const container = document.createElement('div');
  container.className = 'mine-inventory-container';
  
  // Get backpack icon URL
  const backpackIconUrl = chrome.runtime.getURL('assets/ui/inventory.png');
  
  container.innerHTML = `
    <div class="mine-inventory-close" title="Close (Press I)">X</div>
    <div class="mine-inventory-header"><img src="${backpackIconUrl}" style="width: 16px; height: 16px; image-rendering: pixelated; vertical-align: middle; margin-right: 4px;" /> Inventory</div>
    <div class="mine-inventory-content">
      <div class="mine-inventory-section">
        <div class="mine-section-header">Resources</div>
        <div class="mine-inventory-grid" id="mine-inventory-grid"></div>
      </div>
      <div class="mine-inventory-section">
        <div class="mine-section-header">✨ Enchantments</div>
        <div id="mine-current-enchantment" class="mine-current-enchantment"></div>
        <div id="mine-enchantment-inventory" class="mine-enchantment-grid"></div>
      </div>
    </div>
    <button class="mine-craft-button" id="mine-craft-btn">
      <img src="${chrome.runtime.getURL('assets/ui/craft.png')}" style="width: 16px; height: 16px; image-rendering: pixelated; vertical-align: middle; margin-right: 4px;" onerror="this.style.display='none';" />
      <span>Craft</span>
    </button>
    <div class="mine-inventory-hint">Press 'I' to toggle</div>
  `;
  
  document.body.appendChild(container);
  inventoryUI = container;
  
  // Add close button handler
  const closeBtn = container.querySelector('.mine-inventory-close');
  closeBtn.addEventListener('click', () => toggleInventoryUI());
  
  // Add craft button handler
  const craftBtn = container.querySelector('#mine-craft-btn');
  craftBtn.addEventListener('click', () => openCraftingMenu());
  
  // Initial update
  updateInventoryUI();
}

// Update inventory UI with current resources
function updateInventoryUI() {
  if (!inventoryUI || !playerData) return;
  
  // Update enchantment display
  const enchantmentSection = inventoryUI.querySelector('#mine-current-enchantment');
  if (enchantmentSection) {
    // Check if Haste is active (show it prominently)
    if (playerData.hasteEffect && playerData.hasteEffect.remainingMines > 0) {
      const bookImgSrc = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
      const remaining = playerData.hasteEffect.remainingMines;
      const total = ENCHANTMENTS.haste.mineCount;
      const percentage = (remaining / total) * 100;
      enchantmentSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; position: relative;">
          <img src="${bookImgSrc}" style="width: 20px; height: 20px; image-rendering: pixelated;" />
          <div style="flex: 1;">
            <div style="font-weight: bold; color: #FFD700;">⚡ ${ENCHANTMENTS.haste.name} - ${ENCHANTMENTS.haste.description}</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <div style="flex: 1; height: 8px; background: rgba(0,0,0,0.8); border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); overflow: hidden;">
                <div style="height: 100%; background: linear-gradient(90deg, #FFD700, #FFA500); border-radius: 3px; width: ${percentage}%; transition: width 0.3s ease;"></div>
              </div>
              <div style="font-size: 12px; color: white; font-weight: bold; text-shadow: 1px 1px 2px black; min-width: 30px;">${remaining}</div>
            </div>
          </div>
        </div>
      `;
      enchantmentSection.style.display = 'block';
    } else if (playerData.toolEnchantment && ENCHANTMENTS[playerData.toolEnchantment]) {
      const enchant = ENCHANTMENTS[playerData.toolEnchantment];
      const bookImgSrc = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
      enchantmentSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${bookImgSrc}" style="width: 20px; height: 20px; image-rendering: pixelated;" />
          <div style="font-weight: bold; color: #FFD700;">${enchant.name} - ${enchant.description}</div>
        </div>
      `;
      enchantmentSection.style.display = 'block';
    } else {
      const bookImgSrc = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
      enchantmentSection.innerHTML = `
        <div style="color: #ffffff; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; text-shadow: 1px 1px 0 #000000;">
          <img src="${bookImgSrc}" style="width: 16px; height: 16px; image-rendering: pixelated; opacity: 0.5;" /> No Enchantment
        </div>
      `;
      enchantmentSection.style.display = 'block';
    }
  }
  
  const grid = inventoryUI.querySelector('#mine-inventory-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  // Get all resources and craftable items (13 slots: 8 resources + 5 craftable items)
  const resourceKeys = ['coal', 'iron', 'gold', 'redstone', 'lapis', 'emerald', 'diamond', 'netherite', 'torch', 'redstone_lamp', 'beacon', 'golden_apple', 'diamond_sword'];
  
  resourceKeys.forEach(resourceKey => {
    // Check if it's a regular resource or craftable item
    const resource = RESOURCES[resourceKey] || CRAFTABLE_ITEMS[resourceKey];
    if (!resource) return;
    
    // For craftable items, check craftedItems; for resources, check inventory
    // Diamond sword is special - stored in playerData.diamond_sword
    const isCraftable = !!CRAFTABLE_ITEMS[resourceKey];
    let amount;
    if (resourceKey === 'diamond_sword') {
      amount = playerData.diamond_sword || 0;
    } else {
      amount = isCraftable 
        ? (playerData.craftedItems?.[resourceKey] || 0)
        : (playerData.inventory?.[resourceKey] || 0);
    }
    const isEmpty = amount === 0;
    
    const slot = document.createElement('div');
    slot.className = `mine-inventory-slot ${isEmpty ? 'empty' : ''}`;
    
    if (!isEmpty) {
      // Load ui slot background (webp)
      try {
        const slotImgSrc = chrome.runtime.getURL('assets/ui/inventory_slot.webp');
        slot.style.backgroundImage = `url('${slotImgSrc}')`;
      } catch (e) {
        // Extension context invalidated
      }
      
      // Determine the correct folder for the image
      const folder = CRAFTABLE_ITEMS[resourceKey] ? CRAFTABLE_ITEMS[resourceKey].folder : 'resources';
      
      // Try to load resource/item image
      createImageWithFallback(`assets/${folder}`, resource.file, (imgSrc) => {
        // Check if this craftable item is currently active
        let durationBar = '';
        if (isCraftable) {
          const item = CRAFTABLE_ITEMS[resourceKey];
          let activeEffect = null;
          
          // Diamond sword shows uses remaining
          if (resourceKey === 'diamond_sword' && amount > 0) {
            const remaining = amount;
            const total = item.uses;
            const percentage = (remaining / total) * 100;
            activeEffect = { remaining, total, percentage, label: `${remaining}/${total}` };
          }
          // Check which effect is active
          else if (item.effect === 'safe_zone' && playerData.safeZone?.remainingMines > 0) {
            // Torch uses mine count instead of time
            const remaining = playerData.safeZone.remainingMines;
            const total = item.mineCount;
            const percentage = (remaining / total) * 100;
            activeEffect = { remaining, total, label: `${remaining}` };
          } else if (item.effect === 'xp_boost' && playerData.xpBoost?.endTime) {
            const remainingTime = Math.max(0, playerData.xpBoost.endTime - Date.now());
            const percentage = (remainingTime / item.duration) * 100;
            const timeLeft = Math.ceil(remainingTime / 1000);
            activeEffect = { remaining: remainingTime, total: item.duration, percentage, label: `${timeLeft}s` };
          } else if (item.effect === 'double_drops' && playerData.doubleDrops?.remainingMines > 0) {
            // Beacon uses mine count instead of time
            const remaining = playerData.doubleDrops.remainingMines;
            const total = item.mineCount;
            const percentage = (remaining / total) * 100;
            activeEffect = { remaining, total, label: `${remaining}` };
          }
          
          if (activeEffect && activeEffect.remaining > 0) {
            const percentage = activeEffect.percentage || ((activeEffect.remaining / activeEffect.total) * 100);
            durationBar = `
              <div style="position: absolute; bottom: 20px; left: 2px; right: 2px; height: 5px; background: rgba(0,0,0,0.8); border-radius: 2px; border: 1px solid rgba(255,255,255,0.3);">
                <div style="height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); border-radius: 2px; width: ${percentage}%; transition: width 0.3s ease;"></div>
              </div>
              <div style="position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%); font-size: 9px; color: white; text-shadow: 1px 1px 2px black, -1px -1px 2px black; font-weight: bold; background: rgba(0,0,0,0.6); padding: 1px 4px; border-radius: 2px;">${activeEffect.label}</div>
            `;
          }
        }
        
        if (imgSrc) {
          slot.innerHTML = `
            <img src="${imgSrc}" class="mine-inventory-icon" alt="${resource.name}">
            <div class="mine-inventory-count">${amount}</div>
            <div class="mine-inventory-tooltip">${resource.name}</div>
            ${durationBar}
          `;
        } else {
          slot.innerHTML = `
            <div class="mine-inventory-count">${amount}</div>
            <div class="mine-inventory-tooltip">${resource.name}</div>
            ${durationBar}
          `;
        }
        
        // Add click handler for craftable items to activate them
        if (isCraftable && amount > 0) {
          slot.style.cursor = 'pointer';
          slot.addEventListener('click', async () => {
            await useCraftedItem(resourceKey);
          });
        }
      });
    } else {
      // Empty slot with UI background (webp)
      try {
        const slotImgSrc = chrome.runtime.getURL('assets/ui/inventory_slot.webp');
        slot.style.backgroundImage = `url('${slotImgSrc}')`;
      } catch (e) {
        // Extension context invalidated
      }
      slot.title = resource.name;
    }
    
    grid.appendChild(slot);
  });
  
  // Update enchantment inventory section
  const enchantGrid = inventoryUI.querySelector('#mine-enchantment-inventory');
  if (enchantGrid) {
    enchantGrid.innerHTML = '';
    
    // Always show 4 enchantment slots (2x2 grid)
    for (let i = 0; i < 4; i++) {
      const enchantData = playerData.enchantmentInventory?.[i];
      const enchantSlot = document.createElement('div');
      
      if (enchantData) {
        const enchant = ENCHANTMENTS[enchantData.type];
        if (!enchant) continue;
        
        const isActive = playerData.activeEnchantmentIndex === i;
        const durabilityPercent = (enchantData.durability / enchant.durability) * 100;
        
        enchantSlot.className = `mine-inventory-slot mine-enchant-slot ${isActive ? 'active' : ''}`;
        enchantSlot.style.cursor = 'pointer';
        
        try {
          const slotImgSrc = chrome.runtime.getURL('assets/ui/inventory_slot.webp');
          enchantSlot.style.backgroundImage = `url('${slotImgSrc}')`;
        } catch (e) {}
        
        const bookImgSrc = chrome.runtime.getURL('assets/world-items/enchanted-book.gif');
        enchantSlot.innerHTML = `
          <img src="${bookImgSrc}" style="width: 28px; height: 28px; image-rendering: pixelated;" />
          <div class="mine-enchant-durability-bar">
            <div class="mine-enchant-durability-fill" style="width: ${durabilityPercent}%;"></div>
          </div>
          <div class="mine-inventory-tooltip">
            <div style="color: ${isActive ? '#FFD700' : '#DDD'};">${enchant.name} ${isActive ? '⚡' : ''}</div>
            <div style="color: #AAA; font-size: 9px;">${enchant.description}</div>
            <div style="color: #FFD700; font-size: 9px; margin-top: 2px;">${enchantData.durability}/${enchant.durability} uses</div>
            <div style="color: #88FF88; font-size: 9px; margin-top: 2px;">${isActive ? 'Active - Click to remove' : 'Click to activate'}</div>
          </div>
        `;
        
        enchantSlot.addEventListener('click', () => selectEnchantment(i));
      } else {
        // Empty slot
        enchantSlot.className = 'mine-inventory-slot mine-enchant-slot empty';
        try {
          const slotImgSrc = chrome.runtime.getURL('assets/ui/inventory_slot.webp');
          enchantSlot.style.backgroundImage = `url('${slotImgSrc}')`;
        } catch (e) {}
      }
      
      enchantGrid.appendChild(enchantSlot);
    }
  }
}

// Select/deselect enchantment
async function selectEnchantment(index) {
  if (playerData.activeEnchantmentIndex === index) {
    // Deselect
    playerData.activeEnchantmentIndex = null;
    playerData.toolEnchantment = null;
    showNotification('Enchantment removed', 1500);
  } else {
    // Select new enchantment
    const enchantData = playerData.enchantmentInventory[index];
    playerData.activeEnchantmentIndex = index;
    playerData.toolEnchantment = enchantData.type;
    const enchant = ENCHANTMENTS[enchantData.type];
    showNotification(`✨ ${enchant.name} activated!`, 2000);
  }
  await savePlayerData();
  updateInventoryUI();
}

// Update only the progress bars for active craftable items without rebuilding UI
function updateActiveDurabilityBars() {
  if (!inventoryUI) return;
  
  const grid = inventoryUI.querySelector('.mine-inventory-grid');
  if (!grid) return;
  
  // Find all slots with progress bars
  const slots = grid.querySelectorAll('.mine-inventory-slot');
  
  slots.forEach(slot => {
    const progressContainer = slot.querySelector('.mine-item-progress');
    if (!progressContainer) return;
    
    const progressBar = progressContainer.querySelector('.mine-progress-bar');
    const progressLabel = progressContainer.querySelector('.mine-progress-label');
    if (!progressBar || !progressLabel) return;
    
    // Determine which item this is by checking the slot's data or adjacent elements
    const itemName = slot.querySelector('.mine-item-name');
    if (!itemName) return;
    
    const nameText = itemName.textContent.trim();
    
    // Update torch progress (mine count based)
    if (nameText === 'Torch' && playerData.safeZone) {
      const remaining = playerData.safeZone.remainingMines || 0;
      const total = 25;
      const percentage = (remaining / total) * 100;
      progressBar.style.width = `${percentage}%`;
      progressLabel.textContent = `${remaining} mines`;
    }
    
    // Update redstone lamp progress (time based)
    else if (nameText === 'Redstone Lamp' && playerData.xpBoost) {
      const now = Date.now();
      const endTime = playerData.xpBoost.endTime || now;
      const remaining = Math.max(0, endTime - now);
      const total = 120000; // 2 minutes
      const percentage = (remaining / total) * 100;
      const seconds = Math.ceil(remaining / 1000);
      progressBar.style.width = `${percentage}%`;
      progressLabel.textContent = `${seconds}s`;
    }
    
    // Update beacon progress (mine count based)
    else if (nameText === 'Beacon' && playerData.doubleDrops) {
      const remaining = playerData.doubleDrops.remainingMines || 0;
      const total = 50;
      const percentage = (remaining / total) * 100;
      progressBar.style.width = `${percentage}%`;
      progressLabel.textContent = `${remaining} mines`;
    }
  });
}

// Toggle inventory visibility
async function toggleInventoryUI() {
  if (!inventoryUI) {
    createInventoryUI();
  }
  
  inventoryVisible = !inventoryVisible;
  
  if (inventoryVisible) {
    // Position inventory relative to toggle button
    await positionInventoryRelativeToToggle();
    updateInventoryUI();
    inventoryUI.classList.add('visible');
    
    // Start updating only progress bars every second if there are active effects
    if (inventoryUpdateInterval) clearInterval(inventoryUpdateInterval);
    inventoryUpdateInterval = setInterval(() => {
      if (inventoryVisible && (playerData.safeZone || playerData.xpBoost || playerData.doubleDrops)) {
        updateActiveDurabilityBars();
      }
    }, 1000);
  } else {
    inventoryUI.classList.remove('visible');
    
    // Stop the update interval when inventory is closed
    if (inventoryUpdateInterval) {
      clearInterval(inventoryUpdateInterval);
      inventoryUpdateInterval = null;
    }
  }
  
  // Update inventory button active state
  const shadowHost = document.querySelector('#mine-toggle-host');
  if (shadowHost && shadowHost.shadowRoot) {
    const inventoryToggle = shadowHost.shadowRoot.querySelector('#mineInventoryToggle');
    if (inventoryToggle) {
      if (inventoryVisible) {
        inventoryToggle.classList.add('active');
      } else {
        inventoryToggle.classList.remove('active');
      }
    }
  }
}

// Alias for button click
function toggleInventory() {
  toggleInventoryUI();
}

// Position inventory relative to toggle button
async function positionInventoryRelativeToToggle() {
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || { togglePosition: 'bottom-left' };
  const position = currentSettings.togglePosition;
  
  // Get toggle button position
  const shadowHost = document.querySelector('#mine-toggle-host');
  if (!shadowHost || !shadowHost.shadowRoot) return;
  
  const inventoryToggleBtn = shadowHost.shadowRoot.querySelector('#mineInventoryToggle');
  if (!inventoryToggleBtn) return;
  
  const toggleRect = inventoryToggleBtn.getBoundingClientRect();
  const gap = 10; // 10px gap
  
  // Reset all positioning
  inventoryUI.style.top = '';
  inventoryUI.style.bottom = '';
  inventoryUI.style.left = '';
  inventoryUI.style.right = '';
  
  // Determine if left or right side
  const isLeft = position.includes('left');
  const isTop = position.includes('top');
  
  if (isLeft) {
    // Position to the right of inventory icon
    inventoryUI.style.left = `${toggleRect.right + gap}px`;
  } else {
    // Position to the left of inventory icon
    inventoryUI.style.right = `${window.innerWidth - toggleRect.left + gap}px`;
  }
  
  if (isTop) {
    // Expand downward from top
    inventoryUI.style.top = `${toggleRect.top}px`;
  } else {
    // Expand upward from bottom
    inventoryUI.style.bottom = `${window.innerHeight - toggleRect.bottom}px`;
  }
}

// Open crafting menu
function openCraftingMenu() {
  // Remove existing menu if any
  const existingMenu = document.querySelector('.mine-crafting-menu');
  if (existingMenu) {
    existingMenu.remove();
    return;
  }
  
  const menu = document.createElement('div');
  menu.className = 'mine-crafting-menu';
  menu.innerHTML = `
    <div class="mine-crafting-close">X</div>
    <div class="mine-crafting-header">🔨 Crafting</div>
    <div class="mine-crafting-recipes" id="mine-crafting-recipes"></div>
  `;
  
  document.body.appendChild(menu);
  
  // Add close handler
  menu.querySelector('.mine-crafting-close').addEventListener('click', () => menu.remove());
  
  // Populate recipes
  updateCraftingRecipes();
}

// Update crafting recipes display
function updateCraftingRecipes() {
  const recipesContainer = document.querySelector('#mine-crafting-recipes');
  if (!recipesContainer) return;
  
  recipesContainer.innerHTML = '';
  
  Object.keys(CRAFTABLE_ITEMS).forEach(itemKey => {
    const item = CRAFTABLE_ITEMS[itemKey];
    const recipe = item.recipe;
    
    // Check if player has enough resources
    let canCraft = true;
    const resourcesHTML = [];
    
    for (const [resource, amount] of Object.entries(recipe)) {
      const playerAmount = (playerData.inventory && playerData.inventory[resource]) || 0;
      const hasEnough = playerAmount >= amount;
      if (!hasEnough) canCraft = false;
      
      const resourceData = RESOURCES[resource];
      resourcesHTML.push({ resource, amount, playerAmount, hasEnough, resourceData });
    }
    
    const recipeDiv = document.createElement('div');
    recipeDiv.className = `mine-craft-recipe ${canCraft ? 'available' : 'disabled'}`;
    
    // Load item image from correct folder
    const itemFolder = item.folder || 'items';
    createImageWithFallback(`assets/${itemFolder}`, item.file, (itemImgSrc) => {
      const itemImg = itemImgSrc ? `<img src="${itemImgSrc}" alt="${item.name}">` : '';
      
      // Build resources section with icons
      let resourcesSection = '<div class="mine-craft-resources">';
      
      resourcesHTML.forEach(({ resource, amount, playerAmount, hasEnough, resourceData }) => {
        const resourceFile = resourceData?.file || resource;
        const iconSrc = chrome.runtime.getURL(`assets/resources/${resourceFile}.png`);
        const statusClass = hasEnough ? 'enough' : 'insufficient';
        
        resourcesSection += `
          <div class="mine-craft-resource-item ${statusClass}">
            <img src="${iconSrc}" alt="${resource}">
            <span>${playerAmount}/${amount} ${resourceData?.name || resource}</span>
          </div>
        `;
      });
      
      resourcesSection += '</div>';
      
      recipeDiv.innerHTML = `
        <div class="mine-craft-item-icon">${itemImg}</div>
        <div class="mine-craft-item-info">
          <div class="mine-craft-item-name">${item.name}</div>
          <div class="mine-craft-item-desc">${item.description}</div>
          ${resourcesSection}
        </div>
      `;
      
      // Add click handler
      if (canCraft) {
        recipeDiv.addEventListener('click', () => craftItem(itemKey));
      }
    });
    
    recipesContainer.appendChild(recipeDiv);
  });
}

// Craft an item
async function craftItem(itemKey) {
  const item = CRAFTABLE_ITEMS[itemKey];
  if (!item) return;
  
  // Check resources again
  for (const [resource, amount] of Object.entries(item.recipe)) {
    const playerAmount = (playerData.inventory && playerData.inventory[resource]) || 0;
    if (playerAmount < amount) {
      showNotification(`Not enough ${RESOURCES[resource]?.name || resource}!`, 2000);
      return;
    }
  }
  
  // Deduct resources
  for (const [resource, amount] of Object.entries(item.recipe)) {
    playerData.inventory[resource] -= amount;
  }
  
  // Add crafted item - diamond sword is special, stored separately
  if (itemKey === 'diamond_sword') {
    playerData.diamond_sword = (playerData.diamond_sword || 0) + item.uses;
    showNotification(`⚔️ Crafted ${item.name}! (${item.uses} uses)`, 2000);
  } else {
    if (!playerData.craftedItems) playerData.craftedItems = {};
    if (!playerData.craftedItems[itemKey]) playerData.craftedItems[itemKey] = 0;
    playerData.craftedItems[itemKey]++;
    showNotification(`✨ Crafted ${item.name}! ✨`, 2000);
  }
  
  await savePlayerData();
  
  // Execute item effect (for instant items like golden apple)
  if (itemKey !== 'diamond_sword') {
    executeItemEffect(itemKey);
  }
  
  // Update displays
  updateInventoryUI();
  updateCraftingRecipes();
}

// Use a crafted item from inventory
async function useCraftedItem(itemKey) {
  const item = CRAFTABLE_ITEMS[itemKey];
  if (!item) return;
  
  // Check if player has the item
  if (!playerData.craftedItems?.[itemKey] || playerData.craftedItems[itemKey] <= 0) {
    showNotification('❌ No items to use!', 2000);
    return;
  }
  
  // Prevent using if effect is already active
  if (item.effect === 'safe_zone' && playerData.safeZone?.remainingMines > 0) {
    showNotification(`🔥 Torch is already active! (${playerData.safeZone.remainingMines} mines left)`, 2000);
    return;
  }
  if (item.effect === 'xp_boost' && playerData.xpBoost?.endTime > Date.now()) {
    const remaining = Math.ceil((playerData.xpBoost.endTime - Date.now()) / 1000);
    showNotification(`💡 XP Boost is already active! (${remaining}s left)`, 2000);
    return;
  }
  if (item.effect === 'double_drops' && playerData.doubleDrops?.remainingMines > 0) {
    showNotification(`🔷 Beacon is already active! (${playerData.doubleDrops.remainingMines} mines left)`, 2000);
    return;
  }
  
  // Diamond sword is equipped, not "used" - just show status
  if (item.effect === 'warden_slayer') {
    const remaining = playerData.diamond_sword || 0;
    showNotification(`⚔️ Diamond Sword equipped! (${remaining} uses remaining)`, 2000);
    return;
  }
  
  // For instant effects (like golden apple), consume immediately
  if (item.effect === 'instant_xp') {
    playerData.craftedItems[itemKey]--;
  }
  // For duration-based effects (torch, lamp, beacon), keep visible while active
  // They'll be consumed when the effect ends
  
  // Execute the effect
  await executeItemEffect(itemKey);
  
  // Save and update UI
  await savePlayerData();
  updateInventoryUI();
  
  showNotification(`✨ Used ${item.name}!`, 2000);
}

// Execute crafted item effects
async function executeItemEffect(itemKey) {
  const item = CRAFTABLE_ITEMS[itemKey];
  if (!item) return;
  
  switch (item.effect) {
    case 'safe_zone':
      activateSafeZone(item.mineCount);
      break;
      
    case 'xp_boost':
      activateXPBoost(item.duration, item.multiplier);
      break;
      
    case 'double_drops':
      activateDoubleDrops(item.mineCount);
      break;
      
    case 'instant_xp':
      playerData.xp += item.xpAmount;
      showNotification(`🍎 +${item.xpAmount} XP!`, 2000);
      await savePlayerData();
      break;
  }
}

// Activate safe zone (reduced Warden spawns)
function activateSafeZone(mineCount) {
  if (playerData.safeZone?.timeoutId) {
    clearTimeout(playerData.safeZone.timeoutId);
  }
  
  // Store remaining mine count instead of time
  playerData.safeZone = { remainingMines: mineCount };
  showNotification(`🔥 Safe zone active for ${mineCount} mines!`, 3000);
}

// Activate XP boost
function activateXPBoost(duration, multiplier) {
  if (playerData.xpBoost?.timeoutId) {
    clearTimeout(playerData.xpBoost.timeoutId);
  }
  
  const endTime = Date.now() + duration;
  const timeoutId = setTimeout(async () => {
    playerData.xpBoost = null;
    // Consume the redstone lamp item
    if (playerData.craftedItems?.redstone_lamp > 0) {
      playerData.craftedItems.redstone_lamp--;
    }
    await savePlayerData();
    showNotification('💡 XP boost ended!', 2000);
  }, duration);
  
  playerData.xpBoost = { endTime, timeoutId, multiplier };
  showNotification(`💡 ${multiplier}x XP for ${duration / 1000}s!`, 3000);
}

// Activate double drops
function activateDoubleDrops(mineCount) {
  // Set remaining mine count for beacon
  playerData.doubleDrops = { remainingMines: mineCount };
  showNotification(`🔷 2x drops for ${mineCount} mines!`, 3000);
}

// Activate haste effect
function activateHaste(mineCount) {
  // Set remaining mine count for haste
  playerData.hasteEffect = { remainingMines: mineCount };
  showNotification(`⚡ Haste active for ${mineCount} mines!`, 3000);
}

// Initialize with domain block check
(async () => {
  // Check if domain is blocked first
  const blocked = await isDomainBlocked();
  if (blocked) {
    debugLog('Mine Anything: Domain is blocked, extension disabled');
    return; // Exit early, don't initialize ANYTHING
  }
  
  // Normal initialization
  await initPlayerData();
  addHoverListeners();
  checkSVGCracks(); // Check if SVG cracks are available
  
  // Create toggle button when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggleButton);
  } else {
    // DOM already loaded
    setTimeout(createToggleButton, 100);
  }
  
  // Create depth indicator
  createDepthIndicator();
  
  // Watch for page height changes (handles infinite scroll and lazy loading)
  // Throttled to prevent excessive recalculations
  let lastKnownHeight = getCurrentDocumentHeight();
  let heightCheckPending = false;
  
  const heightObserver = new MutationObserver(() => {
    if (heightCheckPending) return;
    
    heightCheckPending = true;
    setTimeout(() => {
      const currentHeight = getCurrentDocumentHeight();
      if (currentHeight !== lastKnownHeight) {
        lastKnownHeight = currentHeight;
        
        // Trigger depth indicator update when page grows
        window.dispatchEvent(new Event('scroll'));
        
        // Note: Sculk blocks are now element-relative, no repositioning needed
      }
      heightCheckPending = false;
    }, 500); // Throttle to once per 500ms
  });
  
  // Observe document body for changes that might affect height
  heightObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  // Initialize sculk blocks when page loads
  window.addEventListener('load', () => {
    // Wait a bit for page to fully render
    setTimeout(addSculkBlocks, 1000);
  });

  // Add sculk blocks once when entering Deep Dark zone (Y: -45)
  let sculkCheckActive = true;
  function checkScrollForSculk() {
    if (!sculkCheckActive) return;
    
    const depthInfo = getCurrentDepthInfo();
    // Add sculk when entering Deep Dark (Y: -45 and below)
    if (depthInfo.yCoord <= -45) {
      addSculkBlocks();
      sculkCheckActive = false; // Only generate once
      window.removeEventListener('scroll', checkScrollForSculk);
    }
  }
  window.addEventListener('scroll', checkScrollForSculk);

  // Create inventory UI
  createInventoryUI();

  // Keyboard shortcut: Hold custom keys to temporarily activate mining
  document.addEventListener('keydown', (e) => {
    currentlyPressedKeys.add(e.key);
    
    // Check if 'I' key pressed to toggle inventory
    // Ignore if user is typing in an input field
    if (e.key === 'i' || e.key === 'I') {
      const activeElement = document.activeElement;
      
      // Check if typing in regular inputs
      let isTyping = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable === true ||
        activeElement.getAttribute('contenteditable') === 'true' ||
        activeElement.getAttribute('role') === 'textbox' ||
        activeElement.getAttribute('role') === 'searchbox' ||
        activeElement.getAttribute('role') === 'search'
      );
      
      // Check for custom web components with inputs (Reddit, etc.)
      if (!isTyping && activeElement) {
        // Check if it's a custom element that might contain an input
        const tagName = activeElement.tagName.toLowerCase();
        if (tagName.includes('input') || 
            tagName.includes('search') || 
            tagName.includes('text') ||
            tagName.includes('composer') ||
            tagName.includes('editor') ||
            tagName.startsWith('shreddit-') ||
            tagName.startsWith('faceplate-')) {
          isTyping = true;
        }
        
        // Check Shadow DOM for inputs
        if (!isTyping && activeElement.shadowRoot) {
          const shadowInput = activeElement.shadowRoot.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
          if (shadowInput) {
            isTyping = true;
          }
        }
      }
      
      if (isTyping) {
        // Don't do anything if user is typing
        return;
      }
      
      if (!e.repeat) {
        e.preventDefault(); // Prevent 'i' from being typed
        toggleInventoryUI();
      }
      return;
    }
    
    // Check if all mining keys are pressed
    const allKeysPressed = isShortcutPressed();
    
    if (allKeysPressed && !e.repeat) {
      // Don't interfere if toggle button has mining persistently enabled
      if (isToggledOn) return;
      
      miningEnabled = true;
      keepStylesHidden = true;
      showToolCursor();
      
      // Visually activate the switch
      const shadowHost = document.querySelector('#mine-toggle-host');
      if (shadowHost && shadowHost.shadowRoot) {
        const toggleSwitch = shadowHost.shadowRoot.querySelector('#mineToggleSwitch');
        if (toggleSwitch) {
          toggleSwitch.classList.add('active');
        }
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    currentlyPressedKeys.delete(e.key);
    
    // Check if any mining key was released
    const anyMiningKeyReleased = miningKeys.includes(e.key);
    
    if (anyMiningKeyReleased) {
      // Only disable if it wasn't toggled on via button
      if (!isToggledOn) {
        miningEnabled = false;
        hideToolCursor();
        
        // Visually deactivate the switch
        const shadowHost = document.querySelector('#mine-toggle-host');
        if (shadowHost && shadowHost.shadowRoot) {
          const toggleSwitch = shadowHost.shadowRoot.querySelector('#mineToggleSwitch');
          if (toggleSwitch) {
            toggleSwitch.classList.remove('active');
          }
        }
      }
    }
  });

  debugLog('Mine Anything extension loaded!');
  const displayKey = miningKeys[0] === 'Alt' ? (isMac ? 'Option' : 'Alt') : miningKeys.join('+');
  debugLog(`💡 Hold ${displayKey} to activate mining mode, or click Mining button for persistent mode!`);
  debugLog('💡 Click RESET (↻) to restore all mined elements.');
})();

} // End of sandbox check
