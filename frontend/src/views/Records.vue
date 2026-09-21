<template>
  <div class="records">
    <h1 class="page-title">每日记录</h1>

    <!-- 日期选择 -->
    <div class="date-selector">
      <button class="btn" @click="changeDate(-1)">◀ 前一天</button>
      <input type="date" v-model="selectedDate" class="input date-input" @change="fetchRecords" />
      <button class="btn" @click="changeDate(1)">后一天 ▶</button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-label">今日总计</div>
        <div class="stat-value number">{{ recordsData.totalStars }}</div>
        <div class="stat-unit">颗星星</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">早上</div>
        <div class="stat-value number">{{ recordsData.morningStars }}</div>
        <div class="stat-unit">🌅</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">下午</div>
        <div class="stat-value number">{{ recordsData.afternoonStars }}</div>
        <div class="stat-unit">☀️</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">晚上</div>
        <div class="stat-value number">{{ recordsData.eveningStars }}</div>
        <div class="stat-unit">🌙</div>
      </div>
    </div>

    <!-- 记录列表 -->
    <div v-if="recordsData.records?.length" class="records-list">
      <h2 class="section-title">记录明细</h2>
      <div v-for="record in recordsData.records" :key="record.id" class="record-item">
        <div class="record-info">
          <div class="record-task">{{ record.task_name }}</div>
          <div class="record-meta">
            <span class="record-period">{{ getPeriodText(record.period) }}</span>
            <!-- 只有时间型的星星能换掷骰子次数，标出来才看得出为什么次数没涨 -->
            <span v-if="isTimeRecord(record)" class="time-tag">⏱ 时间型</span>
            <span v-if="record.is_weekend_double" class="weekend-tag">周末加倍</span>
          </div>
        </div>
        <div class="record-actions">
          <div class="record-stars">
            <span class="star-icon">+{{ record.stars }}</span>
          </div>
          <button class="btn-delete" @click="deleteRecord(record.id)" title="删除">✕</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-state-icon">📝</div>
      <p>这一天还没有记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { recordApi } from '../api'

const userStore = useUserStore()
const selectedDate = ref(new Date().toISOString().split('T')[0])
const recordsData = ref({
  totalStars: 0,
  morningStars: 0,
  afternoonStars: 0,
  eveningStars: 0,
  records: []
})

const fetchRecords = async () => {
  try {
    const res = await recordApi.getRecords(userStore.userId, selectedDate.value)
    if (res.code === 0) {
      recordsData.value = res.data
    }
  } catch (error) {
    console.error('Fetch records error:', error)
  }
}

const changeDate = (delta) => {
  const date = new Date(selectedDate.value)
  date.setDate(date.getDate() + delta)
  selectedDate.value = date.toISOString().split('T')[0]
  fetchRecords()
}

const isTimeRecord = (record) => record.type === 'time_task' || record.type === 'quick_time'

const getPeriodText = (period) => {
  const map = {
    morning: '早上',
    afternoon: '下午',
    evening: '晚上'
  }
  return map[period] || ''
}

const deleteRecord = async (recordId) => {
  if (!confirm('确定要删除这条记录吗？')) return

  try {
    const res = await recordApi.deleteRecord(recordId, userStore.userId, selectedDate.value)
    if (res.code === 0) {
      await fetchRecords()
      await userStore.fetchStats()
    } else {
      alert(res.message || '删除失败')
    }
  } catch (error) {
    alert('删除失败')
  }
}

onMounted(() => {
  fetchRecords()
})
</script>

<style scoped>
.date-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.date-input {
  width: auto;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  text-align: center;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.stat-label {
  color: #B0B0B0;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #FFD700;
}

.stat-unit {
  color: #B0B0B0;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 1rem;
  color: #B0B0B0;
}

.records-list {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.record-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(74, 144, 217, 0.1);
}

.record-item:last-child {
  border-bottom: none;
}

.record-task {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.record-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #B0B0B0;
}

.weekend-tag {
  color: #FFD700;
}

.time-tag {
  color: #7FB2FF;
}

.record-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.record-stars {
  font-size: 1.5rem;
  font-weight: 700;
}

.btn-delete {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(231, 76, 60, 0.2);
  color: #E74C3C;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.btn-delete:hover {
  background: rgba(231, 76, 60, 0.4);
}

@media (max-width: 768px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
