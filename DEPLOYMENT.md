# Fixed Ratio Trading Dashboard - Deployment Guide

This guide explains how to deploy your HTML dashboard to a remote server and manage it effectively.

## Overview

The deployment system allows you to:
- Deploy your HTML dashboard to a remote server (`vmdevbox1`) 
- Serve the dashboard on port 9090 (or auto-find available port)
- Easily sync local changes to the remote server
- Start/stop/restart the remote server
- Check deployment status

## Quick Start

### 1. Initial Deployment
```bash
# Deploy dashboard to remote server
./scripts/deploy_remote_dashboard.sh

# Or use the development workflow helper
./scripts/dev_workflow.sh remote
```

### 2. Development Workflow
```bash
# Test locally first
./scripts/dev_workflow.sh local

# When happy with changes, deploy to remote
./scripts/dev_workflow.sh remote

# Check remote status
./scripts/dev_workflow.sh status
```

## Scripts Overview

### `deploy_remote_dashboard.sh`
Main deployment script that handles all remote operations.

**Usage:**
```bash
./scripts/deploy_remote_dashboard.sh [--update|--restart|--stop|--status]
```

**Options:**
- `--update` (default): Sync files and restart server
- `--restart`: Just restart the server without file updates
- `--stop`: Stop the remote dashboard server
- `--status`: Check server status

### `dev_workflow.sh`
Simplified development workflow helper.

**Usage:**
```bash
./scripts/dev_workflow.sh [local|remote|deploy|status|help]
```

**Commands:**
- `local`: Start local development server (port 3000)
- `remote`/`deploy`: Deploy to remote server
- `status`: Check remote deployment status
- `help`: Show help message

## Remote Server Details

- **Host**: `dev@vmdevbox1` (192.168.2.88)
- **HTTPS URL**: https://frtstage.davincij15.com
- **Port**: 443 (HTTPS)
- **Directory**: `/home/dev/dashboard/`
- **Network**: Solana Mainnet Beta
- **Program ID**: `quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD`

## File Structure on Remote

```
/home/dev/dashboard/
├── html/                    # Dashboard files (synced from local)
│   ├── index.html
│   ├── dashboard.js
│   ├── config.json         # Auto-configured for remote
│   └── ...
└── scripts/                # Management scripts
    ├── dashboard_status.sh  # Check server status
    └── ...
```

## Configuration

The deployment automatically:
- Updates `config.json` with Solana Mainnet RPC URL (`https://api.mainnet-beta.solana.com`)
- Sets up mainnet network configuration with your program ID (`quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD`)
- Configures SSL/HTTPS encryption
- Creates management scripts on remote server

## Troubleshooting

### SSH Connection Issues
```bash
# Test SSH connection manually
ssh dev@vmdevbox1

# Check if SSH keys are set up
ls -la ~/.ssh/
```

### Port Issues
The script automatically finds available ports in range 9090-9099 if the default port is busy.

### Server Not Responding
```bash
# Check server status
./scripts/deploy_remote_dashboard.sh --status

# Restart server
./scripts/deploy_remote_dashboard.sh --restart

# Stop and start fresh
./scripts/deploy_remote_dashboard.sh --stop
./scripts/deploy_remote_dashboard.sh --update
```

### File Sync Issues
```bash
# Force complete file sync
./scripts/deploy_remote_dashboard.sh --update
```

## Remote Management

### Direct SSH Commands
```bash
# Check server status directly
ssh dev@vmdevbox1 '/home/dev/dashboard/scripts/dashboard_status.sh'

# View server processes
ssh dev@vmdevbox1 'ps aux | grep python'

# Check port usage
ssh dev@vmdevbox1 'netstat -tuln | grep 909'

# View logs (if any)
ssh dev@vmdevbox1 'ls -la /home/dev/dashboard/*.log'
```

### Manual Server Control
```bash
# Stop server manually
ssh dev@vmdevbox1 'pkill -f "python.*http.server.*9090"'

# Start server manually
ssh dev@vmdevbox1 'cd /home/dev/dashboard/html && python3 -m http.server 9090 &'
```

## Security Notes

- The dashboard uses HTTP (not HTTPS) for local network deployment
- Ensure your network security is appropriate for your use case
- SSH keys should be properly secured
- Consider firewall rules for port 9090 if needed

## Integration with Main Contract

This dashboard deployment is configured for Solana Mainnet:
- **Network**: Solana Mainnet Beta
- **RPC URL**: `https://api.mainnet-beta.solana.com`
- **Dashboard URL**: `https://frtstage.davincij15.com`
- **Program ID**: `quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD`
- **Server**: `vmdevbox1` with HTTPS/SSL encryption

The dashboard automatically configures itself to connect to Solana mainnet once your program is deployed.
