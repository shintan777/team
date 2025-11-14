// src/claude_insights.rs
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use anyhow::Context;

#[derive(Debug, Deserialize)]
pub struct ClaudeAnalysisRequest {
    pub prompt: String,
    pub dataset_info: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ClaudeAnalysisResponse {
    pub success: bool,
    pub analysis: Option<String>,
    pub error: Option<String>,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

pub async fn analyze_with_claude_cli(
    req: web::Json<ClaudeAnalysisRequest>,
) -> Result<HttpResponse> {
    match call_claude_code_cli(&req.prompt, &req.dataset_info).await {
        Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(ClaudeAnalysisResponse {
            success: true,
            analysis: Some(analysis),
            error: None,
            token_usage,
        })),
        Err(e) => {
            eprintln!("Claude Code CLI Error: {e:?}");
            
            // Provide estimated token usage even when Claude CLI fails
            let prompt_len = req.prompt.len();
            let estimated_prompt_tokens = (prompt_len / 4) as u32;
            let estimated_completion_tokens = 50; // Rough estimate for fallback message
            let estimated_total = estimated_prompt_tokens + estimated_completion_tokens;
            
            let fallback_token_usage = Some(TokenUsage {
                prompt_tokens: Some(estimated_prompt_tokens),
                completion_tokens: Some(estimated_completion_tokens),
                total_tokens: Some(estimated_total),
            });
            
            Ok(HttpResponse::InternalServerError().json(ClaudeAnalysisResponse {
                success: false,
                analysis: None,
                error: Some(format!("Claude Code CLI execution failed: {e}")),
                token_usage: fallback_token_usage,
            }))
        }
    }
}

// Call Claude Code CLI for dataset analysis
pub async fn call_claude_code_cli(prompt: &str, dataset_info: &Option<serde_json::Value>) -> anyhow::Result<(String, Option<TokenUsage>)> {
    use std::process::Command;

    // Check if claude command exists
    let check_command = if cfg!(target_os = "windows") {
        Command::new("where").arg("claude").output()
    } else {
        Command::new("which").arg("claude").output()
    };

    if let Ok(check_result) = check_command {
        if !check_result.status.success() {
            return Err(anyhow::anyhow!(
                "Claude CLI not installed. To use this feature, install the Claude CLI or use the Gemini API instead."
            ));
        }
    }

    // Build the full prompt with dataset context
    let full_prompt = if let Some(dataset) = dataset_info {
        format!("{}\n\nDataset Context:\n{}", prompt, serde_json::to_string_pretty(dataset)?)
    } else {
        prompt.to_string()
    };

    println!("Executing Claude Code CLI analysis...");

    // First try with regular text output since JSON format has issues
    let output = Command::new("claude")
        .arg("--print")
        .arg(&full_prompt)
        .output()
        .context("Failed to execute claude command. Make sure Claude Code CLI is installed and accessible.")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Claude Code CLI failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let analysis = stdout.trim().to_string();
    
    if analysis.is_empty() {
        return Err(anyhow::anyhow!("Claude Code CLI returned empty response"));
    }
    
    // Estimate token usage based on text length
    let prompt_len = full_prompt.len();
    let response_len = analysis.len();
    
    let estimated_prompt_tokens = (prompt_len / 4) as u32;  // Rough estimate: 4 chars per token
    let estimated_completion_tokens = (response_len / 4) as u32;
    let estimated_total = estimated_prompt_tokens + estimated_completion_tokens;
    
    let token_usage = Some(TokenUsage {
        prompt_tokens: Some(estimated_prompt_tokens),
        completion_tokens: Some(estimated_completion_tokens),
        total_tokens: Some(estimated_total),
    });
    
    println!("Claude Code CLI analysis completed successfully");
    Ok((analysis, token_usage))
}