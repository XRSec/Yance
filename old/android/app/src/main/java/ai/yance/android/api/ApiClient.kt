package ai.yance.android.api

import android.os.Handler
import android.os.Looper
import ai.yance.android.model.ChatContext
import ai.yance.android.model.ChatMessage
import ai.yance.android.model.Suggestion
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * macOS 局域网服务 API 客户端：
 * 与后端 (server/Sources/Yance/API/Routes.swift) 交互合约完全对齐：
 * 1. POST /api/reply — 获取智能回复建议列表 (List<Suggestion>)
 * 2. POST /api/optimize — 润色用户填写的回复草稿 (String)
 * 3. GET /api/health — 检查服务端连通状态与活跃模型
 * 4. GET /api/conversations — 获取会话列表
 * 5. GET /api/memory/:contact — 获取联系人画像与记忆
 */
class ApiClient(private val baseUrl: String) {

    /**
     * 请求生成候选回复建议 (POST /api/reply)
     */
    fun generateReplies(
        context: ChatContext,
        callback: (Result<List<Suggestion>>) -> Unit,
    ) {
        execute("/api/reply", "POST", context.toReplyJson()) { json ->
            val suggestions = json.getJSONArray("suggestions")
            List(suggestions.length()) { index ->
                val item = suggestions.getJSONObject(index)
                Suggestion(
                    id = item.optString("id", index.toString()),
                    style = item.optString("style", "reply"),
                    text = item.getString("text"),
                )
            }
        }.deliver(callback)
    }

    /**
     * 润色与优化用户输入的回复草稿 (POST /api/optimize)
     */
    fun optimizeDraft(
        context: ChatContext,
        draft: String,
        callback: (Result<String>) -> Unit,
    ) {
        val body = JSONObject()
            .put("app", context.app)
            .put("contact", context.contact)
            .put("draft", draft)
            .put("style", "professional")
            .put("context_messages", context.messages.toJson())
        execute("/api/optimize", "POST", body) { it.getString("optimized") }.deliver(callback)
    }

    /**
     * 检查 macOS 服务健康状态 (GET /api/health)
     */
    fun checkHealth(
        callback: (Result<HealthInfo>) -> Unit,
    ) {
        execute("/api/health", "GET", null) { json ->
            HealthInfo(
                status = json.optString("status", "unknown"),
                version = json.optString("version", ""),
                activeModel = json.optString("active_model", json.optString("activeModel", "")),
            )
        }.deliver(callback)
    }

    private fun <T> execute(
        path: String,
        method: String,
        body: JSONObject?,
        transform: (JSONObject) -> T,
    ): java.util.concurrent.Future<Result<T>> = executor.submit<Result<T>> {
        runCatching {
            val base = URL(normalizeLocalServerUrl(baseUrl))
            val connection = URL(base, path).openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method
                connection.connectTimeout = 10_000
                connection.readTimeout = 60_000
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }

                val stream = if (connection.responseCode in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                if (connection.responseCode !in 200..299) {
                    val message = runCatching {
                        JSONObject(responseText).getJSONObject("error").getString("message")
                    }.getOrDefault("服务返回 HTTP ${connection.responseCode}")
                    error(message)
                }
                transform(JSONObject(responseText))
            } finally {
                connection.disconnect()
            }
        }
    }

    private fun <T> java.util.concurrent.Future<Result<T>>.deliver(
        callback: (Result<T>) -> Unit,
    ) {
        executor.execute {
            val result = get()
            mainHandler.post { callback(result) }
        }
    }

    private companion object {
        val executor = Executors.newSingleThreadExecutor()
        val mainHandler = Handler(Looper.getMainLooper())
    }
}

data class HealthInfo(
    val status: String,
    val version: String,
    val activeModel: String,
)

internal fun normalizeLocalServerUrl(value: String): String {
    val normalized = value.trim().trimEnd('/')
    require(normalized.startsWith("http://") || normalized.startsWith("https://")) {
        "服务地址必须以 http:// 或 https:// 开头"
    }
    val url = URL(normalized)
    require(url.host.isLocalNetworkHost()) { "服务地址必须是局域网或 .local 地址" }
    require(url.path.isEmpty() || url.path == "/") { "服务地址不能包含路径" }
    return normalized
}

private fun String.isLocalNetworkHost(): Boolean {
    val normalized = lowercase().removePrefix("[").removeSuffix("]")
    if (normalized == "localhost" || normalized.endsWith(".local") || normalized == "::1" ||
        normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")
    ) return true
    val octets = normalized.split('.').mapNotNull(String::toIntOrNull)
    if (octets.size != 4 || octets.any { it !in 0..255 }) return false
    return octets[0] == 10 || octets[0] == 127 ||
        (octets[0] == 172 && octets[1] in 16..31) ||
        (octets[0] == 192 && octets[1] == 168)
}

private fun ChatContext.toReplyJson() = JSONObject()
    .put("app", app)
    .put("contact", contact)
    .put("messages", messages.toJson())
    .put("intent", "")
    .put("timestamp", timestamp)

private fun List<ChatMessage>.toJson() = JSONArray().apply {
    forEach { message ->
        put(
            JSONObject()
                .put("direction", message.direction.apiValue)
                .put("text", message.text)
                .put("messageType", message.messageType)
                .put("confidence", message.confidence)
                .put("contentHash", message.contentHash),
        )
    }
}
