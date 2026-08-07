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
          <div class="count-value number">{{ stats?.halfDrawCount || 0 }}</div>
          <div class="count-label">掷骰子次数</div>
        </div>
      </div>
    </div>

    <!-- 抽卡区域 -->
    <div class="draw-area">
      <!-- 抽卡价格选择 -->
      <div class="price-info">
        <div class="price-option">
          <label class="price-label">
            <input type="radio" v-model="drawType" value="normal" />
            <span>全价抽卡</span>
            <span class="price">5 ⭐</span>
          </label>
        </div>
        <div class="price-option">
          <label class="price-label">
            <input type="radio" v-model="drawType" value="half" />
            <span>半价抽卡</span>
            <span class="price">3 ⭐ + 1次半价次数</span>
          </label>
        </div>
      </div>

      <button
        class="btn btn-primary draw-btn"
        :disabled="!canDraw || isDrawing"
        @click="doDraw"
      >
        {{ isDrawing ? '抽卡中...' : '开始抽卡' }}
      </button>
    </div>

    <!-- 抽卡结果 -->
    <div v-if="lastResult" class="result-card">
      <h3>🎉 抽卡结果</h3>
      <div class="result-wish">{{ lastResult.wishName }}</div>
      <div class="result-fragments">
        获得碎片：{{ lastResult.currentFragments }} / {{ lastResult.totalFragments }}
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
const drawType = ref('normal')
const isDrawing = ref(false)
const lastResult = ref(null)

const stats = computed(() => userStore.stats)

const canDraw = computed(() => {
  if (drawType.value === 'normal') {
    // 全价抽卡：5颗星星
    return (stats.value?.currentStars || 0) >= 5
  } else {
    // 半价抽卡：3颗星星 + 1次半价抽卡次数
    return (stats.value?.currentStars || 0) >= 3 && (stats.value?.halfDrawCount || 0) >= 1
  }
})

const doDraw = async () => {
  isDrawing.value = true

  try {
    const res = await drawApi.draw({
      userId: userStore.userId,
      type: 'stars',
      drawType: drawType.value
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

.price-info, .count-options {
  margin-bottom: 1.5rem;
}

.price-option, .count-option {
  display: block;
  padding: 0.75rem;
  margin: 0.5rem 0;
  background: rgba(26, 26, 46, 0.8);
  border-radius: 8px;
  cursor: pointer;
}

.price-label, .count-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.price-label input, .count-option input {
  accent-color: #4A90D9;
}

.price-label .price {
  margin-left: auto;
  color: #FFD700;
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
