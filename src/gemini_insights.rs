// src/gemini-insights.rs

use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::ApiState;
// use google_sheets4::{Sheets, api::ValueRange};
// use google_apis_common::auth::{ServiceAccountAuthenticator, ServiceAccountKey};
use anyhow::Context;

#[derive(Deserialize)]
pub struct MeetupRequest {
    #[allow(dead_code)]
    meetup_link: String,
}


#[derive(Debug, Serialize)]
pub struct GeminiTestResponse {
    success: bool,
    message: String,
    api_key_present: bool,
    api_key_preview: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GeminiAnalysisRequest {
    pub prompt: String,
    #[allow(dead_code)]
    pub data_context: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiAnalysisResponse {
    pub success: bool,
    pub analysis: Option<String>,
    pub error: Option<String>,
    pub error_details: Option<GeminiErrorDetails>,
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiErrorDetails {
    pub status_code: u16,
    pub error_type: String,
    pub raw_response: Option<String>,
    pub request_size: usize,
    pub timestamp: String,
    pub api_endpoint: String,
}

impl std::fmt::Display for GeminiErrorDetails {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Gemini API {} ({}): {}", 
               self.error_type, 
               self.status_code,
               self.raw_response.as_deref().unwrap_or("No details"))
    }
}

impl std::error::Error for GeminiErrorDetails {}


// Analyze data with Gemini AI
pub async fn analyze_with_gemini(
    data: web::Data<std::sync::Arc<ApiState>>,
    req: web::Json<GeminiAnalysisRequest>,
) -> Result<HttpResponse> {
    let (api_key_present, gemini_api_key) = {
        let config_guard = data.config.lock().unwrap();
        let api_key_present = !config_guard.gemini_api_key.is_empty() 
            && config_guard.gemini_api_key != "dummy_key"
            && config_guard.gemini_api_key != "get-key-at-aistudio.google.com";
        (api_key_present, config_guard.gemini_api_key.clone())
    };
    
    if !api_key_present {
        return Ok(HttpResponse::BadRequest().json(GeminiAnalysisResponse {
            success: false,
            analysis: None,
            error: Some("Gemini API key not configured".to_string()),
            error_details: None,
            token_usage: None,
        }));
    }

    match call_gemini_api(&gemini_api_key, &req.prompt).await {
        Ok((analysis, token_usage)) => Ok(HttpResponse::Ok().json(GeminiAnalysisResponse {
            success: true,
            analysis: Some(analysis),
            error: None,
            error_details: None,
            token_usage,
        })),
        Err(e) => {
            // Log detailed error for debugging
            eprintln!("Gemini API Error: {e:?}");
            
            // Extract GeminiErrorDetails if available
            let error_details = e.chain()
                .find_map(|err| err.downcast_ref::<GeminiErrorDetails>())
                .cloned();

            Ok(HttpResponse::InternalServerError().json(GeminiAnalysisResponse {
                success: false,
                analysis: None,
                error: Some(e.to_string()),
                error_details,
                token_usage: None,
            }))
        }
    }
}

// Call Gemini API for text generation
async fn call_gemini_api(api_key: &str, prompt: &str) -> anyhow::Result<(String, Option<TokenUsage>)> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    );
    
    let request_body = json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 8192,
        }
    });

    let request_size = serde_json::to_string(&request_body)
        .map(|s| s.len())
        .unwrap_or(0);
    
    let start_time = std::time::Instant::now();
    
    println!("Making Gemini API request - Size: {request_size} bytes, URL: {url}");
    
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .context("Failed to make request to Gemini API")?;
    
    let duration = start_time.elapsed();
    let status = response.status();
    let status_code = status.as_u16();
    
    println!("Gemini API response - Status: {status}, Duration: {duration:?}");
    
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unable to read error response".to_string());
        
        let error_details = GeminiErrorDetails {
            status_code,
            error_type: match status_code {
                400 => "Bad Request".to_string(),
                401 => "Unauthorized".to_string(),
                403 => "Forbidden".to_string(),
                429 => "Rate Limited".to_string(),
                500 => "Internal Server Error".to_string(),
                502 => "Bad Gateway".to_string(),
                503 => "Service Unavailable".to_string(),
                504 => "Gateway Timeout".to_string(),
                _ => "Unknown Error".to_string(),
            },
            raw_response: Some(error_text.clone()),
            request_size,
            timestamp: chrono::Utc::now().to_rfc3339(),
            api_endpoint: url.clone(),
        };
        
        println!("Gemini API Error Details: {error_details:?}");
        
        return Err(anyhow::Error::new(error_details)
            .context(format!("Gemini API error {status}: {error_text}")));
    }
    
    let response_json: serde_json::Value = response.json().await
        .context("Failed to parse Gemini API response")?;
    
    println!("Gemini API response parsed successfully");
    
    // Extract the generated text from the response
    let text = response_json
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.get(0))
        .and_then(|part| part.get("text"))
        .and_then(|text| text.as_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid Gemini API response format. Response: {}", 
            serde_json::to_string_pretty(&response_json).unwrap_or_else(|_| "Unable to serialize response".to_string())))?;
    
    println!("Gemini API text extracted successfully - Length: {} chars", text.len());
    
    // Extract token usage information
    let token_usage = response_json
        .get("usageMetadata")
        .map(|usage| {
            let prompt_tokens = usage.get("promptTokenCount").and_then(|v| v.as_u64()).map(|v| v as u32);
            let completion_tokens = usage.get("candidatesTokenCount").and_then(|v| v.as_u64()).map(|v| v as u32);
            let total_tokens = usage.get("totalTokenCount").and_then(|v| v.as_u64()).map(|v| v as u32);
            
            TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens,
            }
        });
    
    if let Some(ref usage) = token_usage {
        println!("Token usage - Prompt: {:?}, Completion: {:?}, Total: {:?}", 
                 usage.prompt_tokens, usage.completion_tokens, usage.total_tokens);
    }
    
    Ok((text.to_string(), token_usage))
}

// Test Gemini API key and connection
pub async fn test_gemini_api(
    data: web::Data<std::sync::Arc<ApiState>>,
) -> Result<HttpResponse> {
    let (api_key_present, gemini_api_key) = {
        let config_guard = data.config.lock().unwrap();
        let api_key_present = !config_guard.gemini_api_key.is_empty() 
            && config_guard.gemini_api_key != "dummy_key"
            && config_guard.gemini_api_key != "get-key-at-aistudio.google.com";
        (api_key_present, config_guard.gemini_api_key.clone())
    };
    
    if !api_key_present {
        return Ok(HttpResponse::Ok().json(GeminiTestResponse {
            success: false,
            message: "Gemini API key not configured".to_string(),
            api_key_present: false,
            api_key_preview: None,
            error: Some("Please configure GEMINI_API_KEY in your .env file".to_string()),
        }));
    }
    
    // Create API key preview (first 4 + "..." + last 4 characters)
    let api_key_preview = if gemini_api_key.len() >= 8 {
        format!("{}...{}", 
                &gemini_api_key[..4], 
                &gemini_api_key[gemini_api_key.len()-4..])
    } else {
        "****".to_string()
    };
    
    // Test the API with a simple prompt
    match call_gemini_api(&gemini_api_key, "Hello, please respond with 'API test successful'").await {
        Ok((response, _)) => {
            if response.to_lowercase().contains("api test successful") {
                Ok(HttpResponse::Ok().json(GeminiTestResponse {
                    success: true,
                    message: "Gemini API connection successful".to_string(),
                    api_key_present: true,
                    api_key_preview: Some(api_key_preview),
                    error: None,
                }))
            } else {
                Ok(HttpResponse::Ok().json(GeminiTestResponse {
                    success: true,
                    message: "Gemini API responded but with unexpected content".to_string(),
                    api_key_present: true,
                    api_key_preview: Some(api_key_preview),
                    error: Some(format!("Expected test response, got: {}", response.chars().take(100).collect::<String>())),
                }))
            }
        },
        Err(e) => {
            Ok(HttpResponse::Ok().json(GeminiTestResponse {
                success: false,
                message: "Gemini API key present but API call failed".to_string(),
                api_key_present: true,
                api_key_preview: Some(api_key_preview),
                error: Some(e.to_string()),
            }))
        }
    }
}