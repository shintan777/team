// src/semantic_search.rs
// Semantic search handler with server-side business logic

use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use crate::prompts::{build_semantic_search_prompt, ProjectData};
use crate::gemini_insights::{self, GeminiAnalysisRequest};
use crate::claude_insights::{self, ClaudeAnalysisRequest};
use crate::ApiState;

/// Request payload for semantic search
#[derive(Debug, Deserialize)]
pub struct SemanticSearchRequest {
    /// User's search query
    pub query: String,

    /// AI provider to use ('gemini' or 'claude')
    #[serde(default = "default_provider")]
    pub provider: String,

    /// Optional filters
    #[serde(default)]
    pub filters: SearchFilters,

    /// Optional: all projects data from client
    /// If not provided, server should load from database/external source
    pub projects: Option<Vec<ProjectData>>,
}

fn default_provider() -> String {
    "gemini".to_string()
}

/// Search filters (extensible for future use)
#[derive(Debug, Deserialize, Default)]
pub struct SearchFilters {
    /// Maximum number of projects to analyze
    #[serde(default = "default_max_results")]
    pub max_results: usize,

    /// Optional team filter
    pub teams: Option<Vec<String>>,

    /// Optional status filter
    pub status: Option<Vec<String>>,
}

fn default_max_results() -> usize {
    30
}

/// Match result from semantic search
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub title: String,
    pub description: String,
    pub relevance_score: Option<u32>,
    pub match_reason: Option<String>,
    pub url: Option<String>,
    pub team: Option<String>,
    pub status: Option<String>,
}

/// Token usage information (compatible with both Gemini and Claude)
#[derive(Debug, Serialize, Clone)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

impl From<gemini_insights::TokenUsage> for TokenUsage {
    fn from(usage: gemini_insights::TokenUsage) -> Self {
        TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        }
    }
}

impl From<claude_insights::TokenUsage> for TokenUsage {
    fn from(usage: claude_insights::TokenUsage) -> Self {
        TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        }
    }
}

/// Response payload for semantic search
#[derive(Debug, Serialize)]
pub struct SemanticSearchResponse {
    pub success: bool,
    pub matches: Option<Vec<SearchMatch>>,
    pub total_matches: Option<usize>,
    pub search_interpretation: Option<String>,
    pub error: Option<String>,
    pub token_usage: Option<TokenUsage>,
}

/// Main semantic search handler
///
/// This endpoint handles all business logic server-side:
/// 1. Validates query
/// 2. Filters and selects projects to analyze
/// 3. Builds prompt using server-side template
/// 4. Calls AI API
/// 5. Parses and validates response
/// 6. Returns structured results
pub async fn search_projects(
    data: web::Data<std::sync::Arc<ApiState>>,
    req: web::Json<SemanticSearchRequest>,
) -> Result<HttpResponse> {
    println!("📡 Semantic search request: query='{}', provider='{}'", req.query, req.provider);

    // 1. Validate query
    if req.query.trim().is_empty() {
        return Ok(HttpResponse::BadRequest().json(SemanticSearchResponse {
            success: false,
            matches: None,
            total_matches: None,
            search_interpretation: None,
            error: Some("Search query cannot be empty".to_string()),
            token_usage: None,
        }));
    }

    // 2. Get projects data
    // In future, this could load from database or external API
    let all_projects = match &req.projects {
        Some(projects) => projects.clone(),
        None => {
            return Ok(HttpResponse::BadRequest().json(SemanticSearchResponse {
                success: false,
                matches: None,
                total_matches: None,
                search_interpretation: None,
                error: Some("No projects data provided. Client must send projects array.".to_string()),
                token_usage: None,
            }));
        }
    };

    println!("📊 Total projects available: {}", all_projects.len());

    // 3. Apply filters and select top projects for analysis
    let filtered_projects = apply_filters(&all_projects, &req.filters);
    let projects_to_analyze = select_projects_for_analysis(&filtered_projects, req.filters.max_results);

    println!("📋 Projects selected for analysis: {} of {}", projects_to_analyze.len(), all_projects.len());

    // 4. Build prompt using server-side template
    let prompt = build_semantic_search_prompt(
        &req.query,
        &projects_to_analyze,
        all_projects.len(),
    );

    println!("📝 Prompt generated: {} characters", prompt.len());

    // 5. Call AI API based on provider
    match req.provider.as_str() {
        "gemini" => call_gemini_for_search(data, &prompt).await,
        "claude" => call_claude_for_search(&prompt).await,
        _ => Ok(HttpResponse::BadRequest().json(SemanticSearchResponse {
            success: false,
            matches: None,
            total_matches: None,
            search_interpretation: None,
            error: Some(format!("Invalid provider: {}. Use 'gemini' or 'claude'", req.provider)),
            token_usage: None,
        })),
    }
}

/// Apply filters to projects
fn apply_filters(projects: &[ProjectData], filters: &SearchFilters) -> Vec<ProjectData> {
    projects.iter()
        .filter(|p| {
            // Team filter
            if let Some(ref teams) = filters.teams {
                if let Some(ref project_team) = p.team {
                    if !teams.iter().any(|t| project_team.contains(t)) {
                        return false;
                    }
                }
            }

            // Status filter
            if let Some(ref statuses) = filters.status {
                if let Some(ref project_status) = p.status {
                    if !statuses.contains(project_status) {
                        return false;
                    }
                }
            }

            true
        })
        .cloned()
        .collect()
}

/// Select projects for analysis
///
/// Future improvements could include:
/// - Relevance ranking before sending to AI
/// - Prioritizing recently updated projects
/// - Ensuring diverse team representation
fn select_projects_for_analysis(projects: &[ProjectData], max_results: usize) -> Vec<ProjectData> {
    projects.iter()
        .take(max_results)
        .cloned()
        .collect()
}

/// Call Gemini API for semantic search using existing handler
async fn call_gemini_for_search(
    data: web::Data<std::sync::Arc<ApiState>>,
    prompt: &str,
) -> Result<HttpResponse> {
    // Use existing Gemini handler
    let gemini_request = GeminiAnalysisRequest {
        prompt: prompt.to_string(),
        data_context: None,
    };

    let response = gemini_insights::analyze_with_gemini(
        data,
        web::Json(gemini_request),
    ).await?;

    // Extract the response body
    if let Ok(body_bytes) = actix_web::body::to_bytes(response.into_body()).await {
        if let Ok(gemini_response) = serde_json::from_slice::<gemini_insights::GeminiAnalysisResponse>(&body_bytes) {
            if gemini_response.success {
                if let Some(analysis) = gemini_response.analysis {
                    // Parse AI response
                    match parse_search_results(&analysis) {
                        Ok((matches, total_matches, interpretation)) => {
                            return Ok(HttpResponse::Ok().json(SemanticSearchResponse {
                                success: true,
                                matches: Some(matches),
                                total_matches: Some(total_matches),
                                search_interpretation: Some(interpretation),
                                error: None,
                                token_usage: gemini_response.token_usage.map(|u| u.into()),
                            }));
                        }
                        Err(e) => {
                            eprintln!("❌ Failed to parse AI response: {}", e);
                            return Ok(HttpResponse::Ok().json(SemanticSearchResponse {
                                success: false,
                                matches: None,
                                total_matches: None,
                                search_interpretation: None,
                                error: Some(format!("Failed to parse AI response: {}", e)),
                                token_usage: gemini_response.token_usage.map(|u| u.into()),
                            }));
                        }
                    }
                }
            }
            // Return the error from Gemini
            return Ok(HttpResponse::Ok().json(SemanticSearchResponse {
                success: false,
                matches: None,
                total_matches: None,
                search_interpretation: None,
                error: gemini_response.error,
                token_usage: None,
            }));
        }
    }

    Ok(HttpResponse::InternalServerError().json(SemanticSearchResponse {
        success: false,
        matches: None,
        total_matches: None,
        search_interpretation: None,
        error: Some("Failed to parse Gemini response".to_string()),
        token_usage: None,
    }))
}

/// Call Claude CLI for semantic search
async fn call_claude_for_search(prompt: &str) -> Result<HttpResponse> {
    match crate::claude_insights::call_claude_code_cli(prompt, &None).await {
        Ok((analysis, token_usage)) => {
            println!("✅ Claude CLI call successful");

            // Parse AI response
            match parse_search_results(&analysis) {
                Ok((matches, total_matches, interpretation)) => {
                    Ok(HttpResponse::Ok().json(SemanticSearchResponse {
                        success: true,
                        matches: Some(matches),
                        total_matches: Some(total_matches),
                        search_interpretation: Some(interpretation),
                        error: None,
                        token_usage: token_usage.map(|u| u.into()),
                    }))
                }
                Err(e) => {
                    eprintln!("❌ Failed to parse AI response: {}", e);
                    Ok(HttpResponse::Ok().json(SemanticSearchResponse {
                        success: false,
                        matches: None,
                        total_matches: None,
                        search_interpretation: None,
                        error: Some(format!("Failed to parse AI response: {}", e)),
                        token_usage: token_usage.map(|u| u.into()),
                    }))
                }
            }
        }
        Err(e) => {
            eprintln!("❌ Claude CLI call failed: {}", e);
            Ok(HttpResponse::InternalServerError().json(SemanticSearchResponse {
                success: false,
                matches: None,
                total_matches: None,
                search_interpretation: None,
                error: Some(format!("Claude CLI error: {}", e)),
                token_usage: None,
            }))
        }
    }
}

/// Parse AI response and extract search results
///
/// This centralizes response parsing logic on the server,
/// making it easier to handle different AI response formats
fn parse_search_results(analysis: &str) -> anyhow::Result<(Vec<SearchMatch>, usize, String)> {
    // Remove markdown code blocks if present
    let mut json_text = analysis.to_string();
    json_text = json_text.replace("```json", "").replace("```", "");

    // Try to find JSON object
    let json_match = json_text.find('{')
        .and_then(|start| {
            json_text.rfind('}').map(|end| &json_text[start..=end])
        })
        .ok_or_else(|| anyhow::anyhow!("No JSON found in response"))?;

    // Parse JSON
    let parsed: serde_json::Value = serde_json::from_str(json_match)?;

    // Extract matches array
    let matches = parsed["matches"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("No 'matches' array in response"))?
        .iter()
        .filter_map(|m| {
            Some(SearchMatch {
                title: m["title"].as_str()?.to_string(),
                description: m["description"].as_str()?.to_string(),
                relevance_score: m["relevance_score"].as_u64().map(|v| v as u32),
                match_reason: m["match_reason"].as_str().map(|s| s.to_string()),
                url: m["url"].as_str().map(|s| s.to_string()),
                team: m["team"].as_str().map(|s| s.to_string()),
                status: m["status"].as_str().map(|s| s.to_string()),
            })
        })
        .collect::<Vec<_>>();

    let total_matches = parsed["total_matches"]
        .as_u64()
        .unwrap_or(matches.len() as u64) as usize;

    let interpretation = parsed["search_interpretation"]
        .as_str()
        .unwrap_or("No interpretation provided")
        .to_string();

    Ok((matches, total_matches, interpretation))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_results() {
        let response = r#"{
            "matches": [
                {
                    "title": "Green Energy",
                    "description": "Solar project",
                    "relevance_score": 95,
                    "match_reason": "Sustainability focus",
                    "url": "https://example.com",
                    "team": "Engineering",
                    "status": "Active"
                }
            ],
            "total_matches": 1,
            "search_interpretation": "Looking for sustainability projects"
        }"#;

        let (matches, total, interp) = parse_search_results(response).unwrap();

        assert_eq!(matches.len(), 1);
        assert_eq!(total, 1);
        assert_eq!(matches[0].title, "Green Energy");
        assert_eq!(interp, "Looking for sustainability projects");
    }

    #[test]
    fn test_parse_search_results_with_markdown() {
        let response = r#"```json
        {
            "matches": [],
            "total_matches": 0,
            "search_interpretation": "Test"
        }
        ```"#;

        let (matches, total, _) = parse_search_results(response).unwrap();
        assert_eq!(matches.len(), 0);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_apply_filters() {
        let projects = vec![
            ProjectData {
                title: "Project A".to_string(),
                description: "Test".to_string(),
                team: Some("Engineering".to_string()),
                status: Some("Active".to_string()),
                tags: None,
                url: None,
            },
            ProjectData {
                title: "Project B".to_string(),
                description: "Test".to_string(),
                team: Some("Marketing".to_string()),
                status: Some("Completed".to_string()),
                tags: None,
                url: None,
            },
        ];

        let filters = SearchFilters {
            max_results: 30,
            teams: Some(vec!["Engineering".to_string()]),
            status: None,
        };

        let filtered = apply_filters(&projects, &filters);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].title, "Project A");
    }
}
