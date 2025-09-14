#!/bin/bash
# Development Workflow Helper for Fixed Ratio Trading Dashboard
# This script provides easy commands for local development and remote deployment
#
# Usage:
#   ./dev_workflow.sh [local|remote|https|deploy|status|help]
#
# Commands:
#   local   - Start local development server (port 3000)
#   remote  - Deploy to remote server (HTTP, port 9090)
#   https   - Deploy to remote server with HTTPS (port 443)
#   deploy  - Same as https (alias for secure deployment)
#   status  - Check remote deployment status
#   help    - Show this help message

set -e

# Find the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default action
ACTION="${1:-help}"

show_help() {
    echo "🚀 Fixed Ratio Trading Dashboard - Development Workflow"
    echo "======================================================"
    echo ""
    echo "Usage: ./scripts/dev_workflow.sh [command]"
    echo ""
    echo "Commands:"
    echo "  local   - Start local development server on http://localhost:3000"
    echo "  remote  - Deploy dashboard to remote server (HTTP, vmdevbox1:9090)"
    echo "  https   - Deploy dashboard with HTTPS (https://frtstage.davincij15.com)"
    echo "  deploy  - Same as https (alias for secure deployment)"
    echo "  status  - Check remote deployment status"
    echo "  help    - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/dev_workflow.sh local    # Start local dev server"
    echo "  ./scripts/dev_workflow.sh https    # Deploy with HTTPS"
    echo "  ./scripts/dev_workflow.sh status   # Check deployment status"
    echo ""
    echo "Development Workflow:"
    echo "  1. Make changes to files in html/ directory"
    echo "  2. Test locally: ./scripts/dev_workflow.sh local"
    echo "  3. When ready: ./scripts/dev_workflow.sh https"
    echo "  4. Check status: ./scripts/dev_workflow.sh status"
    echo ""
    echo "Deployment Options:"
    echo "  🔒 HTTPS (Recommended): Secure deployment with SSL certificate"
    echo "  🌐 HTTP: Simple deployment for testing (use 'remote' command)"
}

start_local() {
    echo -e "${BLUE}🚀 Starting Local Development Server${NC}"
    echo "=================================="
    echo ""
    echo -e "${YELLOW}📝 This will start a local server for development and testing${NC}"
    echo "   URL: http://localhost:3000"
    echo "   Press Ctrl+C to stop"
    echo ""
    
    # Use the existing start script
    "$PROJECT_ROOT/scripts/start_dashboard.sh"
}

deploy_remote() {
    echo -e "${BLUE}🚀 Deploying to Remote Server (HTTP)${NC}"
    echo "===================================="
    echo ""
    echo -e "${YELLOW}📝 This will sync your local changes to the remote server (HTTP)${NC}"
    echo ""
    
    # Use the remote deployment script
    "$PROJECT_ROOT/scripts/deploy_remote_dashboard.sh" --update
}

deploy_https() {
    echo -e "${BLUE}🔒 Deploying with HTTPS${NC}"
    echo "======================"
    echo ""
    echo -e "${YELLOW}📝 This will sync your local changes and deploy with SSL encryption${NC}"
    echo ""
    
    # Use the HTTPS deployment script
    "$PROJECT_ROOT/scripts/deploy_https_dashboard.sh" --update
}

check_status() {
    echo -e "${BLUE}📊 Checking Remote Deployment Status${NC}"
    echo "===================================="
    echo ""
    
    # Check HTTPS deployment status
    "$PROJECT_ROOT/scripts/deploy_https_dashboard.sh" --status
}

# Execute the requested command
case $ACTION in
    "local")
        start_local
        ;;
    "remote")
        deploy_remote
        ;;
    "https"|"deploy")
        deploy_https
        ;;
    "status")
        check_status
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $ACTION${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
