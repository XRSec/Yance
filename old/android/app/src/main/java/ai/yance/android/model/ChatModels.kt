package ai.yance.android.model

data class ChatMessage(
    val direction: Direction,
    val text: String,
    val messageType: String = "text",
    val confidence: Float = 1f,
    val contentHash: String,
)

data class ChatContext(
    val app: String,
    val contact: String,
    val messages: List<ChatMessage>,
    val timestamp: Long = System.currentTimeMillis(),
)

enum class Direction(val apiValue: String) {
    INCOMING("incoming"),
    OUTGOING("outgoing"),
    UNKNOWN("unknown"),
}

data class Suggestion(
    val id: String,
    val style: String,
    val text: String,
)
