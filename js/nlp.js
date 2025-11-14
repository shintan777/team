// AI-Powered Natural Language Search - Main Orchestration
// This file coordinates between API, display, search, and prompt modules

// Initialize API_BASE
if (typeof API_BASE === 'undefined') {
    var API_BASE = 'http://localhost:8081/api';
    window.API_BASE = API_BASE;
}

console.log('🔧 NLP Search initialized');
console.log('API_BASE:', API_BASE);

/**
 * Initialize the NLP Search Page
 */
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("q");
    const fuzzyCheckbox = document.getElementById("fuzzy");
    const thresholdSlider = document.getElementById("th");
    const searchResultsDiv = document.getElementById("search-results");

    let feeds = [];
    let fuse;

    // Google Sheets URL
    const masterSheetUrl = 'https://docs.google.com/spreadsheets/d/1jQTlXWom-pXvyP9zuTcbdluyvpb43hu2h7anxhF5qlQ/export?format=csv';

    searchResultsDiv.innerHTML = '<p>🔄 Loading project feeds from Google Sheets...</p>';

    // Load project feeds
    loadProjectFeeds(
        masterSheetUrl,
        // Success callback
        (loadedFeeds) => {
            feeds = loadedFeeds;

            // Make feeds available globally for AI search
            window.nlpFeeds = feeds;
            console.log("✅ Set window.nlpFeeds:", window.nlpFeeds.length, "projects");

            // Initialize fuzzy search
            fuse = initializeFuzzySearch(feeds, thresholdSlider.value / 100);

            searchResultsDiv.innerHTML = `<p>✅ Loaded ${feeds.length} project feeds. Start searching above!</p>`;
        },
        // Error callback
        (errorMessage) => {
            searchResultsDiv.innerHTML = `<p style="color:red;">${errorMessage}</p>`;
            console.error('Load error:', errorMessage);
        }
    );

    /**
     * Perform regular (non-AI) search
     */
    const doSearch = () => {
        if (!feeds.length) return;

        const query = searchInput.value.trim();
        if (!query) {
            searchResultsDiv.innerHTML = '';
            return;
        }

        const useFuzzy = fuzzyCheckbox.checked;
        const results = searchFeeds(query, feeds, fuse, useFuzzy);

        if (!results.length) {
            searchResultsDiv.innerHTML = `<p>No results found for "<strong>${query}</strong>"</p>`;
            return;
        }

        // Get URL resolver from AI adapter (if initialized)
        const urlResolver = window.nlpAI?.urlResolver || null;
        searchResultsDiv.innerHTML = renderSearchResults(results, urlResolver);
    };

    // Event listeners for search
    searchInput.addEventListener("input", doSearch);
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch();
    });

    thresholdSlider.addEventListener("input", () => {
        if (fuse) fuse.options.threshold = thresholdSlider.value / 100;
        doSearch();
    });

    fuzzyCheckbox.addEventListener("change", doSearch);
});
