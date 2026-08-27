package ai.yance.android

import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.format.DateUtils
import android.util.Log
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import ai.yance.android.api.normalizeLocalServerUrl
import ai.yance.android.data.TaskRepositories
import ai.yance.android.data.TaskRepository
import ai.yance.android.model.ApprovalTask
import ai.yance.android.model.Channel
import ai.yance.android.model.SendConfirmation
import ai.yance.android.sync.TaskSyncScheduler

class MainActivity : ComponentActivity() {
    private val repository: TaskRepository = TaskRepositories.inbox
    private val preferences by lazy { getSharedPreferences(PREFERENCES, MODE_PRIVATE) }
    private val drafts = mutableMapOf<String, String>()

    private lateinit var root: FrameLayout
    private lateinit var mainContainer: LinearLayout
    private lateinit var headerBar: LinearLayout
    private lateinit var mainScroll: ScrollView
    private lateinit var contentLayout: LinearLayout
    private lateinit var channelSwitcherButton: LinearLayout
    private lateinit var channelSwitcherIcon: TextView
    private lateinit var channelSwitcherText: TextView
    private lateinit var channelMenuOverlay: View
    private lateinit var channelMenuPopup: LinearLayout
    private lateinit var bottomDetailBar: LinearLayout
    private lateinit var draftInput: EditText
    private lateinit var optimizeButton: TextView
    private lateinit var readStatusToggleButton: TextView
    private lateinit var sendButton: TextView

    private var subscription: AutoCloseable? = null
    private var latestTasks = emptyList<ApprovalTask>()
    private var selectedChannel: Channel? = null
    private var isChannelMenuOpen = false
    private var openTaskId: String? = null
    private var settingsOpen = false
    private var activeDraftTaskId: String? = null
    private var isUpdatingDraftInput = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedInstanceState?.let(::restoreUiState)
        title = getString(R.string.app_name)

        buildStaticViewHierarchy()
        setContentView(root)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = navigateBack()
            },
        )
        TaskSyncScheduler.configure(this)

        latestTasks = repository.tasks(selectedChannel)
        Log.d(TAG, "onCreate: loaded ${latestTasks.size} tasks")
        render()
    }

    private fun buildStaticViewHierarchy() {
        // 1. 根容器 (FrameLayout 允许在左下角悬浮土方形切换按钮)
        root = FrameLayout(this).apply {
            setBackgroundColor(COLOR_BG)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        // 2. 主页面纵向容器
        mainContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        // 2.1 顶部导航栏容器
        headerBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(COLOR_CARD)
        }
        mainContainer.addView(headerBar, matchWidth())

        // 2.2 中间可滚动内容区域
        contentLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(80)) // 底部预留空间以防悬浮按钮遮挡
        }

        mainScroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            addView(
                contentLayout,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        mainContainer.addView(mainScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        // 2.3 消息详情吸底操作栏（包含 润色 / 状态切换 / 确认发送）
        buildBottomDetailBar()
        mainContainer.addView(bottomDetailBar, matchWidth())

        root.addView(mainContainer)

        // 3. 左下角弹出式渠道选择菜单与主按钮
        buildChannelMenuPopup()
        buildChannelSwitcherButton()
        val switcherParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.START
            marginStart = dp(16)
            bottomMargin = dp(20)
        }
        root.addView(channelSwitcherButton, switcherParams)

        // 4. WindowInsets 安全区适配
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            headerBar.setPadding(0, bars.top, 0, 0)
            bottomDetailBar.setPadding(dp(16), dp(10), dp(16), dp(10) + bars.bottom)
            (channelSwitcherButton.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                lp.bottomMargin = dp(20) + bars.bottom
                channelSwitcherButton.layoutParams = lp
            }
            (channelMenuPopup.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                lp.bottomMargin = dp(76) + bars.bottom
                channelMenuPopup.layoutParams = lp
            }
            insets
        }
    }

    /**
     * 左下角渠道选择弹出菜单：
     * 点击或长按左下角按钮时，在上方直接展开四个选项：
     * 1. 💬 微信
     * 2. 📕 小红书
     * 3. 🐟 闲鱼
     * 4. 🌐 全部
     */
    private fun buildChannelMenuPopup() {
        channelMenuOverlay = View(this).apply {
            setBackgroundColor(0x22000000.toInt())
            visibility = View.GONE
            isClickable = true
            isFocusable = true
            setOnClickListener { closeChannelMenu() }
        }
        root.addView(channelMenuOverlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))

        channelMenuPopup = object : LinearLayout(this) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                val maxW = dp(144)
                val widthMode = MeasureSpec.getMode(widthMeasureSpec)
                val widthSize = MeasureSpec.getSize(widthMeasureSpec)
                val constrainedWidth = if (widthMode == MeasureSpec.EXACTLY) {
                    Math.min(widthSize, maxW)
                } else if (widthMode == MeasureSpec.AT_MOST) {
                    Math.min(widthSize, maxW)
                } else {
                    maxW
                }
                val constrainedSpec = MeasureSpec.makeMeasureSpec(constrainedWidth, MeasureSpec.AT_MOST)
                super.onMeasure(constrainedSpec, heightMeasureSpec)
            }
        }.apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(COLOR_CARD, 16, strokeColor = COLOR_BORDER, strokeWidth = dp(1))
            setPadding(dp(4), dp(4), dp(4), dp(4))
            elevation = dp(16).toFloat()
            minimumWidth = dp(120)
            visibility = View.GONE
        }
        val popupParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.START
            marginStart = dp(16)
            bottomMargin = dp(74)
        }
        root.addView(channelMenuPopup, popupParams)
        initChannelMenuItems()
    }

    private data class ChannelMenuItem(val icon: String, val label: String, val channel: Channel?)

    private class MenuItemHolder(
        val root: LinearLayout,
        val iconView: TextView,
        val titleView: TextView,
        val badgeView: TextView,
        val item: ChannelMenuItem,
    )

    private val channelMenuItems by lazy {
        listOf(
            ChannelMenuItem("💬", Channel.WECHAT.label, Channel.WECHAT),
            ChannelMenuItem("📕", Channel.XIAOHONGSHU.label, Channel.XIAOHONGSHU),
            ChannelMenuItem("🐟", Channel.XIANYU.label, Channel.XIANYU),
            ChannelMenuItem("🌐", getString(R.string.channel_home_label), null),
        )
    }

    private val menuHolders = mutableListOf<MenuItemHolder>()
    private var hoveredChannelIndex: Int = -1

    private fun initChannelMenuItems() {
        channelMenuPopup.removeAllViews()
        menuHolders.clear()

        channelMenuItems.forEachIndexed { index, item ->
            val itemView = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(10), dp(8), dp(10), dp(8))
                isClickable = true
                isFocusable = true

                setOnClickListener {
                    selectChannel(item.channel)
                }
            }

            val iconView = TextView(this).apply {
                text = item.icon
                textSize = 14f
                gravity = Gravity.CENTER
            }
            itemView.addView(iconView)

            val titleView = TextView(this).apply {
                text = item.label
                textSize = 13f
                setPadding(dp(7), 0, dp(10), 0)
            }
            itemView.addView(titleView, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            val badgeView = TextView(this).apply {
                textSize = 11f
                background = rounded(COLOR_SURFACE_SUBTLE, 8)
                setPadding(dp(5), dp(1), dp(5), dp(1))
            }
            itemView.addView(badgeView)

            val holder = MenuItemHolder(itemView, iconView, titleView, badgeView, item)
            menuHolders.add(holder)
            channelMenuPopup.addView(itemView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

            if (index == 2) {
                channelMenuPopup.addView(dividerView(topMarginDp = 2, bottomMarginDp = 2))
            }
        }
    }

    private fun updateMenuBadgeCounts() {
        menuHolders.forEach { holder ->
            val count = if (holder.item.channel == null) {
                latestTasks.size
            } else {
                latestTasks.count { it.channel == holder.item.channel }
            }
            holder.badgeView.text = count.toString()
        }
    }

    private fun updateItemHighlight(hoveredIndex: Int) {
        hoveredChannelIndex = hoveredIndex

        menuHolders.forEachIndexed { index, holder ->
            val isTarget = if (hoveredIndex >= 0) {
                hoveredIndex == index
            } else {
                selectedChannel == holder.item.channel
            }

            holder.root.background = if (isTarget) {
                buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 10)
            } else {
                buttonStateBackground(Color.TRANSPARENT, COLOR_SURFACE_SUBTLE, 10)
            }

            holder.root.animate()
                .scaleX(if (isTarget) 1.03f else 1.0f)
                .scaleY(if (isTarget) 1.03f else 1.0f)
                .setDuration(80)
                .start()

            holder.titleView.setTextColor(if (isTarget) COLOR_PRIMARY else COLOR_TEXT_PRIMARY)
            holder.titleView.setTypeface(holder.titleView.typeface, if (isTarget) Typeface.BOLD else Typeface.NORMAL)
            holder.badgeView.setTextColor(if (isTarget) COLOR_PRIMARY else COLOR_TEXT_MUTED)
            holder.badgeView.background = rounded(if (isTarget) Color.WHITE else COLOR_SURFACE_SUBTLE, 8)
        }
    }

    private fun selectChannel(channel: Channel?) {
        root.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        selectedChannel = channel
        closeChannelMenu()
        val label = channel?.label ?: getString(R.string.channel_home_label)
        toast(getString(R.string.switched_channel_toast, label))
        render()
    }

    private fun toggleChannelMenu() {
        if (isChannelMenuOpen) {
            closeChannelMenu()
        } else {
            openChannelMenu()
        }
    }

    private fun openChannelMenu(animate: Boolean = true) {
        isChannelMenuOpen = true
        updateMenuBadgeCounts()
        updateItemHighlight(-1)
        channelMenuOverlay.visibility = View.VISIBLE
        channelMenuPopup.visibility = View.VISIBLE

        if (animate) {
            channelMenuOverlay.alpha = 0f
            channelMenuOverlay.animate().alpha(1f).setDuration(140).start()

            channelMenuPopup.pivotX = dp(24).toFloat()
            channelMenuPopup.pivotY = dp(160).toFloat()
            channelMenuPopup.scaleX = 0.82f
            channelMenuPopup.scaleY = 0.82f
            channelMenuPopup.alpha = 0f
            channelMenuPopup.animate()
                .scaleX(1f)
                .scaleY(1f)
                .alpha(1f)
                .setDuration(190)
                .setInterpolator(OvershootInterpolator(1.15f))
                .start()
        } else {
            channelMenuOverlay.alpha = 1f
            channelMenuPopup.scaleX = 1f
            channelMenuPopup.scaleY = 1f
            channelMenuPopup.alpha = 1f
        }
    }

    private fun closeChannelMenu(animate: Boolean = true) {
        if (!isChannelMenuOpen) return
        isChannelMenuOpen = false
        hoveredChannelIndex = -1
        if (animate) {
            channelMenuOverlay.animate().alpha(0f).setDuration(130).withEndAction {
                channelMenuOverlay.visibility = View.GONE
            }.start()
            channelMenuPopup.animate()
                .scaleX(0.88f)
                .scaleY(0.88f)
                .alpha(0f)
                .setDuration(130)
                .setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    channelMenuPopup.visibility = View.GONE
                }.start()
        } else {
            channelMenuOverlay.visibility = View.GONE
            channelMenuPopup.visibility = View.GONE
        }
    }

    /**
     * 左下角土方形按钮（用于在 微信、小红书、闲鱼、全部 之间快速展开选择）
     * - 3D Touch 体验：按压下沉震动呼出气泡，手指滑动即时高亮反馈，松手直接选中选定
     * - 同时也支持单点呼出常驻选择
     */
    private fun buildChannelSwitcherButton() {
        channelSwitcherButton = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = buttonStateBackground(COLOR_EARTH_BG, COLOR_EARTH_PRESSED, 14, strokeColor = COLOR_EARTH_BORDER)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            elevation = dp(8).toFloat()
            isClickable = true
            isFocusable = true
            contentDescription = getString(R.string.category_switch_description)

            var downX = 0f
            var downY = 0f
            var downTime = 0L
            var isDraggingSelection = false
            val loc = IntArray(2)

            setOnTouchListener { view, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        downX = event.rawX
                        downY = event.rawY
                        downTime = System.currentTimeMillis()
                        isDraggingSelection = false

                        // 3D Touch 按压物理感
                        view.animate().scaleX(0.93f).scaleY(0.93f).setDuration(70).start()
                        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)

                        if (!isChannelMenuOpen) {
                            openChannelMenu()
                        }
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = Math.abs(event.rawX - downX)
                        val dy = Math.abs(event.rawY - downY)
                        if (dy > dp(4) || dx > dp(4)) {
                            isDraggingSelection = true
                        }

                        if (isChannelMenuOpen && isDraggingSelection) {
                            var hitIndex = -1
                            for (i in menuHolders.indices) {
                                val itemV = menuHolders[i].root
                                itemV.getLocationOnScreen(loc)
                                val left = loc[0] - dp(24)
                                val right = loc[0] + itemV.width + dp(40)
                                val top = loc[1] - dp(2)
                                val bottom = loc[1] + itemV.height + dp(2)

                                if (event.rawX >= left && event.rawX <= right && event.rawY >= top && event.rawY <= bottom) {
                                    hitIndex = i
                                    break
                                }
                            }
                            if (hitIndex != hoveredChannelIndex) {
                                if (hitIndex >= 0) {
                                    view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                                }
                                updateItemHighlight(hitIndex)
                            }
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                        val pressDuration = System.currentTimeMillis() - downTime
                        if (isDraggingSelection && hoveredChannelIndex in channelMenuItems.indices) {
                            // 滑动至对应项松手选定
                            val target = channelMenuItems[hoveredChannelIndex]
                            selectChannel(target.channel)
                        } else if (isDraggingSelection) {
                            // 滑到外部松手取消
                            closeChannelMenu()
                        } else if (pressDuration < 320) {
                            // 轻按单点展开
                            view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                        }
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                        closeChannelMenu()
                        true
                    }
                    else -> false
                }
            }
        }

        channelSwitcherIcon = TextView(this).apply {
            textSize = 15f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        channelSwitcherButton.addView(channelSwitcherIcon)

        channelSwitcherText = TextView(this).apply {
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(6), 0, dp(4), 0)
        }
        channelSwitcherButton.addView(channelSwitcherText)

        val switchIndicator = TextView(this).apply {
            text = "▴"
            textSize = 12f
            setTextColor(0xCCFFFFFF.toInt())
            gravity = Gravity.CENTER
        }
        channelSwitcherButton.addView(switchIndicator)
    }

    private fun updateChannelSwitcherButton() {
        val count = if (selectedChannel == null) {
            latestTasks.size
        } else {
            latestTasks.count { it.channel == selectedChannel }
        }
        val (icon, label) = when (selectedChannel) {
            null -> "🌐" to getString(R.string.channel_home_label)
            Channel.WECHAT -> "💬" to Channel.WECHAT.label
            Channel.XIANYU -> "🐟" to Channel.XIANYU.label
            Channel.XIAOHONGSHU -> "📕" to Channel.XIAOHONGSHU.label
        }
        channelSwitcherIcon.text = icon
        channelSwitcherText.text = "$label ($count)"
    }

    private fun buildBottomDetailBar() {
        bottomDetailBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(COLOR_CARD)
            setPadding(dp(16), dp(10), dp(16), dp(10))
            elevation = dp(8).toFloat()
            visibility = View.GONE
        }

        bottomDetailBar.addView(dividerView())

        draftInput = EditText(this).apply {
            hint = getString(R.string.draft_hint)
            minLines = 2
            maxLines = 4
            gravity = Gravity.TOP or Gravity.START
            textSize = 14f
            setTextColor(COLOR_TEXT_PRIMARY)
            setHintTextColor(COLOR_TEXT_LIGHT)
            background = rounded(COLOR_SURFACE_SUBTLE, 14, strokeColor = COLOR_BORDER)
            setPadding(dp(14), dp(11), dp(14), dp(11))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    if (isUpdatingDraftInput) return
                    val taskId = activeDraftTaskId ?: return
                    drafts[taskId] = s?.toString().orEmpty()
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        bottomDetailBar.addView(draftInput, matchWidth().apply { topMargin = dp(8) })

        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(9), 0, 0)
        }

        // 1. 润色按钮
        optimizeButton = TextView(this).apply {
            text = getString(R.string.optimize_draft)
            textSize = 13f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(COLOR_PRIMARY)
            background = buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 20)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            isClickable = true
            isFocusable = true
            setOnClickListener {
                val taskId = activeDraftTaskId ?: return@setOnClickListener
                val draftText = draftInput.text.toString().trim()
                if (!repository.optimizeDraft(taskId, draftText)) {
                    toast(R.string.enter_draft_first)
                } else {
                    toast(R.string.mock_candidates_updated)
                }
            }
        }
        actionRow.addView(optimizeButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)))

        // 2. 中间：已读 / 待办 状态切换按钮
        readStatusToggleButton = TextView(this).apply {
            textSize = 13f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            isClickable = true
            isFocusable = true
            setOnClickListener {
                val taskId = activeDraftTaskId ?: return@setOnClickListener
                if (repository.toggleReadStatus(taskId)) {
                    val task = latestTasks.firstOrNull { it.id == taskId }
                    if (task?.status == ai.yance.android.model.TaskStatus.PENDING) {
                        toast(R.string.task_status_pending_toast)
                    } else {
                        toast(R.string.task_status_read_toast)
                    }
                    render()
                }
            }
        }
        actionRow.addView(readStatusToggleButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)).apply {
            marginStart = dp(8)
        })

        actionRow.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))

        // 3. 确认发送按钮
        sendButton = TextView(this).apply {
            text = getString(R.string.confirm_send)
            textSize = 13f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            background = buttonStateBackground(COLOR_PRIMARY, COLOR_PRIMARY_PRESSED, 20)
            setPadding(dp(18), dp(8), dp(18), dp(8))
            isClickable = true
            isFocusable = true
            setOnClickListener {
                val taskId = activeDraftTaskId ?: return@setOnClickListener
                val task = latestTasks.firstOrNull { it.id == taskId } ?: return@setOnClickListener
                val draftText = draftInput.text.toString().trim()
                if (!repository.selectReply(task.id, draftText)) {
                    toast(R.string.enter_draft_first)
                } else {
                    repository.confirmation(task.id)?.let { showSendConfirmation(task, it) }
                }
            }
        }
        actionRow.addView(sendButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)))
        bottomDetailBar.addView(actionRow, matchWidth())

        val safetyNote = TextView(this).apply {
            text = getString(R.string.send_safety_note)
            textSize = 11f
            gravity = Gravity.CENTER
            setTextColor(COLOR_TEXT_LIGHT)
            setPadding(0, dp(6), 0, dp(2))
        }
        bottomDetailBar.addView(safetyNote, matchWidth())
    }

    private fun navigateBack() {
        when {
            isChannelMenuOpen -> closeChannelMenu()
            settingsOpen -> {
                settingsOpen = false
                render()
            }
            openTaskId != null -> {
                openTaskId = null
                render()
            }
            else -> finishAfterTransition()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_CHANNEL, selectedChannel?.name)
        outState.putString(STATE_OPEN_TASK, openTaskId)
        outState.putBoolean(STATE_SETTINGS, settingsOpen)
        outState.putBundle(
            STATE_DRAFTS,
            Bundle().apply { drafts.forEach(::putString) },
        )
    }

    private fun restoreUiState(state: Bundle) {
        selectedChannel = state.getString(STATE_CHANNEL)
            ?.let { name -> runCatching { Channel.valueOf(name) }.getOrNull() }
        openTaskId = state.getString(STATE_OPEN_TASK)
        settingsOpen = state.getBoolean(STATE_SETTINGS)
        state.getBundle(STATE_DRAFTS)?.let { savedDrafts ->
            savedDrafts.keySet().forEach { taskId ->
                savedDrafts.getString(taskId)?.let { draft -> drafts[taskId] = draft }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        subscription = repository.subscribe { tasks ->
            runOnUiThread {
                latestTasks = tasks
                Log.d(TAG, "onSubscribeUpdate: received ${tasks.size} tasks")
                if (openTaskId != null && tasks.none { it.id == openTaskId }) openTaskId = null
                render()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        latestTasks = repository.tasks(null)
        render()
    }

    override fun onStop() {
        closeChannelMenu()
        subscription?.close()
        subscription = null
        super.onStop()
    }

    private fun render() {
        renderHeader()
        contentLayout.removeAllViews()

        if (settingsOpen) {
            closeChannelMenu()
            bottomDetailBar.visibility = View.GONE
            channelSwitcherButton.visibility = View.GONE
            activeDraftTaskId = null
            populateSettingsContent()
            return
        }

        val taskId = openTaskId
        val task = taskId?.let { id -> latestTasks.firstOrNull { it.id == id } }

        if (task != null) {
            // 处于消息详情页：隐藏渠道选择菜单与按钮，展示详情吸底操作栏
            closeChannelMenu()
            channelSwitcherButton.visibility = View.GONE
            bottomDetailBar.visibility = View.VISIBLE
            activeDraftTaskId = task.id

            // 更新已读/待办切换按钮样式与文案
            updateReadStatusToggleButton(task)

            isUpdatingDraftInput = true
            val currentDraft = drafts[task.id] ?: task.selectedReply.orEmpty()
            draftInput.setText(currentDraft)
            draftInput.setSelection(draftInput.text.length)
            isUpdatingDraftInput = false
            populateTaskDetailContent(task)
        } else {
            // 处于主列表页：展示左下角土方形切换按钮，隐藏详情操作栏
            bottomDetailBar.visibility = View.GONE
            channelSwitcherButton.visibility = View.VISIBLE
            updateChannelSwitcherButton()
            if (isChannelMenuOpen) {
                updateMenuBadgeCounts()
            }
            activeDraftTaskId = null
            openTaskId = null
            populateInboxContent()
        }
    }

    private fun updateReadStatusToggleButton(task: ApprovalTask) {
        val isRead = task.status == ai.yance.android.model.TaskStatus.READ
        if (isRead) {
            readStatusToggleButton.text = "✓ " + getString(R.string.status_read)
            readStatusToggleButton.setTextColor(COLOR_SUCCESS)
            readStatusToggleButton.background = buttonStateBackground(0xFFEDFBF2.toInt(), 0xFFD1F4DF.toInt(), 20)
        } else {
            readStatusToggleButton.text = "⏳ " + getString(R.string.status_pending)
            readStatusToggleButton.setTextColor(COLOR_PRIMARY)
            readStatusToggleButton.background = buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 20)
        }
    }

    // ==========================================
    // 顶部导航栏 (Header Bar)
    // ==========================================
    private fun renderHeader() {
        headerBar.removeAllViews()
        val task = openTaskId?.let { id -> latestTasks.firstOrNull { it.id == id } }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(10), dp(16), dp(10))

            if (settingsOpen || task != null) {
                addView(headerIconButton("‹", getString(R.string.back), ::navigateBack), LinearLayout.LayoutParams(dp(36), dp(36)).apply {
                    marginEnd = dp(10)
                })
            }

            // 标题文本区域
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                when {
                    settingsOpen -> {
                        addView(TextView(this@MainActivity).apply {
                            text = getString(R.string.settings_title)
                            textSize = 19f
                            setTextColor(COLOR_TEXT_PRIMARY)
                            setTypeface(typeface, Typeface.BOLD)
                        })
                        addView(TextView(this@MainActivity).apply {
                            text = getString(R.string.settings_subtitle)
                            textSize = 12f
                            setTextColor(COLOR_TEXT_MUTED)
                            setPadding(0, dp(1), 0, 0)
                        })
                    }
                    task != null -> {
                        addView(TextView(this@MainActivity).apply {
                            text = task.contact
                            textSize = 17f
                            setTextColor(COLOR_TEXT_PRIMARY)
                            setTypeface(typeface, Typeface.BOLD)
                            maxLines = 1
                        })
                        addView(LinearLayout(this@MainActivity).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL
                            setPadding(0, dp(2), 0, 0)

                            addView(channelBadge(task.channel, compact = true))
                            addView(TextView(this@MainActivity).apply {
                                text = "· " + DateUtils.getRelativeTimeSpanString(task.receivedAt)
                                textSize = 11f
                                setTextColor(COLOR_TEXT_LIGHT)
                                setPadding(dp(6), 0, 0, 0)
                            })
                        })
                    }
                    else -> {
                        addView(LinearLayout(this@MainActivity).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL

                            addView(TextView(this@MainActivity).apply {
                                text = getString(R.string.inbox_title)
                                textSize = 21f
                                setTextColor(COLOR_TEXT_PRIMARY)
                                setTypeface(typeface, Typeface.BOLD)
                            })
                            addView(View(this@MainActivity).apply {
                                background = rounded(COLOR_SUCCESS, 4)
                                layoutParams = LinearLayout.LayoutParams(dp(6), dp(6)).apply {
                                    marginStart = dp(8)
                                    marginEnd = dp(4)
                                }
                            })
                            addView(TextView(this@MainActivity).apply {
                                text = "局域网协同"
                                textSize = 11f
                                setTextColor(COLOR_SUCCESS)
                                setTypeface(typeface, Typeface.BOLD)
                            })
                        })
                        addView(TextView(this@MainActivity).apply {
                            text = getString(R.string.local_status_mock)
                            textSize = 12f
                            setTextColor(COLOR_TEXT_MUTED)
                            setPadding(0, dp(1), 0, 0)
                        })
                    }
                }
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            // 右上角操作按钮区（消息页与设置页之间的切换）
            when {
                settingsOpen -> {
                    // 设置页右上角：提供切回“💬 消息”入口
                    addView(headerTextButton("💬 " + getString(R.string.tab_inbox), getString(R.string.tab_inbox)) {
                        settingsOpen = false
                        render()
                    })
                }
                task == null -> {
                    // 首页消息列表右上角：提供打开“⚙ 设置”入口
                    addView(headerIconButton("⚙", getString(R.string.open_settings)) {
                        settingsOpen = true
                        render()
                    }, LinearLayout.LayoutParams(dp(36), dp(36)))
                }
            }
        }

        headerBar.addView(row, matchWidth())
        headerBar.addView(dividerView())
    }

    // ==========================================
    // 待办收件箱列表填充 (Inbox Content)
    // ==========================================
    private fun populateInboxContent() {
        val allTasks = latestTasks.sortedByDescending(ApprovalTask::receivedAt)
        val visibleTasks = allTasks.filter { selectedChannel == null || it.channel == selectedChannel }

        // 分区标题与统计
        val pendingCount = visibleTasks.count { it.status == ai.yance.android.model.TaskStatus.PENDING }
        val titleRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(4), dp(4), dp(10))

            addView(TextView(this@MainActivity).apply {
                text = if (selectedChannel == null) {
                    getString(R.string.recent_pending, visibleTasks.size)
                } else {
                    getString(R.string.channel_pending, selectedChannel?.label, visibleTasks.size)
                }
                textSize = 15f
                setTextColor(COLOR_TEXT_MUTED)
                setTypeface(typeface, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            if (pendingCount > 0) {
                addView(TextView(this@MainActivity).apply {
                    text = "需人工确认"
                    textSize = 11f
                    setTextColor(COLOR_PRIMARY)
                    background = rounded(COLOR_PRIMARY_BG, 8)
                    setPadding(dp(8), dp(3), dp(8), dp(3))
                })
            }
        }
        contentLayout.addView(titleRow, matchWidth())

        // 列表内容或空状态
        if (visibleTasks.isEmpty()) {
            contentLayout.addView(buildEmptyStateView(), matchWidth().apply { topMargin = dp(20) })
        } else {
            visibleTasks.forEach { task ->
                contentLayout.addView(buildTaskCard(task))
            }
        }
    }

    // ==========================================
    // 待办卡片 (Task Card)
    // ==========================================
    private fun buildTaskCard(task: ApprovalTask): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = cardStateBackground(18)
        setPadding(dp(16), dp(15), dp(16), dp(15))
        isClickable = true
        isFocusable = true
        elevation = dp(1).toFloat()
        setOnClickListener {
            // 点击进入详情时，自动标记为已读
            repository.markAsRead(task.id)
            openTaskId = task.id
            render()
        }

        // 头部：姓名 + 渠道徽章 + 状态徽章 + 时间
        addView(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL

                addView(TextView(this@MainActivity).apply {
                    text = task.contact
                    textSize = 15f
                    setTextColor(COLOR_TEXT_PRIMARY)
                    setTypeface(typeface, Typeface.BOLD)
                })
                addView(channelBadge(task.channel, compact = true), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginStart = dp(8)
                })
                if (task.status == ai.yance.android.model.TaskStatus.READ) {
                    addView(TextView(this@MainActivity).apply {
                        text = getString(R.string.status_read)
                        textSize = 11f
                        setTextColor(COLOR_TEXT_MUTED)
                        background = rounded(COLOR_SURFACE_SUBTLE, 6)
                        setPadding(dp(6), dp(1), dp(6), dp(1))
                    }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        marginStart = dp(6)
                    })
                }
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            addView(TextView(this@MainActivity).apply {
                text = DateUtils.getRelativeTimeSpanString(task.receivedAt)
                textSize = 11f
                setTextColor(COLOR_TEXT_LIGHT)
            })
        }, matchWidth())

        // 消息气泡引用框
        addView(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            background = rounded(COLOR_SURFACE_SUBTLE, 12)
            setPadding(dp(10), dp(9), dp(12), dp(9))

            addView(View(this@MainActivity).apply {
                background = rounded(channelColor(task.channel), 2)
            }, LinearLayout.LayoutParams(dp(3), dp(28)).apply {
                marginEnd = dp(9)
                gravity = Gravity.CENTER_VERTICAL
            })

            addView(TextView(this@MainActivity).apply {
                text = task.incomingText
                textSize = 14f
                setTextColor(COLOR_TEXT_PRIMARY)
                maxLines = 2
                setLineSpacing(dp(2).toFloat(), 1f)
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }, matchWidth().apply { topMargin = dp(11) })

        layoutParams = matchWidth().apply { topMargin = dp(11) }
    }

    // ==========================================
    // 空状态视图 (Empty State View)
    // ==========================================
    private fun buildEmptyStateView(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        background = rounded(COLOR_CARD, 20, strokeColor = COLOR_BORDER)
        setPadding(dp(24), dp(36), dp(24), dp(36))

        addView(TextView(this@MainActivity).apply {
            text = "✓"
            textSize = 26f
            gravity = Gravity.CENTER
            setTextColor(COLOR_SUCCESS)
            background = rounded(0xFFEDFBF2.toInt(), 28)
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56))
        })

        addView(TextView(this@MainActivity).apply {
            text = getString(R.string.empty_tasks)
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(COLOR_TEXT_PRIMARY)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(14), 0, dp(4))
        })

        addView(TextView(this@MainActivity).apply {
            text = getString(R.string.empty_tasks_subtitle)
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(COLOR_TEXT_MUTED)
            setLineSpacing(dp(2).toFloat(), 1f)
            setPadding(dp(12), 0, dp(12), dp(16))
        })

        // 重置 Mock 数据按钮
        addView(TextView(this@MainActivity).apply {
            text = getString(R.string.reset_mock_tasks)
            textSize = 13f
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(COLOR_PRIMARY)
            background = buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 16)
            setPadding(dp(16), dp(8), dp(16), dp(8))
            isClickable = true
            isFocusable = true
            setOnClickListener {
                repository.resetMockTasks()
                toast(R.string.mock_candidates_updated)
            }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    // ==========================================
    // 任务详情与审核回复 (Task Detail Content)
    // ==========================================
    private fun populateTaskDetailContent(task: ApprovalTask) {
        // 1. 对方消息区域
        contentLayout.addView(sectionLabel(getString(R.string.incoming_message)))
        val incomingRow = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(COLOR_CARD, 16, strokeColor = COLOR_BORDER)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            elevation = dp(1).toFloat()

            addView(TextView(this@MainActivity).apply {
                text = task.incomingText
                textSize = 15f
                setTextColor(COLOR_TEXT_PRIMARY)
                setLineSpacing(dp(2).toFloat(), 1f)
            })
        }
        contentLayout.addView(incomingRow, matchWidth().apply {
            bottomMargin = dp(14)
        })

        // 2. AI 候选回复标题与换一组
        val aiHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(8), dp(2), dp(6))

            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.ai_candidates)
                textSize = 14f
                setTextColor(COLOR_TEXT_PRIMARY)
                setTypeface(typeface, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.regenerate)
                textSize = 12f
                setTextColor(COLOR_PRIMARY)
                setTypeface(typeface, Typeface.BOLD)
                background = buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 14)
                setPadding(dp(10), dp(5), dp(10), dp(5))
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    repository.regenerateCandidates(task.id)
                    toast(R.string.mock_candidates_updated)
                }
            })
        }
        contentLayout.addView(aiHeader, matchWidth())

        val aiTip = TextView(this).apply {
            text = getString(R.string.ai_candidates_tip)
            textSize = 12f
            setTextColor(COLOR_TEXT_LIGHT)
            setPadding(dp(2), 0, dp(2), dp(10))
        }
        contentLayout.addView(aiTip, matchWidth())

        // 3. 候选卡片列表
        val currentDraftText = drafts[task.id] ?: task.selectedReply.orEmpty()
        task.candidates.forEachIndexed { index, option ->
            val isCurrentSelection = currentDraftText.trim() == option.text.trim()
            contentLayout.addView(buildCandidateCard(index + 1, option.text, isCurrentSelection) {
                isUpdatingDraftInput = true
                draftInput.setText(option.text)
                draftInput.setSelection(draftInput.text.length)
                isUpdatingDraftInput = false
                drafts[task.id] = option.text
                render()
            })
        }
    }

    // ==========================================
    // AI 候选卡片 (Candidate Card)
    // ==========================================
    private fun buildCandidateCard(
        index: Int,
        text: String,
        isSelected: Boolean,
        onClick: () -> Unit,
    ): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = if (isSelected) {
            rounded(COLOR_PRIMARY_BG, 14, strokeColor = COLOR_PRIMARY, strokeWidth = dp(2))
        } else {
            stateDrawable(COLOR_CARD, COLOR_SURFACE_SUBTLE, 14, strokeColor = COLOR_BORDER)
        }
        setPadding(dp(14), dp(11), dp(14), dp(11))
        isClickable = true
        isFocusable = true
        contentDescription = getString(R.string.use_candidate_description, text)
        setOnClickListener { onClick() }

        // 标签栏
        addView(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL

            addView(TextView(this@MainActivity).apply {
                this.text = getString(R.string.candidate_tag, index)
                textSize = 11f
                setTextColor(if (isSelected) COLOR_PRIMARY else COLOR_TEXT_MUTED)
                setTypeface(typeface, Typeface.BOLD)
                background = rounded(if (isSelected) Color.WHITE else COLOR_SURFACE_SUBTLE, 8)
                setPadding(dp(6), dp(2), dp(6), dp(2))
            })

            if (isSelected) {
                addView(View(this@MainActivity), LinearLayout.LayoutParams(0, 0, 1f))
                addView(TextView(this@MainActivity).apply {
                    this.text = "✓ " + getString(R.string.candidate_selected)
                    textSize = 11f
                    setTextColor(COLOR_PRIMARY)
                    setTypeface(typeface, Typeface.BOLD)
                })
            }
        }, matchWidth())

        // 文本
        addView(TextView(this@MainActivity).apply {
            this.text = text
            textSize = 14f
            setTextColor(COLOR_TEXT_PRIMARY)
            setLineSpacing(dp(2).toFloat(), 1f)
            setPadding(0, dp(7), 0, 0)
        }, matchWidth())

        layoutParams = matchWidth().apply {
            bottomMargin = dp(9)
        }
    }

    // ==========================================
    // 设置页面填充 (Settings Content)
    // ==========================================
    private fun populateSettingsContent() {
        val appVersion = packageManager.getPackageInfo(packageName, 0).versionName.orEmpty()
        val serverInput = EditText(this).apply {
            setText(preferences.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL))
            hint = DEFAULT_SERVER_URL
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            textSize = 14f
            setTextColor(COLOR_TEXT_PRIMARY)
            setHintTextColor(COLOR_TEXT_LIGHT)
            background = rounded(COLOR_SURFACE_SUBTLE, 12, strokeColor = COLOR_BORDER)
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }

        // 1. 服务配置
        contentLayout.addView(settingsSectionTitle(getString(R.string.settings_connection)))
        contentLayout.addView(settingsCard().apply {
            addView(settingsRow(getString(R.string.connection_mode), getString(R.string.connection_mode_mock)))
            addView(dividerView(12, 12))
            addView(settingsRow(getString(R.string.server_address), getString(R.string.server_address_description)))
            addView(serverInput, matchWidth().apply {
                topMargin = dp(10)
                bottomMargin = dp(10)
            })
            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.save)
                textSize = 13f
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.WHITE)
                background = buttonStateBackground(COLOR_PRIMARY, COLOR_PRIMARY_PRESSED, 16)
                setPadding(dp(16), dp(8), dp(16), dp(8))
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    val normalized = runCatching {
                        normalizeLocalServerUrl(serverInput.text.toString())
                    }.getOrNull()
                    if (normalized == null) {
                        toast(R.string.invalid_server_address)
                    } else {
                        serverInput.setText(normalized)
                        preferences.edit().putString(KEY_SERVER_URL, normalized).apply()
                        toast(R.string.saved)
                    }
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        })

        // 2. 交互控制
        contentLayout.addView(settingsSectionTitle(getString(R.string.settings_control)))
        contentLayout.addView(settingsCard().apply {
            addView(settingsRow(getString(R.string.manual_confirmation), getString(R.string.manual_confirmation_description)))
            addView(dividerView(12, 12))
            addView(settingsRow(getString(R.string.reply_candidates), getString(R.string.reply_candidates_description)))
        })

        // 3. 隐私与安全
        contentLayout.addView(settingsSectionTitle(getString(R.string.settings_privacy)))
        contentLayout.addView(settingsCard().apply {
            addView(settingsRow(getString(R.string.local_network_only), getString(R.string.local_network_only_description)))
            addView(dividerView(12, 12))
            addView(settingsRow(getString(R.string.android_permissions), getString(R.string.android_permissions_description)))
            addView(dividerView(12, 12))
            addView(settingsRow(getString(R.string.no_cloud_relay), getString(R.string.no_cloud_relay_description)))
        })

        // 4. 数据缓存
        contentLayout.addView(settingsSectionTitle(getString(R.string.settings_local_data)))
        contentLayout.addView(settingsCard().apply {
            addView(settingsRow(getString(R.string.draft_storage), getString(R.string.draft_storage_description)))
            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.clear_drafts)
                textSize = 13f
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(COLOR_TEXT_MUTED)
                background = buttonStateBackground(COLOR_SURFACE_SUBTLE, COLOR_BORDER, 16)
                setPadding(dp(16), dp(8), dp(16), dp(8))
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    drafts.clear()
                    toast(R.string.drafts_cleared)
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(10)
            })
        })

        // 5. 关于
        contentLayout.addView(settingsSectionTitle(getString(R.string.settings_about)))
        contentLayout.addView(settingsCard().apply {
            addView(settingsRow(getString(R.string.app_name), getString(R.string.version_value, appVersion)))
            addView(dividerView(12, 12))
            addView(settingsRow(getString(R.string.product_role), getString(R.string.product_role_description)))
        })
    }

    // ==========================================
    // UI 辅助组件与布局方法
    // ==========================================
    private fun channelBadge(channel: Channel, compact: Boolean = false): View = TextView(this).apply {
        text = channel.label
        textSize = if (compact) 11f else 12f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(channelColor(channel))
        background = rounded(channelPaleColor(channel), 8, strokeColor = channelBorderColor(channel))
        setPadding(dp(if (compact) 6 else 8), dp(2), dp(if (compact) 6 else 8), dp(2))
    }

    private fun headerIconButton(text: String, description: String, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        contentDescription = description
        textSize = 18f
        gravity = Gravity.CENTER
        setTextColor(COLOR_TEXT_PRIMARY)
        background = stateDrawable(COLOR_SURFACE_SUBTLE, COLOR_BORDER, 18)
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
    }

    private fun headerTextButton(text: String, description: String, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        contentDescription = description
        textSize = 13f
        gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(COLOR_PRIMARY)
        background = buttonStateBackground(COLOR_PRIMARY_BG, COLOR_PRIMARY_BORDER, 14)
        setPadding(dp(12), dp(6), dp(12), dp(6))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
    }

    private fun sectionLabel(text: String) = TextView(this).apply {
        this.text = text
        textSize = 12f
        setTextColor(COLOR_TEXT_MUTED)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(dp(2), dp(6), dp(2), dp(4))
    }

    private fun settingsSectionTitle(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        setTextColor(COLOR_TEXT_MUTED)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(dp(4), dp(18), dp(4), dp(8))
    }

    private fun settingsCard() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = rounded(COLOR_CARD, 18, strokeColor = COLOR_BORDER)
        setPadding(dp(16), dp(16), dp(16), dp(16))
        elevation = dp(1).toFloat()
        layoutParams = matchWidth()
    }

    private fun settingsRow(title: String, description: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(TextView(this@MainActivity).apply {
            text = title
            textSize = 15f
            setTextColor(COLOR_TEXT_PRIMARY)
            setTypeface(typeface, Typeface.BOLD)
        })
        addView(TextView(this@MainActivity).apply {
            text = description
            textSize = 13f
            setTextColor(COLOR_TEXT_MUTED)
            setLineSpacing(dp(2).toFloat(), 1f)
            setPadding(0, dp(4), 0, 0)
        })
    }

    private fun dividerView(topMarginDp: Int = 0, bottomMarginDp: Int = 0) = View(this).apply {
        setBackgroundColor(COLOR_BORDER)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(1),
        ).apply {
            if (topMarginDp > 0) topMargin = dp(topMarginDp)
            if (bottomMarginDp > 0) bottomMargin = dp(bottomMarginDp)
        }
    }

    private fun showSendConfirmation(task: ApprovalTask, confirmation: SendConfirmation) {
        AlertDialog.Builder(this)
            .setTitle(R.string.confirm_dialog_title)
            .setMessage(getString(R.string.confirm_dialog_message, task.channel.label, task.contact, confirmation.reply))
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.confirm_send) { _, _ ->
                if (repository.confirmSend(confirmation)) {
                    drafts.remove(task.id)
                    openTaskId = null
                    toast(R.string.mock_sent)
                } else {
                    toast(R.string.task_changed)
                }
            }
            .show()
    }

    // ==========================================
    // 视觉与 Drawable 工厂
    // ==========================================
    private fun rounded(color: Int, radiusDp: Int, strokeColor: Int? = null, strokeWidth: Int = dp(1)): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radiusDp).toFloat()
            strokeColor?.let { setStroke(strokeWidth, it) }
        }

    private fun stateDrawable(
        normalColor: Int,
        pressedColor: Int,
        radiusDp: Int,
        strokeColor: Int? = null,
    ): StateListDrawable = StateListDrawable().apply {
        addState(
            intArrayOf(android.R.attr.state_pressed),
            rounded(pressedColor, radiusDp, strokeColor),
        )
        addState(
            intArrayOf(),
            rounded(normalColor, radiusDp, strokeColor),
        )
    }

    private fun buttonStateBackground(
        normalColor: Int,
        pressedColor: Int,
        radiusDp: Int,
        strokeColor: Int? = null,
    ): StateListDrawable = stateDrawable(normalColor, pressedColor, radiusDp, strokeColor)

    private fun cardStateBackground(radiusDp: Int): StateListDrawable =
        stateDrawable(COLOR_CARD, 0xFFF8FAFC.toInt(), radiusDp, strokeColor = COLOR_BORDER)

    private fun channelColor(channel: Channel): Int = when (channel) {
        Channel.WECHAT -> 0xFF07C160.toInt()
        Channel.XIAOHONGSHU -> 0xFFFF2442.toInt()
        Channel.XIANYU -> 0xFFFF6A00.toInt()
    }

    private fun channelPaleColor(channel: Channel): Int = when (channel) {
        Channel.WECHAT -> 0xFFEDFBF2.toInt()
        Channel.XIAOHONGSHU -> 0xFFFFF1F2.toInt()
        Channel.XIANYU -> 0xFFFFF7ED.toInt()
    }

    private fun channelBorderColor(channel: Channel): Int = when (channel) {
        Channel.WECHAT -> 0xFFD1F4DF.toInt()
        Channel.XIAOHONGSHU -> 0xFFFFE4E6.toInt()
        Channel.XIANYU -> 0xFFFFEDD5.toInt()
    }

    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun matchWidth() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    )

    private companion object {
        const val TAG = "YanceMainActivity"
        const val PREFERENCES = "yance-settings"
        const val KEY_SERVER_URL = "server-url"
        const val DEFAULT_SERVER_URL = "http://192.0.2.1:8080"
        const val STATE_CHANNEL = "selected-channel"
        const val STATE_OPEN_TASK = "open-task"
        const val STATE_SETTINGS = "settings-open"
        const val STATE_DRAFTS = "drafts"

        val COLOR_BG = 0xFFF8FAFC.toInt()
        val COLOR_CARD = 0xFFFFFFFF.toInt()
        val COLOR_SURFACE_SUBTLE = 0xFFF1F5F9.toInt()
        val COLOR_BORDER = 0xFFE2E8F0.toInt()
        val COLOR_TEXT_PRIMARY = 0xFF0F172A.toInt()
        val COLOR_TEXT_MUTED = 0xFF64748B.toInt()
        val COLOR_TEXT_LIGHT = 0xFF94A3B8.toInt()
        val COLOR_PRIMARY = 0xFF4F46E5.toInt()
        val COLOR_PRIMARY_PRESSED = 0xFF4338CA.toInt()
        val COLOR_PRIMARY_BG = 0xFFEEF2FF.toInt()
        val COLOR_PRIMARY_BORDER = 0xFFC7D2FE.toInt()
        val COLOR_SUCCESS = 0xFF10B981.toInt()

        // 温暖大地/土黄色调（土方形专属配色）
        val COLOR_EARTH_BG = 0xFF8D5B28.toInt()
        val COLOR_EARTH_PRESSED = 0xFF6E4218.toInt()
        val COLOR_EARTH_BORDER = 0xFFD4A373.toInt()
    }
}
