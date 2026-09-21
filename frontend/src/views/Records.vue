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

      <!-- 0-6 点记录的那一档。以前没有这一格，凌晨的星星会被并进早上或晚上 -->
      <div class="stat-card">
        <div class="stat-label">其他</div>
        <div class="stat-value number">{{ recordsData.otherStars }}</div>
        <div class="stat-unit">🕛</div>
      </div>
    </div>

    <!-- 工时（由记录折算，不单独存） -->
    <div class="stats-cards time-cards">
      <div class="stat-card time-card">
        <div class="stat-label">今日总计时间</div>
        <div class="stat-value-number time-value">{{ formatMinutes(recordsData.totalMinutes) }}</div>
        <div class="stat-unit">⏱</div>
      </div>

      <div class="stat-card time-card">
        <div class="stat-label">早上</div>
        <div class="stat-value-number time-value">{{ formatMinutes(recordsData.morningMinutes) }}</div>
        <div class="stat-unit">🌅</div>
      </div>

      <div class="stat-card time-card">
        <div class="stat-label">下午</div>
        <div class="stat-value-number time-value">{{ formatMinutes(recordsData.afternoonMinutes) }}</div>
        <div class="stat-unit">☀️</div>
      </div>

      <div class="stat-card time-card">
        <div class="stat-label">晚上</div>
        <div class="stat-value-number time-value">{{ formatMinutes(recordsData.eveningMinutes) }}</div>
        <div class="stat-unit">🌙</div>
      </div>

      <!-- 「其他」这一格的工时**故意留空**（需求就是这么定的）：
           0-6 点的工时折算口径还没定，先不显示。
           里面的 &nbsp; 不能删 —— 空的 div 没有行高，卡片里的 🕛 会往上跑，
           跟旁边那几张的图标错开一整行 -->
      <div class="stat-card time-card">
        <div class="stat-label">其他</div>
        <div class="stat-value-number time-value">&nbsp;</div>
        <div class="stat-unit">🕛</div>
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
  // 0-6 点那一档
  otherStars: 0,
  // 工时由后端从记录折算，不单独存
  totalMinutes: 0,
  morningMinutes: 0,
  afternoonMinutes: 0,
  eveningMinutes: 0,
  records: []
})

// 工时统一显示成「多少h多少min」，跟需求里写的一致。
// 不足一小时只说分钟，整点不带尾巴（1h15min / 1h / 25min / 0min）。
const formatMinutes = (minutes) => {
  const total = Math.max(0, Math.floor(minutes || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0) return m > 0 ? `${h}h${m}min` : `${h}h`
  return `${m}min`
}

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
    evening: '晚上',
    other: '其他'
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

/* 两排都是 5 格：今日总计 + 早上 / 下午 / 晚上 / 其他。
   写死 5 列不用 auto-fit —— 列数一旦跟卡片数对不上，最后一格会孤零零地
   掉到第二行去，两排就错开了 */
.stats-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

/* 工时那一排贴着星星那一排，所以自己不带下边距 */
.time-cards {
  margin-top: -1rem;
}

/* 工时是「1h15min」这种字符串，比纯数字长，字号得压一点才不撑破卡片 */
.time-card .time-value {
  font-size: 1.7rem;
  font-weight: 700;
  color: #7FB2FF;
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
