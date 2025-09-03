// Theme configuration for per-league visual customization

const themes = {
    'clean_sports': {
        name: 'Clean Sports Modern',
        description: 'Professional, ESPN-like design with clean whitespace',
        colors: {
            primary: '#1a365d',      // Navy blue
            secondary: '#38a169',    // Green accent
            success: '#48bb78',      // Success green
            warning: '#ed8936',      // Warning orange
            danger: '#e53e3e',       // Error red
            info: '#3182ce',         // Info blue
            light: '#f7fafc',        // Light gray
            dark: '#2d3748',         // Dark gray
            background: '#ffffff',   // White background
            surface: '#f8f9fa',      // Light surface
            text: '#2d3748',         // Text color
            textMuted: '#718096'     // Muted text
        },
        fonts: {
            primary: 'Inter, system-ui, -apple-system, sans-serif',
            secondary: 'Roboto, system-ui, -apple-system, sans-serif',
            mono: 'Menlo, Monaco, Consolas, monospace'
        },
        styles: {
            borderRadius: '0.375rem',
            shadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            shadowHover: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.15s ease-in-out'
        }
    },

    'bold_gameday': {
        name: 'Bold Game Day',
        description: 'Energetic, high-contrast design for game day excitement',
        colors: {
            primary: '#22543d',      // Forest green
            secondary: '#d69e2e',    // Gold accent
            success: '#38a169',      // Success green
            warning: '#dd6b20',      // Warning orange
            danger: '#c53030',       // Error red
            info: '#2b6cb0',         // Info blue
            light: '#f7fafc',        // Light gray
            dark: '#1a202c',         // Very dark gray
            background: '#ffffff',   // White background
            surface: '#edf2f7',      // Light surface
            text: '#1a202c',         // Text color
            textMuted: '#4a5568'     // Muted text
        },
        fonts: {
            primary: 'Oswald, Impact, Helvetica, Arial, sans-serif',
            secondary: 'Roboto Condensed, Arial, sans-serif',
            mono: 'Menlo, Monaco, Consolas, monospace'
        },
        styles: {
            borderRadius: '0.25rem',
            shadow: '0 2px 4px 0 rgba(0, 0, 0, 0.2)',
            shadowHover: '0 8px 16px -4px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.2s ease-out'
        }
    },

    'classic_fantasy': {
        name: 'Classic Fantasy',
        description: 'Friendly, approachable design with fantasy football vibes',
        colors: {
            primary: '#2b6cb0',      // Rich blue
            secondary: '#ed8936',    // Orange highlight
            success: '#48bb78',      // Success green
            warning: '#d69e2e',      // Warning yellow
            danger: '#e53e3e',       // Error red
            info: '#4299e1',         // Info blue
            light: '#f7fafc',        // Light gray
            dark: '#2d3748',         // Dark gray
            background: '#ffffff',   // White background
            surface: '#f8f9fa',      // Light surface
            text: '#2d3748',         // Text color
            textMuted: '#718096'     // Muted text
        },
        fonts: {
            primary: 'Poppins, system-ui, -apple-system, sans-serif',
            secondary: 'Open Sans, system-ui, -apple-system, sans-serif',
            mono: 'Fira Code, Menlo, Monaco, monospace'
        },
        styles: {
            borderRadius: '0.5rem',
            shadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            shadowHover: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s ease-in-out'
        }
    },

    'premium_dark': {
        name: 'Premium Dark Mode',
        description: 'Sleek, high-tech dark theme with premium feel',
        colors: {
            primary: '#4299e1',      // Electric blue
            secondary: '#ed8936',    // Orange accent
            success: '#48bb78',      // Success green
            warning: '#f6e05e',      // Warning yellow
            danger: '#fc8181',       // Error red
            info: '#63b3ed',         // Info blue
            light: '#4a5568',        // Light in dark theme
            dark: '#1a202c',         // Very dark
            background: '#2d3748',   // Dark background
            surface: '#4a5568',      // Dark surface
            text: '#f7fafc',         // Light text
            textMuted: '#a0aec0'     // Muted light text
        },
        fonts: {
            primary: 'JetBrains Mono, Monaco, Consolas, monospace',
            secondary: 'Nunito Sans, system-ui, -apple-system, sans-serif',
            mono: 'JetBrains Mono, Monaco, Consolas, monospace'
        },
        styles: {
            borderRadius: '0.375rem',
            shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            shadowHover: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease-in-out'
        }
    }
};

// CSS variable generator for themes
function generateThemeCSS(themeKey) {
    const theme = themes[themeKey];
    if (!theme) return '';

    let css = `:root[data-theme="${themeKey}"] {\n`;
    
    // Color variables
    Object.entries(theme.colors).forEach(([key, value]) => {
        css += `  --color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};\n`;
    });
    
    // Font variables
    Object.entries(theme.fonts).forEach(([key, value]) => {
        css += `  --font-${key}: ${value};\n`;
    });
    
    // Style variables
    Object.entries(theme.styles).forEach(([key, value]) => {
        css += `  --${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};\n`;
    });
    
    css += '}\n';
    return css;
}

// Generate all theme CSS
function generateAllThemeCSS() {
    return Object.keys(themes).map(generateThemeCSS).join('\n');
}

// Theme selector for league creation
function getThemeOptions() {
    return Object.entries(themes).map(([key, theme]) => ({
        value: key,
        label: theme.name,
        description: theme.description,
        preview: {
            primary: theme.colors.primary,
            secondary: theme.colors.secondary,
            background: theme.colors.background,
            text: theme.colors.text
        }
    }));
}

// Validate theme key
function isValidTheme(themeKey) {
    return themes.hasOwnProperty(themeKey);
}

// Get theme data
function getTheme(themeKey) {
    return themes[themeKey] || themes.clean_sports;
}

// League theme middleware for EJS
function themeMiddleware(req, res, next) {
    // This will be populated from league data in actual middleware
    res.locals.currentTheme = req.league?.theme_style || 'clean_sports';
    res.locals.themeConfig = getTheme(res.locals.currentTheme);
    next();
}

module.exports = {
    themes,
    generateThemeCSS,
    generateAllThemeCSS,
    getThemeOptions,
    isValidTheme,
    getTheme,
    themeMiddleware
};