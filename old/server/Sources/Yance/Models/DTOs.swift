import Foundation
import Vapor

// MARK: - API Request / Response

/// POST /api/reply request body
struct ReplyRequest: Codable, Sendable {
    let app: String
    let contact: String
    let messages: [ChatMessageDTO]
    let intent: String?
    let timestamp: Int64?
}

/// POST /api/optimize request body
struct OptimizeRequest: Codable, Sendable {
    let app: String
    let contact: String
    let draft: String
    let style: String?
    let contextMessages: [ChatMessageDTO]?

    enum CodingKeys: String, CodingKey {
        case app, contact, draft, style
        case contextMessages = "context_messages"
    }
}

/// A single chat message from the client
struct ChatMessageDTO: Codable, Sendable {
    let direction: String      // "incoming" | "outgoing" | "unknown"
    let text: String
    let messageType: String?   // "text" | "image" | "voice" | "system"
    let confidence: Float?
    let contentHash: String?

    enum CodingKeys: String, CodingKey {
        case direction, text, confidence
        case messageType = "messageType"
        case contentHash = "contentHash"
    }
}

// MARK: - Reply response

struct ReplyResponse: Content {
    let suggestions: [Suggestion]
    let contextUsed: ContextUsed

    enum CodingKeys: String, CodingKey {
        case suggestions
        case contextUsed = "context_used"
    }
}

struct Suggestion: Content {
    let id: String
    let style: String
    let text: String
    let reasoning: String?
}

struct ContextUsed: Codable, Sendable {
    let recentMessages: Int
    let summaries: Int
    let memories: Int

    enum CodingKeys: String, CodingKey {
        case recentMessages = "recent_messages"
        case summaries
        case memories
    }
}

// MARK: - Optimize response

struct OptimizeResponse: Content {
    let optimized: String
    let changes: String?
    let alternatives: [String]?
}

// MARK: - Memory response

struct MemoryResponse: Content {
    let contact: String
    let firstSeen: String?
    let lastActive: String?
    let messageCount: Int
    let preferences: [String]
    let relationship: String?
    let openTasks: [String]
    let recentSummaries: [SummaryDTO]

    enum CodingKeys: String, CodingKey {
        case contact, preferences, relationship
        case firstSeen = "first_seen"
        case lastActive = "last_active"
        case messageCount = "message_count"
        case openTasks = "open_tasks"
        case recentSummaries = "recent_summaries"
    }
}

struct SummaryDTO: Content {
    let period: String
    let summary: String
}

// MARK: - Conversations response

struct ConversationsResponse: Content {
    let conversations: [ConversationDTO]
    let total: Int
}

struct ConversationDTO: Content {
    let contact: String
    let app: String
    let lastMessage: String?
    let lastActive: String?
    let messageCount: Int
    let unanalyzed: Int

    enum CodingKeys: String, CodingKey {
        case contact, app, unanalyzed
        case lastMessage = "last_message"
        case lastActive = "last_active"
        case messageCount = "message_count"
    }
}

// MARK: - Health response

struct HealthResponse: Content {
    let status: String
    let version: String
    let uptimeSeconds: Int
    let dbSizeBytes: Int64
    let modelsAvailable: [String]
    let activeModel: String?

    enum CodingKeys: String, CodingKey {
        case status, version
        case uptimeSeconds = "uptime_seconds"
        case dbSizeBytes = "db_size_bytes"
        case modelsAvailable = "models_available"
        case activeModel = "active_model"
    }
}

// MARK: - Error response

struct ErrorResponse: Codable, Sendable {
    let error: ErrorDetail
}

struct ErrorDetail: Codable, Sendable {
    let code: String
    let message: String
}

// MARK: - Internal domain

enum MessageDirection: String, Codable, Sendable {
    case incoming, outgoing, unknown
}

struct StoredMessage: Sendable {
    let id: Int64
    let conversationId: Int64
    let direction: MessageDirection
    let text: String
    let messageType: String
    let confidence: Float
    let contentHash: String
    let capturedAt: Date
}

struct Conversation: Sendable {
    let id: Int64
    let app: String
    let contact: String
    let createdAt: Date
    let lastActiveAt: Date
    let messageCount: Int
}
