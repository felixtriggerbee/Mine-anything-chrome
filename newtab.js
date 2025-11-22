// Check if custom new tab is enabled
chrome.storage.local.get(['customNewTabEnabled', 'playerData'], async (result) => {
  // If disabled, redirect to default new tab (only works on first load)
  if (result.customNewTabEnabled === false) {
    // Show a message since we can't redirect to chrome:// URLs from extensions
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
        <div style="text-align: center;">
          <h2>Custom New Tab Disabled</h2>
          <p>Close this tab and open a new one to use your default new tab page.</p>
          <p style="font-size: 14px; opacity: 0.7; margin-top: 20px;">
            You can re-enable the custom new tab in the Mine Anything popup settings.
          </p>
        </div>
      </div>
    `;
    return;
  }

  // Load and display player stats
  const playerData = result.playerData || {};
  
  // Update stats
  document.getElementById('totalMined').textContent = (playerData.totalMined || 0).toLocaleString();
  document.getElementById('currentTool').textContent = getToolDisplayName(playerData.currentTool || 'hand');
  document.getElementById('totalXP').textContent = (playerData.xp || 0).toLocaleString();
  
  // Count achievements
  const achievements = playerData.achievements || {};
  const unlockedCount = Object.values(achievements).filter(v => v === true).length;
  document.getElementById('achievements').textContent = `${unlockedCount}/15`;

  // Generate background blocks
  generateBackgroundBlocks();
});

function getToolDisplayName(toolKey) {
  const tools = {
    hand: 'Hand',
    wooden_axe: 'Wooden Axe',
    copper_axe: 'Copper Axe',
    iron_axe: 'Iron Axe',
    golden_axe: 'Golden Axe',
    diamond_axe: 'Diamond Axe',
    netherite_axe: 'Netherite Axe'
  };
  return tools[toolKey] || 'Hand';
}

function generateBackgroundBlocks() {
  const container = document.getElementById('bgBlocks');
  const blockTypes = ['⬛', '🟫', '🟦', '🟩', '🟨'];
  
  for (let i = 0; i < 20; i++) {
    const block = document.createElement('div');
    block.textContent = blockTypes[Math.floor(Math.random() * blockTypes.length)];
    block.style.cssText = `
      position: absolute;
      font-size: ${Math.random() * 40 + 20}px;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: float ${Math.random() * 10 + 5}s ease-in-out infinite;
      animation-delay: ${Math.random() * 5}s;
    `;
    container.appendChild(block);
  }
}
