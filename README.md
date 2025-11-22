# ⛏️ Mine Anything - Turn the Web Into Minecraft

Ever wanted to mine through websites like you're playing Minecraft? Now you can! **Mine Anything** is a Chrome extension that lets you break apart any website element with authentic Minecraft-style mining mechanics.

## What Is This?

This extension transforms your browser into a mining adventure. Click and hold on any element (divs, images, cards, buttons, etc.) and watch them crack apart with pixelated Minecraft textures. As you mine, you'll earn XP, upgrade your tools from a basic hand to a legendary Netherite Axe, discover rare pets, collect enchantments, and find precious diamonds.

## Core Gameplay

**Mining Mechanics**
- Click and hold any element to start mining it
- Watch authentic 10-stage crack animations appear
- Faster tools = quicker mining times
- Toggle mining on/off - mined elements reappear when disabled
- Your current tool follows your cursor while mining

**Position-Based XP**
Mining isn't just about quantity - depth matters! Elements give different XP based on their position on the page:
- Top 30% of page: 1 XP
- 31-50% depth: 2 XP  
- 50-80% depth: 3 XP
- Bottom 20% (deep zone): 5 XP

Ads give 2x the normal XP, and deeper ads are even more valuable!

## 7 Tool Progression

Start with your bare hands and work your way up:

1. **✋ Hand** - 5s mining time (0 XP)
2. **🪓 Wooden Axe** - 4s (10 XP)
3. **⛏️ Copper Axe** - 3s (50 XP)
4. **⚒️ Iron Axe** - 2s (150 XP)
5. **👑 Golden Axe** - 1.5s (500 XP)
6. **💎 Diamond Axe** - 1s (2,000 XP)
7. **🔥 Netherite Axe** - 0.5s (10,000 XP)

## Mobs & Companions

**Collectible Pets** (Spawn while mining, 0.5-3% rates, 1 per page max)
- **Allay** (3%) - Grants +1 bonus XP per mine
- **Axolotl** (1.5%) - Grants +1 bonus XP per mine
- **Dennis** (2.5%) - Defuses explosive creepers (+1 XP)
- **Cat** (2%) - Defuses 5 creepers before running away
- **Toad** (2%) - Reduces mining time by 0.1s
- **White Toad** (0.5%) - Reduces mining time by 0.5s (rare!)

**Explosive Creepers**
Randomly spawn at 10% rate when mining. If you don't have Dennis or Cat, they'll explode and destroy 8-15 nearby elements! With a defusing pet, you get +1 XP instead. You can manually defuse creepers during their 3-second countdown.

## Enchantment System

Find rare enchanted books while mining (1 per page max, ~1% spawn rate each):

- **Fortune** (1%) - +50% XP from all mining
- **Efficiency** (1%) - -30% mining time on all elements
- **Unbreaking** (0.8%) - Protects your tool from being stolen 3 times
- **Mending** (0.7%) - +30% stolen tool recovery chance (total 50%)
- **Looting** (0.6%) - Doubles pet spawn rates
- **Silk Touch** (0.8%) - Mined ads give 3x XP instead of 2x

Enchantments auto-apply to your current tool. When your tool is lost, the enchantment goes with it!

## Diamond Collection

**Treasure Chests** spawn rarely (0.5-1.5% rate, 1 per page max) and drop diamonds. Collect 3 diamonds to craft a Diamond Sword - a powerful item with special uses (discover what it does yourself!).

## Daily Challenges

Get 3 random daily challenges that reset at midnight:

- **Block Breaker**: Mine 50 blocks (+100 XP)
- **Ad Hunter**: Mine 10 ads (+200 XP)
- **Pet Collector**: Find 1 pet (+1 Diamond)
- **Deep Miner**: Mine 20 elements in the deep zone (+150 XP)
- **Encounter Challenge**: Survive a dangerous encounter (Guaranteed chest spawn)
- **Book Collector**: Find 1 enchantment (+250 XP)

Challenges track automatically as you play and award rewards instantly!

## Sculk Blocks

The bottom 20% of each page contains mysterious sculk blocks (15-35 blocks in a spreading pattern). These animated blocks mark the dangerous deep zone where stronger entities may lurk...

## Tool Recovery System

Lost your tool to a dangerous mob? Don't worry! You have a 20% base chance to recover it with each mine. The Mending enchantment boosts this to 50%, making recovery much more likely.

## Domain Blocking

Don't want to mine certain websites? Open the extension popup and add domains to your blocklist. The extension won't activate on blocked sites.

## How To Use

1. Click the extension icon or press Alt (customizable shortcut)
2. Hover over elements - they'll highlight with a green outline
3. Click and hold to start mining
4. Watch cracks appear and elements break
5. Collect XP, pets, enchantments, and diamonds
6. Open the popup to see your stats and progress
7. Toggle off to restore all mined elements

## Pro Tips

- **Target ads** for double XP (marked with "AD!" notification)
- **Scroll down** to find deep zone elements worth 5 XP each
- **Complete daily challenges** for huge rewards
- **Enchant strategically** - Fortune for XP grinding, Efficiency for speed
- **Save pets** - Having Dennis or Cat prevents creeper destruction
- **Explore the deep zone** - Higher risk but better rewards
- **Use Looting enchantment** when hunting for rare pets
- **Stack bonuses** - Pets + enchantments + deep zone = massive XP gains

## Technical Details

- Works on any website
- Progress saved per-browser using Chrome Storage
- Manifest V3 compliant
- No external dependencies
- Lightweight and performant
- All processing happens locally

## Installation

**From Zip File (Private/Development)**
1. Extract the zip file
2. Open chrome://extensions
3. Enable "Developer Mode"
4. Click "Load Unpacked"
5. Select the extracted folder
6. Start mining!

**Note**: Each person who installs gets a fresh start. Stats are stored locally per-browser and don't transfer.

---

**Ready to mine the entire internet?** Install Mine Anything and start your adventure today! ⛏️✨
