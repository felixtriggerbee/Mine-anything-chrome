# Crack SVG Assets

This folder will contain 5 SVG files representing progressive crack stages:

- `crack-1.svg` - First crack (lightest)
- `crack-2.svg` - Second crack stage
- `crack-3.svg` - Third crack stage  
- `crack-4.svg` - Fourth crack stage
- `crack-5.svg` - Fifth crack (heaviest)

These will overlay on elements during mining to show progressive damage.

## Current Status
Currently using CSS-based crack patterns. Once you add SVG files here, update the code to use them instead.

## Implementation Notes
- SVGs should be semi-transparent
- Black cracks work best over any background
- Recommended size: scalable vector, will stretch to fit element
- Format: SVG with viewBox for proper scaling
