// Search Logic for NLP - CSV Loading and Fuzzy Search

/**
 * Loads project feeds from Google Sheets
 * @param {string} sheetUrl - The Google Sheets CSV export URL
 * @param {Function} onSuccess - Callback when data loads successfully
 * @param {Function} onError - Callback when loading fails
 */
window.loadProjectFeeds = function(sheetUrl, onSuccess, onError) {
    console.log('📥 Loading project feeds from:', sheetUrl);

    fetch(sheetUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if(results.data.length === 0){
                        onError('No data found in Google Sheet.');
                        return;
                    }

                    // Store all columns from Google Sheet
                    const feeds = results.data.map(r => ({
                        Title: r.Title?.trim() || r.Name?.trim() || "(No title)",
                        Description: r.Description?.trim() || r.About?.trim() || "(No description)",
                        URL: r.URL?.trim() || r.Link?.trim() || "#",
                        Team: r.Team?.trim() || "",
                        Status: r.Status?.trim() || "",
                        Location: r.Location?.trim() || "",
                        Tags: r.Tags?.trim() || "",
                        // Keep all original data for AI analysis
                        _raw: r
                    }));

                    console.log("✅ Google Sheets loaded successfully. Total feeds:", feeds.length);
                    console.log("📋 Available columns:", Object.keys(results.data[0] || {}));

                    onSuccess(feeds);
                },
                error: function(err) {
                    onError(`Error parsing CSV: ${err}`);
                }
            });
        })
        .catch(error => {
            onError(`Error loading Google Sheet: ${error.message}`);
        });
};

/**
 * Initializes Fuse.js for fuzzy searching
 * @param {Array} feeds - Array of project feeds
 * @param {number} threshold - Search threshold (0-1)
 * @returns {Fuse} Fuse.js instance
 */
window.initializeFuzzySearch = function(feeds, threshold = 0.35) {
    return new Fuse(feeds, {
        keys: ['Title', 'Description', 'Team', 'Tags', 'Location'],
        threshold: threshold,
        includeScore: true
    });
};

/**
 * Performs search on project feeds
 * @param {string} query - Search query
 * @param {Array} feeds - Array of project feeds
 * @param {Fuse} fuseInstance - Fuse.js instance (optional)
 * @param {boolean} useFuzzy - Whether to use fuzzy search
 * @returns {Array} Search results
 */
window.searchFeeds = function(query, feeds, fuseInstance, useFuzzy) {
    if (!query.trim()) {
        return [];
    }

    if (useFuzzy && fuseInstance) {
        return fuseInstance.search(query);
    } else {
        // Exact match search
        const lowerQuery = query.toLowerCase();
        return feeds
            .filter(f =>
                f.Title.toLowerCase().includes(lowerQuery) ||
                f.Description.toLowerCase().includes(lowerQuery)
            )
            .map(f => ({ item: f }));
    }
};

/**
 * Renders search results as HTML cards
 * @param {Array} results - Search results from searchFeeds
 * @param {NLPURLResolver} urlResolver - Optional URL resolver for project page links
 * @returns {string} HTML string of result cards
 */
window.renderSearchResults = function(results, urlResolver = null) {
    if (!results || results.length === 0) {
        return '';
    }

    return results.map(r => {
        const item = r.item;

        // Get project page URL using resolver (with fallback to original URL)
        const projectURL = urlResolver
            ? urlResolver.getProjectPageURL(item.Title, item.URL)
            : item.URL;

        return `<div class="card">
                    <h3>${item.Title}</h3>
                    <p>${item.Description}</p>
                    <a href="${projectURL}" target="_blank">View Project →</a>
                </div>`;
    }).join('');
};
