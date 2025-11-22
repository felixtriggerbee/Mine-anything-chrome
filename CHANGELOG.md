# Changelog - Mine Anything Chrome Extension

## Latest Updates

### ✨ New Features

#### 1. **Three-State Toggle System**
- **ON Button**: Click to activate mining mode (button turns green)
- **OFF State**: Deactivate mining but keep mined elements hidden
- **RESET Button (↻)**: Circular red button that restores ALL mined elements
  - Hover animation: rotates 180 degrees
  - Use this to restore the website to original state

#### 2. **Keyboard Shortcut**
- **Hold `Ctrl`**: Activates mining mode
- **Release `Ctrl`**: Deactivates mining mode
- **Important**: Elements stay hidden until you click RESET or reload the page
- Perfect for quick mining sessions!

#### 3. **Enhanced Visual Feedback**

##### Crack Animations - FIXED! 🎨
- **10 progressive crack stages** from subtle to complete destruction
- **Highly visible pixelated cracks** with dark black lines
- **Expanding pattern**: Cracks start small and grow to cover entire element
- **Border effects**: Each stage adds visible borders
- **Shadow effects**: Inset shadows make cracks appear deeper
- **Final stage**: Intense shaking animation with red glow

##### Visual Details:
- Stage 1-2: Small cracks in center
- Stage 3-5: Cracks expand outward
- Stage 6-8: Dense crack network with shadows
- Stage 9: Complete coverage + shake + red glow effect

### 🎮 How to Use

1. **Load the extension** in Chrome (`chrome://extensions/`)
2. **Visit any website**
3. **Enable mining** using either:
   - Click the purple button in top-right → turns green "Mining: ON"
   - Hold the `Ctrl` key
4. **Hover over elements** → green outline appears
5. **Click and hold** → watch the CRACKS appear and intensify!
6. **Hold until complete** → element disappears (visibility: hidden)
7. **Restore elements**:
   - Click the red RESET button (↻)
   - Or reload the page

### 🔧 Technical Improvements

- Fixed crack overlay z-index for better visibility
- Added overflow: hidden to prevent crack overflow
- Improved element position handling (converts static to relative)
- Enhanced crack patterns with solid backgrounds and borders
- Added proper button container with flexbox layout
- Keyboard event handlers for Ctrl key
- State management for keeping elements hidden vs restoring

### 🎯 Button Layout

```
┌─────────────────────────────────────┐
│                    [Mining: ON] [↻] │  ← Top right corner
└─────────────────────────────────────┘
   Purple/Green       Red Reset
   Toggle Button      Button
```

### 💡 Tips

- **Quick Mining**: Hold Ctrl, click elements, release Ctrl when done
- **Permanent Mode**: Click toggle button to keep mining active
- **Reset Anytime**: Click the ↻ button to restore everything
- **Visual Cracks**: Now MUCH more visible with thick black lines!
- **Ad Hunting**: Ads still give 2x XP - look for them!

### 🐛 Bug Fixes

- ✅ Toggle button now properly appears on all pages
- ✅ Crack overlays are now highly visible (was invisible before)
- ✅ Elements properly hide with visibility:hidden
- ✅ Reset functionality restores all elements correctly
- ✅ Keyboard shortcut keeps elements hidden after release
- ✅ Button hover states don't interfere with mining

---

**Version**: 1.1.0  
**Date**: November 14, 2025  
**Status**: Ready for testing! 🎉
