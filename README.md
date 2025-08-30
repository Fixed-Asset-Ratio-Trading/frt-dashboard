# Fixed Ratio Trading Dashboard

A web-based dashboard for interacting with Fixed Ratio Trading pools on Solana.

## Features

- **Pool Management**: View and interact with fixed ratio trading pools
- **Token Swapping**: Swap tokens at guaranteed fixed ratios with no slippage
- **Liquidity Operations**: Add or remove liquidity from pools
- **Pool Creation**: Create new fixed ratio trading pools
- **Real-time Updates**: Live pool data from the Solana blockchain

## Quick Start

1. Start the dashboard:
   ```bash
   cd scripts
   ./start_dashboard.sh
   ```

2. Open your browser to `http://localhost:8899`

3. Connect your Backpack wallet

## Documentation

### Core Documentation
- [Configuration Guide](docs/README-Configuration.md) - How to configure the dashboard
- [**Swap Calculation Guide**](docs/SWAP_CALCULATION_GUIDE.md) - Complete guide for calculating swap amounts for any pool ratio
- [**Swap Calculation Quick Reference**](docs/SWAP_CALCULATION_QUICK_REFERENCE.md) - Quick reference card for swap formulas

### Code Policy Documents
- [Browser Debugging Guide](docs/codepolicy/BROWSER_DEBUGGING_GUIDE.md) - Essential debugging techniques for dashboard development
- [Display Standards & Best Practices](docs/codepolicy/DISPLAY_STANDARDS_BEST_PRACTICES.md) - UI/UX guidelines for token pair display
- [Git Commit Standards](docs/codepolicy/GIT_COMMIT_STANDARDS.md) - Commit message conventions and standards
- [One-to-Many Pool Display Rules](docs/codepolicy/ONE_TO_MANY_POOL_DISPLAY_RULES.md) - Special handling for one-to-many ratio pools
- [UX Design: Token Pair Display](docs/codepolicy/UX_DESIGN_TOKEN_PAIR_DISPLAY.md) - Detailed UX patterns for token pair presentation

### Dashboard Documentation
- [Dashboard Upgrade Requirements](docs/dashboard/DASHBOARD_UPGRADE_REQUIREMENTS.md) - Security and upgrade requirements
- [Dashboard User Operations Only](docs/dashboard/DASHBOARD_USER_OPERATIONS_ONLY.md) - User-only operations mode

## Key Concepts

### Fixed Ratio Trading
Pools maintain a constant exchange ratio between two tokens. For example, a pool might always exchange 1 TokenA for 10 TokenB, regardless of external market conditions.

### Basis Points
All token amounts in the smart contract are stored as integers (basis points) to avoid floating-point precision issues. The dashboard handles conversion between display units and basis points automatically.

### Token Decimals
Each token has a decimal precision (0-9) that determines how basis points convert to display units. For example:
- SOL has 9 decimals: 1 SOL = 1,000,000,000 basis points
- USDC has 6 decimals: 1 USDC = 1,000,000 basis points

## Security

This dashboard is designed for user operations only and does not include administrative functions. All transactions require wallet signature approval.

## License

See the project root for license information.