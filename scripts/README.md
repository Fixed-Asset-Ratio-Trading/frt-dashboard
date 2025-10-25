# Scripts Documentation

This directory contains deployment and development scripts for the Fixed Ratio Trading Dashboard project.

## 📋 Script Overview

| Script | Purpose | Environment | Protocol |
|--------|---------|-------------|----------|
| [`deploy_to_stage_server.sh`](#deploy_to_stage_serversh) | Stage server deployment | Stage (vmdevbox1) | HTTPS |
| [`deploy_to_live_server.sh`](#deploy_to_live_serversh) | Live server deployment | Production (frt15.net) | HTTPS |

---

## 🏗️ deploy_to_stage_server.sh

**Deployment script for the staging environment with HTTPS support.**

### Usage
```bash
./scripts/deploy_to_stage_server.sh [option]
```

### Options

| Option | Description | Use Case |
|--------|-------------|----------|
| `--setup` | Initial setup with SSL certificates | First-time deployment |
| `--update` | Update files and restart server | Regular updates (default) |
| `--restart` | Restart server without file updates | Service restart only |
| `--stop` | Stop the Nginx server | Maintenance |
| `--status` | Check server status | Health check |

### Configuration
- **Host:** `dev@vmdevbox1`
- **Domain:** `frtstage.davincij15.com`
- **IP:** `192.168.2.88`
- **Remote Directory:** `/var/www/html/frt15`
- **Port:** `443 (HTTPS)`
- **SSL:** Custom certificate (expires 03-05-2026)
- **Network:** Solana Mainnet Beta
- **RPC:** Chainstack Premium

### Features
- ✅ SSL certificate management
- ✅ Nginx configuration
- ✅ File synchronization with rsync
- ✅ Chainstack credentials storage
- ✅ Health checks
- ✅ Service management
- ✅ Automatic cache directory setup
- ✅ Token image and pool data caching
- ✅ Legacy directory migration

### Examples
```bash
# Initial setup (first time)
./scripts/deploy_to_stage_server.sh --setup

# Update files (regular use)
./scripts/deploy_to_stage_server.sh --update

# Check status
./scripts/deploy_to_stage_server.sh --status
```

---

## 🌍 deploy_to_live_server.sh

**Deployment script for the production live server with Let's Encrypt SSL.**

### Usage
```bash
./scripts/deploy_to_live_server.sh [option]
```

### Options

| Option | Description | Use Case |
|--------|-------------|----------|
| `--setup` | Initial setup and deployment | First-time deployment |
| `--update` | Update files and restart services | Regular updates (default) |
| `--restart` | Restart services without updates | Service restart only |
| `--stop` | Stop services | Maintenance |
| `--status` | Check server status | Health check |

### Configuration
- **Host:** `root@frt15.net`
- **Domain:** `frt15.net`
- **Remote Directory:** `/var/www/html/frt15`
- **Port:** `443 (HTTPS)`
- **SSL:** Let's Encrypt (auto-renewed)
- **Network:** Solana Mainnet Beta
- **RPC:** Solana Labs (Public)

### Features
- ✅ Let's Encrypt SSL (free, auto-renewed)
- ✅ PHP cache directory setup
- ✅ Token image service configuration
- ✅ Service management (Nginx + PHP-FPM)
- ✅ File synchronization
- ✅ Comprehensive health checks
- ✅ Legacy directory migration
- ✅ Automatic cron job updates

### Token Image Service
The live server includes a fully functional token image service at:
- **URL:** `https://frt15.net/token-image.php`
- **Cache:** 60-day caching for performance
- **Sources:** DexScreener, Jupiter Token List, Metaplex metadata
- **IPFS:** Pinata gateway support
- **Overrides:** Manual override support via `token-image-overrides.txt`

### Examples
```bash
# Initial deployment (first time)
./scripts/deploy_to_live_server.sh --setup

# Update files (regular use)
./scripts/deploy_to_live_server.sh --update

# Check status and test token images
./scripts/deploy_to_live_server.sh --status

# Test token image service
curl "https://frt15.net/token-image.php?mint=So11111111111111111111111111111111111111112"
```

---

## 🔧 Common Functions

### File Synchronization
All deployment scripts use `rsync` for efficient file synchronization:
- Excludes: `*.log`, `*.tmp`, `.DS_Store`, `cache/`, `config.json`
- Preserves permissions and timestamps
- Only transfers changed files
- Automatically migrates from legacy directories
- Preserves existing `config.json` on remote server

### Health Checks
Standard health checks include:
- SSH connectivity test
- Service status verification
- SSL certificate validation
- HTTP/HTTPS response testing
- Token image service testing (live server)

### Error Handling
- ✅ Comprehensive error checking
- ✅ Colored output for clarity
- ✅ Graceful failure handling
- ✅ Detailed error messages

---

## 🌐 Network Configurations

### Stage Environment
- **Network:** Solana Mainnet Beta
- **RPC Provider:** Chainstack Premium
- **RPC URL:** `https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602`
- **WSS URL:** `wss://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602`

### Live Environment
- **Network:** Solana Mainnet Beta
- **RPC Provider:** Solana Labs (Public)
- **RPC URL:** `https://api.mainnet-beta.solana.com`
- **WSS URL:** `wss://api.mainnet-beta.solana.com`

### Program Configuration
- **Program ID:** `quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD`
- **Pool State Seed:** `pool_state`
- **Metaplex Program ID:** `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`

---

## 🔒 Security Features

### SSL/TLS
- **Stage:** Custom SSL certificate (expires 03-05-2026)
- **Live:** Let's Encrypt (auto-renewed every 90 days)
- **Protocols:** TLS 1.2, TLS 1.3
- **Security Headers:** HSTS, X-Frame-Options, X-Content-Type-Options

### Permissions
- **File Permissions:** 644 for files, 755 for directories
- **PHP Permissions:** 755 for PHP files, 775 for cache directories
- **SSL Permissions:** 600 for private keys, 644 for certificates

---

## 📊 Monitoring and Maintenance

### Regular Commands
```bash
# Check stage status
./scripts/deploy_to_stage_server.sh --status

# Check live status
./scripts/deploy_to_live_server.sh --status

# Update stage
./scripts/deploy_to_stage_server.sh --update

# Update live
./scripts/deploy_to_live_server.sh --update
```

### Log Locations
- **Nginx Logs:** `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- **PHP Logs:** `/var/log/php8.3-fpm.log`
- **SSL Logs:** `/var/log/letsencrypt/letsencrypt.log` (live server)
- **Cache Logs:**
  - Stage: `/var/www/html/frt15/cache/pool_data/debug.log`
  - Stage: `/var/www/html/frt15/cache/pool_data/metrics.log`
  - Live: `/var/www/html/frt15/cache/pool_data/debug.log`
  - Live: `/var/www/html/frt15/cache/pool_data/metrics.log`

---

## 🚨 Troubleshooting

### Common Issues

1. **SSH Connection Failed**
   - Check SSH keys are set up correctly
   - Verify host is accessible
   - Test manual SSH connection

2. **SSL Certificate Issues**
   - Stage: Check certificate file exists and is valid
   - Live: Check Let's Encrypt renewal status

3. **Service Not Starting**
   - Check Nginx configuration: `nginx -t`
   - Check PHP-FPM status: `systemctl status php8.3-fpm`
   - Review error logs

4. **Token Image Service Not Working**
   - Check cache directory permissions
   - Verify PHP can write to cache
   - Check PHP error logs

### Emergency Commands
```bash
# Stop all services
./scripts/deploy_to_live_server.sh --stop

# Restart all services
./scripts/deploy_to_live_server.sh --restart

# Check service status
systemctl status nginx php8.3-fpm
```

---

## 🔄 Optional Cron Jobs

The FRT dashboard uses on-demand caching for token images and pool data. No cron jobs are required for basic operation. However, you may optionally set up the following maintenance tasks:

### Cache Cleanup (Optional)

Clean up old cache files periodically to prevent disk space issues:

```bash
# Clean token image cache older than 60 days (stage server)
0 3 * * 0 find /var/www/html/frt15/cache/token-images -type f -mtime +60 -delete

# Clean token image cache older than 60 days (live server)
0 3 * * 0 find /var/www/html/frt15/cache/token-images -type f -mtime +60 -delete

# Clean pool data cache older than 1 day (both servers)
0 4 * * * find /var/www/html/frt15/cache/pool_data -type f -name "*.json" -mtime +1 -delete
```

### Cache Warm-up (Optional)

Pre-fetch commonly used pool data to improve response times:

```bash
# Warm up main pool cache every hour (example)
0 * * * * curl -s "https://frtstage.davincij15.com/pool-data.php?poolAddress=YOUR_POOL_ADDRESS" > /dev/null
```

**Note:** The deployment scripts automatically check for and update any existing cron jobs that reference old directory paths.

---

## 📝 Development Notes

### Making Changes
1. Edit files in the `html/` directory
2. Deploy to stage with `./scripts/deploy_to_stage_server.sh --update`
3. Deploy to live with `./scripts/deploy_to_live_server.sh --update`

### File Structure
```
scripts/
├── README.md                      # This documentation
├── deploy_to_stage_server.sh     # Stage deployment (HTTPS)
└── deploy_to_live_server.sh      # Live deployment (HTTPS)
```

### Prerequisites
- **Local:** Python 3
- **Remote:** SSH access with key authentication
- **Stage:** Custom SSL certificate file
- **Live:** Ubuntu server with Nginx + PHP configured

### Directory Structure (Remote Servers)
Both stage and live servers use the same standard directory structure:
- **Application Root:** `/var/www/html/frt15`
- **Cache Directories:**
  - `/var/www/html/frt15/cache/token-images` (60-day cache)
  - `/var/www/html/frt15/cache/token-metadata` (60-day cache)
  - `/var/www/html/frt15/cache/pool_data` (20-minute cache)
- **Configuration:** `/var/www/html/frt15/config.json` (server-managed, not synced)

---

*Last updated: $(date +%Y-%m-%d)*
*For support, check the troubleshooting section or review the deployment logs.*
