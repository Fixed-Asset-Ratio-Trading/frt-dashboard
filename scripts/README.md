# Scripts Documentation

This directory contains deployment and development scripts for the Fixed Ratio Trading Dashboard project.

## 📋 Script Overview

| Script | Purpose | Environment | Protocol |
|--------|---------|-------------|----------|
| [`dev_workflow.sh`](#dev_workflowsh) | Development workflow helper | Local/Remote | HTTP/HTTPS |
| [`start_dashboard.sh`](#start_dashboardsh) | Local development server | Local | HTTP |
| [`deploy_to_stage_dashboard.sh`](#deploy_to_stage_dashboardsh) | Stage server deployment | Stage (vmdevbox1) | HTTPS |
| [`deploy_to_live_server.sh`](#deploy_to_live_serversh) | Live server deployment | Production (frt15.net) | HTTPS |

---

## 🚀 dev_workflow.sh

**Main development workflow helper script that provides easy commands for local development and remote deployment.**

### Usage
```bash
./scripts/dev_workflow.sh [command]
```

### Commands

| Command | Description | Action |
|---------|-------------|--------|
| `local` | Start local development server | Launches HTTP server on port 3000 |
| `remote` | Deploy to remote server (HTTP) | Syncs files to vmdevbox1:9090 |
| `https` | Deploy with HTTPS to stage | Secure deployment to frtstage.davincij15.com |
| `deploy` | Same as `https` | Alias for secure deployment |
| `status` | Check deployment status | Shows remote server status |
| `help` | Show help message | Displays usage information |

### Examples
```bash
# Start local development server
./scripts/dev_workflow.sh local

# Deploy with HTTPS to stage
./scripts/dev_workflow.sh https

# Check deployment status
./scripts/dev_workflow.sh status
```

### Development Workflow
1. Make changes to files in `html/` directory
2. Test locally: `./scripts/dev_workflow.sh local`
3. When ready: `./scripts/dev_workflow.sh https`
4. Check status: `./scripts/dev_workflow.sh status`

---

## 🌐 start_dashboard.sh

**Local development server for testing the dashboard on your machine.**

### Usage
```bash
./scripts/start_dashboard.sh
```

### Features
- ✅ Serves dashboard on `http://localhost:3000`
- ✅ Auto-detects Python 3 or Python
- ✅ Validates project structure
- ✅ Checks for required dashboard files
- ✅ Provides clear startup information

### Prerequisites
- Python 3 or Python installed
- Dashboard files present in `html/` directory

### Output
- **URL:** http://localhost:3000
- **Directory:** Serves from `html/` folder
- **Stop:** Press `Ctrl+C`

---

## 🏗️ deploy_to_stage_dashboard.sh

**Deployment script for the staging environment with HTTPS support.**

### Usage
```bash
./scripts/deploy_to_stage_dashboard.sh [option]
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

### Examples
```bash
# Initial setup (first time)
./scripts/deploy_to_stage_dashboard.sh --setup

# Update files (regular use)
./scripts/deploy_to_stage_dashboard.sh --update

# Check status
./scripts/deploy_to_stage_dashboard.sh --status
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
- Excludes: `*.log`, `*.tmp`, `.DS_Store`, `cache/`
- Preserves permissions and timestamps
- Only transfers changed files

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
./scripts/deploy_to_stage_dashboard.sh --status

# Check live status
./scripts/deploy_to_live_server.sh --status

# Update stage
./scripts/deploy_to_stage_dashboard.sh --update

# Update live
./scripts/deploy_to_live_server.sh --update
```

### Log Locations
- **Nginx Logs:** `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- **PHP Logs:** `/var/log/php8.3-fpm.log`
- **SSL Logs:** `/var/log/letsencrypt/letsencrypt.log` (live server)

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

## 📝 Development Notes

### Making Changes
1. Edit files in the `html/` directory
2. Test locally with `./scripts/dev_workflow.sh local`
3. Deploy to stage with `./scripts/deploy_to_stage_dashboard.sh --update`
4. Deploy to live with `./scripts/deploy_to_live_server.sh --update`

### File Structure
```
scripts/
├── README.md                    # This documentation
├── dev_workflow.sh             # Development workflow helper
├── start_dashboard.sh          # Local development server
├── deploy_to_stage_dashboard.sh # Stage deployment
└── deploy_to_live_server.sh    # Live deployment
```

### Prerequisites
- **Local:** Python 3
- **Remote:** SSH access with key authentication
- **Stage:** Custom SSL certificate file
- **Live:** Ubuntu server with Nginx + PHP configured

---

*Last updated: $(date +%Y-%m-%d)*
*For support, check the troubleshooting section or review the deployment logs.*
