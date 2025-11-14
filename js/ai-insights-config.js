/**
 * AI Insights Configuration Presets
 *
 * This file contains pre-configured settings for different use cases of the AI Insights component.
 * Each preset defines the behavior, features, and display mode for specific pages or contexts.
 *
 * Usage:
 * const myInsights = new MyAdapter(AIInsightsConfigs.nlp);
 */

const AIInsightsConfigs = {
    /**
     * NLP Search Configuration
     * Used for semantic search - finding matching projects based on natural language queries
     *
     * Features:
     * - Single AI provider (Gemini)
     * - No caching (one-time searches)
     * - No save/cancel workflow
     * - Search results display mode
     * - Button triggers immediate search
     */
    nlp: {
        providers: ['gemini'],
        enableCaching: false,
        enableSaveCancel: false,
        enableCustomPrompts: false,
        enableMaxRows: false,
        enableRefreshButton: false,
        displayMode: 'search-results',
        cachePrefix: 'nlpInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    },

    /**
     * Projects Analysis Configuration
     * Used for data analysis - analyzing and summarizing entire datasets
     *
     * Features:
     * - Multiple AI providers (Claude + Gemini)
     * - Persistent caching in localStorage
     * - Save/Cancel workflow for analysis
     * - Custom prompts via modal
     * - Max rows control
     * - Refresh button for re-analysis
     * - Analysis/summary display mode
     */
    projects: {
        providers: ['claude', 'gemini'],
        enableCaching: true,
        enableSaveCancel: true,
        enableCustomPrompts: true,
        enableMaxRows: true,
        enableRefreshButton: true,
        displayMode: 'analysis',
        cachePrefix: 'projectsInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    },

    /**
     * Simple Analysis Configuration
     * Lightweight configuration for quick AI insights without caching
     *
     * Features:
     * - Single AI provider (Gemini by default)
     * - No caching
     * - Simple one-click analysis
     * - Good for temporary insights
     */
    simple: {
        providers: ['gemini'],
        enableCaching: false,
        enableSaveCancel: false,
        enableCustomPrompts: false,
        enableMaxRows: false,
        enableRefreshButton: false,
        displayMode: 'analysis',
        cachePrefix: 'simpleInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    },

    /**
     * Advanced Analysis Configuration
     * Full-featured configuration with all bells and whistles
     *
     * Features:
     * - Multiple AI providers
     * - Full caching support
     * - Custom prompts
     * - Max rows control
     * - Refresh capability
     * - Save/Cancel workflow
     */
    advanced: {
        providers: ['claude', 'gemini'],
        enableCaching: true,
        enableSaveCancel: true,
        enableCustomPrompts: true,
        enableMaxRows: true,
        enableRefreshButton: true,
        displayMode: 'analysis',
        cachePrefix: 'advancedInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    },

    /**
     * Dashboard Configuration
     * For dashboard pages with quick insights
     *
     * Features:
     * - Single provider for simplicity
     * - Caching for performance
     * - No custom prompts (pre-defined)
     * - Compact display
     */
    dashboard: {
        providers: ['gemini'],
        enableCaching: true,
        enableSaveCancel: false,
        enableCustomPrompts: false,
        enableMaxRows: false,
        enableRefreshButton: true,
        displayMode: 'analysis',
        cachePrefix: 'dashboardInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    },

    /**
     * Report Generation Configuration
     * For generating reports and detailed analysis
     *
     * Features:
     * - Multiple providers for comparison
     * - Full caching
     * - Custom prompts for specific reports
     * - Max rows control
     * - Save/Cancel workflow
     */
    report: {
        providers: ['claude', 'gemini'],
        enableCaching: true,
        enableSaveCancel: true,
        enableCustomPrompts: true,
        enableMaxRows: true,
        enableRefreshButton: true,
        displayMode: 'analysis',
        cachePrefix: 'reportInsights',
        apiBase: window.API_BASE || 'http://localhost:8081/api'
    }
};

/**
 * Helper function to create custom config
 * Merges user config with a base preset
 *
 * @param {string} basePreset - Name of the base preset ('nlp', 'projects', etc.)
 * @param {object} overrides - Custom configuration overrides
 * @returns {object} Merged configuration
 */
function createCustomConfig(basePreset, overrides = {}) {
    const base = AIInsightsConfigs[basePreset] || AIInsightsConfigs.simple;
    return {
        ...base,
        ...overrides
    };
}

/**
 * Validate configuration
 * Ensures all required fields are present and valid
 *
 * @param {object} config - Configuration to validate
 * @returns {boolean} True if valid
 */
function validateConfig(config) {
    const required = ['providers', 'displayMode', 'cachePrefix', 'apiBase'];
    const missing = required.filter(field => !(field in config));

    if (missing.length > 0) {
        console.error('❌ Invalid AI Insights config. Missing fields:', missing);
        return false;
    }

    if (!Array.isArray(config.providers) || config.providers.length === 0) {
        console.error('❌ Invalid AI Insights config. Providers must be a non-empty array.');
        return false;
    }

    const validProviders = ['claude', 'gemini'];
    const invalidProviders = config.providers.filter(p => !validProviders.includes(p));
    if (invalidProviders.length > 0) {
        console.error('❌ Invalid AI providers:', invalidProviders);
        return false;
    }

    const validDisplayModes = ['analysis', 'search-results'];
    if (!validDisplayModes.includes(config.displayMode)) {
        console.error('❌ Invalid display mode:', config.displayMode);
        return false;
    }

    return true;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AIInsightsConfigs,
        createCustomConfig,
        validateConfig
    };
}
