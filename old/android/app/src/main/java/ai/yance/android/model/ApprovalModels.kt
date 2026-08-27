package ai.yance.android.model

enum class Channel(val label: String, val apiValue: String) {
    WECHAT("微信", "wechat"),
    XIAOHONGSHU("小红书", "xiaohongshu"),
    XIANYU("闲鱼", "xianyu"),
}

/**
 * 任务处理状态：
 * - PENDING: 待办（未读/未处理）
 * - READ: 已读（已进入消息详情查看，但尚未发送回复）
 * - SENT: 已确认发送并归档
 */
enum class TaskStatus {
    PENDING,
    READ,
    SENT,
}

data class ReplyOption(
    val id: String,
    val text: String,
    val reasoning: String? = null,
)

data class ApprovalTask(
    val id: String,
    val channel: Channel,
    val contact: String,
    val incomingText: String,
    val receivedAt: Long,
    val candidates: List<ReplyOption>,
    val selectedReply: String? = null,
    val status: TaskStatus = TaskStatus.PENDING,
    val version: Int = 1,
)

data class SendConfirmation(
    val taskId: String,
    val version: Int,
    val reply: String,
)

