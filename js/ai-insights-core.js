/**
 * AI Insights Core Component
 * A reusable, modular component for displaying AI-powered insights across different pages
 *
 * Features:
 * - Multi-provider support (Claude, Gemini)
 * - Configurable UI (buttons, controls, modals)
 * - Optional caching with localStorage
 * - Save/Cancel workflow support
 * - Custom prompt support
 * - Event-driven architecture
 *
 * Usage:
 * class MyAdapter extends AIInsightsComponent {
 *   constructor() {
 *     super(myConfig);
 *   }
 *
 *   async onProviderClick(provider) {
 *     // Custom implementation
 *   }
 * }
 */

class AIInsightsComponent {
    constructor(config = {}) {
        // Merge with defaults
        this.config = {
            // Container IDs
            containerId: 'aiInsights',
            contentId: 'insightsContent',
            statusId: 'insightsStatus',
            providerButtonsId: 'aiProviderButtons',
            controlsId: 'aiControlsArea',

            // AI Providers
            providers: ['gemini'], // ['claude', 'gemini']

            // Features
            enableCaching: false,
            enableSaveCancel: false,
            enableCustomPrompts: false,
            enableMaxRows: false,
            enableRefreshButton: false,

            // Display
            displayMode: 'analysis', // 'analysis' or 'search-results'

            // API
            apiBase: window.API_BASE || 'http://localhost:8081/api',

            // Cache
            cachePrefix: 'aiInsights',

            // Callbacks (can be overridden)
            onInit: null,
            onShow: null,
            onHide: null,

            ...config
        };

        // State
        this.cache = {};
        this.currentProvider = null;
        this.pendingAnalysis = {};
        this.isVisible = false;

        // DOM Elements (will be set during init)
        this.container = null;
        this.content = null;
        this.status = null;

        console.log('🔧 AI Insights Component initialized with config:', this.config);
    }

    /**
     * Initialize the component
     */
    init() {
        console.log('🚀 Initializing AI Insights Component');

        // Get DOM elements
        this.container = document.getElementById(this.config.containerId);
        this.content = document.getElementById(this.config.contentId);
        this.status = document.getElementById(this.config.statusId);

        if (!this.container) {
            console.error('❌ AI Insights container not found:', this.config.containerId);
            return false;
        }

        // Load cache if caching is enabled
        if (this.config.enableCaching) {
            this.loadCache();
        }

        // Render UI elements
        this.renderProviderButtons();
        if (this.config.enableMaxRows) {
            this.renderMaxRowsControl();
        }

        // Call custom init callback
        if (typeof this.config.onInit === 'function') {
            this.config.onInit.call(this);
        }

        console.log('✅ AI Insights Component ready');
        return true;
    }

    /**
     * Show the insights section
     */
    show() {
        if (this.container) {
            this.container.style.setProperty('display', 'block', 'important');
            this.isVisible = true;

            if (typeof this.config.onShow === 'function') {
                this.config.onShow.call(this);
            }
        }
    }

    /**
     * Hide the insights section
     */
    hide() {
        if (this.container) {
            this.container.style.setProperty('display', 'none', 'important');
            this.isVisible = false;

            if (typeof this.config.onHide === 'function') {
                this.config.onHide.call(this);
            }
        }
    }

    /**
     * Toggle visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Render AI provider buttons
     */
    renderProviderButtons() {
        const buttonsContainer = document.getElementById(this.config.providerButtonsId);
        if (!buttonsContainer) {
            console.warn('⚠️ Provider buttons container not found');
            return;
        }

        buttonsContainer.innerHTML = '';

        this.config.providers.forEach(provider => {
            const group = document.createElement('div');
            group.className = 'insight-button-group';

            // Main button
            const button = document.createElement('button');
            button.id = `${provider}InsightsBtn`;
            button.className = provider === 'claude' ? 'btn btn-secondary' : 'btn btn-primary';
            button.innerHTML = `<span id="${provider}InsightsText">${this.capitalize(provider)} Insights</span>`;
            button.onclick = () => this.handleProviderClick(provider);

            group.appendChild(button);

            // Refresh button (if enabled)
            if (this.config.enableRefreshButton) {
                const refreshBtn = document.createElement('button');
                refreshBtn.id = `${provider}RefreshBtn`;
                refreshBtn.className = provider === 'claude' ? 'btn btn-secondary refresh-btn' : 'btn btn-primary refresh-btn';
                refreshBtn.style.display = 'none';
                refreshBtn.title = 'Refresh with custom prompt';
                refreshBtn.innerHTML = '<span>↻</span>';
                refreshBtn.onclick = () => this.handleRefreshClick(provider);

                group.appendChild(refreshBtn);
            }

            buttonsContainer.appendChild(group);
        });
    }

    /**
     * Render max rows control
     */
    renderMaxRowsControl() {
        const controlsContainer = document.getElementById(this.config.controlsId);
        if (!controlsContainer) return;

        const control = document.createElement('div');
        control.className = 'max-rows-control';
        control.innerHTML = `
            <label for="maxRowsInput">Max rows:</label>
            <input type="number" id="maxRowsInput" value="20" min="1" max="100"
                   style="width: 50px; padding: 4px 6px; border: 1px solid var(--border-light); border-radius: 4px; font-size: 12px;"
                   title="Maximum number of rows to send to AI">
        `;

        controlsContainer.appendChild(control);
    }

    /**
     * Handle provider button click - Override this in subclass
     */
    async handleProviderClick(provider) {
        console.log(`🔍 Provider clicked: ${provider}`);
        this.currentProvider = provider;

        // This should be overridden by subclass
        this.onProviderClick(provider);
    }

    /**
     * Handle refresh button click - Override this in subclass
     */
    async handleRefreshClick(provider) {
        console.log(`🔄 Refresh clicked: ${provider}`);
        this.currentProvider = provider;

        // This should be overridden by subclass
        this.onRefreshClick(provider);
    }

    /**
     * Call AI API
     * @param {string} provider - 'claude' or 'gemini'
     * @param {string} prompt - The prompt to send
     * @param {object} data - Additional data to send
     * @returns {Promise<object>} API response
     */
    async callAI(provider, prompt, data = {}) {
        const endpoint = provider === 'claude' ? '/claude/analyze' : '/gemini/analyze';
        const url = `${this.config.apiBase}${endpoint}`;

        console.log(`📡 Calling ${provider} API:`, url);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    data_context: data.data_context || null,
                    dataset_info: data.dataset_info || null
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('📥 AI Response received:', result);

            return result;

        } catch (error) {
            console.error(`❌ AI API Error (${provider}):`, error);
            throw error;
        }
    }

    /**
     * Display results in the content area
     * @param {string} html - HTML content to display
     */
    displayContent(html) {
        if (this.content) {
            this.content.innerHTML = html;
        }
    }

    /**
     * Display loading message
     * @param {string} message - Loading message
     */
    displayLoading(message = 'Loading...') {
        this.displayContent(`
            <div class="loading-status">
                <p>🔄 ${message}</p>
            </div>
        `);
    }

    /**
     * Display error message
     * @param {string} message - Error message
     */
    displayError(message) {
        this.displayContent(`
            <div class="error-status" style="padding: 16px; color: var(--error-color, #dc2626);">
                <p><strong>❌ Error:</strong> ${message}</p>
            </div>
        `);
    }

    /**
     * Update button states (cached indicators)
     */
    updateButtonStates() {
        this.config.providers.forEach(provider => {
            const button = document.getElementById(`${provider}InsightsBtn`);
            const text = document.getElementById(`${provider}InsightsText`);
            const refreshBtn = document.getElementById(`${provider}RefreshBtn`);

            if (!button || !text) return;

            const cacheKey = this.getCurrentCacheKey();
            const hasCached = this.config.enableCaching && this.cache[provider] && this.cache[provider][cacheKey];

            if (hasCached) {
                button.classList.add('cached-insights');
                text.textContent = `${this.capitalize(provider)} Insights (Cached)`;
                if (refreshBtn && this.config.enableRefreshButton) {
                    refreshBtn.style.display = 'flex';
                }
            } else {
                button.classList.remove('cached-insights');
                text.textContent = `${this.capitalize(provider)} Insights`;
                if (refreshBtn) {
                    refreshBtn.style.display = 'none';
                }
            }
        });
    }

    /**
     * Cache management
     */
    loadCache() {
        try {
            this.config.providers.forEach(provider => {
                const cacheKey = `${this.config.cachePrefix}_${provider}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    this.cache[provider] = JSON.parse(cached);
                    console.log(`📦 Loaded ${provider} cache:`, Object.keys(this.cache[provider]).length, 'entries');
                } else {
                    this.cache[provider] = {};
                }
            });
        } catch (error) {
            console.error('❌ Error loading cache:', error);
            this.cache = {};
        }
    }

    saveToCache(provider, cacheKey, data) {
        if (!this.config.enableCaching) return;

        if (!this.cache[provider]) {
            this.cache[provider] = {};
        }

        this.cache[provider][cacheKey] = {
            ...data,
            timestamp: new Date().toISOString()
        };

        try {
            const storageKey = `${this.config.cachePrefix}_${provider}`;
            localStorage.setItem(storageKey, JSON.stringify(this.cache[provider]));
            console.log(`💾 Saved to cache: ${provider}/${cacheKey}`);
        } catch (error) {
            console.error('❌ Error saving to cache:', error);
        }
    }

    getFromCache(provider, cacheKey) {
        if (!this.config.enableCaching) return null;
        return this.cache[provider]?.[cacheKey] || null;
    }

    clearCache(provider = null) {
        if (provider) {
            this.cache[provider] = {};
            const storageKey = `${this.config.cachePrefix}_${provider}`;
            localStorage.removeItem(storageKey);
        } else {
            this.cache = {};
            this.config.providers.forEach(p => {
                const storageKey = `${this.config.cachePrefix}_${p}`;
                localStorage.removeItem(storageKey);
            });
        }
    }

    /**
     * Helper: Get current cache key (should be overridden by subclass)
     */
    getCurrentCacheKey() {
        return 'default';
    }

    /**
     * Helper: Capitalize string
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Event handlers - Override these in subclass
     */
    onProviderClick(provider) {
        console.warn('⚠️ onProviderClick not implemented. Override this method in your subclass.');
    }

    onRefreshClick(provider) {
        console.warn('⚠️ onRefreshClick not implemented. Override this method in your subclass.');
    }

    onSave(analysis, provider) {
        console.warn('⚠️ onSave not implemented. Override this method in your subclass.');
    }

    onCancel(provider) {
        console.warn('⚠️ onCancel not implemented. Override this method in your subclass.');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIInsightsComponent;
}
