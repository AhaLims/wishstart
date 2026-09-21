<template>
  <div class="draw">
    <h1 class="page-title">抽卡</h1>

    <!-- 星星和抽卡次数显示 -->
    <div class="draw-counts">
      <div class="count-card">
        <span class="count-icon">⭐</span>
        <div class="count-info">
          <div class="count-value number">{{ stats?.currentStars || 0 }}</div>
          <div class="count-label">可用星星</div>
        </div>
      </div>

      <div class="count-card">
        <span class="count-icon">🎲</span>
        <div class="count-info">
          <div class="count-value number">{{ stats?.diceCount || 0 }}</div>
          <div class="count-label">掷骰子次数</div>
        </div>
      </div>

      <div class="count-card">
        <span class="count-icon">🎴</span>
        <div class="count-info">
          <div class="count-value number">{{ stats?.drawCount || 0 }}</div>
          <div class="count-label">免费抽卡次数</div>
        </div>
      </div>

      <div class="count-card">
        <span class="count-icon">💰</span>
        <div class="count-info">
          <div class="count-value number">{{ stats?.halfDrawCount || 0 }}</div>
          <div class="count-label">半价抽卡次数</div>
        </div>
      </div>
    </div>

    <!-- 抽卡区域 -->
    <div class="draw-area">
      <!-- 消耗方式不用选，系统按资源自动挑一档，这里只提前说明会用哪一档 -->
      <div class="draw-mode" :class="{ 'draw-mode-empty': !canDraw }">
        <template v-if="canDraw">
          <span class="mode-label">本次抽卡</span>
          <span class="mode-name">{{ nextDrawMode.label }}</span>
          <span class="mode-cost">{{ nextDrawMode.cost }}</span>
        </template>
        <template v-else>
          <span class="mode-label">暂时抽不了</span>
          <span class="mode-cost">抽卡次数和星星都不够，先去完成任务攒一点吧</span>
        </template>
      </div>
      <p v-if="canDraw" class="hint mode-hint">优先用免费的，没有免费次数就用半价，都没有才全价 5 ⭐</p>

      <button
        class="btn btn-primary draw-btn"
        :disabled="!canDraw || isDrawing"
        @click="doDraw"
      >
        {{ isDrawing ? '抽卡中...' : '开始抽卡' }}
      </button>
    </div>

    <!-- 线下抽卡不在这里记了，改在愿望页对应愿望的卡片上「补记碎片」 -->

    <!-- 抽卡结果 -->
    <div v-if="lastResult" class="result-card">
      <h3>🎉 抽卡结果</h3>
      <div class="result-wish">{{ lastResult.wishName }}</div>
      <div class="result-fragments">
        获得碎片：{{ fragmentsText(lastResult) }}
      </div>
      <div v-if="lastResult.isReady" class="complete-badge">
        🎊 愿望已集满，可以合成了！
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { drawApi } from '../api'

const userStore = useUserStore()
const isDrawing = ref(false)
const lastResult = ref(null)

const stats = computed(() => userStore.stats)

// 消耗方式由后端按当前资源自动决定，前端这里只是提前算一遍给用户看。
// 规则必须和后端 pickDrawMode 保持一致：免费 → 半价 → 全价
const nextDrawMode = computed(() => {
  const stars = stats.value?.currentStars || 0
  const free = stats.value?.drawCount || 0
  const half = stats.value?.halfDrawCount || 0

  if (free >= 1) {
    return { label: '免费抽卡', cost: `1次抽卡次数（还有 ${free} 次）`, affordable: true }
  }
  if (half >= 1 && stars >= 3) {
    return { label: '半价抽卡', cost: '3 ⭐ + 1次半价次数', affordable: true }
  }
  if (stars >= 5) {
    return { label: '全价抽卡', cost: '5 ⭐', affordable: true }
  }
  return { label: '', cost: '', affordable: false }
})

// 抽卡按钮是否可用：三档里有一档用得起就行
const canDraw = computed(() => nextDrawMode.value.affordable)

// 碎片展示：通用愿望（无上限）只显示当前数量，不带分母
const fragmentsText = (w) => {
  if (!w) return ''
  const current = parseInt(w.current_fragments ?? w.currentFragments) || 0
  const total = parseInt(w.total_fragments ?? w.totalFragments) || 0
  return total > 0 ? `${current}/${total}` : `${current}`
}

const doDraw = async () => {
  isDrawing.value = true

  try {
    const res = await drawApi.draw({
      userId: userStore.userId,
      type: 'stars'
    })

    if (res.code === 0) {
      lastResult.value = res.data
      await userStore.fetchStats()
    } else {
      alert(res.message || '抽卡失败')
    }
  } catch (error) {
    alert('抽卡失败')
  } finally {
    isDrawing.value = false
  }
}

onMounted(() => {
  userStore.fetchStats()
})
</script>

<style scoped>
.draw-counts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.count-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
}

.count-icon {
  font-size: 1.5rem;
}

.count-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.count-label {
  color: #B0B0B0;
  font-size: 0.9rem;
}

.draw-area {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 2rem;
  border: 1px solid rgba(74, 144, 217, 0.2);
  text-align: center;
}

.draw-type-selector {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.type-btn {
  padding: 0.75rem 1.5rem;
  border-radius: 12px;
  border: 1px solid rgba(74, 144, 217, 0.3);
  background: transparent;
  color: #B0B0B0;
  cursor: pointer;
  transition: all 0.3s ease;
}

.type-btn.active {
  background: rgba(74, 144, 217, 0.2);
  color: #fff;
  border-color: #4A90D9;
}

/* 消耗方式提示条：不让人选，只说明这次会用哪一档 */
.draw-mode {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(26, 26, 46, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.35);
  border-radius: 10px;
}

.draw-mode-empty {
  border-color: rgba(255, 255, 255, 0.12);
}

.draw-mode .mode-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.draw-mode .mode-name {
  color: #4A90D9;
  font-weight: 700;
}

.draw-mode .mode-cost {
  margin-left: auto;
  color: #FFD700;
  font-size: 0.9rem;
}

.draw-mode-empty .mode-label {
  color: #FFD700;
  font-weight: 700;
}

.draw-mode-empty .mode-cost {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

/* 抽卡区整体是居中的，但这条是对上面那个框的注解，贴左边读起来才跟得住 */
.mode-hint {
  margin-bottom: 1.5rem;
  text-align: left;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
}

.count-badge {
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  background: rgba(74, 144, 217, 0.2);
  border-radius: 4px;
  font-size: 0.9rem;
}

.draw-btn {
  padding: 1rem 3rem;
  font-size: 1.2rem;
}

.result-card {
  margin-top: 2rem;
  background: rgba(22, 33, 62, 0.8);
  border-radius: 16px;
  padding: 2rem;
  text-align: center;
  border: 1px solid rgba(155, 89, 182, 0.3);
}

.result-card h3 {
  color: #9B59B6;
  margin-bottom: 1rem;
}

.result-wish {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.result-fragments {
  color: #B0B0B0;
  margin-bottom: 1rem;
}

.complete-badge {
  color: #FFD700;
  font-weight: 700;
  font-size: 1.1rem;
}

@media (max-width: 768px) {
  .draw-counts {
    grid-template-columns: 1fr;
  }
}
</style>
