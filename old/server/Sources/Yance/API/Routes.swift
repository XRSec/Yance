import Vapor

func routes(_ app: Application, store: MessageStore, llm: LLMGateway) throws {
    let api = app.grouped("api")
    
    // MARK: - Health
    api.get("health") { _ async throws -> HealthResponse in
        return await HealthResponse(
            status: "ok",
            version: "0.1.0",
            uptimeSeconds: store.uptimeSeconds,
            dbSizeBytes: store.dbSizeBytes(),
            modelsAvailable: ["gpt-4o", "claude-sonnet-4"],
            activeModel: llm.activeModel
        )
    }
    
    // MARK: - Conversations
    api.get("conversations") { _ async throws -> ConversationsResponse in
        let convs = try store.listConversations()
        let dtos = convs.map { conversation in
            ConversationDTO(
                contact: conversation.contact,
                app: conversation.app,
                lastMessage: nil, // Would normally join latest message here
                lastActive: ISO8601DateFormatter().string(from: conversation.lastActiveAt),
                messageCount: conversation.messageCount,
                unanalyzed: 0
            )
        }
        return ConversationsResponse(conversations: dtos, total: dtos.count)
    }
    
    // MARK: - Memory
    api.get("memory", ":contact") { req async throws -> MemoryResponse in
        guard let contact = req.parameters.get("contact") else {
            throw Abort(.badRequest, reason: "Missing contact parameter")
        }
        let memories = try store.memoriesFor(contact: contact)
        let summaries = try store.summariesFor(contact: contact)
        let count = try store.messageCount(contact: contact)
        
        let prefs = memories.filter { $0.0 == "preference" }.map { $0.1 }
        let rel = memories.first { $0.0 == "relationship" }?.1
        let tasks = memories.filter { $0.0 == "task" }.map { $0.1 }
        
        return MemoryResponse(
            contact: contact,
            firstSeen: nil,
            lastActive: nil,
            messageCount: count,
            preferences: prefs,
            relationship: rel,
            openTasks: tasks,
            recentSummaries: summaries
        )
    }
    
    // MARK: - Reply
    api.post("reply") { req async throws -> ReplyResponse in
        let body = try req.content.decode(ReplyRequest.self)
        guard !body.messages.isEmpty else {
            throw Abort(.badRequest, reason: "messages array is empty")
        }
        
        let convId = try store.ensureConversation(app: body.app, contact: body.contact)
        _ = try store.insertMessages(body.messages, conversationId: convId)
        
        let recent = try store.recentMessages(conversationId: convId, limit: 15)
        let memories = try store.memoriesFor(contact: body.contact)
        let summaries = try store.summariesFor(contact: body.contact)
        
        let suggestions = try await llm.generateReply(
            contact: body.contact,
            messages: recent,
            memories: memories,
            summaries: summaries,
            intent: body.intent
        )
        
        return ReplyResponse(
            suggestions: suggestions,
            contextUsed: ContextUsed(
                recentMessages: recent.count,
                summaries: summaries.count,
                memories: memories.count
            )
        )
    }
    
    // MARK: - Optimize
    api.post("optimize") { req async throws -> OptimizeResponse in
        let body = try req.content.decode(OptimizeRequest.self)
        
        let context: [StoredMessage]?
        if let ctxMsgs = body.contextMessages {
            context = ctxMsgs.map { message in
                StoredMessage(
                    id: 0,
                    conversationId: 0,
                    direction: MessageDirection(rawValue: message.direction) ?? .unknown,
                    text: message.text,
                    messageType: message.messageType ?? "text",
                    confidence: message.confidence ?? 1.0,
                    contentHash: message.contentHash ?? "",
                    capturedAt: Date()
                )
            }
        } else {
            context = nil
        }
        
        return try await llm.optimizeDraft(
            contact: body.contact,
            draft: body.draft,
            style: body.style,
            context: context
        )
    }
}
