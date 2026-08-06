<template>
  <div class="stats">
    <h1 class="page-title">统计数据</h1>

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
        <span class="stat-icon">💎</span>
        <div class="stat-info">
          <div class="stat-value number">{{ stats?.gems || 0 }}</div>
          <div class="stat-label">宝石</div>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">🎴</span>
        <div class="stat-info">
          <div class="stat-value number">{{ (stats?.drawCount || 0) + (stats?.halfDrawCount || 0) }}</div>
          <div class="stat-label">抽卡次数</div>
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

    <!-- 宝石兑换 -->
    <div class="exchange-section">
      <h2 class="section-title">宝石兑换</h2>
      <div class="exchange-card">
        <p>10颗星星 = 1颗宝石</p>
        <div class="exchange-form">
          <input
            v-model.number="exchangeStars"
            type="number"
            class="input"
            placeholder="输入星星数量"
          />
          <button
            class="btn btn-primary"
            :disabled="!canExchange"
            @click="exchangeGem"
          >
            兑换
          </button>
        </div>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { statsApi, gemApi } from '../api'

const userStore = useUserStore()
const logs = ref([])
const exchangeStars = ref(10)

const stats = computed(() => userStore.stats)

const canExchange = computed(() => {
  return exchangeStars.value >= 10 && (stats.value?.currentStars || 0) >= exchangeStars.value
})

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

const exchangeGem = async () => {
  if (!canExchange.value) return

  try {
    const res = await gemApi.exchange(userStore.userId, exchangeStars.value)
    if (res.code === 0) {
      alert(`兑换成功！获得 ${res.data.gemsReceived} 颗宝石`)
      exchangeStars.value = 10
      await userStore.fetchStats()
    } else {
      alert(res.message || '兑换失败')
    }
  } catch (error) {
    alert('兑换失败')
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

onMounted(async () => {
  await userStore.fetchStats()
  await fetchLogs()
})
</script>

<style scoped>
.overall-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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

.exchange-section {
  margin-bottom: 2rem;
}

.exchange-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(155, 89, 182, 0.2);
}

.exchange-card p {
  text-align: center;
  color: #B0B0B0;
  margin-bottom: 1rem;
}

.exchange-form {
  display: flex;
  gap: 1rem;
}

.exchange-form .input {
  flex: 1;
}

.logs-section {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
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

@media (max-width: 768px) {
  .overall-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
