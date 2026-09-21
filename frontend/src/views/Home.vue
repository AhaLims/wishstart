<template>
  <div class="home">
    <h1 class="page-title">欢迎回来！{{ userStore.userInfo?.name || '小伙伴' }}</h1>

    <!-- 资源展示 -->
    <div class="resources-grid">
      <div class="resource-card star-card">
        <div class="resource-icon">⭐</div>
        <div class="resource-info">
          <div class="resource-label">当前星星</div>
          <div class="resource-value number">{{ stats?.currentStars || 0 }}</div>
        </div>
      </div>

      <div class="resource-card dice-card">
        <div class="resource-icon">🎲</div>
        <div class="resource-info">
          <div class="resource-label">掷骰子次数</div>
          <div class="resource-value number">{{ stats?.diceCount || 0 }}</div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="quick-actions">
      <h2 class="section-title">快捷操作</h2>
      <div class="actions-grid">
        <button class="action-btn" @click="$router.push('/tasks')">
          <span class="action-icon">✓</span>
          <span class="action-text">完成任务</span>
        </button>
        <button class="action-btn" @click="showQuickRecord = true">
          <span class="action-icon">⚡</span>
          <span class="action-text">快速记录</span>
        </button>
        <button class="action-btn" @click="$router.push('/dice')">
          <span class="action-icon">🎲</span>
          <span class="action-text">掷骰子</span>
        </button>
        <button class="action-btn" @click="$router.push('/wishes')">
          <span class="action-icon">🎰</span>
          <span class="action-text">抽卡</span>
        </button>
      </div>
    </div>

    <!-- 快速记录弹框 -->
    <div v-if="showQuickRecord" class="modal-overlay" @click.self="showQuickRecord = false">
      <div class="modal">
        <h3 class="modal-title">快速记录</h3>
        <div class="form-group">
          <label class="label">任务名称</label>
          <input v-model="quickTaskName" class="input" placeholder="输入任务名称" />
        </div>
        <div class="form-group">
          <label class="label">获得星星</label>
          <input v-model.number="quickStars" type="number" class="input" placeholder="输入星星数量" />
        </div>
        <div class="form-group">
          <label class="label">任务类型</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" value="general" v-model="quickType" />
              ✅ 通用型
            </label>
            <label class="radio-label">
              <input type="radio" value="time" v-model="quickType" />
              ⏱ 时间型（星星计入掷骰子次数）
            </label>
          </div>

          <!-- 标成时间型才会折算工时。这里实时算一遍，省得去记录页才发现对不上 -->
          <p v-if="quickType === 'time'" class="quick-time-hint">
            本次 = <strong>{{ quickMinutesText }}</strong> 工时（1 颗星 = 25 分钟）
            <template v-if="isWeekendToday">
              <br />今天周末，星星会翻倍，但<b>工时按翻倍前的星数算</b>，不会跟着翻倍
            </template>
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="submitQuickRecord">提交</button>
          <button class="btn" @click="showQuickRecord = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '../stores/user'
import { recordApi } from '../api'

const userStore = useUserStore()
const showQuickRecord = ref(false)
const quickTaskName = ref('')
const quickStars = ref(5)
// 只有时间型的星星能换掷骰子次数，所以快速记录也得说清楚是哪一型
const quickType = ref('general')

const stats = computed(() => userStore.stats)

// ---- 快速记录的工时预览 ----
//
// 规则跟后端 records.js 的 minutesOf() 必须一致，不然预览和记录页会对不上：
//   - 只有标成「时间型」的才折算工时
//   - 1 颗星 = 25 分钟
//   - 周末星星翻倍，但那是奖励不是工时，要按翻倍前的星数算

// 今天是不是周末。用本地日期，跟后端 completions.js 的 now.getDay() 是同一套。
const isWeekendToday = computed(() => {
  const day = new Date().getDay()
  return day === 0 || day === 6
})

const quickMinutes = computed(() => {
  if (quickType.value !== 'time') return 0
  return Math.max(0, parseInt(quickStars.value) || 0) * 25
})

// 跟记录页一个格式：1h15min / 1h / 25min
const quickMinutesText = computed(() => {
  const m = quickMinutes.value
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h > 0) return rest > 0 ? `${h}h${rest}min` : `${h}h`
  return `${rest}min`
})

onMounted(async () => {
  await userStore.initUser()
  await userStore.fetchStats()
})

const submitQuickRecord = async () => {
  if (!quickTaskName.value || !quickStars.value) return

  try {
    const res = await recordApi.quickRecord({
      userId: userStore.userId,
      taskName: quickTaskName.value,
      stars: quickStars.value,
      recordType: quickType.value
    })

    if (res.code === 0) {
      showQuickRecord.value = false
      quickTaskName.value = ''
      quickStars.value = 5
      quickType.value = 'general'
      await userStore.fetchStats()
    } else {
      alert(res.message || '记录失败')
    }
  } catch (error) {
    alert('记录失败')
  }
}
</script>

<style scoped>
.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.resource-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.resource-icon {
  font-size: 2.5rem;
}

.star-card .resource-icon {
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
}

.dice-card .resource-icon {
  text-shadow: 0 0 20px rgba(74, 144, 217, 0.5);
}

.resource-label {
  color: #B0B0B0;
  font-size: 0.9rem;
}

.resource-value {
  font-size: 2rem;
  font-weight: 700;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 1rem;
  color: #B0B0B0;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.action-btn {
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.3);
  border-radius: 12px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.action-btn:hover {
  background: rgba(74, 144, 217, 0.2);
  transform: translateY(-2px);
}

.action-icon {
  font-size: 2rem;
}

.action-text {
  color: #B0B0B0;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
}

/* 工时预览：是注解不是表单，所以压小、压暗，别抢上面的输入框 */
.quick-time-hint {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.quick-time-hint strong {
  color: #7FB2FF;
}

@media (max-width: 768px) {
  .resources-grid, .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
