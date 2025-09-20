# Fixed Ratio Trading - Container Standards

## Overview
This document defines the standardized container styles for all pages in the Fixed Ratio Trading dashboard to ensure consistent layout and user experience.

## Container Specifications

### Main Container
- **Max Width**: `1000px`
- **Margin**: `0 auto` (centered)
- **Background**: `rgba(255, 255, 255, 0.95)` (semi-transparent white)
- **Border Radius**: `15px`
- **Padding**: `30px`
- **Box Shadow**: `0 10px 30px rgba(0, 0, 0, 0.2)`

### Body Styles
- **Background**: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- **Min Height**: `100vh`
- **Padding**: `20px`
- **Font Family**: `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`

### Mobile Responsive
- **Container Padding**: Reduces to `20px` on screens ≤ 768px
- **Header**: Stacks vertically on mobile devices

## Implementation

### Option 1: Shared CSS File (Recommended for new projects)
Include the shared styles file:
```html
<link rel="stylesheet" href="shared-styles.css">
```

### Option 2: Inline Styles (Current implementation)
Copy the container CSS directly into each HTML file's `<style>` section.

## Files Updated
All HTML files in the `/html` directory have been standardized to use the 1000px container width:

- ✅ `index.html` (changed from 1400px)
- ✅ `swap.html` (already 1000px - reference standard)
- ✅ `pools.html` (changed from 1400px)
- ✅ `liquidity.html` (already 1000px)
- ✅ `pool-creation.html` (changed from 1200px)
- ✅ `token-creation.html` (changed from 1200px)
- ✅ `donate.html` (changed from 800px)
- ✅ `admin.html` (changed from 1400px)
- ✅ `admin-treasury.html` (changed from 1400px)
- ✅ `admin-system.html` (changed from 1200px)
- ✅ `admin-pool.html` (changed from 1200px)
- ✅ `pool-success.html` (changed from 800px)
- ✅ `token-images-preview.html` (changed from 1200px)
- ✅ `debug-localStorage.html` (already 1000px)

## Future Development Guidelines

### For New Pages
1. Use the standardized container width of `1000px`
2. Include the complete container CSS from `shared-styles.css`
3. Ensure mobile responsiveness with the provided media queries
4. Test on various screen sizes to ensure proper layout

### Design Rationale
- **1000px width** provides optimal readability and content organization
- **Semi-transparent background** creates visual depth while maintaining readability
- **Consistent spacing** (30px padding, 20px body padding) ensures uniform layout
- **Responsive design** maintains usability across all device sizes

## Testing
After implementing these standards, test pages on:
- Desktop (1920px+ width)
- Tablet (768px - 1024px width)
- Mobile (320px - 767px width)

## Maintenance
- When adding new pages, copy the container styles from `shared-styles.css`
- Periodically review pages to ensure consistency
- Update this document when standards change

---
*Last updated: September 20, 2025*
*Standard established from: swap.html container styles*
