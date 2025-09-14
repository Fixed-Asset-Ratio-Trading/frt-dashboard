#!/bin/bash
# Remote HTTPS Setup Script
# Run this script ON the remote server (vmdevbox1) to complete HTTPS setup

set -e

echo "🔒 Completing HTTPS Setup on Remote Server"
echo "=========================================="

# Move Nginx configuration
echo "📝 Installing Nginx configuration..."
sudo mv /tmp/frt-dashboard.conf /etc/nginx/sites-available/frt-dashboard

# Enable the site
echo "🔗 Enabling site..."
sudo ln -sf /etc/nginx/sites-available/frt-dashboard /etc/nginx/sites-enabled/frt-dashboard

# Remove default site
echo "🗑️ Removing default site..."
sudo rm -f /etc/nginx/sites-enabled/default

# Stop any Python servers that might conflict
echo "🛑 Stopping conflicting servers..."
pkill -f 'python.*http.server.*9090' || true

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# Restart Nginx
echo "🔄 Restarting Nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# Check status
echo "📊 Checking status..."
sudo systemctl status nginx --no-pager -l

echo ""
echo "✅ HTTPS setup complete!"
echo "🌐 Your dashboard should now be available at:"
echo "   https://frtstage.davincij15.com"
echo "   https://192.168.2.88"
