/**
 * Theme Testing System - Temporary Development Tool
 * Allows testing themes without database changes
 */

class ThemeTester {
    constructor() {
        this.themes = {
            'clean_sports': 'Clean Sports Modern',
            'bold_gameday': 'Bold Game Day', 
            'classic_fantasy': 'Classic Fantasy',
            'premium_dark': 'Premium Dark'
        };
        
        this.init();
    }
    
    init() {
        this.createThemeSelector();
        this.loadSavedTheme();
        this.attachEventListeners();
    }
    
    createThemeSelector() {
        // Create theme selector HTML
        const selector = document.createElement('div');
        selector.className = 'theme-tester';
        selector.innerHTML = `
            <div class="alert alert-warning alert-dismissible fade show" role="alert">
                <div class="d-flex align-items-center">
                    <i class="fas fa-palette me-2"></i>
                    <strong>Theme Testing Mode</strong>
                    <select class="form-select form-select-sm ms-3" id="theme-selector" style="width: 200px;">
                        ${Object.entries(this.themes).map(([key, name]) => 
                            `<option value="${key}">${name}</option>`
                        ).join('')}
                    </select>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        // Insert at top of main content
        const mainContent = document.querySelector('main') || document.querySelector('.container').parentElement;
        if (mainContent) {
            mainContent.insertBefore(selector, mainContent.firstChild);
        }
    }
    
    loadSavedTheme() {
        const savedTheme = localStorage.getItem('theme-tester-theme');
        if (savedTheme && this.themes[savedTheme]) {
            this.applyTheme(savedTheme);
            document.getElementById('theme-selector').value = savedTheme;
        }
    }
    
    attachEventListeners() {
        const selector = document.getElementById('theme-selector');
        if (selector) {
            selector.addEventListener('change', (e) => {
                this.applyTheme(e.target.value);
                localStorage.setItem('theme-tester-theme', e.target.value);
            });
        }
    }
    
    applyTheme(themeKey) {
        // Apply to html element (same as production system)
        document.documentElement.setAttribute('data-theme', themeKey);
        
        // Update meta theme color for mobile
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        const themeColors = {
            'clean_sports': '#1a365d',
            'bold_gameday': '#22543d', 
            'classic_fantasy': '#2b6cb0',
            'premium_dark': '#4299e1'
        };
        
        if (metaThemeColor) {
            metaThemeColor.content = themeColors[themeKey] || '#1a365d';
        }
        
        // Trigger any custom theme events
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: themeKey }
        }));
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize in development/testing mode
    if (window.location.search.includes('theme-test') || localStorage.getItem('theme-tester-enabled')) {
        new ThemeTester();
    }
});

// Global function to enable theme testing
window.enableThemeTesting = function() {
    localStorage.setItem('theme-tester-enabled', 'true');
    window.location.reload();
};

// Global function to disable theme testing  
window.disableThemeTesting = function() {
    localStorage.removeItem('theme-tester-enabled');
    localStorage.removeItem('theme-tester-theme');
    window.location.reload();
};