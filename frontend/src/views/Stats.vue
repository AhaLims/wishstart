<template>
  <div class="stats">
    <h1 class="page-title">统计 &amp; 同步</h1>

    <!-- 总体统计 -->
    <div class="overall-stats">
      <div class="stat-item">
        <span class="stat-icon">⭐</span>
        <div class="stat-info">
          <div class="stat-value number">{{ stats?.totalStars || 0 }}</div>
          <div class="stat-label">累计星星</div>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">🎲</span>
        <div class="stat-info">
          <!-- 这里以前取的是 halfDrawCount（半价抽卡次数），标却写着「掷骰子次数」——
               两个不同的数。diceCount 才是掷骰子次数 -->
          <div class="stat-value number">{{ stats?.diceCount || 0 }}</div>
          <div class="stat-label">掷骰子次数</div>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">✅</span>
        <div class="stat-info">
          <div class="stat-value number">{{ stats?.completedWishes || 0 }}</div>
          <div class="stat-label">已完成愿望</div>
        </div>
      </div>
    </div>

    <!-- 任务统计 -->
    <div class="task-stats">
      <div class="task-stat-card">
        <div class="task-stat-value number">{{ stats?.totalTasks || 0 }}</div>
        <div class="task-stat-label">总任务数</div>
      </div>
      <div class="task-stat-card">
        <div class="task-stat-value number">{{ stats?.activeTasks || 0 }}</div>
        <div class="task-stat-label">进行中</div>
      </div>
    </div>

    <!-- 流水记录 -->
    <div class="logs-section">
      <h2 class="section-title">流水记录</h2>
      <div class="logs-list">
        <div v-for="log in logs" :key="log.id" class="log-item">
          <div class="log-info">
            <div class="log-desc">{{ log.description }}</div>
            <div class="log-time">{{ formatTime(log.created_at) }}</div>
          </div>
          <div class="log-amount" :class="log.type">
            {{ log.type === 'income' ? '+' : '' }}{{ log.amount }}
          </div>
        </div>

        <div v-if="!logs.length" class="empty-state">
          <p>暂无流水记录</p>
        </div>
      </div>
    </div>

    <!-- 数据同步。原来是自己一个页面叫「设置」，但那页除了导出/导入和一个只在
         桌面端才出现的路径框之外什么都没有 —— 它从来就不是「设置」，是同步。
         跟统计并成一页，顺便把桌面端剩下的那点东西清掉（现在只有网页端了）。
         放最下面：统计和流水是天天看的，同步是偶尔搬一次数据才用的 -->
    <div class="sync-card">
      <h2 class="section-title">数据同步</h2>
      <p class="sync-desc">
        整份数据导出成一个 JSON 快照文件，存起来或搬到别处用。导入是覆盖式的，
        导入前会自动备份当前数据。
      </p>
      <p class="sync-desc sync-note">
        愿望配图会以 base64 内嵌在快照里一起搬过去，所以配图多的快照文件会比较大，
        导入时也需要多等一会儿。
      </p>
      <div class="sync-actions">
        <button class="btn btn-primary" @click="exportSnapshot">导出快照</button>
        <label class="btn btn-import">
          导入快照
          <input type="file" accept=".json,application/json" class="hidden-input" @change="onImportFile" />
        </label>
      </div>
      <div v-if="importing" class="import-status">正在导入…</div>
      <div v-if="importResult" class="import-status success">导入完成：{{ importResult }}</div>
      <div v-if="importError" class="import-status error">导入失败：{{ importError }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { statsApi, syncApi } from '../api'

const userStore = useUserStore()
const logs = ref([])

const stats = computed(() => userStore.stats)

const fetchLogs = async () => {
  try {
    const res = await statsApi.getLogs(userStore.userId)
    if (res.code === 0) {
      logs.value = res.data
    }
  } catch (error) {
    console.error('Fetch logs error:', error)
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ---- 数据同步 ----
const importing = ref(false)
const importResult = ref('')
const importError = ref('')

async function exportSnapshot() {
  try {
    const res = await syncApi.exportSnapshot()
    if (res.code !== 0) {
      alert(res.message || '导出失败')
      return
    }
    // 内嵌配图后快照可能有好几 MB，缩进会白白撑大文件，这里紧凑输出
    const json = JSON.stringify(res.data)
    const fileName = `wishstar-snapshot-${new Date().toISOString().slice(0, 10)}.json`

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    alert('快照已导出')
  } catch (error) {
    alert('导出失败')
  }
}

async function onImportFile(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  // 清掉选择，这样连着导入同一个文件两次也能触发 change
  event.target.value = ''

  try {
    const text = await file.text()
    const snapshot = JSON.parse(text)
    importing.value = true
    importResult.value = ''
    importError.value = ''

    const res = await syncApi.importSnapshot(snapshot)
    if (res.code === 0) {
      const imageText = res.data.importedImages
        ? `，${res.data.importedImages} 张配图`
        : ''
      importResult.value = `已导入 ${res.data.imported} 个数据键${imageText}`
      // 快照把整份数据换掉了，页面上的数字得跟着换，不然还是导入前那份
      await userStore.fetchStats()
      await fetchLogs()
    } else {
      importError.value = res.message || '导入失败'
    }
  } catch (error) {
    importError.value = '文件解析失败，请确认是导出的快照 JSON'
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await userStore.fetchStats()
  await fetchLogs()
})
</script>

<style scoped>
.overall-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-item {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.stat-icon {
  font-size: 2rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  color: #B0B0B0;
  font-size: 0.9rem;
}

.task-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.task-stat-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  text-align: center;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.task-stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #4A90D9;
}

.task-stat-label {
  color: #B0B0B0;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 1rem;
  color: #B0B0B0;
}

.logs-section {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.logs-list {
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(74, 144, 217, 0.1);
}

.log-item:last-child {
  border-bottom: none;
}

.log-desc {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.log-time {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.log-amount {
  font-weight: 700;
  font-size: 1.1rem;
}

.log-amount.income {
  color: #2ECC71;
}

.log-amount.expenditure {
  color: #E74C3C;
}

/* 同步那一块，跟流水那张卡同一个壳 */
.sync-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.sync-desc {
  color: #B0B0B0;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.sync-note {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.45);
}

.sync-actions {
  display: flex;
  gap: 1rem;
}

.btn-import {
  cursor: pointer;
}

.hidden-input {
  display: none;
}

.import-status {
  margin-top: 1rem;
  color: #B0B0B0;
  font-size: 0.9rem;
}

.import-status.success {
  color: #2ECC71;
}

.import-status.error {
  color: #E74C3C;
}

@media (max-width: 768px) {
  .overall-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .sync-actions {
    flex-direction: column;
  }
}
</style>
