#!/bin/bash

# Token Image Security Migration Script
# Migrates from token-image.php to token-image-secure.php

set -e

echo "================================================"
echo "Token Image Security Migration"
echo "================================================"
echo ""

# Configuration
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
HTML_DIR="./html"
CACHE_DIR="$HTML_DIR/cache/token-images"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Create backup
echo "Step 1: Creating backup..."
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    if [ -f "$HTML_DIR/token-image.php" ]; then
        cp "$HTML_DIR/token-image.php" "$BACKUP_DIR/"
        print_status "Backed up original token-image.php"
    fi
    
    if [ -d "$CACHE_DIR" ]; then
        cp -r "$CACHE_DIR" "$BACKUP_DIR/"
        print_status "Backed up cache directory"
    fi
else
    print_error "Backup directory already exists"
    exit 1
fi

# Step 2: Validate secure version exists
echo ""
echo "Step 2: Validating secure version..."
if [ ! -f "$HTML_DIR/token-image-secure.php" ]; then
    print_error "token-image-secure.php not found!"
    exit 1
fi
print_status "Secure version found"

# Step 3: Test secure version
echo ""
echo "Step 3: Testing secure version..."
if command -v php &> /dev/null; then
    php -l "$HTML_DIR/token-image-secure.php" &> /dev/null
    if [ $? -eq 0 ]; then
        print_status "PHP syntax check passed"
    else
        print_error "PHP syntax error in secure version"
        exit 1
    fi
else
    print_warning "PHP not found, skipping syntax check"
fi

# Step 4: Clean cache of potentially unsafe images
echo ""
echo "Step 4: Cleaning image cache..."
if [ -d "$CACHE_DIR" ]; then
    # Count files before cleaning
    TOTAL_FILES=$(find "$CACHE_DIR" -type f | wc -l)
    
    # Remove any security marker files from previous runs
    find "$CACHE_DIR" -name "*.security" -type f -delete 2>/dev/null || true
    
    print_status "Cache directory prepared (${TOTAL_FILES} files)"
else
    mkdir -p "$CACHE_DIR"
    print_status "Created cache directory"
fi

# Step 5: Update configuration files
echo ""
echo "Step 5: Updating configuration..."

# Check if we need to update any JavaScript files
JS_FILES=$(grep -l "token-image\.php" "$HTML_DIR"/*.js 2>/dev/null || true)
if [ ! -z "$JS_FILES" ]; then
    print_warning "Found references to token-image.php in JavaScript files:"
    echo "$JS_FILES"
    echo ""
    read -p "Do you want to update these references to token-image-secure.php? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for file in $JS_FILES; do
            sed -i.bak 's/token-image\.php/token-image-secure.php/g' "$file"
            print_status "Updated $(basename $file)"
        done
    else
        print_warning "Skipped JavaScript updates - manual update required"
    fi
fi

# Step 6: Create symlink for backward compatibility (optional)
echo ""
echo "Step 6: Backward compatibility..."
read -p "Create symlink for backward compatibility? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$HTML_DIR/token-image.php" ]; then
        mv "$HTML_DIR/token-image.php" "$HTML_DIR/token-image-old.php"
    fi
    ln -sf "token-image-secure.php" "$HTML_DIR/token-image.php"
    print_status "Created compatibility symlink"
else
    print_warning "No symlink created - update references manually"
fi

# Step 7: Set permissions
echo ""
echo "Step 7: Setting permissions..."
chmod 644 "$HTML_DIR/token-image-secure.php"
chmod 755 "$CACHE_DIR"
print_status "Permissions set"

# Step 8: Generate test report
echo ""
echo "Step 8: Generating test URLs..."
echo ""
echo "Test these URLs after deployment:"
echo "----------------------------------------"
echo "1. Valid token (should show image):"
echo "   /token-image-secure.php?mint=So11111111111111111111111111111111111111112"
echo ""
echo "2. Invalid mint (should show default '?'):"
echo "   /token-image-secure.php?mint=invalid"
echo ""
echo "3. Check security headers with:"
echo "   curl -I https://yourdomain.com/token-image-secure.php?mint=YOUR_MINT"
echo ""

# Summary
echo "================================================"
echo "Migration Summary"
echo "================================================"
print_status "Backup created at: $BACKUP_DIR"
print_status "Secure version ready: token-image-secure.php"

if [ -L "$HTML_DIR/token-image.php" ]; then
    print_status "Compatibility symlink created"
else
    print_warning "Remember to update references to token-image.php"
fi

echo ""
echo "Next steps:"
echo "1. Deploy to staging environment"
echo "2. Test with various token images"
echo "3. Monitor security logs for blocked images"
echo "4. Deploy to production when ready"
echo ""
print_status "Migration preparation complete!"
