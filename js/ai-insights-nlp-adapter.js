/**
 * NLP Search Adapter for AI Insights Component
 *
 * This adapter extends the AIInsightsComponent for semantic search functionality.
 * It handles:
 * - Natural language search queries
 * - Project matching with relevance scores
 * - Match reasoning display
 * - Integration with NLP search modules
 *
 * Usage:
 * const nlpAI = new NLPAIAdapter();
 * nlpAI.init();
 */

class NLPAIAdapter extends AIInsightsComponent {
    constructor(customConfig = {}) {
        // Merge NLP preset with custom config
        const config = {
            ...AIInsightsConfigs.nlp,
            ...customConfig
        };

        super(config);

        // NLP-specific state
        this.currentQuery = '';
        this.lastResults = null;

        // URL resolver for project page links
        this.urlResolver = null;

        console.log('🔍 NLP AI Adapter initialized');
    }

    /**
     * Initialize - Override to add NLP-specific setup
     */
    async init() {
        const success = super.init();

        if (success) {
            // Initialize URL resolver
            if (typeof NLPURLResolver !== 'undefined') {
                this.urlResolver = new NLPURLResolver();
                await this.urlResolver.init();
            } else {
                console.warn('⚠️ NLPURLResolver not loaded, project page links will use fallback URLs');
            }

            // Show the insights section automatically for NLP
            this.show();

            // Add default message
            this.displayDefaultMessage();
        }

        return success;
    }

    /**
     * Handle provider button click
     * For NLP, this triggers an immediate semantic search
     */
    async onProviderClick(provider) {
        console.log(`🔍 NLP Search triggered with ${provider}`);

        // Get search query from input
        const searchInput = document.getElementById('q');
        if (!searchInput) {
            this.displayError('Search input not found');
            return;
        }

        this.currentQuery = searchInput.value.trim();

        // Validation
        if (!this.currentQuery) {
            alert('Please enter a search query first');
            return;
        }

        if (!window.nlpFeeds || window.nlpFeeds.length === 0) {
            alert('Project data not loaded yet. Please wait...');
            return;
        }

        // Clear regular search results
        const searchResultsDiv = document.getElementById('search-results');
        if (searchResultsDiv) {
            searchResultsDiv.innerHTML = '';
        }

        // Show loading state
        this.displayLoading(`AI is analyzing ${window.nlpFeeds.length} projects to find matches...`);

        try {
            // NEW SIMPLIFIED API CALL
            // Server handles all business logic: prompt building, data selection, parsing
            const response = await fetch(`${this.config.apiBase}/semantic-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: this.currentQuery,
                    provider: provider,
                    filters: {
                        max_results: 30
                    },
                    projects: window.nlpFeeds  // Send raw project data, server will process
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            // Display results (server already parsed and structured the response)
            if (result.success && result.matches) {
                this.displaySearchResults(result, this.currentQuery);
                this.lastResults = result;
            } else {
                this.displayError(result.error || 'No results returned');
            }

        } catch (error) {
            console.error('❌ NLP Search Error:', error);
            this.displayError(`Unable to connect to AI service: ${error.message}`);
        }
    }

    /**
     * Parse AI response into structured results
     */
    parseSearchResults(analysisText) {
        try {
            // Remove markdown code blocks if present
            let jsonText = analysisText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // Try to find JSON object
            let jsonMatch = jsonText.match(/\{[\s\S]*\}/);

            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const results = JSON.parse(jsonMatch[0]);
            console.log('✅ Parsed search results:', results);

            return results;

        } catch (error) {
            console.error('❌ JSON parse error:', error);
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
    }

    /**
     * Display search results as project cards
     */
    displaySearchResults(results, query) {
        console.log('🎨 Displaying NLP search results');

        // Validate results structure
        if (!results || typeof results !== 'object') {
            this.displayError('Invalid results format received');
            return;
        }

        if (!results.matches || !Array.isArray(results.matches)) {
            this.displayNoResults(query);
            return;
        }

        if (results.matches.length === 0) {
            this.displayNoResults(query);
            return;
        }

        // Build results HTML
        let html = this.buildResultsHeader(results, query);
        html += this.buildProjectCards(results.matches);

        this.displayContent(html);
    }

    /**
     * Display "no results" message
     */
    displayNoResults(query) {
        this.displayContent(`
            <div style="padding: 20px; text-align: center; background: #f9f9f9; border-radius: 5px;">
                <p style="font-size: 16px; color: #666;">No matching projects found for "<strong>${query}</strong>"</p>
                <p style="font-size: 14px; color: #999;">Try different keywords or a more general query.</p>
            </div>
        `);
    }

    /**
     * Build results header
     */
    buildResultsHeader(results, query) {
        let html = '<div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin-bottom: 15px;">';
        html += `<h4 style="margin: 0 0 10px 0; color: #2c5aa0;">🤖 AI Search Results</h4>`;
        html += `<p style="margin: 0; font-size: 14px; color: #666;">`;
        html += `Found <strong>${results.total_matches || results.matches.length} matching projects</strong>`;
        if (results.search_interpretation) {
            html += `<br><em>Understanding: ${results.search_interpretation}</em>`;
        }
        html += `</p></div>`;
        return html;
    }

    /**
     * Build project cards
     */
    buildProjectCards(matches) {
        let html = '';

        matches.forEach((match, index) => {
            // Validate match object
            if (!match || typeof match !== 'object') {
                console.warn(`⚠️ Invalid match at index ${index}:`, match);
                return;
            }

            const title = match.title || match.Title || '(No title)';
            const description = match.description || match.Description || '(No description)';
            const originalURL = match.url || match.URL || '#';
            const score = match.relevance_score || match.score || 0;
            const reason = match.match_reason || match.reason || '';
            const team = match.team || match.Team || '';
            const status = match.status || match.Status || '';

            // Get project page URL using resolver (with fallback to original URL)
            const projectURL = this.urlResolver
                ? this.urlResolver.getProjectPageURL(title, originalURL)
                : originalURL;

            console.log(`  Match ${index + 1}: ${title} (${score}%)`);

            html += `<div class="card" style="border-left: 4px solid #4CAF50;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h3 style="margin: 0 0 10px 0;">${this.escapeHtml(title)}</h3>
                    <span style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 3px; font-size: 12px; white-space: nowrap;">
                        ${score}% match
                    </span>
                </div>
                <p style="margin: 0 0 10px 0;">${this.escapeHtml(description)}</p>
                ${reason ? `<p style="margin: 0 0 10px 0; padding: 10px; background: #f0f9ff; border-radius: 3px; font-size: 13px;"><strong>Why this matches:</strong> ${this.escapeHtml(reason)}</p>` : ''}
                <div style="display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #666;">
                    ${team ? `<span>👥 Team: ${this.escapeHtml(team)}</span>` : ''}
                    ${status ? `<span>📊 Status: ${this.escapeHtml(status)}</span>` : ''}
                </div>
                <a href="${this.escapeHtml(projectURL)}" target="_blank" style="display: inline-block; margin-top: 10px;">View Project →</a>
            </div>`;
        });

        return html;
    }

    /**
     * Display default message
     */
    displayDefaultMessage() {
        this.displayContent(`
            <div style="color: var(--text-secondary, #6b7280); font-style: italic; text-align: center; padding: 20px;">
                Enter a search query above and click <strong>Gemini Insights</strong> for AI-powered semantic search.
            </div>
        `);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get current cache key - Not used for NLP (no caching)
     */
    getCurrentCacheKey() {
        return 'nlp_search';
    }

    /**
     * Refresh is not used in NLP mode - same as provider click
     */
    onRefreshClick(provider) {
        this.onProviderClick(provider);
    }
}

// Make available globally
window.NLPAIAdapter = NLPAIAdapter;
