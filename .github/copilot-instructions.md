# Mine Anything - Chrome Extension Development Guide

## Architecture Overview

**Core Components:**
- `content.js` (5900+ lines): Main game engine injected into all web pages
- `popup.js` (830 lines): Extension popup UI showing stats/settings
- `newtab.js`: Optional custom new tab page with mining stats
- `content.css`: All extension UI styles (non-intrusive to host pages)

**Data Flow:**
1. User mines element → `content.js` calculates XP/drops → Updates `playerData`
2. `playerData` saved to `chrome.storage.local` → Synced across all tabs
3. Popup reads same storage → Displays current state
4. All game state in single `playerData` object (no backend/API)

## Core Game Mechanics - Function Reference

### Overlay Management System (Lines 52-130)
**Purpose**: Prevents multiple overlays from stacking and creating visual confusion.

**Priority System**:
- Warden: 100 (highest - always takes precedence)
- Villager: 50 (interactive trade modal)
- Chest: 30 (reward collection)
- Enchantment: 20 (auto-collects after 1.5s)
- Pet: 10 (lowest - auto-collects after 1.5s)

**Key Functions**:
- `dismissCurrentOverlay(newType, newPriority)` - Dismisses current overlay if new one has equal/higher priority
- `registerOverlay(element, type)` - Registers new overlay and handles automatic cleanup
- Uses MutationObserver to track when overlays are removed from DOM

**Behavior**:
- New overlay with higher/equal priority dismisses current overlay with smooth fade-out
- New overlay with lower priority is blocked (returns false, spawn aborted)
- Example: Chest spawning while villager is open → villager fades out, chest appears
- Example: Pet spawning while warden is active → pet spawn is blocked

### Mining System (Lines 1260-1450)
**Entry Point**: `startMining(element)` - Line 1260
- Creates crack overlay with 10 stages
- Shows floating tool cursor following mouse
- Calculates mining time based on tool: `TOOLS[currentTool].miningTime`
- Position-based XP: `calculatePositionXP(element)` - Line 1320
  - Top 30%: 1 XP, 31-50%: 2 XP, 51-80%: 3 XP, Bottom 20%: 5 XP
  - Ad detection: `isElementAd(element)` - Line 1405 (doubles XP)
- **Complete Mining**: `completeMining(element)` - Line 1380
  - Hides element, awards XP, spawns drops/mobs
  - Calls `checkToolUpgrade()` - Line 1193 to auto-upgrade tools

**Restoration**: `restoreMinedElements()` - Line 4875
- Loops through `minedElements` Set and restores display property
- Called when mining toggled off

### Tool Progression (Lines 86-93, 1193-1210)
**Data Structure**: `TOOLS` object - Line 86
```javascript
TOOLS = {
  hand: { name: 'Hand', xpRequired: 0, miningTime: 5 },
  wooden_axe: { xpRequired: 100, miningTime: 4 },
  // ... up to netherite_axe: { xpRequired: 100000, miningTime: 0.5 }
}
```

**Upgrade Logic**: `checkToolUpgrade()` - Line 1193
- Iterates tools array backwards to find highest unlocked tool
- Compares `playerData.xp >= TOOLS[key].xpRequired`
- Shows notification if tool upgraded
- **Tool Display**: `TOOLS_DISPLAY` maps tool keys to cursor filenames

### Resource Collection (Lines 305-355, 1175-1192)
**Resource Definitions**: `RESOURCES` - Line 305
```javascript
RESOURCES = {
  coal: { name: 'Coal', file: 'coal', dropRate: 0.4, colorRange: {...} },
  // 8 total resources with color-based drop logic
}
```

**Drop Mechanics**: `collectResource(minedElement)` - Line 1175
1. Extracts dominant color from element: `getDominantColor(element)`
2. Matches color to resource via HSL ranges in `colorRange`
3. Random roll against `dropRate`
4. Adds to `playerData.inventory[resourceKey]`
5. Shows floating notification with resource icon

**Storage**: All resources stored in `playerData.inventory = { coal: 0, iron: 0, diamond: 0, ... }`

### Mob System

#### Creeper (Lines 1950-2070)
**Spawn**: `spawnCreeper(element, dropType)` - Line 1950
- 10% spawn chance when mining
- Creates GIF container at element position
- 3-second countdown timer starts
- **Explosion**: `explodeCreeper(creeper)` - Line 2010
  - Finds 8-15 nearby elements with `findNearbyElements()`
  - Hides elements with explosion animation
  - Unless defused by Dennis pet or Cat pet

#### Zombie (Lines 1780-1890)
**Spawn**: `spawnZombie(element)` - Line 1780
- 5% spawn chance after mining
- Steals 100 XP: `playerData.xp -= 100`
- Shows walking GIF animation for 2 seconds
- **Defense**: Click zombie during animation to recover 50 XP

#### Villager (Lines 2145-2400)
**Spawn**: `spawnVillager()` - Line 2145
- 1-2% spawn chance, 1 per page max
- Shows modal with 3 random trades from `VILLAGER_TRADES`
- **Trade Types**: resource swaps, XP exchanges, tool upgrades
- **Trade Execution**: `executeVillagerTrade(tradeKey)` - Line 2320
  - Deducts resources, awards items/XP
  - Saves state and updates UI

### Pet System (Lines 145-210, 2075-2145)
**Pet Definitions**: `PETS` - Line 145
```javascript
PETS = {
  allay: { name: 'Allay', file: 'allay.gif', spawnRate: 0.03, effect: 'xp_bonus', bonus: 1 },
  // 6 total pets with unique effects
}
```

**Spawn Logic**: `checkPetSpawn(element)` - Line 2075
- Rolled after each successful mine
- 1 pet max per page: checks `pageSpawnedItems.pet`
- Looting enchantment doubles spawn rates
- **Collection**: `collectPet(petKey)` - Line 2110
  - Sets `playerData.pets[petKey].collected = true`
  - Increments `playerData.pets[petKey].count`
  - Pet effects activate immediately (XP bonus, time reduction)

**Active Effects**:
- Allay/Axolotl: Add bonus XP in `completeMining()`
- Toad/White Toad: Reduce mining time in `startMining()`
- Dennis: Prevents creeper explosions
- Cat: Prevents 5 creepers then runs away

### Enchantment System (Lines 95-145, 3035-3180)
**Enchantment Definitions**: `ENCHANTMENTS` - Line 95
```javascript
ENCHANTMENTS = {
  fortune: { name: 'Fortune', description: '+50% XP', xpMultiplier: 1.5 },
  efficiency: { description: '-30% mining time', timeMultiplier: 0.7 },
  unbreaking: { protectionUses: 3 }, // Protects tool from theft
  haste: { speedMultiplier: 0.5, mineCount: 20 }, // 50% faster for 20 mines
  // 7 total enchantments
}
```

**Spawn**: `spawnEnchantmentBook(element, enchantKey)` - Line 3035
- **Haste**: Tool-tier-based spawn rate
  - 33% for hand/wooden_axe/copper_axe (early game)
  - 10% for iron_axe and above (late game)
  - Checked first before other enchantments
- **Other enchantments**: ~0.02-0.05% chance per type
- 1 per page max: `pageSpawnedItems.enchantment`
- Shows floating enchanted book GIF
- **Collection**: `collectEnchantment(enchantKey)` - Line 3187
  - Haste: Activates immediately via `activateHaste()`, not added to inventory
  - Others: Added to `playerData.enchantmentInventory`
- **Application**: `applyEnchantment(enchantKey)` - Line 3125
  - Sets `playerData.toolEnchantment = enchantKey`
  - Resets `playerData.unbreakingUses = 0`
  - Enchantment lost if tool stolen (unless Unbreaking protects)

**Effect Integration**:
- Fortune: XP multiplied in `completeMining()`
- Efficiency: Mining time reduced in `startMining()`
- Silk Touch: Ad XP multiplier changed from 2x to 3x
- Looting: Pet spawn rates doubled in `checkPetSpawn()`
- **Haste**: Mining time multiplied by 0.5 in `startMining()`, decrements in `completeMining()`, displays in inventory UI enchantment section

### Treasure Chest System (Lines 2400-2520)
**Spawn**: `spawnTreasureChest(element)` - Line 2400
- 0.5-1.5% spawn rate, 1 per page max
- Higher chance in bottom 20% (deep zone)
- Shows golden chest GIF at element position
- **Opening**: Drops 1-3 diamonds instantly
- Awards to `playerData.inventory.diamond`

### Warden Deep Zone System (Lines 2680-3030)

**Warning System**: Lines 2680-2710
- Tracks footer mining count in deep zone (bottom 20%)
- Progressive warnings at 3, 6, 9, 12 footer mines
- Messages: "approaches..." → "advances..." → "draws close..." → "emerges!"
- **Spawn Trigger**: `spawnWarden()` - Line 2710 after 15+ footer mines

**Overlay Creation**: `createWardenOverlay(penaltyMessage)` - Line 2800
```javascript
// Structure:
overlay (fullscreen black)
  └─ contentContainer (flex column, centered)
      ├─ warningText ("THE WARDEN HAS EMERGED")
      ├─ penaltyDiv (horizontal: ⚠️ icon + 32px img + text)
      ├─ instructions ("Find Diamond Sword...")
      ├─ escapeButton ("Retreat to Surface" - reloads page)
      ├─ killButton (if has diamond_sword > 0)
      └─ wardenContainer (400x400px, spawn GIF → spawned GIF after 4s)
```

**Penalty Application**: `applyWardenPenalty()` - Line 2715
Priority order:
1. Steals up to 4 diamonds from `playerData.inventory.diamond`
2. Steals random collected pet
3. Downgrades tool (Unbreaking can protect 3 times)
4. Steals 500 XP (or 20% if less than 500)

**Diamond Sword Mechanic**:
- Crafted from 15 diamonds
- Stored in `playerData.diamond_sword` (number, not craftedItems)
- 3 uses total, decrements on each warden defeat
- Attack button disabled after click via `dataset.attacking = 'true'`
- Rewards +1000 XP per defeat

### Crafting System (Lines 357-405, 5491-5670)

**Item Definitions**: `CRAFTABLE_ITEMS` - Line 357
```javascript
CRAFTABLE_ITEMS = {
  torch: {
    recipe: { coal: 8, gold: 2 },
    mineCount: 25, // Lasts 25 mines
    effect: 'safe_zone' // 50% less mob spawns
  },
  redstone_lamp: {
    recipe: { redstone: 12, gold: 4 },
    duration: 120000, // 2 minutes in ms
    effect: 'xp_boost',
    multiplier: 2.0
  },
  beacon: {
    recipe: { diamond: 2, iron: 10, gold: 5 },
    mineCount: 50,
    effect: 'double_drops' // 2x resources
  },
  golden_apple: {
    recipe: { gold: 8, emerald: 1 },
    effect: 'instant_xp',
    xpAmount: 50
  },
  diamond_sword: {
    recipe: { diamond: 15 },
    uses: 3,
    effect: 'warden_slayer'
  }
}
```

**Recipe Display**: `updateCraftingRecipes()` - Line 5491
- Horizontal layout: 64px icon box + info column + resources
- Checks `playerData.inventory` for each recipe requirement
- Available: Brown bg (#8B4513), solid border, hover slides right
- Disabled: Gray bg, dashed border, 50% opacity
- Resource badges: Green (enough) or Red (insufficient) with icons

**Crafting Execution**: `craftItem(itemKey)` - Line 5548
```javascript
1. Verify resources in playerData.inventory
2. Deduct recipe costs
3. If diamond_sword: playerData.diamond_sword += 3
   Else: playerData.craftedItems[itemKey]++
4. Execute effect (instant items only)
5. Save and update UI
```

**Item Usage**: `useCraftedItem(itemKey)` - Line 5595
- Checks active effects to prevent re-activation exploits
- Torch/Beacon: Activate mine-count based effects
- Lamp: Activate time-based XP boost
- Golden Apple: Instant XP (consumed immediately)
- Diamond Sword: Shows remaining uses notification

**Effect Activation**:
- `activateSafeZone(mineCount)` - Line 5673: Sets `playerData.safeZone.remainingMines`
- `activateXPBoost(duration, multiplier)` - Line 5688: Sets `playerData.xpBoost.endTime`
- `activateDoubleDrops(mineCount)` - Line 5704: Sets `playerData.doubleDrops.remainingMines`

### Achievement System (Lines 211-302, 2520-2645)

**Achievement Definitions**: `ACHIEVEMENTS` - Line 211
```javascript
ACHIEVEMENTS = {
  first_mine: {
    name: 'First Mine!',
    description: 'Mine your first element',
    icon: 'first_mine.png',
    requirement: { type: 'totalMined', value: 1 }
  },
  // 15 total achievements with various requirement types
}
```

**Check Logic**: `checkAchievements()` - Line 2520
- Called after every significant action (mining, pet collection, etc.)
- Iterates all achievements, checks `playerData.achievements[key].unlocked`
- **Requirement Types**:
  - `totalMined`: Total elements mined
  - `xpEarned`: Total XP threshold
  - `petCollected`: Specific pet obtained
  - `toolLevel`: Current tool unlocked
  - `hasDiamondSword`: Check `playerData.diamond_sword > 0`

**Notification**: `showAchievementNotification(achievement)` - Line 2429
- Creates overlay with achievement icon + title
- Gold border, glowing effect
- Auto-dismisses after 5 seconds

### Sculk Block System (Lines 3275-3400)

**Spawn Logic**: `addSculkBlocks()` - Line 3275
- Activates in bottom 20% of page (deep zone)
- Spawns 15-35 blocks based on page height
- **Block Placement**:
  1. Finds valid container elements (not extension UI)
  2. Positions absolute within container
  3. Uses `sculk.svg` from assets/Blocks/
  4. **Critical**: `pointer-events: none !important` - blocks are purely visual
- Spreading pattern with some randomness

**Visual Effects**:
- 50x50px blocks
- 80% opacity
- z-index: 2147483645 (below overlays, above content)

### Inventory UI System (Lines 5030-5310)

**UI Creation**: `createInventoryUI()` - Line 5030
- Creates persistent overlay (hidden by default)
- Keyboard shortcut: 'i' key toggles
- **Structure**:
```
mine-inventory-container (fixed overlay)
  ├─ mine-inventory-header (title + close)
  ├─ mine-current-enchantment (shows active enchantment)
  ├─ mine-inventory-content (flex row)
  │   ├─ mine-inventory-grid (4x4 grid, 16 slots)
  │   └─ mine-enchantment-inventory (2x2 grid, 4 slots)
  └─ mine-crafting-section
      ├─ mine-craft-button (opens crafting)
      └─ mine-crafting-menu (modal)
```

**Grid Population**: `updateInventoryUI()` - Line 5113
- **Slot Order**: `['coal', 'iron', 'gold', 'redstone', 'lapis', 'emerald', 'diamond', 'netherite', 'torch', 'redstone_lamp', 'beacon', 'golden_apple', 'diamond_sword']`
- Reads from `playerData.inventory` (resources) and `playerData.craftedItems`
- Diamond sword reads from `playerData.diamond_sword`
- **Durability Bars**: Show for active effects
  - Mine-count items: `${remaining}/${total}` with percentage bar
  - Time-based items: `${seconds}s` with percentage bar
  - Diamond sword: `${uses}/3` with percentage bar

**Click Handlers**: Lines 5240-5250
- Craftable items are clickable in inventory
- Calls `useCraftedItem(itemKey)` on click

## Iteration Instructions

### Adding New Resources
1. **Define in RESOURCES** (Line 305):
   ```javascript
   new_resource: {
     name: 'Display Name',
     file: 'filename', // Must match assets/resources/filename.png
     colorRange: { hueMin: X, hueMax: Y, satMin: Z, satMax: W, lightMin: A, lightMax: B },
     dropRate: 0.3 // 30% chance
   }
   ```
2. **Add PNG file**: `assets/resources/new_resource.png` (16x16 or 32x32 pixelated)
3. **Update manifest.json**: Already covered by `assets/resources/*.png` wildcard
4. **Add to inventory order** in `updateInventoryUI()` (Line 5147): Add to `resourceKeys` array
5. **Initialize in playerData**: Add to `inventory` object initialization (Line 940)

### Adding New Pets
1. **Define in PETS** (Line 145):
   ```javascript
   new_pet: {
     name: 'Display Name',
     file: 'pet_name.gif', // Must exist in assets/Pets/
     spawnRate: 0.02, // 2% base rate
     effect: 'xp_bonus|time_reduction|creeper_defense',
     bonus: 1, // For xp_bonus or time_reduction
     uses: 5 // Optional, for limited-use pets like Cat
   }
   ```
2. **Add asset**: `assets/Pets/pet_name.gif` (animated, ~64x64px)
3. **Implement effect**:
   - XP bonus: Add to `calculateBonusXP()` checks
   - Time reduction: Add to `startMining()` time calculation
   - Special: Add custom logic in appropriate function
4. **Update spawn logic**: Already handled in `checkPetSpawn()` loop

### Adding New Enchantments
1. **Define in ENCHANTMENTS** (Line 95):
   ```javascript
   new_enchant: {
     name: 'Enchantment Name',
     description: 'Effect description',
     icon: 'enchant_icon.gif', // Optional custom icon
     xpMultiplier: 1.5, // For XP effects
     timeMultiplier: 0.8, // For time effects
     dropMultiplier: 2.0, // For drop effects
     // Or custom properties for unique effects
   }
   ```
2. **Implement effect**:
   - XP: Modify `completeMining()` XP calculation
   - Time: Modify `startMining()` time calculation
   - Drops: Modify `collectResource()` logic
3. **Add spawn entry**: Enchantments spawn via `spawnEnchantmentBook()` - add to spawn rate checks

### Adding New Craftable Items
1. **Define in CRAFTABLE_ITEMS** (Line 357):
   ```javascript
   new_item: {
     name: 'Item Name',
     file: 'item_file', // Must match assets/items/item_file.png
     folder: 'items',
     description: 'Effect description',
     recipe: { coal: 10, iron: 5 }, // Resource requirements
     mineCount: 30, // For mine-count effects
     // OR duration: 60000, // For time-based effects (ms)
     effect: 'custom_effect_key',
     // Optional: multiplier, xpAmount, etc.
   }
   ```
2. **Add PNG file**: `assets/items/item_file.png`
3. **Implement effect**:
   - Add case in `executeItemEffect()` (Line 5625)
   - Create activation function (e.g., `activateCustomEffect()`)
   - Add active state check in `useCraftedItem()` to prevent exploits
4. **Add to inventory**: Include in `resourceKeys` array in `updateInventoryUI()`
5. **Add durability display**: If item has duration/mineCount, add logic in `updateInventoryUI()` active effect checks

### Adding New Mobs
1. **Create spawn function**: Follow pattern of `spawnZombie()` (Line 1780)
   ```javascript
   function spawnNewMob(element) {
     const mobContainer = document.createElement('div');
     mobContainer.className = 'mine-new-mob-container';
     // Position at element location
     // Add GIF image
     // Add interaction logic (click handlers, timers, etc.)
     // Apply penalty or effect
     document.body.appendChild(mobContainer);
   }
   ```
2. **Add GIF**: `assets/mobs/mob_name.gif`
3. **Integrate spawn**: Add to `completeMining()` spawn logic with rate check
4. **Add to extensionClasses**: Add `'mine-new-mob-container'` to `findMineableElement()` exclusion list

### Adding New Achievements
1. **Define in ACHIEVEMENTS** (Line 211):
   ```javascript
   achievement_key: {
     name: 'Achievement Name',
     description: 'How to unlock',
     icon: 'achievement_icon.png',
     requirement: {
       type: 'totalMined|xpEarned|petCollected|toolLevel|custom',
       value: 100 // Threshold value
     }
   }
   ```
2. **Add icon**: `assets/achievements/achievement_icon.png`
3. **Add check**: 
   - For existing types: Automatically checked in `checkAchievements()`
   - For custom types: Add case in `checkAchievements()` switch statement
4. **Update popup.js**: Add to ACHIEVEMENTS object (Lines 29-44) for popup display

## UI Design Patterns

### Overlay Structure (Established Pattern)
All fullscreen overlays follow this structure:
```javascript
const overlay = document.createElement('div');
overlay.id = 'mine-unique-overlay-id';
overlay.style.cssText = `
  position: fixed !important;
  top: 0 !important; left: 0 !important;
  width: 100vw !important; height: 100vh !important;
  background: rgba(0, 0, 0, 0.9) !important;
  z-index: 2147483646 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: auto !important;
`;
```
**Always**:
- Use `!important` on all styles to override site CSS
- High z-index (2147483646+)
- Flexbox for centering
- Use IDs for unique overlays, classes for repeated elements

### Button Design Pattern
```javascript
const button = document.createElement('div'); // Use div, not button element
button.style.cssText = `
  padding: 12px 25px !important;
  background: rgba(R, G, B, 0.3) !important;
  border: 2px solid #COLOR !important;
  color: #COLOR !important;
  font-family: 'Minecraft', monospace !important;
  font-size: 16px !important;
  cursor: pointer !important;
  border-radius: 4px !important;
  transition: all 0.3s !important;
`;
// Hover effects
button.addEventListener('mouseenter', () => {
  button.style.background = 'rgba(R, G, B, 0.5) !important';
  button.style.transform = 'scale(1.05)';
});
button.addEventListener('mouseleave', () => {
  button.style.background = 'rgba(R, G, B, 0.3) !important';
  button.style.transform = 'scale(1)';
});
```

### Notification Pattern
```javascript
const notification = document.createElement('div');
notification.className = 'mine-notification';
notification.textContent = 'Message text';
document.body.appendChild(notification);

setTimeout(() => {
  notification.style.opacity = '1';
  notification.style.transform = 'translateY(0)';
}, 10);

setTimeout(() => {
  notification.style.opacity = '0';
  notification.style.transform = 'translateY(-20px)';
  setTimeout(() => notification.remove(), 300);
}, duration);
```

### Compact Horizontal Info Box (Warden Penalty Style)
```javascript
const infoBox = document.createElement('div');
infoBox.style.cssText = `
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 12px 20px !important;
  background: rgba(139, 0, 0, 0.4) !important;
  border: 2px solid #ff0000 !important;
  border-radius: 6px !important;
  font-size: 14px !important;
`;
infoBox.innerHTML = `
  <span style="color: #ff6b6b; font-weight: bold;">⚠️ Label:</span>
  <img src="icon.png" style="width: 32px; height: 32px; image-rendering: pixelated;">
  <span>Description text</span>
`;
```

### Crafting Recipe Card Pattern
```html
<div class="mine-craft-recipe available|disabled">
  <div class="mine-craft-item-icon">
    <img src="item.png" style="width: 48px; height: 48px; image-rendering: pixelated;">
  </div>
  <div class="mine-craft-item-info">
    <div class="mine-craft-item-name">Item Name</div>
    <div class="mine-craft-item-desc">Description text</div>
    <div class="mine-craft-resources">
      <div class="mine-craft-resource-item enough|insufficient">
        <img src="resource.png" style="width: 16px; height: 16px;">
        <span>10/5 Resource</span>
      </div>
    </div>
  </div>
</div>
```
**CSS** (content.css Lines 913-1020):
- Available: Brown bg, solid border, slides right on hover
- Disabled: Gray bg, dashed border, no interaction
- Resource badges: Green (enough) / Red (insufficient)

### Durability Bar Pattern (Inventory Slots)
```javascript
const percentage = (remaining / total) * 100;
const durationBar = `
  <div style="position: absolute; bottom: 20px; left: 2px; right: 2px; height: 5px; background: rgba(0,0,0,0.8); border-radius: 2px; border: 1px solid rgba(255,255,255,0.3);">
    <div style="height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); border-radius: 2px; width: ${percentage}%; transition: width 0.3s ease;"></div>
  </div>
  <div style="position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%); font-size: 9px; color: white; text-shadow: 1px 1px 2px black; font-weight: bold; background: rgba(0,0,0,0.6); padding: 1px 4px; border-radius: 2px;">${label}</div>
`;
```

### Anti-Spam Button Pattern
```javascript
button.addEventListener('click', async () => {
  // Prevent spam clicking
  if (button.dataset.processing === 'true') return;
  button.dataset.processing = 'true';
  button.style.opacity = '0.5';
  button.style.pointerEvents = 'none';
  
  // Execute action
  await performAction();
  
  // Optional: Re-enable or remove
  // button.dataset.processing = 'false';
  // button.style.opacity = '1';
  // button.style.pointerEvents = 'auto';
});
```

## Critical Development Patterns

### Player Data Structure
```javascript
playerData = {
  xp, currentTool, inventory: {coal, iron, diamond, etc.},
  craftedItems: {torch, beacon, etc.}, diamond_sword: number,
  pets: {allay: {collected, count}, ...},
  toolEnchantment, unbreakingUses, stolenTool,
  safeZone: {remainingMines}, doubleDrops: {remainingMines},
  xpBoost: {endTime, multiplier}, achievements: {...}
}
```

**ALWAYS** use `playerData.inventory.diamond` (not `playerData.diamonds`)
**ALWAYS** call `await savePlayerData()` after mutations
**ALWAYS** call `updateInventoryUI()` after data changes to reflect in UI

### UI Element Protection
**Non-mineable elements** use `mine-` class prefix:
```javascript
// In findMineableElement() - Lines 1202-1250
const extensionClasses = [
  'mine-toggle-container', 'mine-inventory-slot', 
  'mine-crafting-menu', 'mine-zombie-container',
  'mine-warden-image', 'mine-notification', 'mine-xp-orb',
  'mine-particle', 'mine-explosion-container',
  'mine-chest-container', 'mine-pet-container',
  'mine-enchant-container', 'mine-creeper-container',
  // etc. - add new mob/UI containers here
];
```
**NEVER** use wildcard checks like `className.includes('mine-')` - too broad, breaks site functionality

### Image Loading Pattern
```javascript
createImageWithFallback(folder, filename, callback)
// Priority varies by folder:
// - 'resources': ['png', 'gif', ...] 
// - 'mobs': ['gif', 'png', ...]
// - default: ['png', 'gif', ...]
```
Always use `chrome.runtime.getURL()` for asset paths in injected content.

### Input Detection (Inventory Toggle)
```javascript
// Lines 5700-5745 - Prevents inventory from toggling while typing
function isTypingInInput() {
  const activeEl = document.activeElement;
  
  // Check regular inputs
  if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable) {
    return true;
  }
  
  // Check Shadow DOM (for Reddit, etc.)
  if (activeEl.shadowRoot) {
    const shadowInput = activeEl.shadowRoot.querySelector('input, textarea, [contenteditable="true"]');
    if (shadowInput) return true;
  }
  
  // Check custom elements (Reddit-specific)
  if (activeEl.tagName.startsWith('SHREDDIT-') || activeEl.tagName.startsWith('FACEPLATE-')) {
    return true;
  }
  
  return false;
}
```

## Debug System

**Console Commands** (Lines 541-650):
```javascript
MineAnythingDebug.addDiamonds(15)     // Adds to inventory.diamond
MineAnythingDebug.giveSword()          // Sets diamond_sword = 3
MineAnythingDebug.forceWarden()        // Next footer mine spawns warden
MineAnythingDebug.forceCreeper()       // Next mine spawns creeper
MineAnythingDebug.forcePet('allay')    // Next mine spawns specific pet
MineAnythingDebug.forceEnchantment()   // Next mine spawns random enchantment
MineAnythingDebug.addXP(1000)          // Adds XP directly
MineAnythingDebug.resetPets()          // Clears all collected pets
```

**Critical Debug Setup:**
- Set `PRODUCTION_MODE = false` to enable logging (Line 5)
- Logger functions use `console.log/warn` (NOT recursive calls)
- Add `updateInventoryUI()` calls for immediate visual feedback

## Common Pitfalls & Fixes

1. **Duplicate appendChild breaks layout**: Only append each element once to DOM
   ```javascript
   // WRONG:
   container.appendChild(element);
   document.body.appendChild(container);
   document.body.appendChild(container); // Moves it!
   
   // RIGHT:
   container.appendChild(element);
   document.body.appendChild(container); // Once only
   ```

2. **Infinite button clicks**: Use `dataset.flag` + `pointerEvents: 'none'` to prevent spam
   ```javascript
   if (button.dataset.clicked === 'true') return;
   button.dataset.clicked = 'true';
   button.style.pointerEvents = 'none';
   ```

3. **Active item exploits**: Check existing state before allowing re-activation:
   ```javascript
   if (playerData.safeZone?.remainingMines > 0) {
     showNotification('Already active!');
     return;
   }
   ```

4. **Input detection on Reddit**: Check Shadow DOM + custom elements (`shreddit-*`, `faceplate-*`)

5. **Sculk blocks block clicks**: Must have `pointer-events: none` - purely visual decoration

6. **Missing assets**: Check file extensions match
   - Resources: `.png`
   - Mobs: `.gif` preferred
   - Items: `.png`
   - Pets: `.gif` or `.webp`

7. **Wrong diamond field**: Use `playerData.inventory.diamond`, NOT `playerData.diamonds`

8. **Forgotten UI update**: Always call `updateInventoryUI()` after changing `playerData`

9. **Overlapping z-indexes**: Extension overlays use 2147483646+, always check conflicts

10. **Missing save**: Every `playerData` mutation must be followed by `await savePlayerData()`

11. **CSS !important overrides**: When adding dynamic styles via JavaScript, check `content.css` for `!important` declarations
    ```javascript
    // If CSS has: background-repeat: no-repeat !important;
    
    // WRONG - will be overridden:
    element.style.backgroundRepeat = 'repeat-x';
    
    // RIGHT - use setProperty with 'important':
    element.style.setProperty('background-repeat', 'repeat-x', 'important');
    
    // OR remove !important from CSS if it's just a default
    ```
    **Always check content.css before making style iterations** - `!important` flags prevent JavaScript overrides

## Testing Workflow

1. Load unpacked extension from chrome://extensions
2. Enable "Developer Mode" checkbox
3. Open any website, press Alt/Option to activate
4. Use `MineAnythingDebug.*` commands in console for rapid testing
5. Check `chrome.storage.local` in DevTools → Application → Storage
6. Test on multiple sites: Reddit, Twitter, news sites, e-commerce
7. Test edge cases: sandboxed iframes, dynamic content, SPAs

## XP Balancing

Current progression requires ~100K XP for Netherite (weeks of gameplay):
- Tool XP gates: 100, 500, 1500, 5000, 20000, 100000
- Warden defeat: +1000 XP (significant reward)
- Zombie: -100 XP penalty
- Position-based: 1-5 XP per mine based on depth
- Ads: 2x multiplier (3x with Silk Touch)
- Pets: +1 XP per mine (Allay/Axolotl)
- Fortune enchantment: +50% all XP

## Asset Organization

```
assets/
├── resources/     # 8 mineable resources (.png) - 16x16 or 32x32
├── items/         # Craftable items (.png) - 48x48 pixelated
├── mobs/          # Zombie, villager (.gif preferred) - 64x64
├── Pets/          # Collectible companions (.gif/.webp) - 64x64
├── world-items/   # Chests, enchanted books, warden (.gif) - varies
├── achievements/  # Achievement icons (.png/.svg) - 64x64
├── pickaxe-levels/# Tool cursors (.svg/.png/.gif) - 32x32
├── cracks/        # Mining crack animations (.svg) - overlay size
├── ui/            # Inventory slots, buttons (.png/.webp)
└── Blocks/        # Sculk, ore blocks (.svg/.png) - 50x50
```

All assets must be listed in `manifest.json` web_accessible_resources.

---

**Key Principle**: This is a complete game engine running as a content script. Treat it like a game dev project - state management, performance, and user experience are paramount. Every change should preserve the mining feel and prevent exploits.

