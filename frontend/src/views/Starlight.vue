<template>
  <div class="starlight-page">
    <h1 class="page-title">星光值</h1>
    <p class="page-subtitle">星光值可凝结成许愿星</p>

    <!-- 凝结许愿星总数。当天还剩多少星光值在下面的进度条上，不单列一张卡 -->
    <div class="overview">
      <div class="card overview-card">
        <div class="overview-label">凝结许愿星总数</div>
        <div class="overview-value number">
          {{ state.banked }}<span class="overview-unit">颗</span>
        </div>
      </div>
    </div>

    <!-- 星光值任务：整页唯一要动手的地方，放在总览数字下面 -->
    <div class="section-head tasks-head">
      <h2 class="section-title">星光值任务</h2>
      <button class="btn btn-primary btn-sm" @click="openCreate">+ 新建任务</button>
    </div>

    <div v-if="state.tasks.length" class="task-list">
      <div v-for="task in state.tasks" :key="task.id" class="card task-card">
        <div class="task-main">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-meta">
            完成一次抽一只精灵 ·
            已完成 <b class="number">{{ task.complete_count }}</b> 次
          </div>
        </div>
        <div class="task-actions">
          <button
            class="btn btn-success btn-sm"
            :disabled="completingId === task.id"
            @click="completeTask(task)"
          >
            {{ completingId === task.id ? '抽取中...' : '完成' }}
          </button>
          <button class="btn btn-primary btn-sm" @click="openEdit(task)">编辑</button>
          <button class="btn btn-danger btn-sm" @click="removeTask(task)">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="card empty-state">
      <div class="empty-state-icon">✨</div>
      <p>还没有星光值任务，新建一个开始攒星光值吧</p>
    </div>

    <!-- 待入库：整块可点，点一下全部收进仓库 -->
    <div v-if="state.pending > 0" class="card pending-card">
      <div class="pending-title">
        天上有 {{ state.pending }} 颗许愿星等着你摘
      </div>
      <p class="pending-hint">
        点一下就把这 {{ state.pending }} 颗全部收进仓库（不点也不会消失，明天还在）
      </p>
      <button class="pending-stars" title="全部收进仓库" :disabled="collecting" @click="collectAll">
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

    <!-- 抽到精灵的结果卡：不挡操作，几秒后自己淡出 -->
    <div v-if="result" class="card result-card" :class="{ 'result-error': result.error }">
      <template v-if="result.error">
        <span class="result-error-text">{{ result.error }}</span>
      </template>
      <template v-else>
        <div class="result-title">抽到精灵啦</div>
        <div class="result-body">
          <div class="result-thumb">
            <img v-if="!broken[result.spirit.number]" :src="result.spirit.headUrl"
                 :alt="result.spirit.name" @error="markBroken(result.spirit.number)" />
            <span v-else class="sprite-placeholder">🔮</span>
          </div>
          <div class="result-info">
            <div class="result-name">{{ result.spirit.name }}</div>
            <div class="result-star number">+{{ result.earned }} <span class="result-unit">星光值</span></div>
            <div class="result-no">No.{{ result.spirit.number }}</div>
          </div>
        </div>
        <p v-if="result.condensedNow > 0" class="result-condense">
          这一下刚好够档位，自动凝结出 {{ result.condensedNow }} 颗许愿星（消耗 {{ result.spentNow }} 星光值）
        </p>
      </template>
    </div>

    <!-- 今日抽到的精灵 -->
    <div class="section-head">
      <h2 class="section-title">今日抽到的精灵</h2>
      <!-- 池子没读出来时别写「还剩 0 只」，那会被当成今天抽完了 -->
      <span v-if="state.poolTotal > 0" class="pool-note">还剩 {{ state.poolRemaining }} 只没抽到</span>
      <span v-else class="pool-note pool-note-error">精灵池没加载出来</span>
    </div>

    <div v-if="state.todayDraws.length" class="sprite-grid">
      <div v-for="sprite in state.todayDraws" :key="sprite.number" class="sprite-card">
        <div class="sprite-thumb">
          <img v-if="!broken[sprite.number]" :src="sprite.headUrl"
               :alt="sprite.name" @error="markBroken(sprite.number)" />
          <span v-else class="sprite-placeholder">🔮</span>
          <span class="sprite-no">{{ sprite.number }}</span>
        </div>
        <div class="sprite-name">{{ sprite.name }}</div>
        <div class="sprite-star number">★ {{ sprite.star }}</div>
      </div>
    </div>

    <div v-else class="card empty-state sprite-empty">
      <div class="empty-state-icon">🔍</div>
      <p v-if="state.poolTotal > 0">今天还没抽到精灵，完成一次星光值任务试试</p>
      <p v-else>没有读到精灵数据，检查一下数据目录里有没有 data/spirits.jsonl</p>
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
          <p>最近 7 天没有流水记录</p>
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

        <p class="form-hint">
          完成一次就从今天的精灵池里随机抽一只还没抽到过的精灵，
          这只精灵值多少星光值就加多少。
        </p>

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
  logs: [],
  todayDraws: [],
  poolRemaining: 0,
  poolTotal: 0
}

const state = ref({ ...emptyState })
// 抽到精灵的结果卡（或「今天抽完了」这类提示），几秒后自己消失
const result = ref(null)
let resultTimer = null

// 正在抽精灵的任务 id（空串 = 没有请求在飞），用来在请求期间禁用「完成」按钮
const completingId = ref('')

// 头像加载失败（图还没拷全）就换成占位符，不显示破图
const broken = ref({})
const markBroken = (number) => {
  broken.value = { ...broken.value, [number]: true }
}

const showModal = ref(false)
const editingId = ref('')
const form = ref({ name: '' })
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

// 不传 count —— 后端收到就是把待入库的全部收走。
// 「全部」是按后端当下读到的待入库算的，所以并发点两下会各收一遍，
// 后端那把锁是主力，这里只是别让手指头把请求打出去。
const collecting = ref(false)
const collectAll = async () => {
  if (collecting.value) return
  collecting.value = true
  try {
    const res = await starlightApi.collect(userStore.userId)
    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }
    } else {
      alert(res.message || '入库失败')
    }
  } catch (error) {
    alert('入库失败')
  } finally {
    collecting.value = false
  }
}

const openCreate = () => {
  editingId.value = ''
  form.value = { name: '' }
  formError.value = ''
  showModal.value = true
}

const openEdit = (task) => {
  editingId.value = task.id
  form.value = { name: task.name }
  formError.value = ''
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
}

// 前端也校验一遍，省得为一个手滑的输入跑一趟后端
const validateForm = () => {
  if (!form.value.name.trim()) return '任务名称不能为空'
  return ''
}

const save = async () => {
  const error = validateForm()
  if (error) {
    formError.value = error
    return
  }

  const payload = { name: form.value.name.trim() }

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

// 结果卡几秒后自己淡出，连续点「完成」不会被挡住
const showResult = (payload) => {
  result.value = payload
  clearTimeout(resultTimer)
  resultTimer = setTimeout(() => {
    result.value = null
  }, 6000)
}

const completeTask = async (task) => {
  // 正在抽精灵的任务 id。结果卡是不挡操作的（点完成不会被弹窗挡住），
  // 所以更得防连点：连点两下会一次任务抽走两只精灵，还破坏「不放回」的语义。
  // 后端有一把按用户分的锁兜底，这里挡在第一线。
  if (completingId.value) return
  completingId.value = task.id

  try {
    const res = await starlightApi.completeTask(task.id)

    if (res.code === 0) {
      state.value = { ...state.value, ...res.data.state }
      showResult({
        spirit: res.data.spirit,
        earned: res.data.earned,
        // 这一下刚好够档位，凝结是当次就发生的，得说一声，不然星星是哪儿来的会看不懂
        condensedNow: res.data.state.condensedNow,
        spentNow: res.data.state.spentNow
      })
    } else {
      // 「今天的精灵都抽完了」也走这里，用同一块地方提示，不弹 alert 打断
      showResult({ error: res.message || '完成失败' })
    }
  } catch (error) {
    showResult({ error: '完成失败' })
  } finally {
    completingId.value = ''
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
/* 这一页不再单独限宽：跟着外层 .main-content 用满 1200px，
   否则右边会空出一大块（精灵小卡片那一排也正好铺开） */

.page-subtitle {
  margin: -1rem 0 1.5rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.45);
}

/* 只剩「凝结许愿星总数」一张卡了，占满一行 */
.overview {
  display: grid;
  grid-template-columns: 1fr;
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

/* 收取请求在飞的时候：别让 hover 效果骗人，看起来还能点 */
.pending-stars:disabled {
  cursor: default;
  opacity: 0.6;
}

.pending-stars:disabled:hover {
  border-color: rgba(255, 215, 0, 0.35);
  background: rgba(255, 215, 0, 0.05);
  box-shadow: none;
}

.pending-stars:disabled:hover .pending-star {
  transform: none;
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

/* 抽到精灵的结果卡 */
.result-card {
  margin-bottom: 1.5rem;
  border-color: rgba(46, 204, 113, 0.4);
  animation: fadeIn 0.3s ease;
}

.result-card.result-error {
  border-color: rgba(231, 76, 60, 0.4);
}

.result-error-text {
  color: #E74C3C;
  font-weight: 600;
}

.result-title {
  font-size: 0.85rem;
  color: #2ECC71;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.result-body {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.result-thumb {
  width: 84px;
  height: 84px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.25);
}

.result-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.result-name {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.result-star {
  font-size: 1.35rem;
  color: #7FB2FF;
}

.result-unit {
  font-size: 0.85rem;
  color: #B0B0B0;
}

.result-no {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
}

.result-condense {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(74, 144, 217, 0.1);
  font-size: 0.85rem;
  color: #FFD700;
}

/* 今日抽到的精灵：小卡片平铺 */
.sprite-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 0.85rem;
  margin-bottom: 2rem;
}

.sprite-card {
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: 12px;
  padding: 0.6rem;
  text-align: center;
}

.sprite-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sprite-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sprite-placeholder {
  font-size: 2rem;
  opacity: 0.5;
}

.sprite-no {
  position: absolute;
  top: 0;
  left: 0;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(26, 26, 46, 0.9);
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sprite-name {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  line-height: 1.35;
  word-break: break-all;
}

.sprite-star {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: #FFD700;
}

.sprite-empty {
  margin-bottom: 2rem;
}

.pool-note {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
}

/* 数据目录配错时用警告色，别让人以为只是「今天抽完了」 */
.pool-note-error {
  color: #FF8A80;
}

.tasks-head {
  margin-top: 0.5rem;
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

.form-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
  margin-bottom: 0.5rem;
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
