<template>
  <div class="work">
    <h1 class="page-title">⏱ 工作时间</h1>

    <!-- 模式切换 -->
    <div v-if="!running" class="mode-switch">
      <button class="mode-btn" :class="{ active: mode === 'count_up' }" @click="mode = 'count_up'">正计时</button>
      <button class="mode-btn" :class="{ active: mode === 'countdown' }" @click="mode = 'countdown'">倒计时</button>
    </div>
    <div v-else class="mode-switch">
      <button class="mode-btn active">{{ running.mode === 'countdown' ? '倒计时' : '正计时' }}</button>
    </div>

    <!-- 倒计时设置 -->
    <div v-if="!running && mode === 'countdown'" class="countdown-setup">
      <input v-model.number="plannedMinutes" type="number" min="1" class="input minutes-input" />
      <span class="unit">分钟</span>
    </div>

    <!-- 计时显示 -->
    <div class="timer-display" :class="{ pulsing: running }">
      <div class="time">{{ displayText }}</div>
      <div class="mode-label">{{ running ? (running.mode === 'countdown' ? '工作中…' : '工作中…') : '准备就绪' }}</div>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <button v-if="!running" class="btn btn-primary btn-lg" @click="start">开始工作</button>
      <button v-else class="btn btn-success btn-lg" @click="manualEnd">
        {{ running.mode === 'countdown' ? '停止' : '结束工作' }}
      </button>
    </div>

    <!-- 今日汇总 -->
    <div class="today-summary">
      <div class="summary-item">
        <span class="summary-label">今日已工作</span>
        <span class="summary-value">{{ formatMinutes(dailyMinutes) }}</span>
      </div>
      <div v-if="timeTasks.length" class="summary-item">
        <span class="summary-label">今日自动完成</span>
        <span class="summary-value">{{ totalEarned }} 次「{{ timeTasks[0].name }}」</span>
      </div>
    </div>

    <!-- 阈值提示（小字，不打扰） -->
    <transition name="toast-fade">
      <div v-if="toast" class="star-toast">⭐ 已获得 {{ toastStars }} 颗星星</div>
    </transition>

    <!-- 结束汇总确认框 -->
    <div v-if="showSummary" class="modal-overlay" @click.self="showSummary = false">
      <div class="modal">
        <h3 class="modal-title">本次工作结束</h3>
        <div class="summary-content">
          <div class="summary-row">本次时长：<b>{{ formatMinutes(Math.round(summary.actualSeconds / 60)) }}</b></div>
          <div v-for="item in summary.settled" :key="item.taskId" class="summary-row">
            自动完成 {{ item.addedCount }} 次「{{ item.name }}」，获得 {{ item.starsEarned }} 颗星星
          </div>
          <div v-if="!summary.settled.length" class="summary-row summary-muted">
            本次未满一个周期，星星继续累积
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="closeSummary">好的</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { workApi } from '../api'

const userStore = useUserStore()

const mode = ref('count_up')
const plannedMinutes = ref(25)
const running = ref(null)
const displayMs = ref(0)
const dailyTotalSeconds = ref(0)
const timeTasks = ref([])
const toast = ref(false)
const toastStars = ref(0)
const showSummary = ref(false)
const summary = ref({ actualSeconds: 0, settled: [] })

let tickTimer = null
let toastTimer = null
let settledUnits = 0
const tickCount = ref(0)


const displayText = computed(() => {
  const totalSec = Math.max(0, Math.floor(displayMs.value / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})

const dailyMinutes = computed(() => {
  void tickCount.value
  const runningSec = running.value ? Math.floor((Date.now() - parseInt(running.value.started_at)) / 1000) : 0
  return Math.floor((dailyTotalSeconds.value + runningSec) / 60)
})

// 时间型任务配置的完成周期（默认 25 分钟）
function thresholdMinutes() {
  const task = timeTasks.value[0]
  return parseInt(task && task.minutesPerComplete) || 25
}

const totalEarned = computed(() => {
  const task = timeTasks.value[0]
  if (!task) return 0
  return Math.floor(dailyMinutes.value / thresholdMinutes())
})

// 当前累计分钟（已结束会话 + 运行中会话）
function accumulatedMinutes() {
  void tickCount.value
  const runningSec = running.value ? Math.floor((Date.now() - parseInt(running.value.started_at)) / 1000) : 0
  return Math.floor((dailyTotalSeconds.value + runningSec) / 60)
}

async function refreshToday() {
  try {
    const res = await workApi.getToday(userStore.userId)
    if (res.code === 0) {
      dailyTotalSeconds.value = res.data.totalSeconds
      timeTasks.value = res.data.timeTasks || []
    }
  } catch (error) {
    console.error('刷新工作汇总失败:', error)
  }
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = setInterval(tick, 1000)
}

function tick() {
  if (!running.value) return
  tickCount.value++
  const startedAt = parseInt(running.value.started_at)
  const elapsedMs = Math.max(0, Date.now() - startedAt)

  if (running.value.mode === 'countdown') {
    const total = (parseInt(running.value.planned_minutes) || 25) * 60 * 1000
    const remaining = total - elapsedMs
    displayMs.value = Math.max(0, remaining)
    if (remaining <= 0) {
      countdownFinished()
      return
    }
  } else {
    displayMs.value = elapsedMs
  }

  checkThreshold()
}

function checkThreshold() {
  const minutes = accumulatedMinutes()
  const units = Math.floor(minutes / thresholdMinutes())
  if (units > settledUnits) {
    settledUnits = units
    settleNow()
  }
}

async function settleNow() {
  try {
    const res = await workApi.settle(userStore.userId)
    if (res.code === 0 && res.data.settled.length) {
      const stars = res.data.settled.reduce((sum, item) => sum + item.starsEarned, 0)
      toastStars.value = stars
      toast.value = true
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => { toast.value = false }, 3000)
      await userStore.fetchStats()
    }
  } catch (error) {
    console.error('结算失败:', error)
  }
}

async function start() {
  try {
    const res = await workApi.startSession({
      userId: userStore.userId,
      mode: mode.value,
      plannedMinutes: mode.value === 'countdown' ? plannedMinutes.value : 0
    })
    if (res.code !== 0) {
      alert(res.message || '开始失败')
      return
    }
    running.value = res.data
    displayMs.value = 0
    settledUnits = Math.floor(accumulatedMinutes() / thresholdMinutes())
    startTick()
  } catch (error) {
    alert('开始失败')
  }
}

async function manualEnd() {
  if (!running.value) return
  await endSession(false)
}

async function countdownFinished() {
  // 倒计时走完：自动结束，桌面通知
  if (running.value) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('⏱ 倒计时结束', { body: '本次工作完成，休息一下吧！' })
    }
    await endSession(true)
  }
}

async function endSession(completed) {
  if (!running.value) return
  const session = running.value
  try {
    const res = await workApi.endSession(session.id, { completed: completed || false })
    if (res.code !== 0) {
      alert(res.message || '结束失败')
      return
    }
    running.value = null
    if (tickTimer) clearInterval(tickTimer)
    displayMs.value = res.data.actualSeconds * 1000
    summary.value = { actualSeconds: res.data.actualSeconds, settled: res.data.settled || [] }
    showSummary.value = true
    await refreshToday()
    await userStore.fetchStats()
  } catch (error) {
    alert('结束失败')
  }
}

function closeSummary() {
  showSummary.value = false
  displayMs.value = 0
}

function formatMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`
}

async function restoreRunning() {
  try {
    const res = await workApi.getStatus(userStore.userId)
    if (res.code === 0 && res.data) {
      running.value = res.data
      mode.value = res.data.mode
      plannedMinutes.value = parseInt(res.data.planned_minutes) || 25
      const startedAt = parseInt(res.data.started_at)
      displayMs.value = res.data.mode === 'countdown'
        ? Math.max(0, (parseInt(res.data.planned_minutes) || TIME_TASK_MINUTES) * 60000 - (Date.now() - startedAt))
        : (Date.now() - startedAt)
      settledUnits = Math.floor(accumulatedMinutes() / thresholdMinutes())
      startTick()
    }
  } catch (error) {
    console.error('恢复会话失败:', error)
  }
}

onMounted(async () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  await refreshToday()
  await restoreRunning()
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<style scoped>
.mode-switch {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.mode-btn {
  padding: 0.6rem 2rem;
  border-radius: 20px;
  border: 1px solid rgba(74, 144, 217, 0.3);
  background: rgba(22, 33, 62, 0.8);
  color: #B0B0B0;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.mode-btn.active {
  background: rgba(74, 144, 217, 0.3);
  color: #fff;
  border-color: #4A90D9;
}

.countdown-setup {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  color: #B0B0B0;
}

.minutes-input {
  width: 100px;
  text-align: center;
  font-size: 1.2rem;
}

.timer-display {
  text-align: center;
  padding: 3rem 1rem;
  background: rgba(22, 33, 62, 0.6);
  border-radius: 24px;
  border: 1px solid rgba(74, 144, 217, 0.2);
  margin-bottom: 1.5rem;
}

.timer-display.pulsing .time {
  color: #FFD700;
  text-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
}

.time {
  font-size: 5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.mode-label {
  color: #B0B0B0;
  margin-top: 0.5rem;
}

.controls {
  display: flex;
  justify-content: center;
  margin-bottom: 2rem;
}

.btn-lg {
  padding: 0.8rem 3.5rem;
  font-size: 1.2rem;
  border-radius: 30px;
}

.today-summary {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
  color: #B0B0B0;
}

.summary-item {
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: 16px;
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.summary-label {
  font-size: 0.85rem;
}

.summary-value {
  color: #FFD700;
  font-weight: 700;
  font-size: 1.1rem;
}

.star-toast {
  position: fixed;
  bottom: 3rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.5);
  color: #FFD700;
  padding: 0.5rem 1.5rem;
  border-radius: 20px;
  font-size: 0.95rem;
  z-index: 1000;
  pointer-events: none;
}

.toast-fade-enter-active, .toast-fade-leave-active {
  transition: opacity 0.4s ease;
}

.toast-fade-enter-from, .toast-fade-leave-to {
  opacity: 0;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 1rem 0;
}

.summary-row {
  color: #B0B0B0;
}

.summary-row b {
  color: #fff;
}

.summary-muted {
  font-size: 0.9rem;
}
</style>
