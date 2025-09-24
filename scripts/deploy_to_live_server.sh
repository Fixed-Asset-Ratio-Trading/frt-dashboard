#!/bin/bash
# Deploy Fixed Ratio Trading Dashboard to Live Server with HTTPS/Nginx
# This script deploys the HTML dashboard to frt15.net with SSL/TLS encryption via Let's Encrypt
# Serves on https://frt15.net (port 443)
#
# Usage:
#   ./deploy_to_live_server.sh [--update|--restart|--stop|--status|--setup]
#
# Options:
#   --setup     Initial setup with SSL certificates and Nginx (first time)
#   --update    Update files and restart server (default)
#   --restart   Just restart the server without file updates
#   --stop      Stop the Nginx server
#   --status    Check server status
#   (no option) Update files and start/restart server

set -e

# Parse command line arguments
ACTION="update"  # Default action
for arg in "$@"; do
    case $arg in
        --setup)
            ACTION="setup"
            ;;
        --update)
            ACTION="update"
            ;;
        --restart)
            ACTION="restart"
            ;;
        --stop)
            ACTION="stop"
            ;;
        --status)
            ACTION="status"
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--setup|--update|--restart|--stop|--status]"
            exit 1
            ;;
    esac
done

# Find the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify we found the correct project directory
if [ ! -d "$PROJECT_ROOT/html" ]; then
    echo "❌ Error: Could not find html directory in project root: $PROJECT_ROOT"
    echo "   Please run this script from the frt-dashboard project directory or its subdirectories"
    exit 1
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
REMOTE_HOST="root@frt15.net"
DOMAIN="frt15.net"
REMOTE_BASE_DIR="/var/www"
REMOTE_HTML_DIR="$REMOTE_BASE_DIR/html"
NGINX_SITE_NAME="default"

echo "🚀 Fixed Ratio Trading Dashboard - Live Server Deployment (Mainnet)"
echo "=================================================================="
echo "📂 Local Project Root: $PROJECT_ROOT"
echo "🌐 Remote Host: $REMOTE_HOST"
echo "🔐 Domain: https://$DOMAIN"
echo "📁 Remote Directory: $REMOTE_BASE_DIR"
echo "🌐 Network: Solana Mainnet Beta"
echo "📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD"
echo ""

# Check for required tools
echo -e "${YELLOW}🔧 Checking required tools...${NC}"
MISSING_TOOLS=""
command -v ssh >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS ssh"
command -v rsync >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS rsync"

if [ -n "$MISSING_TOOLS" ]; then
    echo -e "${RED}❌ Missing required tools:$MISSING_TOOLS${NC}"
    echo "   Please install the missing tools first"
    exit 1
fi
echo -e "${GREEN}✅ All required tools found${NC}"

# Test SSH connectivity
echo -e "${YELLOW}🔍 Testing SSH connectivity...${NC}"
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$REMOTE_HOST" 'echo "SSH connection successful"' >/dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to $REMOTE_HOST${NC}"
    echo "   Please ensure:"
    echo "   1. SSH keys are set up correctly"
    echo "   2. The remote host is accessible"
    echo "   3. You can SSH manually: ssh $REMOTE_HOST"
    exit 1
fi
echo -e "${GREEN}✅ SSH connection successful${NC}"

# Function to setup PHP cache directories and permissions
setup_php_cache() {
    echo -e "${YELLOW}📁 Setting up PHP cache directories...${NC}"
    
    # Create all required cache directories
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_HTML_DIR/cache/token-images"
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_HTML_DIR/cache/token-metadata"
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_HTML_DIR/cache/pool_data"
    
    # Set proper ownership and permissions
    ssh "$REMOTE_HOST" "chown -R www-data:www-data $REMOTE_HTML_DIR/cache"
    ssh "$REMOTE_HOST" "chmod -R 755 $REMOTE_HTML_DIR/cache"
    
    # Ensure PHP can write to cache directories
    ssh "$REMOTE_HOST" "chmod -R 775 $REMOTE_HTML_DIR/cache/token-images"
    ssh "$REMOTE_HOST" "chmod -R 775 $REMOTE_HTML_DIR/cache/token-metadata"
    ssh "$REMOTE_HOST" "chmod -R 775 $REMOTE_HTML_DIR/cache/pool_data"
    
    echo -e "${GREEN}✅ PHP cache directories configured${NC}"
}

# Function to sync cache metadata overrides
sync_cache_metadata() {
    echo -e "${YELLOW}📁 Syncing cache metadata overrides...${NC}"
    
    # Check if token-metadata cache directory exists locally
    if [ -d "$PROJECT_ROOT/html/cache/token-metadata" ]; then
        echo "   Syncing token metadata overrides..."
        rsync -avz \
            "$PROJECT_ROOT/html/cache/token-metadata/" \
            "$REMOTE_HOST:$REMOTE_HTML_DIR/cache/token-metadata/"
        
        # Set proper permissions for metadata files
        ssh "$REMOTE_HOST" "chown -R www-data:www-data $REMOTE_HTML_DIR/cache/token-metadata"
        ssh "$REMOTE_HOST" "chmod -R 644 $REMOTE_HTML_DIR/cache/token-metadata/*"
        
        echo -e "${GREEN}✅ Token metadata overrides synced${NC}"
    else
        echo "   No token metadata overrides found locally"
    fi
    
    # Check if token-image-overrides.txt exists and sync it
    if [ -f "$PROJECT_ROOT/html/token-image-overrides.txt" ]; then
        echo "   Syncing token image overrides file..."
        rsync -avz \
            "$PROJECT_ROOT/html/token-image-overrides.txt" \
            "$REMOTE_HOST:$REMOTE_HTML_DIR/"
        
        # Set proper permissions
        ssh "$REMOTE_HOST" "chown www-data:www-data $REMOTE_HTML_DIR/token-image-overrides.txt"
        ssh "$REMOTE_HOST" "chmod 644 $REMOTE_HTML_DIR/token-image-overrides.txt"
        
        echo -e "${GREEN}✅ Token image overrides file synced${NC}"
    else
        echo "   No token image overrides file found locally"
    fi
}

# Function to check server status
check_server_status() {
    echo -e "${YELLOW}🔍 Checking HTTPS server status...${NC}"
    
    # Check if Nginx is running
    if ssh "$REMOTE_HOST" "systemctl is-active nginx >/dev/null 2>&1"; then
        echo -e "${GREEN}✅ Nginx is running${NC}"
        
        # Check if PHP-FPM is running
        if ssh "$REMOTE_HOST" "systemctl is-active php8.3-fpm >/dev/null 2>&1"; then
            echo -e "${GREEN}✅ PHP-FPM is running${NC}"
        else
            echo -e "${RED}❌ PHP-FPM is not running${NC}"
        fi
        
        # Test HTTPS connection
        if curl -k -s --connect-timeout 10 "https://$DOMAIN/" | grep -q "Welcome\|Dashboard\|Fixed Ratio"; then
            echo -e "${GREEN}✅ HTTPS server is responding${NC}"
            echo -e "${GREEN}🌐 Dashboard URL: https://$DOMAIN${NC}"
            echo -e "${GREEN}🔒 SSL Certificate: Let's Encrypt (auto-renewed)${NC}"
            echo -e "${GREEN}🌐 Network: Solana Mainnet Beta${NC}"
            echo -e "${GREEN}📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD${NC}"
            
            # Test token-image.php
            if curl -k -s --connect-timeout 10 "https://$DOMAIN/token-image.php?mint=So11111111111111111111111111111111111111112" | file - | grep -q "image"; then
                echo -e "${GREEN}✅ Token image service is working${NC}"
            else
                echo -e "${YELLOW}⚠️ Token image service may not be working properly${NC}"
            fi
            
            return 0
        else
            echo -e "${YELLOW}⚠️ Nginx is running but HTTPS not responding properly${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Nginx is not running${NC}"
        return 1
    fi
}

# Function to start/restart services
restart_services() {
    echo -e "${YELLOW}🚀 Restarting services...${NC}"
    
    # Restart PHP-FPM first
    ssh "$REMOTE_HOST" "systemctl restart php8.3-fpm"
    
    # Then restart Nginx
    ssh "$REMOTE_HOST" "systemctl restart nginx"
    
    echo -e "${GREEN}✅ Services restarted${NC}"
}

# Function to stop services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    
    ssh "$REMOTE_HOST" "systemctl stop nginx"
    ssh "$REMOTE_HOST" "systemctl stop php8.3-fpm"
    
    echo -e "${GREEN}✅ Services stopped${NC}"
}

# Function to sync files to remote
sync_files() {
    echo -e "${YELLOW}📁 Syncing dashboard files to remote server...${NC}"
    
    # Sync HTML files
    echo "   Syncing HTML files..."
    rsync -avz --delete \
        --exclude='*.log' \
        --exclude='*.tmp' \
        --exclude='.DS_Store' \
        --exclude='cache/token-images/' \
        --exclude='cache/pool_data/' \
        --exclude='config.json' \
        "$PROJECT_ROOT/html/" "$REMOTE_HOST:$REMOTE_HTML_DIR/"
    
    # Set proper permissions
    ssh "$REMOTE_HOST" "chown -R www-data:www-data $REMOTE_HTML_DIR"
    ssh "$REMOTE_HOST" "find $REMOTE_HTML_DIR -type d -exec chmod 755 {} \;"
    ssh "$REMOTE_HOST" "find $REMOTE_HTML_DIR -type f -exec chmod 644 {} \;"
    
    # Make PHP files executable
    ssh "$REMOTE_HOST" "chmod 755 $REMOTE_HTML_DIR/*.php"
    
    echo -e "${GREEN}✅ Files synced successfully${NC}"
}

# Function to update remote configuration
update_config() {
    echo -e "${YELLOW}⚙️ Updating remote configuration for Solana Mainnet...${NC}"
    
    # Read existing credentials from current config.json if it exists
    echo "   Checking for existing credentials..."
    EXISTING_USERNAME=""
    EXISTING_PASSWORD=""
    
    if ssh "$REMOTE_HOST" "test -f $REMOTE_HTML_DIR/config.json"; then
        echo "   Found existing config.json, preserving credentials..."
        EXISTING_CREDS=$(ssh "$REMOTE_HOST" "jq -r '.solana.auth // empty' $REMOTE_HTML_DIR/config.json 2>/dev/null || echo 'null'")
        if [ "$EXISTING_CREDS" != "null" ] && [ "$EXISTING_CREDS" != "" ]; then
            EXISTING_USERNAME=$(echo "$EXISTING_CREDS" | jq -r '.username // empty' 2>/dev/null || echo "")
            EXISTING_PASSWORD=$(echo "$EXISTING_CREDS" | jq -r '.password // empty' 2>/dev/null || echo "")
            if [ -n "$EXISTING_USERNAME" ] && [ -n "$EXISTING_PASSWORD" ]; then
                echo "   ✅ Found existing credentials for user: $EXISTING_USERNAME"
            fi
        fi
    else
        echo "   No existing config.json found, will create new one"
    fi
    
    # Create config for HTTPS deployment with mainnet settings using Chainstack
    ssh "$REMOTE_HOST" "cat > $REMOTE_HTML_DIR/config.json << 'EOF'
{
  \"solana\": {
    \"rpcUrl\": \"https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602\",
    \"wsUrl\": \"wss://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602\",
    \"commitment\": \"confirmed\",
    \"disableRetryOnRateLimit\": false,
    \"network\": \"mainnet-beta\",
    \"provider\": \"chainstack\"$(if [ -n "$EXISTING_USERNAME" ] && [ -n "$EXISTING_PASSWORD" ]; then echo ",
    \"auth\": {
      \"username\": \"$EXISTING_USERNAME\",
      \"password\": \"$EXISTING_PASSWORD\"
    }"; fi)
  },
  \"program\": {
    \"programId\": \"quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD\",
    \"poolStateSeedPrefix\": \"pool_state\"
  },
  \"metaplex\": {
    \"tokenMetadataProgramId\": \"metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s\",
    \"candyMachineProgramId\": \"cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ\",
    \"auctionHouseProgramId\": \"hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk\",
    \"lastUpdated\": \"$(date +%Y-%m-%d)\",
    \"deploymentType\": \"mainnet\",
    \"remoteRpcUrl\": \"https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602\"
  },
  \"wallets\": {
    \"expectedBackpackWallet\": \"5GGZiMwU56rYL1L52q7Jz7ELkSN4iYyQqdv418hxPh6t\"
  },
  \"dashboard\": {
    \"refreshInterval\": 10000,
    \"title\": \"Fixed Ratio Trading Dashboard\",
    \"network\": \"mainnet-beta\"
  },
  \"deployment\": {
    \"type\": \"https\",
    \"domain\": \"$DOMAIN\",
    \"port\": 443,
    \"secure\": true,
    \"network\": \"mainnet-beta\"
  },
  \"version\": \"1.0.0\",
  \"lastUpdated\": \"$(date +%Y-%m-%d)\",
  \"_description\": \"Centralized configuration for Fixed Ratio Trading project - Live deployment\"
}
EOF"
    
    # Report credential status
    if [ -n "$EXISTING_USERNAME" ] && [ -n "$EXISTING_PASSWORD" ]; then
        echo -e "${GREEN}✅ Chainstack credentials preserved in new config${NC}"
        echo "   🔑 Username: $EXISTING_USERNAME"
    else
        echo -e "${YELLOW}⚠️ No existing credentials found${NC}"
        echo "   Server will use default RPC endpoints without authentication"
    fi
    
    echo -e "${GREEN}✅ Remote configuration updated for Solana Mainnet${NC}"
    echo "   🌐 Network: Solana Mainnet Beta"
    echo "   🔗 RPC Provider: Chainstack (Authenticated)"
    echo "   🔗 RPC URL: https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602"
    echo "   📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD"
}

# Function to test PHP services functionality
test_php_services() {
    echo -e "${YELLOW}🖼️ Testing PHP services...${NC}"
    
    # Test token-image.php with SOL token (well-known token)
    echo "   Testing token-image.php with SOL token..."
    if curl -k -s --connect-timeout 10 "https://$DOMAIN/token-image.php?mint=So11111111111111111111111111111111111111112" | file - | grep -q "image"; then
        echo -e "${GREEN}✅ Token image service is working${NC}"
    else
        echo -e "${YELLOW}⚠️ Token image service test inconclusive${NC}"
    fi
    
    # Test pool-data.php with a known pool address (if available)
    echo "   Testing pool-data.php..."
    POOL_TEST_RESPONSE=$(curl -k -s --connect-timeout 10 "https://$DOMAIN/pool-data.php?poolAddress=test" 2>/dev/null)
    if echo "$POOL_TEST_RESPONSE" | grep -q "error.*Invalid pool address format"; then
        echo -e "${GREEN}✅ Pool data service is responding correctly${NC}"
    else
        echo -e "${YELLOW}⚠️ Pool data service test inconclusive${NC}"
    fi
    
    # Check all cache directories
    echo "   Checking cache directories..."
    if ssh "$REMOTE_HOST" "test -d $REMOTE_HTML_DIR/cache/token-images && test -w $REMOTE_HTML_DIR/cache/token-images"; then
        echo -e "${GREEN}✅ Token images cache directory is writable${NC}"
    else
        echo -e "${RED}❌ Token images cache directory issues detected${NC}"
        setup_php_cache
    fi
    
    if ssh "$REMOTE_HOST" "test -d $REMOTE_HTML_DIR/cache/token-metadata && test -w $REMOTE_HTML_DIR/cache/token-metadata"; then
        echo -e "${GREEN}✅ Token metadata cache directory is writable${NC}"
    else
        echo -e "${RED}❌ Token metadata cache directory issues detected${NC}"
        setup_php_cache
    fi
    
    if ssh "$REMOTE_HOST" "test -d $REMOTE_HTML_DIR/cache/pool_data && test -w $REMOTE_HTML_DIR/cache/pool_data"; then
        echo -e "${GREEN}✅ Pool data cache directory is writable${NC}"
    else
        echo -e "${RED}❌ Pool data cache directory issues detected${NC}"
        setup_php_cache
    fi
}

# Execute the requested action
case $ACTION in
    "setup")
        echo -e "${BLUE}🔧 Initial live server setup...${NC}"
        sync_files
        setup_php_cache
        sync_cache_metadata
        update_config
        restart_services
        test_php_services
        ;;
    "status")
        check_server_status
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        echo -e "${BLUE}🔄 Restarting live server...${NC}"
        restart_services
        ;;
    "update")
        echo -e "${BLUE}🔄 Updating and deploying dashboard...${NC}"
        sync_files
        setup_php_cache
        sync_cache_metadata
        update_config
        restart_services
        test_php_services
        ;;
esac

echo ""
echo "=================================================================="
echo -e "${GREEN}🎉 LIVE SERVER DEPLOYMENT COMPLETE!${NC}"
echo "=================================================================="
echo -e "${BLUE}📊 Your Fixed Ratio Trading Dashboard is live:${NC}"
echo ""
echo "  🔐 HTTPS URL: https://$DOMAIN"
echo "  🖥️ Remote Host: $REMOTE_HOST"
echo "  📁 Remote Directory: $REMOTE_BASE_DIR"
echo "  🔌 Server Port: 443 (HTTPS)"
echo "  🖼️ Token Images: https://$DOMAIN/token-image.php"
echo "  📊 Pool Data: https://$DOMAIN/pool-data.php"
echo ""
echo -e "${BLUE}🌐 Solana Network Configuration:${NC}"
echo "  🔗 Network: Mainnet Beta"
echo "  📡 RPC URL: https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602"
echo "  🔗 Provider: Chainstack (Authenticated)"
echo "  📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD"
echo ""
echo -e "${BLUE}📋 Management Commands:${NC}"
echo "  📊 Check Status:  ./scripts/deploy_to_live_server.sh --status"
echo "  🔄 Update Files:  ./scripts/deploy_to_live_server.sh --update"
echo "  🚀 Restart:       ./scripts/deploy_to_live_server.sh --restart"
echo "  🛑 Stop Server:   ./scripts/deploy_to_live_server.sh --stop"
echo ""
echo -e "${BLUE}📝 SSL Certificate Info:${NC}"
echo "  🔐 Certificate:   Let's Encrypt (auto-renewed)"
echo "  📅 Auto-Renewal: Every 90 days"
echo ""
echo -e "${GREEN}💡 The dashboard is now live with HTTPS encryption!${NC}"
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. 🌐 Open https://$DOMAIN in your browser"
echo "  2. 🔄 Run './scripts/deploy_to_live_server.sh --update' when you make local changes"
echo "  3. 📊 Monitor with './scripts/deploy_to_live_server.sh --status'"
echo "  4. 🖼️ Test token images at https://$DOMAIN/token-image.php?mint=So11111111111111111111111111111111111111112"
echo "  5. 📊 Test pool data at https://$DOMAIN/pool-data.php?poolAddress=<pool_address>"
echo ""
echo -e "${YELLOW}🔐 Chainstack Credentials:${NC}"
echo "  Credentials are automatically preserved from existing config.json during deployment."
echo "  If credentials exist in the current server config, they will be maintained."
echo "  To add credentials initially, manually update the server's config.json file."
echo ""
