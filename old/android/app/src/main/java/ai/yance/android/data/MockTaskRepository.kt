package ai.yance.android.data

import ai.yance.android.model.ApprovalTask
import ai.yance.android.model.Channel
import ai.yance.android.model.ReplyOption
import ai.yance.android.model.SendConfirmation
import ai.yance.android.model.TaskStatus

class MockTaskRepository(now: Long = System.currentTimeMillis()) : TaskRepository {
    private val lock = Any()
    private val listeners = linkedSetOf<(List<ApprovalTask>) -> Unit>()
    private var tasks = mockTasks(now)

    override fun tasks(channel: Channel?): List<ApprovalTask> = synchronized(lock) {
        activeTasks(tasks, channel)
    }

    override fun subscribe(listener: (List<ApprovalTask>) -> Unit): AutoCloseable {
        val snapshot = synchronized(lock) {
            listeners += listener
            activeTasks(tasks)
        }
        listener(snapshot)
        return AutoCloseable { synchronized(lock) { listeners -= listener } }
    }

    override fun refresh(): Boolean = true

    override fun markAsRead(taskId: String): Boolean = update(taskId) { task ->
        if (task.status == TaskStatus.PENDING) {
            task.copy(status = TaskStatus.READ)
        } else {
            task
        }
    }

    override fun toggleReadStatus(taskId: String): Boolean = update(taskId) { task ->
        when (task.status) {
            TaskStatus.PENDING -> task.copy(status = TaskStatus.READ)
            TaskStatus.READ -> task.copy(status = TaskStatus.PENDING)
            TaskStatus.SENT -> null
        }
    }

    override fun selectReply(taskId: String, reply: String): Boolean {
        val normalizedReply = reply.trim()
        if (normalizedReply.isEmpty()) return false
        return update(taskId) { task ->
            if (task.status == TaskStatus.SENT) null else task.copy(selectedReply = normalizedReply)
        }
    }

    override fun regenerateCandidates(taskId: String): Boolean = update(taskId) { task ->
        if (task.status == TaskStatus.SENT) {
            null
        } else {
            val generation = task.version + 1
            task.copy(
                candidates = listOf(
                    ReplyOption("$generation-1", "收到，我先确认一下具体情况，稍后给您答复。"),
                    ReplyOption("$generation-2", "好的，方便再补充一下您的时间和具体需求吗？"),
                    ReplyOption("$generation-3", "没问题，我正在处理，确认后第一时间回复您。"),
                ),
                selectedReply = null,
                version = generation,
            )
        }
    }

    override fun optimizeDraft(taskId: String, draft: String): Boolean {
        val normalizedDraft = draft.trim()
        if (normalizedDraft.isEmpty()) return false
        return update(taskId) { task ->
            if (task.status == TaskStatus.SENT) {
                null
            } else {
                val generation = task.version + 1
                task.copy(
                    candidates = listOf(
                        ReplyOption("$generation-1", normalizedDraft),
                        ReplyOption("$generation-2", "您好，$normalizedDraft"),
                        ReplyOption("$generation-3", "$normalizedDraft 如果您方便，我可以继续为您处理。"),
                    ),
                    selectedReply = null,
                    version = generation,
                )
            }
        }
    }

    override fun confirmation(taskId: String): SendConfirmation? = synchronized(lock) {
        tasks.firstOrNull { it.id == taskId && it.status != TaskStatus.SENT }
            ?.selectedReply
            ?.takeIf(String::isNotBlank)
            ?.let { reply ->
                val task = tasks.first { it.id == taskId }
                SendConfirmation(task.id, task.version, reply)
            }
    }

    override fun confirmSend(confirmation: SendConfirmation): Boolean = update(confirmation.taskId) { task ->
        if (
            task.status == TaskStatus.SENT ||
            task.version != confirmation.version ||
            task.selectedReply != confirmation.reply
        ) {
            null
        } else {
            task.copy(status = TaskStatus.SENT)
        }
    }

    override fun resetMockTasks(): Boolean {
        val listenersSnapshot: List<(List<ApprovalTask>) -> Unit>
        val tasksSnapshot: List<ApprovalTask>
        synchronized(lock) {
            tasks = mockTasks(System.currentTimeMillis())
            listenersSnapshot = listeners.toList()
            tasksSnapshot = activeTasks(tasks)
        }
        listenersSnapshot.forEach { it(tasksSnapshot) }
        return true
    }

    private fun update(
        taskId: String,
        transform: (ApprovalTask) -> ApprovalTask?,
    ): Boolean {
        val listenersSnapshot: List<(List<ApprovalTask>) -> Unit>
        val tasksSnapshot: List<ApprovalTask>
        synchronized(lock) {
            val index = tasks.indexOfFirst { it.id == taskId }
            if (index < 0) return false
            val updated = transform(tasks[index]) ?: return false
            tasks = tasks.toMutableList().also { it[index] = updated }
            listenersSnapshot = listeners.toList()
            tasksSnapshot = activeTasks(tasks)
        }
        listenersSnapshot.forEach { it(tasksSnapshot) }
        return true
    }

    private companion object {
        fun mockTasks(now: Long) = listOf(
            ApprovalTask(
                id = "wechat-a",
                channel = Channel.WECHAT,
                contact = "测试联系人 A",
                incomingText = "明天下午方便聊一下方案吗？",
                receivedAt = now - 2 * 60_000,
                candidates = listOf(
                    ReplyOption("1", "方便，明天下午三点可以，您看合适吗？"),
                    ReplyOption("2", "可以的，请问您希望明天下午几点沟通？"),
                    ReplyOption("3", "没问题，我确认一下安排后马上回复您。"),
                ),
            ),
            ApprovalTask(
                id = "xhs-b",
                channel = Channel.XIAOHONGSHU,
                contact = "测试联系人 B",
                incomingText = "请问笔记里的同款还有吗？",
                receivedAt = now - 11 * 60_000,
                candidates = listOf(
                    ReplyOption("1", "您好，还有的，我把详细信息发给您。"),
                    ReplyOption("2", "有的，请问您想了解哪个颜色？"),
                    ReplyOption("3", "感谢关注，目前还有少量库存。"),
                ),
            ),
            ApprovalTask(
                id = "xianyu-c",
                channel = Channel.XIANYU,
                contact = "测试联系人 C",
                incomingText = "今天拍下的话什么时候能发货？",
                receivedAt = now - 24 * 60_000,
                candidates = listOf(
                    ReplyOption("1", "今天拍下，明天可以发货。"),
                    ReplyOption("2", "您好，付款后会在 24 小时内发出。"),
                    ReplyOption("3", "可以尽快安排，发出后我会同步单号。"),
                ),
            ),
            ApprovalTask(
                id = "wechat-d",
                channel = Channel.WECHAT,
                contact = "测试联系人 D",
                incomingText = "上次说的报价可以再发我一份吗？",
                receivedAt = now - 52 * 60_000,
                candidates = listOf(
                    ReplyOption("1", "可以，我整理好后马上发给您。"),
                    ReplyOption("2", "没问题，我现在重新发您一份。"),
                    ReplyOption("3", "好的，请稍等，我核对后发给您。"),
                ),
            ),
        )
    }
}

object TaskRepositories {
    val inbox: TaskRepository = MockTaskRepository()

    /** No remote source exists in Mock mode, so no background work is scheduled. */
    fun backgroundSource(): TaskRepository? = null
}
