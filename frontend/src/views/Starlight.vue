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
            <img v-if="!broken[result.spirit.id]" :src="cardImage(result.spirit)"
                 :alt="displayName(result.spirit)" @error="markCardBroken(result.spirit)" />
            <span v-else class="sprite-placeholder">🔮</span>
          </div>
          <div class="result-info">
            <div class="result-name">
              <span v-if="result.spirit.isShiny" class="shiny-mark" title="异色">
                <img class="shiny-ico" :src="shinyIcon" alt="异色" />
              </span>
              {{ displayName(result.spirit) }}
            </div>
            <div class="result-star number">
              +{{ result.earned }} <span class="result-unit">星光值</span>
              <span v-if="result.spirit.starMultiplier > 1" class="star-boost" :title="boostTitle(result.spirit)">
                {{ baseStar(result.spirit) }}×{{ result.spirit.starMultiplier }}
              </span>
            </div>
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
      <!-- key 用 id 不用编号：同一个编号下挂着本体 / 地区形态 / 首领化 / 异色，
           编号会重复，拿它当 key 会让 Vue 报重复 key 并且渲染错位 -->
      <button
        v-for="sprite in state.todayDraws"
        :key="sprite.id || sprite.at"
        class="sprite-card"
        :title="`点开看「${displayName(sprite)}」的详情`"
        @click="openDetail(sprite)"
      >
        <div class="sprite-thumb">
          <img v-if="!broken[sprite.id]" :src="cardImage(sprite)"
               :alt="displayName(sprite)" @error="markCardBroken(sprite)" />
          <span v-else class="sprite-placeholder">🔮</span>
          <span class="sprite-no">{{ sprite.number }}</span>
          <span v-if="sprite.isShiny" class="sprite-shiny shiny-mark" title="异色">
            <img class="shiny-ico" :src="shinyIcon" alt="异色" />
          </span>
        </div>
        <div class="sprite-name">{{ displayName(sprite) }}</div>
        <div class="sprite-star number">
          ★ {{ sprite.star }}
          <span v-if="sprite.starMultiplier > 1" class="star-boost" :title="boostTitle(sprite)">
            {{ baseStar(sprite) }}×{{ sprite.starMultiplier }}
          </span>
        </div>
      </button>
    </div>

    <div v-else class="card empty-state sprite-empty">
      <div class="empty-state-icon">🔍</div>
      <p v-if="state.poolTotal > 0">今天还没抽到精灵，完成一次星光值任务试试</p>
      <p v-else>没有读到精灵数据，检查一下数据目录里有没有 data/entities.json</p>
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

    <!-- 精灵详情：点「今日抽到的精灵」里任意一张卡片打开。
         数据是跟着「今日抽到的精灵」一起从后端来的，点开就有，不转圈。 -->
    <div v-if="detail" class="modal-overlay" @click.self="closeDetail">
      <div class="modal spirit-modal">
        <button class="spirit-close" title="关闭" @click="closeDetail">✕</button>

        <div class="spirit-art">
          <img v-if="!artBroken && detail.artUrl" :src="detail.artUrl"
               :alt="detail.name" @error="artBroken = true" />
          <span v-else class="sprite-placeholder">🔮</span>
        </div>

        <h3 class="spirit-name">
          <span v-if="detail.isShiny" class="shiny-mark" title="异色">
            <img class="shiny-ico" :src="shinyIcon" alt="异色" />
          </span>
          {{ detail.name }}<span v-if="detail.isShiny" class="spirit-shiny-word">（异色）</span>
        </h3>
        <div class="spirit-no">No.{{ detail.number }}</div>

        <div class="spirit-tags">
          <span v-if="detail.formLabel" class="spirit-tag tag-form">{{ detail.formLabel }}</span>
          <span v-for="t in detail.types" :key="t" class="spirit-tag tag-type">{{ t }}</span>
          <span v-if="detail.kicker" class="spirit-tag">{{ detail.kicker }}</span>
          <span v-if="detail.stage" class="spirit-tag">{{ detail.stage }}</span>
          <span v-if="detail.season" class="spirit-tag">{{ detail.season }}</span>
        </div>

        <div class="spirit-star number">
          ★ {{ detail.star }}<span class="spirit-star-unit">星光值</span>
          <span v-if="detail.starMultiplier > 1" class="star-boost" :title="boostTitle(detail)">
            基础 {{ baseStar(detail) }} ×{{ detail.starMultiplier }}
          </span>
        </div>

        <p v-if="detail.desc" class="spirit-desc">{{ detail.desc }}</p>
        <p v-else class="spirit-desc spirit-desc-empty">这只精灵没有收录介绍</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { starlightApi } from '../api'
// wiki 上标「异色外观」的那个小图标（57×56）。
// 详情页立绘切换那一排 tab 里就有它，193 只异色共用同一张 —— 所以它才是
// 「这只是异色」的官方标志，不是各写各的 emoji。见 docs/核心功能 7.8。
import shinyIcon from '../assets/shiny-icon.png'

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

// 头像加载失败（图还没拷全）就换成占位符，不显示破图。
// 按 id 记，不能按编号 —— 同一个编号下有好几只，其中一只缺图不该把另一只也变成占位符。
const broken = ref({})
const markBroken = (key) => {
  broken.value = { ...broken.value, [key]: true }
}

// 卡片上显示哪张图。
//
// 异色走**异色立绘**（images/shiny/ 里那张）：wiki 没给异色单独的头部特写，
// 193 只异色的头像跟本体是同一张，所以卡片上要是也用头像，异色和本体长得一模一样。
// 立绘只有异色这几张走，其余精灵还是用 11KB 的小头像。
const cardImage = (sprite) => {
  if (sprite.isShiny && sprite.artUrl && !broken.value[`${sprite.id}:art`]) return sprite.artUrl
  return sprite.headUrl
}

// 异色立绘万一取不到，退回本体的头像（至少还有张图），再不行才是占位符
const markCardBroken = (sprite) => {
  if (sprite.isShiny && sprite.artUrl && !broken.value[`${sprite.id}:art`]) {
    markBroken(`${sprite.id}:art`)
    return
  }
  markBroken(sprite.id)
}

// 精灵详情弹窗。数据跟着「今日抽到的精灵」一起来，所以这里只是把已经拿到的那条
// 展开，不重新请求（详情字段见后端 spirits.js 的 enrichDraw）。
const detail = ref(null)
// 立绘加载失败时退回占位符。立绘是 1024×1024 的大图，采集没跑完的话可能缺
const artBroken = ref(false)

const openDetail = (sprite) => {
  artBroken.value = false
  detail.value = sprite
}

const closeDetail = () => {
  detail.value = null
}

// 异色在 wiki 上不是独立条目，名字跟本体逐字相同（193 只全是这样），
// 所以卡片和弹窗上都补一个「（异色）」，不然看起来就是同一只精灵抽到了两次
const displayName = (sprite) => (sprite.isShiny ? `${sprite.name}（异色）` : sprite.name)

// 异色 / 地区形态 / 首领化抽到时星光值翻倍，后端在 starMultiplier 里给（1 或 2）。
// 前端只管显示，判据留在后端一处，免得两边规则各写一遍再慢慢走偏。
//
// 卡片上那个数是**加完加成**的数（蹦蹦果基础 60，卡上显示 120）。
// 旁边必须再标一下基础值，写成「60×2」——只写个「×2」会被读成
// 「120 再翻倍 = 240」，图鉴上明明写的是 60。
// 基础值从 star 倒推就够，不用后端多发一个字段：倍数是后端按同一套规则算的，
// 除回去一定等于当初拿来算的那个数。
const baseStar = (sprite) => Math.round(sprite.star / (sprite.starMultiplier || 1))

const boostTitle = (sprite) =>
  `基础星光值 ${baseStar(sprite)}，${sprite.formLabel || '特殊形态'} ×${sprite.starMultiplier}，共 ${sprite.star} 星光值`

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

/* 结果卡名字前面的同一张「异色外观」图标 */
.result-name .shiny-mark {
  width: 20px;
  height: 20px;
  margin-right: 0.35rem;
  vertical-align: -4px;
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

/* 整张卡是个 <button>（点开精灵详情），所以得先把浏览器的默认按钮样式清掉，
   否则会顶着一圈灰色凸起和系统字体，跟旁边的卡片对不上 */
.sprite-card {
  font: inherit;
  color: inherit;
  width: 100%;
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: 12px;
  padding: 0.6rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sprite-card:hover {
  border-color: rgba(74, 144, 217, 0.6);
  background: rgba(74, 144, 217, 0.14);
  transform: translateY(-2px);
}

.sprite-card:active {
  transform: translateY(0);
}

/* 「这只是异色」的官方标志：wiki 上用的小图标（57×56，193 只异色共用同一张）。
   异色的名字和头像跟本体逐字一样，只看卡片分不出是哪一只，所以得有这个角标。

   两处坑：
   1. 图标是灰色线稿，直接放深色卡上几乎看不见 → 垫一层金底、把线稿压成深色。
      但 filter 会连元素**自己的背景**一起算，所以金底必须是外面这层 <span>，
      把 filter 加在里面的 <img> 上。加到金底上会把金底一起 brightness(0) 压黑。
   2. 这条 img 规则比下面那条 `.sprite-thumb img` 多一个 class 才压得住它 ——
      否则缩略图那条 width/height:100% 会把这个角标撑满整格，糊住立绘。 */
.shiny-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.9);
}

.shiny-mark img.shiny-ico {
  width: 14px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) opacity(0.8);
}

.sprite-thumb .sprite-shiny {
  position: absolute;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
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

/* 形态加成的「×2」小标。星光值是翻倍后的数，不标一下对照图鉴会以为算错了 */
.star-boost {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 5px;
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.16);
  border: 1px solid rgba(255, 215, 0, 0.45);
  color: #FFD700;
  font-size: 0.7rem;
  line-height: 1.6;
  vertical-align: 1px;
  cursor: help;
}

/* ---- 精灵详情弹窗 ---- */

.spirit-modal {
  position: relative;
  max-width: 420px;
  text-align: center;
}

.spirit-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #B0B0B0;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.spirit-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

/* 立绘是 1024×1024 的方图。限一下尺寸，不然矮屏幕上整张弹窗要滚动才能看完 */
.spirit-art {
  width: 100%;
  max-width: 300px;
  margin: 0 auto;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 45%, rgba(74, 144, 217, 0.22) 0%, rgba(26, 26, 46, 0.9) 70%);
  border: 1px solid rgba(74, 144, 217, 0.25);
  overflow: hidden;
}

.spirit-art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.spirit-name {
  margin-top: 1rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #FFD700;
}

.spirit-shiny-word {
  font-size: 0.9rem;
}

/* 弹窗里同一张「异色外观」图标，跟名字排在一行 */
.spirit-name .shiny-mark {
  width: 20px;
  height: 20px;
  margin-right: 0.35rem;
  vertical-align: -4px;
}

.spirit-no {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.spirit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
  margin-top: 0.75rem;
}

.spirit-tag {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  color: #B0B0B0;
}

/* 形态标签回答的是「这只是什么来头」，给个区分色；属性用蓝色 */
.spirit-tag.tag-form {
  background: rgba(255, 215, 0, 0.12);
  border-color: rgba(255, 215, 0, 0.35);
  color: #FFD700;
}

.spirit-tag.tag-type {
  background: rgba(74, 144, 217, 0.15);
  border-color: rgba(74, 144, 217, 0.4);
  color: #7FB2FF;
}

.spirit-star {
  margin-top: 0.85rem;
  font-size: 1.2rem;
  color: #7FB2FF;
}

.spirit-star-unit {
  margin-left: 0.3rem;
  font-size: 0.8rem;
  color: #B0B0B0;
}

.spirit-desc {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(74, 144, 217, 0.15);
  font-size: 0.88rem;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.75);
  text-align: left;
}

.spirit-desc-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
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
