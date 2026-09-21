<template>
  <div class="starlight-page">
    <h1 class="page-title">星光值</h1>
    <p class="page-subtitle">星光值可凝结成许愿星</p>

    <!-- 两个总览数字 -->
    <div class="overview">
      <div class="card overview-card">
        <div class="overview-label">凝结许愿星总数</div>
        <div class="overview-value number">
          {{ state.banked }}<span class="overview-unit">颗</span>
        </div>
      </div>
      <div class="card overview-card">
        <div class="overview-label">当日星光值</div>
        <div class="overview-value number starlight">
          {{ state.value }}<span class="overview-unit">星光值</span>
        </div>
      </div>
    </div>

    <!-- 待入库：整块可点，点一下全部收进仓库 -->
    <div v-if="state.pending > 0" class="card pending-card">
      <div class="pending-title">
        天上有 {{ state.pending }} 颗许愿星等着你摘
      </div>
      <p class="pending-hint">
        点一下就把这 {{ state.pending }} 颗全部收进仓库（不点也不会消失，明天还在）
      </p>
      <button class="pending-stars" title="全部收进仓库" @click="collectAll">
        <span v-for="n in state.pending" :key="n" class="pending-star">⭐</span>
      </button>
    </div>

    <!-- 距下一颗的进度 -->
    <div class="card progress-card">
      <template v-if="state.nextCost !== null">
        <div class="progress-head">
          <span>当天第 {{ state.todayCondensed + 1 }} 颗许愿星</span>
          <span class="progress-num number">{{ state.value }} / {{ state.nextCost }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <p class="progress-note">
          还差 <b class="number">{{ state.nextRemaining }}</b> 星光值就能自动凝结出下一颗
        </p>
      </template>
      <template v-else>
        <div class="progress-head">
          <span>今天已经凝结满 {{ state.maxDailyStars }} 颗了</span>
        </div>
        <p class="progress-note">
          剩下的 {{ state.value }} 星光值今天用不掉了（星光值每天清零，许愿星和已入库的总数不受影响）
        </p>
      </template>

      <p class="tier-note">
        今天已凝结 {{ state.todayCondensed }} / {{ state.maxDailyStars }} 颗 ·
        凝结是自动的，够档位就扣星光值生成许愿星
      </p>
    </div>

    <!-- 完成任务的提示 -->
    <div v-if="flash" class="flash card">
      <span class="flash-text">{{ flash }}</span>
    </div>

    <!-- 星光值任务 -->
    <div class="section-head">
      <h2 class="section-title">星光值任务</h2>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ 新建任务</button>
    </div>

    <div v-if="state.tasks.length" class="task-list">
      <div v-for="task in state.tasks" :key="task.id" class="card task-card">
        <div class="task-main">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">
            每次随机 <b class="number">{{ task.min_value }} ~ {{ task.max_value }}</b> 星光值 ·
            已完成 <b class="number">{{ task.complete_count }}</b> 次
          </div>
        </div>
        <div class="task-actions">
          <button class="btn btn-success btn-sm" @click="completeTask(task)">完成</button>
          <button class="btn btn-primary btn-sm" @click="openEdit(task)">编辑</button>
          <button class="btn btn-danger btn-sm" @click="removeTask(task)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="card empty-state">
      <div class="empty-state-icon">✨</div>
      <p>还没有星光值任务，新建一个开始攒星光值吧</p>
    </div>

    <!-- 流水 -->
    <h2 class="section-title logs-title">星光值流水</h2>
    <div class="card logs-card">
      <div class="logs-list">
        <div v-for="log in state.logs" :key="log.id" class="log-item">
          <div class="log-info">
            <div class="log-desc">{{ log.description }}</div>
            <div class="log-time">{{ formatTime(log.created_at) }}</div>
          </div>
          <div class="log-amount number" :class="log.type">
            {{ log.type === 'income' ? '+' : '' }}{{ log.amount }} {{ log.unit }}
          </div>
        </div>

        <div v-if="!state.logs.length" class="empty-state">
          <p>暂无流水记录</p>
        </div>
      </div>
    </div>

    <p class="footnote">
      星光值和凝结出来的许愿星跟任务、抽卡那套星星分开记账，暂时还不能兑换东西。
    </p>

    <!-- 新建 / 编辑弹框 -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">{{ editingId ? '编辑任务' : '新建星光值任务' }}</h3>

        <div class="form-group">
          <label class="label">任务名称</label>
          <input v-model="form.name" class="input" placeholder="比如：开始任务" @keyup.enter="save" />
        </div>

        <div class="form-group">
          <label class="label">每次完成的星光值范围（含两端，每个数概率相同）</label>
          <div class="range-row">
            <input v-model="form.minValue" type="number" class="input" placeholder="最小值" />
            <span class="range-dash">~</span>
            <input v-model="form.maxValue" type="number" class="input" placeholder="最大值" />
          </div>
        </div>

        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button class="btn btn-primary" @click="save">保存</button>
          <button class="btn" @click="closeModal">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { starlightApi } from '../api'

const userStore = useUserStore()

const emptyState = {
  date: '',
  value: 0,
  pending: 0,
  banked: 0,
  todayCondensed: 0,
  todayEarned: 0,
  maxDailyStars: 25,
  nextCost: null,
  nextRemaining: null,
  tasks: [],
  logs: []
}

const state = ref({ ...emptyState })
const flash = ref('')
let flashTimer = null

const showModal = ref(false)
const editingId = ref('')
const form = ref({ name: '', minValue: 1, maxValue: 50 })
const formError = ref('')

const progressPercent = computed(() => {
  if (!state.value.nextCost) return 100
  const pct = (state.value.value / state.value.nextCost) * 100
  return Math.min(100, Math.max(0, pct))
})

const fetchState = async () => {
  try {
    const res = await starlightApi.getState(userStore.userId)
    if (res.code === 0) {
      state.value = { ...emptyState, ...res.data }
    }
  } catch (error) {
    console.error('Fetch starlight state error:', error)
  }
}

// 不传 count —— 后端收到就是把待入库的全部收走
const collectAll = async () => {
  try {
    const res = await starlightApi.collect(userStore.userId)
    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }
    } else {
      alert(res.message || '入库失败')
    }
  } catch (error) {
    alert('入库失败')
  }
}

const openCreate = () => {
  editingId.value = ''
  form.value = { name: '', minValue: 1, maxValue: 50 }
  formError.value = ''
  showModal.value = true
}

const openEdit = (task) => {
  editingId.value = task.id
  form.value = {
    name: task.name,
    minValue: parseInt(task.min_value),
    maxValue: parseInt(task.max_value)
  }
  formError.value = ''
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

// 前端也校验一遍，省得为一个手滑的输入跑一趟后端
const validateForm = () => {
  if (!form.value.name.trim()) return '任务名称不能为空'

  const min = Number(form.value.minValue)
  const max = Number(form.value.maxValue)

  if (form.value.minValue === '' || form.value.maxValue === '') return '星光值范围要填完整'
  if (!Number.isInteger(min) || !Number.isInteger(max)) return '星光值范围只能填整数'
  if (min < 0) return '星光值不能是负数'
  if (min > max) return '最小值不能大于最大值'

  return ''
}

const save = async () => {
  const error = validateForm()
  if (error) {
    formError.value = error
    return
  }

  const payload = {
    name: form.value.name.trim(),
    minValue: Number(form.value.minValue),
    maxValue: Number(form.value.maxValue)
  }

  try {
    const res = editingId.value
      ? await starlightApi.updateTask(editingId.value, payload)
      : await starlightApi.createTask({ userId: userStore.userId, ...payload })

    if (res.code === 0) {
      closeModal()
      await fetchState()
    } else {
      formError.value = res.message || '保存失败'
    }
  } catch (error) {
    formError.value = '保存失败'
  }
}

const removeTask = async (task) => {
  if (!confirm(`确定要删除「${task.name}」吗？`)) return

  try {
    const res = await starlightApi.deleteTask(task.id)
    if (res.code === 0) {
      await fetchState()
    }
  } catch (error) {
    alert('删除失败')
  }
}

const completeTask = async (task) => {
  try {
    const res = await starlightApi.completeTask(task.id)

    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }

      let message = `「${task.name}」抽到 ${res.data.rolled} 星光值`
      // 这一下刚好够档位，凝结是当次就发生的，得说一声，不然星星是哪儿来的会看不懂
      if (res.data.state.condensedNow > 0) {
        message += `，自动凝结出 ${res.data.state.condensedNow} 颗许愿星（消耗 ${res.data.state.spentNow} 星光值）`
      }
      flash.value = message

      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => {
        flash.value = ''
      }, 6000)
    } else {
      alert(res.message || '完成失败')
    }
  } catch (error) {
    alert('完成失败')
  }
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(fetchState)
</script>

<style scoped>
.starlight-page {
  max-width: 760px;
}

.page-subtitle {
  margin: -1rem 0 1.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.45);
}

.overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.overview-card {
  text-align: center;
}

.overview-label {
  font-size: 0.85rem;
  color: #B0B0B0;
  margin-bottom: 0.5rem;
}

.overview-value {
  font-size: 2.4rem;
  line-height: 1.1;
  color: #FFD700;
  text-shadow: 0 0 24px rgba(255, 215, 0, 0.3);
  word-break: break-all;
}

.overview-value.starlight {
  color: #7FB2FF;
  text-shadow: 0 0 24px rgba(127, 178, 255, 0.3);
}

.overview-unit {
  font-size: 0.9rem;
  margin-left: 0.35rem;
  color: #B0B0B0;
  text-shadow: none;
}

.pending-card {
  margin-bottom: 1.5rem;
  border-color: rgba(255, 215, 0, 0.4);
  box-shadow: 0 8px 32px rgba(255, 215, 0, 0.12);
}

.pending-title {
  font-weight: 700;
  font-size: 1.05rem;
  color: #FFD700;
  margin-bottom: 0.35rem;
}

.pending-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 1rem;
}

/* 整块是一个按钮：点哪儿都是「全部入库」 */
.pending-stars {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  width: 100%;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px dashed rgba(255, 215, 0, 0.35);
  background: rgba(255, 215, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
}

.pending-stars:hover {
  border-color: rgba(255, 215, 0, 0.75);
  background: rgba(255, 215, 0, 0.14);
  box-shadow: 0 6px 22px rgba(255, 215, 0, 0.18);
}

.pending-stars:hover .pending-star {
  transform: translateY(-3px);
}

.pending-stars:active {
  transform: scale(0.99);
}

.pending-star {
  font-size: 1.7rem;
  line-height: 1;
  transition: transform 0.2s ease;
  animation: starFloat 2.4s ease-in-out infinite;
}

@keyframes starFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.progress-card {
  margin-bottom: 1.5rem;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.9rem;
  color: #B0B0B0;
  margin-bottom: 0.6rem;
}

.progress-num {
  color: #7FB2FF;
}

.progress-track {
  height: 10px;
  border-radius: 6px;
  background: rgba(26, 26, 46, 0.9);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, #4A90D9 0%, #7FB2FF 100%);
  transition: width 0.35s ease;
}

.progress-note {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: #B0B0B0;
}

.progress-note b {
  color: #FFD700;
}

.tier-note {
  margin-top: 0.5rem;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.35);
}

.flash {
  margin-bottom: 1.5rem;
  border-color: rgba(46, 204, 113, 0.4);
  animation: fadeIn 0.3s ease;
}

.flash-text {
  color: #2ECC71;
  font-weight: 600;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.3rem;
  color: #B0B0B0;
}

.logs-title {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.task-name {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 0.3rem;
}

.task-meta {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.task-meta b {
  color: #7FB2FF;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.range-dash {
  color: #B0B0B0;
}

.form-error {
  color: #E74C3C;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.logs-card {
  padding: 0.5rem 1.5rem;
}

.logs-list {
  max-height: 420px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 0;
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
  font-size: 1rem;
  white-space: nowrap;
}

.log-amount.income {
  color: #2ECC71;
}

.log-amount.expenditure {
  color: #E74C3C;
}

.footnote {
  margin-top: 1.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}

@media (max-width: 768px) {
  .overview {
    grid-template-columns: 1fr;
  }

  .task-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
