package ai.yance.android.data

import ai.yance.android.model.ApprovalTask
import ai.yance.android.model.Channel
import ai.yance.android.model.SendConfirmation
import ai.yance.android.model.TaskStatus

/**
 * 待办任务数据仓库接口：
 * 定义了客户端与服务端（或 Mock 层）的标准交互合约，涵盖：
 * 1. 任务列表拉取与监听
 * 2. 状态流转（进入详情自动标记已读、切换已读/待办状态、确认发送）
 * 3. AI 智能交互（重新生成建议、草稿润色优化）
 * 4. 远程 API 预设与扩展支持
 */
interface TaskRepository {
    /** 获取任务列表，支持按渠道筛选 */
    fun tasks(channel: Channel? = null): List<ApprovalTask>

    /** 订阅任务变更流（未来接入后端 SSE 或 WebSocket） */
    fun subscribe(listener: (List<ApprovalTask>) -> Unit): AutoCloseable

    /** 触发全量数据同步刷新 */
    fun refresh(): Boolean

    /** 进入详情页或手动触发：标记任务为已读 */
    fun markAsRead(taskId: String): Boolean

    /** 切换任务状态：在已读 (READ) 与 待办 (PENDING) 之间切换 */
    fun toggleReadStatus(taskId: String): Boolean

    /** 选择或更新回复草稿内容 */
    fun selectReply(taskId: String, reply: String): Boolean

    /** 重新生成该任务的候选回复（对接 POST /api/reply） */
    fun regenerateCandidates(taskId: String): Boolean

    /** 针对用户输入的草稿进行 AI 润色优化（对接 POST /api/optimize） */
    fun optimizeDraft(taskId: String, draft: String): Boolean

    /** 获取发送二次确认凭证 */
    fun confirmation(taskId: String): SendConfirmation?

    /** 二次确认后执行发送并将任务标记为已发送/已归档 */
    fun confirmSend(confirmation: SendConfirmation): Boolean

    /** 重置 Mock 演示数据（仅用于本地调试） */
    fun resetMockTasks(): Boolean = false
}

/**
 * 筛选未归档的任务（PENDING 待办 与 READ 已读），按接收时间降序排列
 */
fun activeTasks(tasks: List<ApprovalTask>, channel: Channel? = null): List<ApprovalTask> =
    tasks.asSequence()
        .filter { it.status == TaskStatus.PENDING || it.status == TaskStatus.READ }
        .filter { channel == null || it.channel == channel }
        .sortedByDescending { it.receivedAt }
        .toList()

/** 兼容旧命名 */
fun pendingTasks(tasks: List<ApprovalTask>, channel: Channel? = null): List<ApprovalTask> =
    activeTasks(tasks, channel)

