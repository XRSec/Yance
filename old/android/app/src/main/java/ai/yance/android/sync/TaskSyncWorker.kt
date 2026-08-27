package ai.yance.android.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import ai.yance.android.data.TaskRepositories
import java.util.concurrent.TimeUnit

class TaskSyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : Worker(appContext, workerParameters) {
    override fun doWork(): Result {
        val repository = TaskRepositories.backgroundSource() ?: return Result.failure()
        return if (repository.refresh()) Result.success() else Result.failure()
    }
}

object TaskSyncScheduler {
    private const val UNIQUE_WORK = "approval-task-refresh"

    fun configure(context: Context) {
        val workManager = WorkManager.getInstance(context)
        if (TaskRepositories.backgroundSource() == null) {
            workManager.cancelUniqueWork(UNIQUE_WORK)
            return
        }
        val request = PeriodicWorkRequestBuilder<TaskSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        workManager.enqueueUniquePeriodicWork(
            UNIQUE_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
