// src/prompts.rs
// Server-side prompt templates for AI integrations

use serde::{Deserialize, Serialize};

/// Project data structure for semantic search
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectData {
    #[serde(rename = "Title")]
    pub title: String,
    #[serde(rename = "Description")]
    pub description: String,
    #[serde(rename = "Team")]
    pub team: Option<String>,
    #[serde(rename = "Status")]
    pub status: Option<String>,
    #[serde(rename = "Tags")]
    pub tags: Option<String>,
    #[serde(rename = "URL")]
    pub url: Option<String>,
}

/// Builds the semantic search prompt for AI analysis
/// # Arguments
/// * `query` - The user's search query
/// * `projects` - Array of projects to analyze (server-selected)
/// * `total_projects` - Total number of projects in database
///
/// # Returns
/// Formatted prompt string ready for AI API
pub fn build_semantic_search_prompt(
    query: &str,
    projects: &[ProjectData],
    total_projects: usize,
) -> String {
    let projects_json = serde_json::to_string_pretty(projects)
        .unwrap_or_else(|_| "[]".to_string());

    format!(
        r#"You are a semantic search engine for project feeds. Analyze the user's query and return ONLY the matching projects.

**User Query:** "{query}"

**Your Task:**
1. Understand the semantic meaning and intent of the user's query
2. Find ALL projects that match the query (not just exact keyword matches)
3. Consider synonyms, related concepts, and context
4. Return results in JSON format

**Return Format (JSON ONLY, no other text):**
{{
  "matches": [
    {{
      "title": "Project Title",
      "description": "Project Description",
      "relevance_score": 95,
      "match_reason": "Brief explanation why this matches",
      "url": "project url",
      "team": "team name",
      "status": "status"
    }}
  ],
  "total_matches": 5,
  "search_interpretation": "What you understood from the query"
}}

**Projects Database ({analyzed} of {total} total):**
{projects_json}

Return ONLY valid JSON. No markdown, no code blocks, just JSON."#,
        query = query,
        analyzed = projects.len(),
        total = total_projects,
        projects_json = projects_json
    )
}

/// Builds a general data analysis prompt (used by projects/index.html)
///
/// # Arguments
/// * `custom_prompt` - User's custom prompt or default analysis request
/// * `dataset_info` - JSON value containing dataset context and sample data
///
/// # Returns
/// Formatted prompt with dataset context
pub fn build_data_analysis_prompt(
    custom_prompt: &str,
    dataset_info: &serde_json::Value,
) -> String {
    format!(
        "{}\n\nDataset Context:\n{}",
        custom_prompt,
        serde_json::to_string_pretty(dataset_info)
            .unwrap_or_else(|_| "{}".to_string())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semantic_search_prompt_generation() {
        let projects = vec![
            ProjectData {
                title: "Green Energy".to_string(),
                description: "Solar power initiative".to_string(),
                team: Some("Engineering".to_string()),
                status: Some("Active".to_string()),
                tags: Some("sustainability".to_string()),
                url: Some("https://example.com".to_string()),
            }
        ];

        let prompt = build_semantic_search_prompt(
            "sustainability projects",
            &projects,
            100
        );

        assert!(prompt.contains("sustainability projects"));
        assert!(prompt.contains("1 of 100 total"));
        assert!(prompt.contains("Green Energy"));
    }

    #[test]
    fn test_data_analysis_prompt_generation() {
        let dataset = serde_json::json!({
            "record_count": 50,
            "sample_data": []
        });

        let prompt = build_data_analysis_prompt(
            "Analyze this data",
            &dataset
        );

        assert!(prompt.contains("Analyze this data"));
        assert!(prompt.contains("Dataset Context"));
        assert!(prompt.contains("record_count"));
    }
}
