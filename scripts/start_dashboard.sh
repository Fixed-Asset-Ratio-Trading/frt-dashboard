#!/bin/bash
# Start Fixed Ratio Trading Dashboard Web Server
# Serves the dashboard on http://localhost:3000

# Find the project root directory (where Cargo.toml is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify we found the correct project directory by checking for html directory
if [ ! -d "$PROJECT_ROOT/html" ]; then
    echo "❌ Error: Could not find html directory in project root: $PROJECT_ROOT"
    echo "   Please run this script from the frt-dashboard project directory or its subdirectories"
    exit 1
fi

echo "🌐 Starting Fixed Ratio Trading Dashboard"
echo "========================================"
echo "📂 Project Root: $PROJECT_ROOT"

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python not found. Please install Python to run the web server."
    exit 1
fi

# Check if html directory exists
if [ ! -d "$PROJECT_ROOT/html" ]; then
    echo "❌ HTML directory not found at: $PROJECT_ROOT/html"
    exit 1
fi

# Check if dashboard files exist
if [ ! -f "$PROJECT_ROOT/html/index.html" ] || [ ! -f "$PROJECT_ROOT/html/dashboard.js" ]; then
    echo "❌ Dashboard files not found. Please run the deployment script first."
    exit 1
fi

# Start the web server
echo "📊 Starting web server on http://localhost:3000"
echo "🔗 Dashboard URL: http://localhost:3000"
echo ""
echo "📝 Make sure your local Solana validator is running!"
echo "   If not, run: $PROJECT_ROOT/scripts/deploy_local.sh"
echo ""
echo "🛑 Press Ctrl+C to stop the server"
echo ""

cd "$PROJECT_ROOT/html"
$PYTHON_CMD -m http.server 3000

echo ""
echo "🛑 Dashboard server stopped" 