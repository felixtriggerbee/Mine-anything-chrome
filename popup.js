// Mine Anything - Popup Script

const TOOLS = {
  hand: { name: 'Hand', speed: 5000, xpRequired: 0, icon: '✋', file: 'hand.png' },
  wooden_axe: { name: 'Wooden Axe', speed: 4000, xpRequired: 100, icon: '🪓', file: 'wood.png' },
  copper_axe: { name: 'Copper Axe', speed: 3000, xpRequired: 500, icon: '⛏️', file: 'copper.png' },
  iron_axe: { name: 'Iron Axe', speed: 2000, xpRequired: 1500, icon: '⚒️', file: 'iron.png' },
  golden_axe: { name: 'Golden Axe', speed: 1500, xpRequired: 5000, icon: '👑', file: 'gold.png' },
  diamond_axe: { name: 'Diamond Axe', speed: 1000, xpRequired: 20000, icon: 'diamond_miner.png', file: 'diamond.png' },
  netherite_axe: { name: 'Netherite Axe', speed: 500, xpRequired: 100000, icon: '🔥', file: 'netherite.gif' }
};

const PETS = {
  allay: { name: 'Allay', file: 'Allay.gif', ability: '+1 XP per mine' },
  axolotl: { name: 'Axolotl', file: 'Axolotl.gif', ability: '+1 XP per mine' },
  dennis: { name: 'Dennis', file: 'Dennis.gif', ability: 'Defuses creepers (+1 XP)' },
  cat: { name: 'Cat', file: 'cat.webp', ability: 'Defuses creepers (+1 XP)' },
  toad: { name: 'Toad', file: 'Toad.gif', ability: '-0.1s mining time' },
  white_toad: { name: 'White Toad', file: 'white toad.gif', ability: '-0.5s mining time' }
};

const CRAFTABLE_ITEMS = {
  torch: { name: 'Torch', file: 'torch', folder: 'items', description: '50% less mob spawns (25 mines)' },
  redstone_lamp: { name: 'Redstone Lamp', file: 'redstone_lamp', folder: 'items', description: '+100% XP for 2 minutes' },
  beacon: { name: 'Beacon', file: 'beacon', folder: 'items', description: '2x resource drops (3 mins)' },
  golden_apple: { name: 'Golden Apple', file: 'golden_apple', folder: 'items', description: 'Instant +50 XP boost' }
};

const ACHIEVEMENTS = {
  first_mine: { name: 'Getting Started', description: 'Mine your first element', icon: 'first_mine.png' },
  mining_veteran: { name: 'Mining Veteran', description: 'Mine 100 elements', icon: 'mining_veteran.png' },
  mining_master: { name: 'Mining Master', description: 'Mine 1000 elements', icon: 'mining_master.png' },
  first_upgrade: { name: 'Tool Upgrade', description: 'Upgrade to Wooden Axe', icon: 'first_upgrade.png' },
  iron_age: { name: 'Iron Age', description: 'Upgrade to Iron Axe', icon: 'iron_age.png' },
  diamond_miner: { name: 'Diamond Miner', description: 'Upgrade to Diamond Axe', icon: 'diamond_miner.png' },
  netherite_legend: { name: 'Netherite Legend', description: 'Upgrade to Netherite Axe', icon: 'netherite_legend.png' },
  pet_collector: { name: 'Pet Collector', description: 'Collect your first pet', icon: 'pet_collector.png' },
  treasure_hunter: { name: 'Treasure Hunter', description: 'Find your first diamond', icon: 'treasure_hunter.png' },
  warden_slayer: { name: 'Warden Slayer', description: 'Craft the Diamond Sword', icon: 'warden_slayer.png' },
  enchanter: { name: 'Enchanter', description: 'Apply your first enchantment', icon: 'enchanter.png' },
  deep_diver: { name: 'Deep Diver', description: 'Mine 50 elements in the deep zone', icon: 'deep_diver.png' },
  xp_collector: { name: 'XP Collector', description: 'Reach 500 XP', icon: 'xp_collector.png' },
  xp_master: { name: 'XP Master', description: 'Reach 5000 XP', icon: 'xp_master.png' },
  challenge_complete: { name: 'Challenge Accepted', description: 'Complete your first daily challenge', icon: 'award_generic.png' }
};

const RESOURCES = {
  coal: { name: 'Coal', file: 'coal' },
  iron: { name: 'Iron', file: 'iron' },
  gold: { name: 'Gold', file: 'gold' },
  redstone: { name: 'Redstone', file: 'redstone' },
  lapis: { name: 'Lapis', file: 'lapis' },
  emerald: { name: 'Emerald', file: 'emerald' },
  diamond: { name: 'Diamond Ore', file: 'diamond' },
  netherite: { name: 'Ancient Debris', file: 'netherite' }
};

// Helper to try loading image with multiple extensions
function getResourceImageUrl(filename) {
  // Try common extensions in order
  const extensions = ['png', 'gif', 'webp', 'jpg'];
  // Return first as default, browser handles 404s gracefully
  return chrome.runtime.getURL(`assets/resources/${filename}.${extensions[0]}`);
}

async function loadPlayerData() {
  const result = await chrome.storage.local.get(['playerData']);
  let playerData;
  
  if (result.playerData) {
    playerData = result.playerData;
    // Ensure pets object exists (for backward compatibility)
    if (!playerData.pets) {
      playerData.pets = {};
    }
    // Ensure diamonds tracking exists (for backward compatibility)
    if (playerData.diamonds === undefined) {
      playerData.diamonds = 0;
      playerData.hasDiamondSword = false;
    }
    // Ensure stolen tool tracking exists (for backward compatibility)
    if (playerData.stolenTool === undefined) {
      playerData.stolenTool = null;
    }
    // Ensure enchantments tracking exists (for backward compatibility)
    if (playerData.enchantments === undefined) {
      playerData.enchantments = {};
      playerData.toolEnchantment = null;
      playerData.unbreakingUses = 0;
    }
    // Ensure unbreakingUses exists (for backward compatibility)
    if (playerData.unbreakingUses === undefined) {
      playerData.unbreakingUses = 0;
    }
    // Ensure daily challenges exist (for backward compatibility)
    if (playerData.dailyChallenges === undefined) {
      playerData.dailyChallenges = {
        lastReset: new Date().toDateString(),
        challenges: [],
        completed: []
      };
    }
    // Ensure cat deflections tracking exists (for backward compatibility)
    if (playerData.catDeflections === undefined) {
      playerData.catDeflections = 0;
    }
    // Ensure achievements tracking exists (for backward compatibility)
    if (playerData.achievements === undefined) {
      playerData.achievements = {};
    }
    // Ensure deep mining count exists (for backward compatibility)
    if (playerData.deepMiningCount === undefined) {
      playerData.deepMiningCount = 0;
    }
    // Ensure challenges completed count exists (for backward compatibility)
    if (playerData.challengesCompleted === undefined) {
      playerData.challengesCompleted = 0;
    }
    // Ensure inventory exists (for backward compatibility)
    if (playerData.inventory === undefined) {
      playerData.inventory = {};
    }
    // Ensure crafted items exists (for backward compatibility)
    if (playerData.craftedItems === undefined) {
      playerData.craftedItems = {};
    }
  } else {
    playerData = {
      totalMined: 0,
      currentTool: 'hand',
      xp: 0,
      pets: {},
      diamonds: 0,
      hasDiamondSword: false,
      stolenTool: null
    };
  }
  
  // Load and display blocked domains
  await loadBlockedDomains();
  
    // Load icon images
  const headerPickaxe = document.getElementById('headerPickaxe');
  const minedBlockIcon = document.getElementById('minedBlockIcon');
  const xpOrbIcon = document.getElementById('xpOrbIcon');
  
  if (chrome.runtime?.id) {
    headerPickaxe.src = chrome.runtime.getURL('assets/pickaxe-levels/netherite.gif');
    minedBlockIcon.src = chrome.runtime.getURL('assets/other/mined-block.png');
    xpOrbIcon.src = chrome.runtime.getURL('assets/other/xp-orb.png');
  }
  
  updateUI(playerData);
}

function updateUI(playerData) {
  // Update stats
  document.getElementById('totalMined').textContent = playerData.totalMined.toLocaleString();
  document.getElementById('totalXP').textContent = playerData.xp.toLocaleString();
  
  // Update current tool
  const currentTool = TOOLS[playerData.currentTool];
  const toolIconEl = document.getElementById('toolIcon');
  const toolIconImg = chrome.runtime.getURL(`assets/pickaxe-levels/${currentTool.file}`);
  toolIconEl.innerHTML = `<img src="${toolIconImg}" alt="${currentTool.name}" style="width: 48px; height: 48px; image-rendering: pixelated;">`;
  document.getElementById('toolName').textContent = currentTool.name;
  document.getElementById('toolSpeed').textContent = `${(currentTool.speed / 1000).toFixed(1)}s mining time`;
  
  // Calculate next tool
  const toolKeys = Object.keys(TOOLS);
  const currentIndex = toolKeys.indexOf(playerData.currentTool);
  
  if (currentIndex < toolKeys.length - 1) {
    const nextToolKey = toolKeys[currentIndex + 1];
    const nextTool = TOOLS[nextToolKey];
    const progress = ((playerData.xp / nextTool.xpRequired) * 100).toFixed(1);
    
    document.getElementById('nextToolName').textContent = `${nextTool.icon} ${nextTool.name}`;
    document.getElementById('progressText').textContent = `${playerData.xp} / ${nextTool.xpRequired} XP`;
    document.getElementById('progressFill').style.width = `${Math.min(progress, 100)}%`;
  } else {
    document.getElementById('nextToolName').textContent = '🏆 MAX LEVEL!';
    document.getElementById('progressText').textContent = 'All tools unlocked!';
    document.getElementById('progressFill').style.width = '100%';
  }
  
  // Update tools list
  const toolsList = document.getElementById('toolsList');
  toolsList.innerHTML = '';
  
  const highestUnlockedIndex = toolKeys.indexOf(playerData.highestToolUnlocked || playerData.currentTool || 'hand');
  
  toolKeys.forEach((key, index) => {
    const tool = TOOLS[key];
    // Tool is unlocked if: it's at or below highest unlocked index, OR player has enough XP
    const isUnlocked = index <= highestUnlockedIndex || playerData.xp >= tool.xpRequired;
    const isCurrent = key === playerData.currentTool;
    
    const toolItem = document.createElement('div');
    toolItem.className = `tool-item ${isUnlocked ? 'unlocked' : 'locked'} ${isCurrent ? 'current' : ''}`;
    
    const toolIconImg = chrome.runtime.getURL(`assets/pickaxe-levels/${tool.file}`);
    
    toolItem.innerHTML = `
      <div class="tool-item-icon"><img src="${toolIconImg}" alt="${tool.name}" style="width: 28px; height: 28px; image-rendering: pixelated;"></div>
      <div class="tool-item-info">
        <div class="tool-item-name">
          ${tool.name}
          ${isCurrent ? '<span class="badge">EQUIPPED</span>' : ''}
          ${!isUnlocked ? '<span class="badge locked-badge">🔒 LOCKED</span>' : ''}
          ${isUnlocked && !isCurrent ? '<span class="badge unlocked-badge">✅ UNLOCKED</span>' : ''}
        </div>
        <div class="tool-item-details">
          ${(tool.speed / 1000).toFixed(1)}s • ${isUnlocked ? 'Unlocked!' : `${tool.xpRequired} XP required`}
        </div>
      </div>
    `;
    
    toolsList.appendChild(toolItem);
  });
  
  // Update pets section
  updatePetsSection(playerData);
  
  // Update daily challenges section
  updateDailyChallengesSection(playerData);
  
  // Update diamonds section
  updateDiamondsSection(playerData);
  
  // Update achievements section
  updateAchievementsSection(playerData);
  
  // Update inventory section
  updateInventorySection(playerData);
  
  // Update enchantment section
  updateEnchantmentSection(playerData);
}

function updateEnchantmentSection(playerData) {
  const ENCHANTMENTS = {
    fortune: { name: 'Fortune', description: '+50% XP from mining', durability: 100 },
    efficiency: { name: 'Efficiency', description: '-30% mining time', durability: 100 },
    unbreaking: { name: 'Unbreaking', description: 'Protects tool from 3 Warden steals', durability: 50 },
    mending: { name: 'Mending', description: '30% chance to recover stolen tool per mine', durability: 50 },
    looting: { name: 'Looting', description: 'Double pet spawn rates', durability: 150 },
    silk_touch: { name: 'Silk Touch', description: 'Mined ads give 3x XP instead of 2x', durability: 75 }
  };
  
  const enchantmentSection = document.getElementById('enchantmentSection');
  const enchantmentDisplay = document.getElementById('enchantmentDisplay');
  
  // Check if player has any enchantments in inventory
  if (playerData.enchantmentInventory && playerData.enchantmentInventory.length > 0) {
    enchantmentSection.style.display = 'block';
    
    let html = '';
    
    // Show active enchantment first if any
    if (playerData.activeEnchantmentIndex !== null && playerData.activeEnchantmentIndex !== undefined) {
      const activeEnchant = playerData.enchantmentInventory[playerData.activeEnchantmentIndex];
      if (activeEnchant) {
        const enchant = ENCHANTMENTS[activeEnchant.type];
        const durabilityPercent = (activeEnchant.durability / enchant.durability) * 100;
        html += `
          <div style="background: rgba(255, 215, 0, 0.15); border: 2px solid #FFD700; border-radius: 4px; padding: 10px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 28px;">⚡</span>
              <div style="flex: 1;">
                <div style="font-weight: bold; color: #FFD700; font-size: 14px;">ACTIVE: ${enchant.name}</div>
                <div style="font-size: 11px; color: #DDD; margin-top: 2px;">${enchant.description}</div>
                <div style="margin-top: 6px;">
                  <div style="font-size: 10px; color: #FFD700; margin-bottom: 2px;">${activeEnchant.durability}/${enchant.durability} uses</div>
                  <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${durabilityPercent}%; height: 100%; background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #44ff44 100%);"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }
    
    // Show all enchantments in inventory
    html += '<div style="font-size: 11px; color: #BBB; margin-bottom: 8px;">📚 Enchantment Books:</div>';
    html += '<div style="display: grid; grid-template-columns: 1fr; gap: 6px;">';
    
    playerData.enchantmentInventory.forEach((enchantData, index) => {
      const enchant = ENCHANTMENTS[enchantData.type];
      if (!enchant) return;
      
      const isActive = playerData.activeEnchantmentIndex === index;
      const durabilityPercent = (enchantData.durability / enchant.durability) * 100;
      
      html += `
        <div style="background: ${isActive ? 'rgba(255,215,0,0.1)' : 'rgba(147,112,219,0.1)'}; border: 1px solid ${isActive ? '#FFD700' : '#9370DB'}; border-radius: 3px; padding: 6px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight: bold; color: ${isActive ? '#FFD700' : '#DDD'};">📖 ${enchant.name}</span>
              ${isActive ? '<span style="color: #FFD700; margin-left: 4px;">⚡</span>' : ''}
            </div>
            <div style="color: #AAA;">${enchantData.durability}/${enchant.durability}</div>
          </div>
          <div style="width: 100%; height: 3px; background: rgba(0,0,0,0.5); border-radius: 2px; overflow: hidden; margin-top: 4px;">
            <div style="width: ${durabilityPercent}%; height: 100%; background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #44ff44 100%);"></div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    html += '<div style="font-size: 9px; color: #888; margin-top: 8px; text-align: center;">Click enchantments in inventory (press I) to activate</div>';
    
    enchantmentDisplay.innerHTML = html;
  } else if (playerData.toolEnchantment && ENCHANTMENTS[playerData.toolEnchantment]) {
    // Fallback for old save data
    const enchant = ENCHANTMENTS[playerData.toolEnchantment];
    enchantmentSection.style.display = 'block';
    enchantmentDisplay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 32px;">✨</span>
        <div style="flex: 1;">
          <div style="font-weight: bold; color: #FFD700; font-size: 16px;">${enchant.name}</div>
          <div style="font-size: 12px; color: #DDD; margin-top: 4px;">${enchant.description}</div>
        </div>
      </div>
    `;
  } else {
    enchantmentSection.style.display = 'none';
  }
}

function updatePetsSection(playerData) {
  const petsSection = document.getElementById('petsSection');
  const petsList = document.getElementById('petsList');
  
  // Ensure pets exists
  if (!playerData.pets) {
    petsSection.style.display = 'none';
    return;
  }
  
  // Check if any pets are collected
  const collectedPets = Object.keys(playerData.pets).filter(key => 
    playerData.pets[key] && playerData.pets[key].collected
  );
  
  if (collectedPets.length > 0) {
    petsSection.style.display = 'block';
    petsList.innerHTML = '';
    
    collectedPets.forEach(petKey => {
      const pet = PETS[petKey];
      if (!pet) return; // Skip if pet definition doesn't exist
      
      const petData = playerData.pets[petKey];
      
      const petItem = document.createElement('div');
      petItem.className = 'pet-item';
      const petImg = chrome.runtime.getURL(`assets/Pets/${pet.file}`);
      petItem.innerHTML = `
        <div class="pet-icon"><img src="${petImg}" alt="${pet.name}" style="width: 40px; height: 40px; image-rendering: pixelated;"></div>
        <div class="pet-info">
          <div class="pet-name">${pet.name} ${petData.count > 1 ? `(x${petData.count})` : ''}</div>
          <div class="pet-ability">${pet.ability}</div>
        </div>
      `;
      
      petsList.appendChild(petItem);
    });
  } else {
    petsSection.style.display = 'none';
  }
}

function updateDailyChallengesSection(playerData) {
  const challengesSection = document.getElementById('dailyChallengesSection');
  const challengesList = document.getElementById('dailyChallengesList');
  const countdown = document.getElementById('dailyChallengesCountdown');
  
  // Check if daily challenges exist
  if (!playerData.dailyChallenges || !playerData.dailyChallenges.challenges || playerData.dailyChallenges.challenges.length === 0) {
    challengesSection.style.display = 'none';
    return;
  }
  
  challengesSection.style.display = 'block';
  
  // Display countdown to next reset
  if (playerData.dailyChallenges.nextResetTime) {
    const now = Date.now();
    const timeLeft = playerData.dailyChallenges.nextResetTime - now;
    
    if (timeLeft > 0) {
      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      countdown.innerHTML = `<div style="text-align: center; padding: 8px; background: rgba(255,215,0,0.1); border-radius: 4px; font-size: 12px; color: #FFD700; margin-bottom: 10px;">
        ⏰ Resets in: ${hours}h ${minutes}m
      </div>`;
      
      // Update countdown every minute
      setTimeout(() => {
        if (document.getElementById('dailyChallengesSection')) {
          updateDailyChallengesSection(playerData);
        }
      }, 60000);
    }
  }
  
  // Display challenges
  challengesList.innerHTML = '';
  playerData.dailyChallenges.challenges.forEach((challenge, index) => {
    const progress = challenge.progress || 0;
    const percentage = Math.min((progress / challenge.target) * 100, 100);
    const isCompleted = challenge.completed;
    
    // Difficulty stars
    const difficultyStars = '⭐'.repeat(Math.min(challenge.difficulty || 1, 5));
    
    const challengeItem = document.createElement('div');
    challengeItem.className = 'challenge-item';
    challengeItem.style.cssText = `
      background: ${isCompleted ? 'rgba(50, 205, 50, 0.15)' : 'rgba(139, 69, 19, 0.2)'};
      border: 2px solid ${isCompleted ? '#32CD32' : '#8B4513'};
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      position: relative;
    `;
    
    challengeItem.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
        <div>
          <div style="font-weight: bold; color: ${isCompleted ? '#32CD32' : '#FFD700'}; font-size: 13px;">
            ${isCompleted ? '✅ ' : ''}${challenge.name}
          </div>
          <div style="font-size: 10px; color: #AAA; margin-top: 2px;">
            ${challenge.description}
          </div>
        </div>
        <div style="font-size: 10px; color: #FFD700;">
          ${difficultyStars}
        </div>
      </div>
      <div style="margin-bottom: 4px;">
        <div style="font-size: 11px; color: ${isCompleted ? '#32CD32' : '#DDD'}; margin-bottom: 3px;">
          ${progress} / ${challenge.target} ${isCompleted ? '(Complete!)' : ''}
        </div>
        <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden;">
          <div style="width: ${percentage}%; height: 100%; background: ${isCompleted ? '#32CD32' : 'linear-gradient(90deg, #8B4513 0%, #FFD700 100%)'};  transition: width 0.3s;"></div>
        </div>
      </div>
      <div style="font-size: 10px; color: #32CD32; font-weight: bold;">
        ${challenge.rewardText}
      </div>
    `;
    
    challengesList.appendChild(challengeItem);
  });
}

function updateDiamondsSection(playerData) {
  const diamondsSection = document.getElementById('diamondsSection');
  const diamondsList = document.getElementById('diamondsList');
  
  // Ensure diamonds tracking exists
  if (playerData.diamonds === undefined) {
    diamondsSection.style.display = 'none';
    return;
  }
  
  // Show section if player has any diamonds or diamond sword
  if (playerData.diamonds > 0 || playerData.hasDiamondSword) {
    diamondsSection.style.display = 'block';
    diamondsList.innerHTML = '';
    
    // Show diamonds
    if (playerData.diamonds > 0) {
      const diamondItem = document.createElement('div');
      diamondItem.className = 'diamond-item';
      const diamondImg = chrome.runtime.getURL('assets/world-items/diamond.png');
      diamondItem.innerHTML = `
        <div class="diamond-icon"><img src="${diamondImg}" alt="Diamond" style="width: 40px; height: 40px; image-rendering: pixelated;"></div>
        <div class="diamond-info">
          <div class="diamond-name">Diamonds: ${playerData.diamonds}/15</div>
          <div class="diamond-desc">${playerData.diamonds < 15 ? 'Collect 15 to craft Diamond Sword' : 'Ready to craft!'}</div>
        </div>
      `;
      diamondsList.appendChild(diamondItem);
    }
    
    // Show diamond sword if crafted
    if (playerData.hasDiamondSword) {
      const swordItem = document.createElement('div');
      swordItem.className = 'diamond-item';
      const swordImg = chrome.runtime.getURL('assets/world-items/diamond-sword.png');
      swordItem.innerHTML = `
        <div class="diamond-icon"><img src="${swordImg}" alt="Diamond Sword" style="width: 40px; height: 40px; image-rendering: pixelated;"></div>
        <div class="diamond-info">
          <div class="diamond-name">💎 Diamond Sword 💎</div>
          <div class="diamond-desc">Can defeat the Warden</div>
        </div>
      `;
      diamondsList.appendChild(swordItem);
    }
  } else {
    diamondsSection.style.display = 'none';
  }
}

function updateAchievementsSection(playerData) {
  const achievementsSection = document.getElementById('achievementsSection');
  const achievementsList = document.getElementById('achievementsList');
  
  // Ensure achievements tracking exists
  if (!playerData.achievements) {
    achievementsSection.style.display = 'none';
    return;
  }
  
  const unlockedAchievements = Object.keys(playerData.achievements).filter(key => 
    playerData.achievements[key] === true
  );
  
  if (unlockedAchievements.length > 0) {
    achievementsSection.style.display = 'block';
    achievementsList.innerHTML = '';
    
    // Show progress header
    const progressHeader = document.createElement('div');
    progressHeader.className = 'achievement-progress';
    progressHeader.innerHTML = `
      <span style="font-size: 14px; color: #666;">
        Unlocked: ${unlockedAchievements.length} / ${Object.keys(ACHIEVEMENTS).length}
      </span>
    `;
    achievementsList.appendChild(progressHeader);
    
    // Show all achievements (locked and unlocked)
    Object.keys(ACHIEVEMENTS).forEach(achievementKey => {
      const achievement = ACHIEVEMENTS[achievementKey];
      const isUnlocked = playerData.achievements[achievementKey] === true;
      
      const achievementItem = document.createElement('div');
      achievementItem.className = `achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`;
      
      const iconUrl = chrome.runtime.getURL(`assets/achievements/${achievement.icon}`);
      achievementItem.innerHTML = `
        <div class="achievement-icon"><img src="${iconUrl}" style="width: 48px; height: 48px; image-rendering: pixelated;"></div>
        <div class="achievement-info">
          <div class="achievement-name">${achievement.name}</div>
          <div class="achievement-desc">${achievement.description}</div>
        </div>
        ${isUnlocked ? '<div class="achievement-badge">✓</div>' : '<div class="achievement-badge locked-badge">🔒</div>'}
      `;
      achievementsList.appendChild(achievementItem);
    });
  } else {
    achievementsSection.style.display = 'none';
  }
}

function updateInventorySection(playerData) {
  const inventorySection = document.getElementById('inventorySection');
  const inventoryList = document.getElementById('inventoryList');
  
  // Ensure inventory tracking exists
  if (!playerData.inventory) {
    playerData.inventory = {};
  }
  if (!playerData.craftedItems) {
    playerData.craftedItems = {};
  }
  
  // Combine regular resources and crafted items
  const inventoryItems = Object.keys(playerData.inventory).filter(key => 
    playerData.inventory[key] > 0
  );
  
  const craftedItems = Object.keys(playerData.craftedItems).filter(key => 
    playerData.craftedItems[key] > 0
  );
  
  if (inventoryItems.length > 0 || craftedItems.length > 0) {
    inventorySection.style.display = 'block';
    inventoryList.innerHTML = '';
    
    // Sort by resource rarity (netherite -> diamond -> emerald -> etc)
    const resourceOrder = ['netherite', 'diamond', 'emerald', 'gold', 'lapis', 'redstone', 'iron', 'coal'];
    inventoryItems.sort((a, b) => resourceOrder.indexOf(a) - resourceOrder.indexOf(b));
    
    // Display regular resources
    inventoryItems.forEach(resourceKey => {
      const resource = RESOURCES[resourceKey];
      if (!resource) return;
      
      const amount = playerData.inventory[resourceKey];
      const inventoryItem = document.createElement('div');
      inventoryItem.className = 'inventory-item';
      
      const resourceImg = getResourceImageUrl(resource.file);
      inventoryItem.innerHTML = `
        <div class="inventory-icon">
          <img src="${resourceImg}" alt="${resource.name}" style="width: 32px; height: 32px; image-rendering: pixelated;" 
               onerror="this.style.display='none'">
        </div>
        <div class="inventory-info">
          <div class="inventory-name">${resource.name}</div>
          <div class="inventory-amount">×${amount}</div>
        </div>
      `;
      inventoryList.appendChild(inventoryItem);
    });
    
    // Display crafted items
    craftedItems.forEach(itemKey => {
      const item = CRAFTABLE_ITEMS[itemKey];
      if (!item) return;
      
      const amount = playerData.craftedItems[itemKey];
      const inventoryItem = document.createElement('div');
      inventoryItem.className = 'inventory-item';
      
      const itemImg = chrome.runtime.getURL(`assets/${item.folder}/${item.file}.gif`);
      inventoryItem.innerHTML = `
        <div class="inventory-icon">
          <img src="${itemImg}" alt="${item.name}" style="width: 32px; height: 32px; image-rendering: pixelated;" 
               onerror="this.onerror=null; this.src='${chrome.runtime.getURL(`assets/${item.folder}/${item.file}.png`)}'">
        </div>
        <div class="inventory-info">
          <div class="inventory-name">${item.name}</div>
          <div class="inventory-amount">×${amount}</div>
        </div>
      `;
      inventoryList.appendChild(inventoryItem);
    });
  } else {
    inventorySection.style.display = 'none';
  }
}

// Blocked domains functionality
let currentDomain = '';

async function loadBlockedDomains() {
  // Get current tab domain
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (tabs[0]) {
    try {
      const url = new URL(tabs[0].url);
      currentDomain = url.hostname;
      document.getElementById('currentDomainText').textContent = currentDomain;
    } catch (e) {
      currentDomain = '';
      document.getElementById('currentDomainText').textContent = 'Invalid URL';
      document.getElementById('toggleDomainBlock').disabled = true;
      return;
    }
  }
  
  // Get blocked domains from storage
  const result = await chrome.storage.local.get(['blockedDomains']);
  const blockedDomains = result.blockedDomains || [];
  
  // Update button state
  const toggleBtn = document.getElementById('toggleDomainBlock');
  const isBlocked = blockedDomains.includes(currentDomain);
  
  if (isBlocked) {
    toggleBtn.textContent = 'Unblock Domain';
    toggleBtn.classList.add('blocked');
  } else {
    toggleBtn.textContent = 'Block Domain';
    toggleBtn.classList.remove('blocked');
  }
  
  // Display blocked domains list
  const blockedList = document.getElementById('blockedDomainsList');
  blockedList.innerHTML = '';
  
  if (blockedDomains.length > 0) {
    blockedDomains.forEach(domain => {
      const domainItem = document.createElement('div');
      domainItem.className = 'blocked-domain-item';
      domainItem.innerHTML = `
        <span class="blocked-domain-name">${domain}</span>
        <button class="unblock-btn" data-domain="${domain}">Unblock</button>
      `;
      blockedList.appendChild(domainItem);
    });
    
    // Add unblock listeners
    blockedList.querySelectorAll('.unblock-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.dataset.domain;
        await unblockDomain(domain);
      });
    });
  }
}

async function toggleCurrentDomain() {
  if (!currentDomain) return;
  
  const result = await chrome.storage.local.get(['blockedDomains']);
  let blockedDomains = result.blockedDomains || [];
  
  const isBlocked = blockedDomains.includes(currentDomain);
  
  if (isBlocked) {
    // Unblock
    blockedDomains = blockedDomains.filter(d => d !== currentDomain);
  } else {
    // Block
    blockedDomains.push(currentDomain);
  }
  
  await chrome.storage.local.set({ blockedDomains });
  
  // Notify content script to reload
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'domainBlockChanged',
      blocked: !isBlocked
    }).catch(() => {
      // Content script may not be loaded, reload the tab
      chrome.tabs.reload(tabs[0].id);
    });
  }
  
  // Reload the display
  await loadBlockedDomains();
}

async function unblockDomain(domain) {
  const result = await chrome.storage.local.get(['blockedDomains']);
  let blockedDomains = result.blockedDomains || [];
  
  blockedDomains = blockedDomains.filter(d => d !== domain);
  await chrome.storage.local.set({ blockedDomains });
  
  // If unblocking current domain, notify content script
  if (domain === currentDomain) {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'domainBlockChanged',
        blocked: false
      }).catch(() => {
        chrome.tabs.reload(tabs[0].id);
      });
    }
  }
  
  await loadBlockedDomains();
}

// Add event listener for toggle button
document.getElementById('toggleDomainBlock').addEventListener('click', toggleCurrentDomain);

// Refresh data every second
setInterval(loadPlayerData, 1000);

// Initial load
loadPlayerData();

// Settings handlers
document.getElementById('showToggleBtn').addEventListener('change', async (e) => {
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || {};
  currentSettings.showToggle = e.target.checked;
  await chrome.storage.local.set({ settings: currentSettings });
  
  // Notify content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: currentSettings
      }).catch(() => {
        // Ignore errors if content script isn't loaded
      });
    }
  });
});

document.getElementById('customNewTab').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ customNewTabEnabled: e.target.checked });
});

document.getElementById('togglePosition').addEventListener('change', async (e) => {
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || {};
  currentSettings.togglePosition = e.target.value;
  await chrome.storage.local.set({ settings: currentSettings });
  
  // Notify content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: currentSettings
      }).catch(() => {
        // Ignore errors if content script isn't loaded
      });
    }
  });
});

// Shortcut changer
const shortcutInput = document.getElementById('miningShortcut');
let recordingKeys = false;
let pressedKeys = [];

shortcutInput.addEventListener('click', () => {
  recordingKeys = true;
  pressedKeys = [];
  shortcutInput.value = 'Press keys...';
  shortcutInput.style.background = '#353535';
});

shortcutInput.addEventListener('keydown', async (e) => {
  if (!recordingKeys) return;
  
  e.preventDefault();
  
  // Collect the key combination
  const key = e.key;
  if (!pressedKeys.includes(key)) {
    pressedKeys.push(key);
  }
  
  // Display the keys
  const displayKeys = pressedKeys.map(k => {
    if (k === 'Alt') return '⌥';
    if (k === 'Control') return '⌃';
    if (k === 'Shift') return '⇧';
    if (k === 'Meta') return '⌘';
    return k.toUpperCase();
  });
  
  shortcutInput.value = displayKeys.join(' + ');
});

shortcutInput.addEventListener('keyup', async (e) => {
  if (!recordingKeys) return;
  
  e.preventDefault();
  
  // Save the shortcut after a short delay
  setTimeout(async () => {
    if (pressedKeys.length > 0) {
      const settings = await chrome.storage.local.get(['settings']);
      const currentSettings = settings.settings || {};
      currentSettings.miningShortcut = pressedKeys;
      await chrome.storage.local.set({ settings: currentSettings });
      
      // Notify content script
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateSettings',
            settings: currentSettings
          }).catch(() => {});
        }
      });
      
      shortcutInput.style.background = '#2a2a2a';
    }
    recordingKeys = false;
  }, 300);
});

shortcutInput.addEventListener('blur', () => {
  recordingKeys = false;
  shortcutInput.style.background = '#2a2a2a';
});

// Reset shortcut button
document.getElementById('resetShortcut').addEventListener('click', async () => {
  const settings = await chrome.storage.local.get(['settings']);
  const currentSettings = settings.settings || {};
  currentSettings.miningShortcut = ['Alt'];
  await chrome.storage.local.set({ settings: currentSettings });
  
  loadSettings();
  
  // Notify content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: currentSettings
      }).catch(() => {});
    }
  });
});

// Load settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'customNewTabEnabled']);
  const currentSettings = result.settings || { showToggle: true, togglePosition: 'top-right', miningShortcut: ['Alt'] };
  const customNewTabEnabled = result.customNewTabEnabled !== false; // Default true
  
  document.getElementById('showToggleBtn').checked = currentSettings.showToggle;
  document.getElementById('customNewTab').checked = customNewTabEnabled;
  document.getElementById('togglePosition').value = currentSettings.togglePosition || 'top-right';
  
  // Display shortcut
  const shortcut = currentSettings.miningShortcut || ['Alt'];
  const displayKeys = shortcut.map(k => {
    if (k === 'Alt') return '⌥';
    if (k === 'Control') return '⌃';
    if (k === 'Shift') return '⇧';
    if (k === 'Meta') return '⌘';
    return k.toUpperCase();
  });
  document.getElementById('miningShortcut').value = displayKeys.join(' + ');
}

loadSettings();
