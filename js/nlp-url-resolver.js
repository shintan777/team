/**
 * NLP URL Resolver
 *
 * Resolves project titles to their dedicated projects page URLs.
 * Uses lists.csv as a lookup table to map titles to feed slugs.
 * Falls back to original URL if no mapping is found.
 *
 * Usage:
 * const resolver = new NLPURLResolver();
 * await resolver.init();
 * const url = resolver.getProjectPageURL('Data Pipeline', 'https://fallback.url');
 */

class NLPURLResolver {
    constructor() {
        this.listsMapping = {}; // { "Title": "feed-slug" }
        this.baseURL = window.location.origin + '/team/projects/';
        this.isLoaded = false;
    }

    /**
     * Initialize the resolver by loading lists.csv
     */
    async init() {
        console.log('📋 Loading projects lists mapping...');

        try {
            await this.loadListsMapping();
            this.isLoaded = true;
            console.log('✅ Lists mapping loaded:', Object.keys(this.listsMapping).length, 'projects');
            return true;
        } catch (error) {
            console.error('❌ Failed to load lists mapping:', error);
            this.isLoaded = false;
            return false;
        }
    }

    /**
     * Load lists.csv and create title → slug mapping
     */
    async loadListsMapping() {
        const csvURL = 'projects/lists.csv';

        try {
            const response = await fetch(csvURL);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const csvText = await response.text();

            // Parse CSV using PapaParse
            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        if (!results.data || results.data.length === 0) {
                            reject(new Error('No data found in lists.csv'));
                            return;
                        }

                        // Build mapping: Title → Feed
                        results.data.forEach(row => {
                            const title = row.Title?.trim();
                            const feed = row.Feed?.trim();

                            if (title && feed) {
                                // Store with original case
                                this.listsMapping[title] = feed;

                                // Also store lowercase version for case-insensitive lookup
                                this.listsMapping[title.toLowerCase()] = feed;
                            }
                        });

                        console.log('📦 Parsed lists.csv:', results.data.length, 'rows');
                        resolve();
                    },
                    error: (error) => {
                        reject(new Error(`CSV parse error: ${error.message}`));
                    }
                });
            });
        } catch (error) {
            throw new Error(`Failed to fetch lists.csv: ${error.message}`);
        }
    }

    /**
     * Get the projects page URL for a given project title
     *
     * @param {string} projectTitle - The project title from search results
     * @param {string} fallbackURL - Original URL to use if no mapping found
     * @returns {string} Projects page URL or fallback URL
     */
    getProjectPageURL(projectTitle, fallbackURL = '#') {
        if (!this.isLoaded) {
            console.warn('⚠️ Lists mapping not loaded yet, using fallback URL');
            return fallbackURL;
        }

        if (!projectTitle) {
            return fallbackURL;
        }

        // Try exact match first
        let slug = this.listsMapping[projectTitle.trim()];

        // Try case-insensitive match
        if (!slug) {
            slug = this.listsMapping[projectTitle.trim().toLowerCase()];
        }

        // If found in mapping, return projects page URL
        if (slug) {
            console.log(`✅ Found mapping: "${projectTitle}" → ${slug}`);
            return `${this.baseURL}#list=${slug}&display=table`;
        }

        // Fallback to original URL
        console.log(`⚠️ No mapping found for "${projectTitle}", using fallback URL`);
        return fallbackURL;
    }

}

// Make available globally
window.NLPURLResolver = NLPURLResolver;
