#!/bin/bash
# Deploy Fixed Ratio Trading Dashboard to Remote Server
# This script deploys the HTML dashboard to vmdevbox1 and serves it on port 9090
#
# Usage:
#   ./deploy_remote_dashboard.sh [--update|--restart|--stop|--status]
#
# Options:
#   --update    Update files and restart server (default)
#   --restart   Just restart the server without file updates
#   --stop      Stop the remote dashboard server
#   --status    Check server status
#   (no option) Update files and start/restart server

set -e

# Parse command line arguments
ACTION="update"  # Default action
for arg in "$@"; do
    case $arg in
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
            echo "Usage: $0 [--update|--restart|--stop|--status]"
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
REMOTE_PORT="9090"
REMOTE_BASE_DIR="/home/dev/dashboard"
REMOTE_HTML_DIR="$REMOTE_BASE_DIR/html"
REMOTE_SCRIPTS_DIR="$REMOTE_BASE_DIR/scripts"
SERVICE_NAME="frt-dashboard"

echo "🚀 Fixed Ratio Trading Dashboard - Remote Deployment"
echo "===================================================="
echo "📂 Local Project Root: $PROJECT_ROOT"
echo "🌐 Remote Host: $REMOTE_HOST"
echo "🔌 Remote Port: $REMOTE_PORT"
echo "📁 Remote Directory: $REMOTE_BASE_DIR"
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

# Function to check if remote dashboard server is running
check_server_status() {
    echo -e "${YELLOW}🔍 Checking remote server status...${NC}"
    
    # Check if the process is running
    if ssh "$REMOTE_HOST" "pgrep -f 'python.*http.server.*$REMOTE_PORT' >/dev/null 2>&1"; then
        PID=$(ssh "$REMOTE_HOST" "pgrep -f 'python.*http.server.*$REMOTE_PORT'")
        echo -e "${GREEN}✅ Dashboard server is running (PID: $PID)${NC}"
        
        # Test if the port is actually responding
        if ssh "$REMOTE_HOST" "curl -s --connect-timeout 5 http://localhost:$REMOTE_PORT >/dev/null 2>&1"; then
            echo -e "${GREEN}✅ Server is responding on port $REMOTE_PORT${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️ Server process exists but port $REMOTE_PORT not responding${NC}"
            return 1
        fi
    else
        echo -e "${BLUE}ℹ️ Dashboard server is not running${NC}"
        return 1
    fi
}

# Function to stop the remote server
stop_server() {
    echo -e "${YELLOW}🛑 Stopping remote dashboard server...${NC}"
    
    # Kill both the bash wrapper and Python processes
    if ssh "$REMOTE_HOST" "pgrep -f 'python.*http.server.*$REMOTE_PORT' >/dev/null 2>&1"; then
        echo "   Stopping Python HTTP server processes..."
        ssh "$REMOTE_HOST" "pkill -f 'python.*http.server.*$REMOTE_PORT'" || true
        sleep 2
        
        # Also kill any bash wrappers that might be running the server
        ssh "$REMOTE_HOST" "pkill -f 'nohup.*python.*http.server.*$REMOTE_PORT'" || true
        sleep 1
        
        # Force kill if still running
        if ssh "$REMOTE_HOST" "pgrep -f 'python.*http.server.*$REMOTE_PORT' >/dev/null 2>&1"; then
            echo -e "${YELLOW}⚠️ Server still running, force killing...${NC}"
            ssh "$REMOTE_HOST" "pkill -9 -f 'python.*http.server.*$REMOTE_PORT'" || true
            ssh "$REMOTE_HOST" "pkill -9 -f 'nohup.*python.*http.server.*$REMOTE_PORT'" || true
            sleep 2
        fi
        
        # Final verification
        if ssh "$REMOTE_HOST" "pgrep -f 'python.*http.server.*$REMOTE_PORT' >/dev/null 2>&1"; then
            echo -e "${RED}❌ Warning: Some server processes may still be running${NC}"
        else
            echo -e "${GREEN}✅ Dashboard server stopped successfully${NC}"
        fi
    else
        echo -e "${BLUE}ℹ️ Dashboard server was not running${NC}"
    fi
}

# Function to start the remote server
start_server() {
    echo -e "${YELLOW}🚀 Starting remote dashboard server...${NC}"
    
    # First, ensure the remote HTML directory exists
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_HTML_DIR"
    
    # Check if Python is available on remote
    if ! ssh "$REMOTE_HOST" "command -v python3 >/dev/null 2>&1"; then
        if ! ssh "$REMOTE_HOST" "command -v python >/dev/null 2>&1"; then
            echo -e "${RED}❌ Python not found on remote server${NC}"
            echo "   Please install Python on $REMOTE_HOST"
            exit 1
        else
            PYTHON_CMD="python"
        fi
    else
        PYTHON_CMD="python3"
    fi
    
    # Check if port is already in use
    if ssh "$REMOTE_HOST" "netstat -tuln | grep :$REMOTE_PORT >/dev/null 2>&1"; then
        echo -e "${YELLOW}⚠️ Port $REMOTE_PORT is already in use${NC}"
        
        # Try to find an alternative port
        ALTERNATIVE_PORT=$(ssh "$REMOTE_HOST" "python3 -c \"
import socket
for port in range(9090, 9100):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('', port))
        s.close()
        print(port)
        break
    except:
        continue
else:
    print('none')
\"")
        
        if [ "$ALTERNATIVE_PORT" != "none" ]; then
            echo -e "${BLUE}🔄 Using alternative port: $ALTERNATIVE_PORT${NC}"
            REMOTE_PORT="$ALTERNATIVE_PORT"
        else
            echo -e "${RED}❌ No available ports found in range 9090-9099${NC}"
            exit 1
        fi
    fi
    
    # Start the server in the background
    echo "   Starting $PYTHON_CMD HTTP server on port $REMOTE_PORT..."
    ssh "$REMOTE_HOST" "cd $REMOTE_HTML_DIR && nohup $PYTHON_CMD -m http.server $REMOTE_PORT >/dev/null 2>&1 &"
    
    # Wait a moment and verify it started
    sleep 3
    if check_server_status >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Dashboard server started successfully${NC}"
        echo -e "${GREEN}🌐 Dashboard URL: http://192.168.2.88:$REMOTE_PORT${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to start dashboard server${NC}"
        return 1
    fi
}

# Function to sync files to remote
sync_files() {
    echo -e "${YELLOW}📁 Syncing dashboard files to remote server...${NC}"
    
    # Create remote directories
    ssh "$REMOTE_HOST" "mkdir -p $REMOTE_BASE_DIR $REMOTE_HTML_DIR $REMOTE_SCRIPTS_DIR"
    
    # Sync HTML files
    echo "   Syncing HTML files..."
    rsync -avz --delete \
        --exclude='*.log' \
        --exclude='*.tmp' \
        --exclude='.DS_Store' \
        "$PROJECT_ROOT/html/" "$REMOTE_HOST:$REMOTE_HTML_DIR/"
    
    # Sync scripts
    echo "   Syncing scripts..."
    rsync -avz \
        --exclude='*.log' \
        --exclude='*.tmp' \
        "$PROJECT_ROOT/scripts/" "$REMOTE_HOST:$REMOTE_SCRIPTS_DIR/"
    
    # Make scripts executable
    ssh "$REMOTE_HOST" "chmod +x $REMOTE_SCRIPTS_DIR/*.sh"
    
    # Create a simple status script on remote
    ssh "$REMOTE_HOST" "cat > $REMOTE_SCRIPTS_DIR/dashboard_status.sh << 'EOF'
#!/bin/bash
echo \"Fixed Ratio Trading Dashboard Status\"
echo \"===================================\"
if pgrep -f 'python.*http.server.*$REMOTE_PORT' >/dev/null 2>&1; then
    PID=\$(pgrep -f 'python.*http.server.*$REMOTE_PORT')
    echo \"✅ Dashboard server is running (PID: \$PID)\"
    echo \"🌐 Dashboard URL: http://192.168.2.88:$REMOTE_PORT\"
    echo \"📊 Server process: \$(ps -p \$PID -o pid,ppid,cmd --no-headers)\"
else
    echo \"❌ Dashboard server is not running\"
fi
EOF"
    
    ssh "$REMOTE_HOST" "chmod +x $REMOTE_SCRIPTS_DIR/dashboard_status.sh"
    
    echo -e "${GREEN}✅ Files synced successfully${NC}"
}

# Function to update remote configuration
update_config() {
    echo -e "${YELLOW}⚙️ Updating remote configuration...${NC}"
    
    # Check if config.json exists and update RPC URL for remote deployment
    if [ -f "$PROJECT_ROOT/html/config.json" ]; then
        # Create a temporary config for remote deployment
        ssh "$REMOTE_HOST" "cat > $REMOTE_HTML_DIR/config.json << 'EOF'
{
    \"solana\": {
        \"rpcUrl\": \"http://192.168.2.88:8899\",
        \"commitment\": \"confirmed\",
        \"network\": \"localnet\"
    },
    \"dashboard\": {
        \"title\": \"Fixed Ratio Trading Dashboard\",
        \"refreshInterval\": 5000,
        \"maxRetries\": 3
    },
    \"deployment\": {
        \"type\": \"remote\",
        \"host\": \"192.168.2.88\",
        \"port\": $REMOTE_PORT
    }
}
EOF"
        echo -e "${GREEN}✅ Remote configuration updated${NC}"
    else
        echo -e "${BLUE}ℹ️ No config.json found, using default configuration${NC}"
    fi
}

# Execute the requested action
case $ACTION in
    "status")
        check_server_status
        ssh "$REMOTE_HOST" "$REMOTE_SCRIPTS_DIR/dashboard_status.sh" 2>/dev/null || echo "Status script not available"
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        echo -e "${BLUE}🔄 Restarting remote dashboard server...${NC}"
        stop_server
        start_server
        ;;
    "update")
        echo -e "${BLUE}🔄 Updating and deploying dashboard...${NC}"
        
        # Stop server if running
        if check_server_status >/dev/null 2>&1; then
            stop_server
        fi
        
        # Sync files and update config
        sync_files
        update_config
        
        # Start server
        start_server
        ;;
esac

echo ""
echo "======================================================"
echo -e "${GREEN}🎉 REMOTE DASHBOARD DEPLOYMENT COMPLETE!${NC}"
echo "======================================================"
echo -e "${BLUE}📊 Your Fixed Ratio Trading Dashboard is deployed:${NC}"
echo ""
echo "  🌐 Dashboard URL: http://192.168.2.88:$REMOTE_PORT"
echo "  🖥️ Remote Host: $REMOTE_HOST"
echo "  📁 Remote Directory: $REMOTE_BASE_DIR"
echo "  🔌 Server Port: $REMOTE_PORT"
echo ""
echo -e "${BLUE}📋 Management Commands:${NC}"
echo "  📊 Check Status:  ./scripts/deploy_remote_dashboard.sh --status"
echo "  🔄 Update Files:  ./scripts/deploy_remote_dashboard.sh --update"
echo "  🚀 Restart:       ./scripts/deploy_remote_dashboard.sh --restart"
echo "  🛑 Stop Server:   ./scripts/deploy_remote_dashboard.sh --stop"
echo ""
echo -e "${BLUE}📝 Remote Management:${NC}"
echo "  SSH Access:       ssh $REMOTE_HOST"
echo "  Status Script:    ssh $REMOTE_HOST '$REMOTE_SCRIPTS_DIR/dashboard_status.sh'"
echo "  Log Files:        ssh $REMOTE_HOST 'ls -la $REMOTE_BASE_DIR/*.log'"
echo ""
echo -e "${GREEN}💡 The dashboard is now live and accessible from your network!${NC}"
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "  1. 🌐 Open http://192.168.2.88:$REMOTE_PORT in your browser"
echo "  2. 🔄 Run './scripts/deploy_remote_dashboard.sh --update' when you make local changes"
echo "  3. 📊 Monitor with './scripts/deploy_remote_dashboard.sh --status'"
echo ""
