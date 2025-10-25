/**
 * Hamburger Menu Component for Fixed Ratio Trading Dashboard
 * Provides collapsible navigation menu with YouTube-style functionality
 */

class HamburgerMenu {
    constructor() {
        this.isOpen = false;
        this.isCollapsed = localStorage.getItem('hamburgerMenuCollapsed') === 'true';
        this.currentPage = this.getCurrentPage();
        this.init();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        // Handle special cases
        if (filename === 'dashboard.html') {
            return 'dashboard';
        }
        if (filename === 'index.html' || filename.includes('swap.html')) {
            return 'home';
        }
        if (filename === 'about.html') {
            return 'about';
        }
        if (filename === 'pools.html') {
            return 'pools';
        }
        if (filename === 'admin.html') {
            return 'admin';
        }
        if (filename === 'donate.html') {
            return 'donate';
        }
        
        return '';
    }

    init() {
        this.createMenuHTML();
        this.attachEventListeners();
        this.updateMenuState();
        this.setActiveMenuItem();
    }

    createMenuHTML() {
        // Create hamburger toggle button
        const toggleButton = document.createElement('button');
        toggleButton.className = 'hamburger-toggle';
        // 🛡️ SECURITY: Use textContent instead of innerHTML
        toggleButton.textContent = '☰';
        toggleButton.setAttribute('aria-label', 'Toggle navigation menu');
        document.body.appendChild(toggleButton);

        // Create overlay for mobile
        const overlay = document.createElement('div');
        overlay.className = 'hamburger-overlay';
        document.body.appendChild(overlay);

        // Create hamburger menu
        const menu = document.createElement('div');
        menu.className = `hamburger-menu ${this.isCollapsed ? 'collapsed' : ''}`;
        // 🛡️ SECURITY: Build menu via DOM to avoid innerHTML
        const menuHTML = this.getMenuHTML();
        const temp = document.createElement('div');
        temp.innerHTML = menuHTML; // Controlled, static template
        while (temp.firstChild) {
            menu.appendChild(temp.firstChild);
        }
        document.body.appendChild(menu);

        // No longer applying body classes to prevent content shifting
    }

    getMenuHTML() {
        return `
            <div class="hamburger-header">
                <img src="images/Fixedratio_1024x1024.png" alt="FRT Logo" class="hamburger-logo">
                <div class="hamburger-title">Fixed Ratio Trading</div>
            </div>
            <nav class="hamburger-nav">
                <a href="/swap.html?pool=AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj" class="hamburger-nav-item" data-page="home">
                    <span class="hamburger-nav-icon">🏠</span>
                    <span class="hamburger-nav-text">Home</span>
                </a>
                <a href="about.html" class="hamburger-nav-item" data-page="about">
                    <span class="hamburger-nav-icon">📖</span>
                    <span class="hamburger-nav-text">About</span>
                </a>
                <a href="pools.html" class="hamburger-nav-item" data-page="pools">
                    <span class="hamburger-nav-icon">🏊‍♂️</span>
                    <span class="hamburger-nav-text">Pools</span>
                </a>
                <a href="dashboard.html" class="hamburger-nav-item" data-page="dashboard">
                    <span class="hamburger-nav-icon">📊</span>
                    <span class="hamburger-nav-text">Dashboard</span>
                </a>
                <a href="admin.html" class="hamburger-nav-item" data-page="admin">
                    <span class="hamburger-nav-icon">🔧</span>
                    <span class="hamburger-nav-text">Admin Dashboard</span>
                </a>
                <a href="donate.html" class="hamburger-nav-item" data-page="donate">
                    <span class="hamburger-nav-icon">💝</span>
                    <span class="hamburger-nav-text">Donate</span>
                </a>
            </nav>
            <button class="hamburger-collapse-btn" title="${this.isCollapsed ? 'Expand menu' : 'Collapse menu'}">
                ${this.isCollapsed ? '→' : '←'}
            </button>
        `;
    }

    attachEventListeners() {
        // Toggle menu open/close
        document.querySelector('.hamburger-toggle').addEventListener('click', () => {
            this.toggleMenu();
        });

        // Close menu when clicking overlay
        document.querySelector('.hamburger-overlay').addEventListener('click', () => {
            this.closeMenu();
        });

        // Collapse/expand menu
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('hamburger-collapse-btn')) {
                this.toggleCollapse();
            }
        });

        // Close menu when clicking outside on desktop
        document.addEventListener('click', (e) => {
            const menu = document.querySelector('.hamburger-menu');
            const toggle = document.querySelector('.hamburger-toggle');
            
            if (this.isOpen && 
                !menu.contains(e.target) && 
                !toggle.contains(e.target) &&
                window.innerWidth > 768) {
                this.closeMenu();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.isOpen) {
                // On desktop, keep menu state but remove overlay
                this.updateMenuState();
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeMenu();
            }
        });
    }

    toggleMenu() {
        this.isOpen = !this.isOpen;
        this.updateMenuState();
    }

    openMenu() {
        this.isOpen = true;
        this.updateMenuState();
    }

    closeMenu() {
        this.isOpen = false;
        this.updateMenuState();
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        localStorage.setItem('hamburgerMenuCollapsed', this.isCollapsed.toString());
        this.updateMenuState();
        this.updateCollapseButton();
    }

    updateMenuState() {
        const menu = document.querySelector('.hamburger-menu');
        const overlay = document.querySelector('.hamburger-overlay');

        // Update menu classes
        menu.className = `hamburger-menu ${this.isCollapsed ? 'collapsed' : ''} ${this.isOpen ? 'open' : ''}`;

        // Update overlay - show on mobile when menu is open
        if (this.isOpen && window.innerWidth <= 768) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }

        // No longer updating body classes to prevent content shifting
    }

    updateCollapseButton() {
        const button = document.querySelector('.hamburger-collapse-btn');
        if (button) {
            // 🛡️ SECURITY: Use textContent instead of innerHTML
            button.textContent = this.isCollapsed ? '→' : '←';
            button.title = this.isCollapsed ? 'Expand menu' : 'Collapse menu';
        }
    }

    setActiveMenuItem() {
        const menuItems = document.querySelectorAll('.hamburger-nav-item');
        menuItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === this.currentPage) {
                item.classList.add('active');
            }
        });
    }

    // Method to update active menu item if page changes dynamically
    updateActiveMenuItem(page) {
        this.currentPage = page;
        this.setActiveMenuItem();
    }
}

// Initialize hamburger menu when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.hamburgerMenu = new HamburgerMenu();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HamburgerMenu;
}
