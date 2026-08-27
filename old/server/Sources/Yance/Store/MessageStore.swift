import Foundation
import SQLite

/// Persistent store backed by SQLite.
///
/// SQLite's `Connection` is not Sendable, so this is a plain final class guarded
/// by a serial queue. All public methods are synchronous; clients either call
/// them directly or hop to a background executor when necessary.
final class MessageStore: @unchecked Sendable {
    private let db: Connection
    private let queue = DispatchQueue(label: "ai.yance.store")
    private let startTime = Date()

    // MARK: - Tables

    private let conversations = Table("conversations")
    private let colId = SQLite.Expression<Int64>("id")
    private let colApp = SQLite.Expression<String>("app")
    private let colContact = SQLite.Expression<String>("contact")
    private let colCreatedAt = SQLite.Expression<Double>("created_at")
    private let colLastActiveAt = SQLite.Expression<Double>("last_active_at")

    private let messages = Table("messages")
    private let colMsgId = SQLite.Expression<Int64>("id")
    private let colConvId = SQLite.Expression<Int64>("conversation_id")
    private let colDirection = SQLite.Expression<String>("direction")
    private let colText = SQLite.Expression<String>("text")
    private let colMsgType = SQLite.Expression<String>("message_type")
    private let colConfidence = SQLite.Expression<Double>("confidence")
    private let colContentHash = SQLite.Expression<String>("content_hash")
    private let colCapturedAt = SQLite.Expression<Double>("captured_at")

    private let summaries = Table("summaries")
    private let colSumConvId = SQLite.Expression<Int64>("conversation_id")
    private let colPeriod = SQLite.Expression<String>("period")
    private let colSummary = SQLite.Expression<String>("summary")

    private let memories = Table("memories")
    private let colMemContact = SQLite.Expression<String>("contact")
    private let colKey = SQLite.Expression<String>("key")
    private let colValue = SQLite.Expression<String>("value")

    // MARK: - Init

    init(path: String? = nil) throws {
        let dbPath = path ?? MessageStore.defaultPath()
        let dir = (dbPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        db = try Connection(dbPath)
        try db.run(conversations.create(ifNotExists: true) { table in
            table.column(colId, primaryKey: .autoincrement)
            table.column(colApp)
            table.column(colContact)
            table.column(colCreatedAt)
            table.column(colLastActiveAt)
            table.unique(colApp, colContact)
        })

        try db.run(messages.create(ifNotExists: true) { table in
            table.column(colMsgId, primaryKey: .autoincrement)
            table.column(colConvId, references: conversations, colId)
            table.column(colDirection)
            table.column(colText)
            table.column(colMsgType, defaultValue: "text")
            table.column(colConfidence, defaultValue: 1.0)
            table.column(colContentHash)
            table.column(colCapturedAt)
        })

        try db.run(messages.createIndex(colContentHash, colConvId, unique: false, ifNotExists: true))

        try db.run(summaries.create(ifNotExists: true) { table in
            table.column(colId, primaryKey: .autoincrement)
            table.column(colSumConvId, references: conversations, colId)
            table.column(colPeriod)
            table.column(colSummary)
        })

        try db.run(memories.create(ifNotExists: true) { table in
            table.column(colId, primaryKey: .autoincrement)
            table.column(colMemContact)
            table.column(colKey)
            table.column(colValue)
        })
    }

    private static func defaultPath() -> String {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return support.appendingPathComponent("Yance/yance.sqlite3").path
    }

    // MARK: - Conversations

    /// Find or create a conversation, returns its id.
    func ensureConversation(app: String, contact: String) throws -> Int64 {
        try queue.sync {
            let query = conversations.filter(colApp == app && colContact == contact)
            if let row = try db.pluck(query) {
                let id = row[colId]
                try db.run(query.update(colLastActiveAt <- Date().timeIntervalSince1970))
                return id
            }
            let now = Date().timeIntervalSince1970
            return try db.run(conversations.insert(
                colApp <- app,
                colContact <- contact,
                colCreatedAt <- now,
                colLastActiveAt <- now
            ))
        }
    }

    /// Insert messages, skipping duplicates by content_hash within the conversation.
    func insertMessages(_ msgs: [ChatMessageDTO], conversationId: Int64) throws -> Int {
        try queue.sync {
            var inserted = 0
            for msg in msgs {
                let hash = msg.contentHash ?? md5(msg.text)
                let exists = try db.scalar(
                    messages.filter(colConvId == conversationId && colContentHash == hash).count
                )
                if exists > 0 { continue }
                try db.run(messages.insert(
                    colConvId <- conversationId,
                    colDirection <- msg.direction,
                    colText <- msg.text,
                    colMsgType <- (msg.messageType ?? "text"),
                    colConfidence <- Double(msg.confidence ?? 1.0),
                    colContentHash <- hash,
                    colCapturedAt <- Date().timeIntervalSince1970
                ))
                inserted += 1
            }
            return inserted
        }
    }

    /// Recent messages for a conversation, newest last.
    func recentMessages(conversationId: Int64, limit: Int = 50) throws -> [StoredMessage] {
        try queue.sync {
            let query = messages
                .filter(colConvId == conversationId)
                .order(colCapturedAt.asc)
                .limit(limit)
            return try db.prepare(query).map { row in
                StoredMessage(
                    id: row[colMsgId],
                    conversationId: row[colConvId],
                    direction: MessageDirection(rawValue: row[colDirection]) ?? .unknown,
                    text: row[colText],
                    messageType: row[colMsgType],
                    confidence: Float(row[colConfidence]),
                    contentHash: row[colContentHash],
                    capturedAt: Date(timeIntervalSince1970: row[colCapturedAt])
                )
            }
        }
    }

    /// List all conversations.
    func listConversations() throws -> [Conversation] {
        try queue.sync {
            let query = conversations.order(colLastActiveAt.desc)
            return try db.prepare(query).map { row in
                let convId = row[colId]
                let count = try db.scalar(messages.filter(colConvId == convId).count)
                return Conversation(
                    id: convId,
                    app: row[colApp],
                    contact: row[colContact],
                    createdAt: Date(timeIntervalSince1970: row[colCreatedAt]),
                    lastActiveAt: Date(timeIntervalSince1970: row[colLastActiveAt]),
                    messageCount: count
                )
            }
        }
    }

    /// Get summaries for a contact.
    func summariesFor(contact: String) throws -> [SummaryDTO] {
        try queue.sync {
            let joined = summaries
                .join(conversations, on: colSumConvId == conversations[colId])
                .filter(conversations[colContact] == contact)
                .order(summaries[colId].desc)
                .limit(5)
            return try db.prepare(joined).map { row in
                SummaryDTO(period: row[colPeriod], summary: row[colSummary])
            }
        }
    }

    /// Get memory entries for a contact.
    func memoriesFor(contact: String) throws -> [(String, String)] {
        try queue.sync {
            let query = memories.filter(colMemContact == contact)
            return try db.prepare(query).map { ($0[colKey], $0[colValue]) }
        }
    }

    /// Count messages for a contact across all apps.
    func messageCount(contact: String) throws -> Int {
        try queue.sync {
            let joined = messages
                .join(conversations, on: colConvId == conversations[colId])
                .filter(conversations[colContact] == contact)
            return try db.scalar(joined.count)
        }
    }

    /// DB file size in bytes.
    func dbSizeBytes() -> Int64 {
        (try? FileManager.default.attributesOfItem(atPath: db.description))?[.size] as? Int64 ?? 0
    }

    var uptimeSeconds: Int {
        Int(Date().timeIntervalSince(startTime))
    }

    // MARK: - Helpers

    private func md5(_ string: String) -> String {
        // Simple djb2 hash as a fast placeholder; replace with CryptoKit if needed.
        var hash: UInt64 = 5381
        for byte in string.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }
}