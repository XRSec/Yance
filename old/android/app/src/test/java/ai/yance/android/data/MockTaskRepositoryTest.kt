package ai.yance.android.data

import ai.yance.android.model.Channel
import ai.yance.android.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MockTaskRepositoryTest {
    private val now = 1_000_000L

    @Test
    fun homeReturnsAllPendingTasksNewestFirst() {
        val tasks = MockTaskRepository(now).tasks()

        assertEquals(4, tasks.size)
        assertEquals(listOf("wechat-a", "xhs-b", "xianyu-c", "wechat-d"), tasks.map { it.id })
    }

    @Test
    fun channelFiltersOnlyMatchingTasks() {
        val tasks = MockTaskRepository(now).tasks(Channel.WECHAT)

        assertEquals(listOf("wechat-a", "wechat-d"), tasks.map { it.id })
    }

    @Test
    fun markAsReadAndToggleStatusWorkCorrectly() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()
        assertEquals(TaskStatus.PENDING, task.status)

        assertTrue(repository.markAsRead(task.id))
        assertEquals(TaskStatus.READ, repository.tasks().first { it.id == task.id }.status)

        assertTrue(repository.toggleReadStatus(task.id))
        assertEquals(TaskStatus.PENDING, repository.tasks().first { it.id == task.id }.status)

        assertTrue(repository.toggleReadStatus(task.id))
        assertEquals(TaskStatus.READ, repository.tasks().first { it.id == task.id }.status)
    }

    @Test
    fun selectingCandidateDoesNotSendTask() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()

        assertTrue(repository.selectReply(task.id, task.candidates.first().text))

        assertEquals(task.id, repository.tasks().first().id)
        assertEquals(task.candidates.first().text, repository.tasks().first().selectedReply)
    }

    @Test
    fun emptyDraftCannotBeOptimizedOrSelected() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()

        assertFalse(repository.optimizeDraft(task.id, "   "))
        assertFalse(repository.selectReply(task.id, ""))
        assertEquals(task, repository.tasks().first())
    }

    @Test
    fun regenerateClearsPreviousSelection() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()
        repository.selectReply(task.id, task.candidates.first().text)

        assertTrue(repository.regenerateCandidates(task.id))

        val updated = repository.tasks().first()
        assertNull(updated.selectedReply)
        assertEquals(task.version + 1, updated.version)
    }

    @Test
    fun taskIsSentOnlyAfterExplicitConfirmation() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()
        repository.selectReply(task.id, task.candidates.first().text)
        val confirmation = requireNotNull(repository.confirmation(task.id))

        assertTrue(repository.confirmSend(confirmation))
        assertFalse(repository.tasks().any { it.id == task.id })
        assertFalse(repository.confirmSend(confirmation))
    }

    @Test
    fun staleConfirmationCannotSendChangedTask() {
        val repository = MockTaskRepository(now)
        val task = repository.tasks().first()
        repository.selectReply(task.id, task.candidates.first().text)
        val confirmation = requireNotNull(repository.confirmation(task.id))

        repository.regenerateCandidates(task.id)

        assertFalse(repository.confirmSend(confirmation))
        assertTrue(repository.tasks().any { it.id == task.id })
    }
}

