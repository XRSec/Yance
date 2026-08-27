import Foundation

/// A unified LLM Gateway that handles OpenAI and Anthropic compatible endpoints.
actor LLMGateway {
    private let session = URLSession.shared
    
    // MARK: - Configuration
    
    enum Provider: String, Codable, Sendable {
        case openai
        case anthropic
    }
    
    struct Config: Sendable {
        let provider: Provider
        let baseUrl: URL
        let apiKey: String
        let model: String
        
        static var fallback: Config {
            Config(
                provider: .openai,
                baseUrl: URL(string: "https://api.openai.com/v1")!,
                apiKey: ProcessInfo.processInfo.environment["OPENAI_API_KEY"] ?? "",
                model: "gpt-4o"
            )
        }
    }
    
    private var config: Config
    
    init(config: Config = .fallback) {
        self.config = config
    }
    
    func setConfig(_ newConfig: Config) {
        self.config = newConfig
    }
    
    var activeModel: String {
        config.model
    }
    
    // MARK: - API
    
    /// Generates reply suggestions based on chat context.
    func generateReply(
        contact: String,
        messages: [StoredMessage],
        memories: [(String, String)],
        summaries: [SummaryDTO],
        intent: String?
    ) async throws -> [Suggestion] {
        let prompt = buildPrompt(contact: contact, messages: messages, memories: memories, summaries: summaries, intent: intent)
        let jsonResponse = try await completeJSON(prompt: prompt)
        
        struct ReplyFormat: Decodable {
            let suggestions: [Suggestion]
        }
        
        if let data = jsonResponse.data(using: .utf8),
           let parsed = try? JSONDecoder().decode(ReplyFormat.self, from: data) {
            return parsed.suggestions
        }
        
        // Fallback if LLM didn't return perfect JSON
        return [Suggestion(id: UUID().uuidString, style: "default", text: jsonResponse, reasoning: nil)]
    }
    
    /// Optimizes a draft message.
    func optimizeDraft(
        contact: String,
        draft: String,
        style: String?,
        context: [StoredMessage]?
    ) async throws -> OptimizeResponse {
        var prompt = "Please optimize the following draft message to \(contact).\n"
        if let s = style {
            prompt += "Requested style: \(s)\n"
        }
        if let ctx = context, !ctx.isEmpty {
            prompt += "\nRecent Context:\n"
            for m in ctx.suffix(5) {
                let dir = m.direction == .incoming ? contact : "Me"
                prompt += "[\(dir)]: \(m.text)\n"
            }
        }
        prompt += "\nDraft: \(draft)\n\n"
        prompt += "Return ONLY valid JSON matching this schema:\n"
        prompt += "{ \"optimized\": \"...\", \"changes\": \"...\", \"alternatives\": [\"...\"] }"
        
        let jsonResponse = try await completeJSON(prompt: prompt)
        
        if let data = jsonResponse.data(using: .utf8),
           let parsed = try? JSONDecoder().decode(OptimizeResponse.self, from: data) {
            return parsed
        }
        
        return OptimizeResponse(optimized: jsonResponse, changes: nil, alternatives: nil)
    }
    
    // MARK: - Internal HTTP execution
    
    private func buildPrompt(
        contact: String,
        messages: [StoredMessage],
        memories: [(String, String)],
        summaries: [SummaryDTO],
        intent: String?
    ) -> String {
        var prompt = "You are Yance, an AI communication copilot. Suggest 3 replies for the following conversation with \(contact).\n\n"
        
        if !memories.isEmpty {
            prompt += "Known preferences for \(contact):\n"
            for (k, v) in memories {
                prompt += "- \(k): \(v)\n"
            }
            prompt += "\n"
        }
        
        if !summaries.isEmpty {
            prompt += "Previous conversation summaries:\n"
            for s in summaries {
                prompt += "- \(s.summary)\n"
            }
            prompt += "\n"
        }
        
        prompt += "Recent Messages:\n"
        for m in messages.suffix(15) {
            let dir = m.direction == .incoming ? contact : "Me"
            prompt += "[\(dir)]: \(m.text)\n"
        }
        
        if let i = intent, !i.isEmpty {
            prompt += "\nThe user wants to express this intent: \"\(i)\"\n"
        }
        
        prompt += "\nReturn ONLY valid JSON matching this schema:\n"
        prompt += "{ \"suggestions\": [ { \"id\": \"s1\", \"style\": \"professional|casual|direct\", \"text\": \"...\", \"reasoning\": \"...\" } ] }"
        
        return prompt
    }
    
    private func completeJSON(prompt: String) async throws -> String {
        switch config.provider {
        case .openai:
            return try await callOpenAICompatible(prompt: prompt)
        case .anthropic:
            return try await callAnthropicCompatible(prompt: prompt)
        }
    }
    
    private func callOpenAICompatible(prompt: String) async throws -> String {
        let endpoint = config.baseUrl.appendingPathComponent("chat/completions")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        
        let body: [String: Any] = [
            "model": config.model,
            "messages": [
                ["role": "system", "content": "You are a helpful assistant. Always return valid JSON when requested, without markdown formatting."],
                ["role": "user", "content": prompt]
            ],
            "response_format": ["type": "json_object"],
            "temperature": 0.7
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let err = String(data: data, encoding: .utf8) ?? "Unknown HTTP error"
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: err])
        }
        
        struct OpenAIResponse: Decodable {
            struct Choice: Decodable {
                struct Message: Decodable {
                    let content: String
                }
                let message: Message
            }
            let choices: [Choice]
        }
        
        let res = try JSONDecoder().decode(OpenAIResponse.self, from: data)
        return res.choices.first?.message.content ?? "{}"
    }
    
    private func callAnthropicCompatible(prompt: String) async throws -> String {
        let endpoint = config.baseUrl.appendingPathComponent("messages")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        
        let body: [String: Any] = [
            "model": config.model,
            "max_tokens": 1024,
            "system": "You are a helpful assistant. Always return valid JSON when requested, without markdown block wrappers.",
            "messages": [
                ["role": "user", "content": prompt]
            ],
            "temperature": 0.7
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let err = String(data: data, encoding: .utf8) ?? "Unknown HTTP error"
            throw URLError(.badServerResponse, userInfo: [NSLocalizedDescriptionKey: err])
        }
        
        struct AnthropicResponse: Decodable {
            struct Content: Decodable {
                let text: String
            }
            let content: [Content]
        }
        
        let res = try JSONDecoder().decode(AnthropicResponse.self, from: data)
        return res.content.first?.text ?? "{}"
    }
}
