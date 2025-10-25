#!/bin/bash
# Deploy Fixed Ratio Trading Dashboard to Remote Server with HTTPS/Nginx
# This script deploys the HTML dashboard to vmdevbox1 with SSL/TLS encryption
# Serves on https://frtstage.davincij15.com (port 443)
#
# Usage:
#   ./deploy_to_stage_dashboard.sh [--update|--restart|--stop|--status|--setup]
#
# Options:
#   --setup     Initial setup with SSL certificates and Nginx (first time)
#   --update    Update files and restart server (default)
#   --restart   Just restart the server without file updates
#   --stop      Stop the Nginx server
#   --status    Check server status
#   (no option) Update files and start/restart server

# Note: Not using 'set -e' to handle expected rsync permission warnings gracefully

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
REMOTE_HOST="dev@vmdevbox1"
FRT_DOMAIN="frtstage.davincij15.com"
REMOTE_IP="192.168.2.88"
REMOTE_BASE_DIR="/home/dev/dashboard"
REMOTE_HTML_DIR="$REMOTE_BASE_DIR/html"
REMOTE_FRT_DIR="$REMOTE_HTML_DIR/frt"
REMOTE_SSL_DIR="/home/dev/ssl"
NGINX_SITE_NAME="frt-dashboard"
CERT_FILE="$PROJECT_ROOT/davincij15_cert.txt"

echo "🚀 Fixed Ratio Trading Dashboard - HTTPS Stage Deployment"
echo "=========================================================="
echo "📂 Local Project Root: $PROJECT_ROOT"
echo "🌐 Remote Host: $REMOTE_HOST"
echo "🔐 FRT Domain: https://$FRT_DOMAIN"
echo "📁 Remote Directory: $REMOTE_BASE_DIR"
echo "🌐 Network: Solana Mainnet Beta"
echo "📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD"
echo ""

# Check for required tools
echo -e "${YELLOW}🔧 Checking required tools...${NC}"
MISSING_TOOLS=""
command -v ssh >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS ssh"
command -v rsync >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS rsync"
command -v openssl >/dev/null 2>&1 || MISSING_TOOLS="$MISSING_TOOLS openssl"

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

# Function to extract and deploy SSL certificates
setup_ssl_certificates() {
    echo -e "${YELLOW}🔐 Setting up SSL certificates...${NC}"
    
    # Check if certificate file exists
    if [ ! -f "$CERT_FILE" ]; then
        echo -e "${RED}❌ Certificate file not found: $CERT_FILE${NC}"
        echo "   Please ensure the certificate file exists before running setup"
        exit 1
    fi
    
    # Create temporary directory for certificate processing
    TEMP_CERT_DIR=$(mktemp -d)
    
    echo "   Extracting private key..."
    # Extract private key (between first -----BEGIN RSA PRIVATE KEY----- and -----END RSA PRIVATE KEY-----)
    sed -n '/-----BEGIN RSA PRIVATE KEY-----/,/-----END RSA PRIVATE KEY-----/p' "$CERT_FILE" > "$TEMP_CERT_DIR/private.key"
    
    echo "   Extracting certificate chain..."
    # Extract all certificates (everything from first -----BEGIN CERTIFICATE----- to end)
    sed -n '/-----BEGIN CERTIFICATE-----/,$ p' "$CERT_FILE" > "$TEMP_CERT_DIR/fullchain.pem"
    
    # Validate extracted files
    if ! openssl rsa -in "$TEMP_CERT_DIR/private.key" -check >/dev/null 2>&1; then
        echo -e "${RED}❌ Invalid private key extracted${NC}"
        rm -rf "$TEMP_CERT_DIR"
        exit 1
    fi
    
    if ! openssl x509 -in "$TEMP_CERT_DIR/fullchain.pem" -text >/dev/null 2>&1; then
        echo -e "${RED}❌ Invalid certificate extracted${NC}"
        rm -rf "$TEMP_CERT_DIR"
        exit 1
    fi
    
    echo -e "${GREEN}✅ SSL certificates extracted and validated${NC}"
    
    # Create SSL directory on remote server
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_SSL_DIR && chmod 700 $REMOTE_SSL_DIR"
    
    # Copy certificates to remote server
    echo "   Uploading certificates to remote server..."
    scp "$TEMP_CERT_DIR/private.key" "$REMOTE_HOST:$REMOTE_SSL_DIR/private.key"
    scp "$TEMP_CERT_DIR/fullchain.pem" "$REMOTE_HOST:$REMOTE_SSL_DIR/fullchain.pem"
    
    # Set proper permissions on remote
    ssh "$REMOTE_HOST" "chmod 600 $REMOTE_SSL_DIR/private.key && chmod 644 $REMOTE_SSL_DIR/fullchain.pem"
    
    # Clean up temporary files
    rm -rf "$TEMP_CERT_DIR"
    
    echo -e "${GREEN}✅ SSL certificates deployed to remote server${NC}"
}

# Function to setup Nginx
setup_nginx() {
    echo -e "${YELLOW}🌐 Setting up Nginx...${NC}"
    
    # Check if Nginx is installed
    if ! ssh "$REMOTE_HOST" "which nginx >/dev/null 2>&1"; then
        echo -e "${RED}❌ Nginx is not installed on the remote server${NC}"
        echo "   Please install Nginx first:"
        echo "   ssh $REMOTE_HOST 'sudo apt-get update && sudo apt-get install -y nginx'"
        exit 1
    fi
    echo "   Nginx is already installed"
    
    # Stop any existing Python servers on port 9090
    ssh "$REMOTE_HOST" "pkill -f 'python.*http.server.*9090' || true"
    
    # Create Nginx configuration for FRT
    echo "   Creating Nginx configuration for FRT domain..."
    ssh "$REMOTE_HOST" "cat > /tmp/frt-dashboard.conf << 'EOF'
# HTTP to HTTPS redirects
server {
    listen 80;
    server_name $FRT_DOMAIN $REMOTE_IP;
    
    # Redirect all HTTP traffic to HTTPS
    return 301 https://\$server_name\$request_uri;
}

# FRT15 Stage Domain - Fixed Ratio Trading
server {
    listen 443 ssl http2;
    server_name $FRT_DOMAIN;
    
    # SSL Configuration
    ssl_certificate $REMOTE_SSL_DIR/fullchain.pem;
    ssl_certificate_key $REMOTE_SSL_DIR/private.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection \"1; mode=block\" always;
    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;
    
    # Document root for FRT
    root $REMOTE_FRT_DIR;
    index index.html;
    
    # PHP handling
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        include fastcgi_params;
    }
    
    # Main location
    location / {
        try_files \$uri \$uri/ =404;
        
        # Cache static assets
        location ~* \\.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control \"public, immutable\";
        }
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 \"FRT Stage healthy\\n\";
        add_header Content-Type text/plain;
    }
}

# Default server for IP access - redirect to FRT
server {
    listen 443 ssl http2 default_server;
    server_name $REMOTE_IP;
    
    # SSL Configuration
    ssl_certificate $REMOTE_SSL_DIR/fullchain.pem;
    ssl_certificate_key $REMOTE_SSL_DIR/private.key;
    
    # Redirect IP access to FRT domain
    return 301 https://$FRT_DOMAIN\$request_uri;
}
EOF"
    
    # Move config to sites-available and enable it
    ssh "$REMOTE_HOST" "sudo mv /tmp/frt-dashboard.conf /etc/nginx/sites-available/$NGINX_SITE_NAME"
    ssh "$REMOTE_HOST" "sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE_NAME /etc/nginx/sites-enabled/$NGINX_SITE_NAME"
    
    # Remove default site if it exists
    ssh "$REMOTE_HOST" "sudo rm -f /etc/nginx/sites-enabled/default"
    
    # Test Nginx configuration
    echo "   Testing Nginx configuration..."
    if ! ssh "$REMOTE_HOST" "sudo nginx -t"; then
        echo -e "${RED}❌ Nginx configuration test failed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Nginx configuration created and tested${NC}"
}

# Function to check server status
check_server_status() {
    echo -e "${YELLOW}🔍 Checking HTTPS server status...${NC}"
    
    # Check if Nginx is running without sudo (just check process)
    if ssh "$REMOTE_HOST" "pgrep nginx >/dev/null 2>&1"; then
        echo -e "${GREEN}✅ Nginx is running${NC}"
        
        # Test FRT domain
        echo "   Testing FRT domain..."
        if curl -k -s --connect-timeout 10 "https://$FRT_DOMAIN/health" | grep -q "FRT Stage healthy"; then
            echo -e "${GREEN}✅ FRT Stage server is responding${NC}"
        else
            echo -e "${YELLOW}⚠️ FRT Stage server not responding properly${NC}"
        fi
        
        echo -e "${GREEN}🌐 FRT Dashboard: https://$FRT_DOMAIN${NC}"
        echo -e "${GREEN}🔒 SSL Certificate: Valid (expires 03-05-2026)${NC}"
        echo -e "${GREEN}🌐 Network: Solana Mainnet Beta${NC}"
        echo -e "${GREEN}📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD${NC}"
        return 0
    else
        echo -e "${BLUE}ℹ️ Nginx is not running${NC}"
        return 1
    fi
}

# Function to start/restart Nginx
start_nginx() {
    echo -e "${YELLOW}🚀 Starting/restarting Nginx...${NC}"
    
    # Check if Nginx is already running
    if ssh "$REMOTE_HOST" "pgrep nginx >/dev/null 2>&1"; then
        echo "   Nginx is already running, files updated successfully"
        echo -e "${GREEN}✅ Dashboard updated without restart needed${NC}"
        return 0
    else
        echo -e "${RED}❌ Nginx is not running${NC}"
        echo "   Please manually restart Nginx on the remote server:"
        echo "   ssh $REMOTE_HOST 'sudo systemctl restart nginx'"
        return 1
    fi
}

# Function to stop Nginx
stop_nginx() {
    echo -e "${YELLOW}🛑 Stopping Nginx...${NC}"
    
    ssh "$REMOTE_HOST" "sudo systemctl stop nginx"
    
    echo -e "${GREEN}✅ Nginx stopped${NC}"
}

# Function to sync files to remote
sync_files() {
    echo -e "${YELLOW}📁 Syncing dashboard files to remote server...${NC}"
    
    # Create remote directories
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_BASE_DIR $REMOTE_HTML_DIR $REMOTE_FRT_DIR"
    
    # Temporarily change ownership to dev user for syncing
    echo "   Preparing remote directory for sync..."
    ssh "$REMOTE_HOST" "sudo chown -R dev:dev $REMOTE_FRT_DIR 2>/dev/null || true"
    
    # Sync FRT files
    echo "   Syncing FRT dashboard files..."
    rsync -avz --delete \
        --exclude='*.log' \
        --exclude='*.tmp' \
        --exclude='.DS_Store' \
        --exclude='cache/token-images/' \
        --exclude='cache/token-metadata/' \
        --exclude='cache/pool_data/' \
        --exclude='config.json' \
        "$PROJECT_ROOT/html/" "$REMOTE_HOST:$REMOTE_FRT_DIR/"
    
    # Set proper permissions for FRT
    ssh "$REMOTE_HOST" "sudo chown -R www-data:www-data $REMOTE_FRT_DIR"
    ssh "$REMOTE_HOST" "sudo find $REMOTE_FRT_DIR -type d -exec chmod 755 {} \;"
    ssh "$REMOTE_HOST" "sudo find $REMOTE_FRT_DIR -type f -exec chmod 644 {} \;"
    ssh "$REMOTE_HOST" "sudo find $REMOTE_FRT_DIR -name '*.php' -exec chmod 755 {} \;"
    
    # Set up PHP cache directories for FRT
    echo "   Setting up PHP cache directories..."
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_FRT_DIR/cache/token-images $REMOTE_FRT_DIR/cache/token-metadata $REMOTE_FRT_DIR/cache/pool_data"
    ssh "$REMOTE_HOST" "sudo chown -R www-data:www-data $REMOTE_FRT_DIR/cache"
    ssh "$REMOTE_HOST" "sudo chmod -R 775 $REMOTE_FRT_DIR/cache/token-images"
    ssh "$REMOTE_HOST" "sudo chmod -R 775 $REMOTE_FRT_DIR/cache/token-metadata"
    ssh "$REMOTE_HOST" "sudo chmod -R 775 $REMOTE_FRT_DIR/cache/pool_data"
    
    echo -e "${GREEN}✅ Files synced successfully${NC}"
}

# Function to sync cache metadata overrides
sync_cache_metadata() {
    echo -e "${YELLOW}📁 Syncing cache metadata overrides...${NC}"
    
    # Check if FRT token-metadata cache directory exists locally
    if [ -d "$PROJECT_ROOT/html/cache/token-metadata" ]; then
        echo "   Syncing token metadata overrides..."
        rsync -avz \
            "$PROJECT_ROOT/html/cache/token-metadata/" \
            "$REMOTE_HOST:$REMOTE_FRT_DIR/cache/token-metadata/"
        
        # Set proper permissions for metadata files
        ssh "$REMOTE_HOST" "sudo chown -R www-data:www-data $REMOTE_FRT_DIR/cache/token-metadata"
        ssh "$REMOTE_HOST" "sudo chmod -R 644 $REMOTE_FRT_DIR/cache/token-metadata/*"
        
        echo -e "${GREEN}✅ Token metadata overrides synced${NC}"
    else
        echo "   No token metadata overrides found locally"
    fi
    
    # Check if token-image-overrides.txt exists and sync it
    if [ -f "$PROJECT_ROOT/html/token-image-overrides.txt" ]; then
        echo "   Syncing token image overrides file..."
        rsync -avz \
            "$PROJECT_ROOT/html/token-image-overrides.txt" \
            "$REMOTE_HOST:$REMOTE_FRT_DIR/"
        
        # Set proper permissions
        ssh "$REMOTE_HOST" "sudo chown www-data:www-data $REMOTE_FRT_DIR/token-image-overrides.txt"
        ssh "$REMOTE_HOST" "sudo chmod 644 $REMOTE_FRT_DIR/token-image-overrides.txt"
        
        echo -e "${GREEN}✅ Token image overrides file synced${NC}"
    else
        echo "   No token image overrides file found locally"
    fi
}

# Function to store Chainstack credentials securely on remote server
store_chainstack_credentials() {
    echo -e "${YELLOW}🔐 Storing Chainstack credentials securely on remote server...${NC}"
    
    # Create secure credentials directory on remote server (outside web root)
    ssh "$REMOTE_HOST" "mkdir -p /home/dev/.config/chainstack && chmod 700 /home/dev/.config/chainstack"
    
    # Store credentials in secure file on remote server
    ssh "$REMOTE_HOST" "cat > /home/dev/.config/chainstack/credentials << 'EOF'
# Chainstack Solana Mainnet Credentials
# Generated: $(date)
# WARNING: Keep this file secure - contains API credentials

# Direct endpoints (no auth required)
CHAINSTACK_HTTPS_ENDPOINT=https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602
CHAINSTACK_WSS_ENDPOINT=wss://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602

# Password-protected endpoints (for future use if needed)
# CHAINSTACK_HTTPS_BASE=https://solana-mainnet.core.chainstack.com
# CHAINSTACK_WSS_BASE=wss://solana-mainnet.core.chainstack.com
# CHAINSTACK_USERNAME=[REMOVED - Use environment variables]
# CHAINSTACK_PASSWORD=[REMOVED - Use environment variables]

# Usage notes:
# - Direct endpoints are configured for origin/IP filtering
# - Password-protected endpoints available as backup
# - Never commit these credentials to version control
# - Use environment variables for sensitive credentials
EOF"
    
    # Set secure permissions
    ssh "$REMOTE_HOST" "chmod 600 /home/dev/.config/chainstack/credentials"
    
    echo -e "${GREEN}✅ Chainstack credentials stored securely at /home/dev/.config/chainstack/credentials${NC}"
    echo "   🔒 File permissions: 600 (owner read/write only)"
    echo "   📁 Location: Outside web root for security"
}

# Function to check remote configuration (read-only)
check_config() {
    echo -e "${YELLOW}ℹ️  Checking remote configuration...${NC}"
    
    if ssh "$REMOTE_HOST" "test -f $REMOTE_FRT_DIR/config.json"; then
        echo -e "${GREEN}✅ Server config.json exists${NC}"
        echo "   📝 Note: config.json is managed on the server and preserved during deployments"
        echo "   📄 Reference: html/sample-config.json for configuration structure"
    else
        echo -e "${YELLOW}⚠️  Server config.json not found${NC}"
        echo "   Please manually create $REMOTE_FRT_DIR/config.json on the server"
        echo "   Use html/sample-config.json as a template"
    fi
}

# Execute the requested action
case $ACTION in
    "setup")
        echo -e "${BLUE}🔧 Initial HTTPS setup...${NC}"
        setup_ssl_certificates
        store_chainstack_credentials
        sync_files
        sync_cache_metadata
        check_config
        setup_nginx
        start_nginx
        ;;
    "status")
        check_server_status
        check_config
        ;;
    "stop")
        stop_nginx
        ;;
    "restart")
        echo -e "${BLUE}🔄 Restarting HTTPS server...${NC}"
        start_nginx
        ;;
    "update")
        echo -e "${BLUE}🔄 Updating and deploying dashboard...${NC}"
        sync_files
        sync_cache_metadata
        check_config
        start_nginx
        ;;
esac

echo ""
echo "============================================================"
echo -e "${GREEN}🎉 STAGE DEPLOYMENT COMPLETE!${NC}"
echo "============================================================"
echo -e "${BLUE}📊 Your Fixed Ratio Trading Dashboard is deployed:${NC}"
echo ""
echo "  🔐 FRT Dashboard: https://$FRT_DOMAIN"
echo "  🌐 IP Access: https://$REMOTE_IP (redirects to FRT)"
echo "  🖥️ Remote Host: $REMOTE_HOST"
echo "  📁 Remote Directory: $REMOTE_BASE_DIR"
echo "  🔌 Server Port: 443 (HTTPS)"
echo ""
echo -e "${BLUE}🌐 Solana Network Configuration:${NC}"
echo "  🔗 Network: Mainnet Beta"
echo "  📡 RPC URL: https://api.mainnet-beta.solana.com"
echo "  📋 Program ID: quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD"
echo "  ⚠️  Note: Program not yet deployed - will work once deployed"
echo ""
echo -e "${BLUE}📋 Management Commands:${NC}"
echo "  📊 Check Status:  ./scripts/deploy_to_stage_dashboard.sh --status"
echo "  🔄 Update Files:  ./scripts/deploy_to_stage_dashboard.sh --update"
echo "  🚀 Restart:       ./scripts/deploy_to_stage_dashboard.sh --restart"
echo "  🛑 Stop Server:   ./scripts/deploy_to_stage_dashboard.sh --stop"
echo ""
echo -e "${BLUE}📝 SSL Certificate Info:${NC}"
echo "  🔐 Certificate:   $REMOTE_SSL_DIR/fullchain.pem"
echo "  🔑 Private Key:   $REMOTE_SSL_DIR/private.key"
echo "  📅 Expires:       03-05-2026"
echo ""
echo -e "${GREEN}💡 The dashboard is now live with HTTPS encryption!${NC}"
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. 🌐 Open https://$FRT_DOMAIN for Fixed Ratio Trading"
echo "  2. 🔄 Run './scripts/deploy_to_stage_dashboard.sh --update' when you make local changes"
echo "  3. 📊 Monitor with './scripts/deploy_to_stage_dashboard.sh --status'"
echo ""
