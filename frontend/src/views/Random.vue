<template>
  <div class="random-page">
    <h1 class="page-title">随机数</h1>

    <div class="card range-card">
      <div class="range-row">
        <div class="range-field">
          <label class="label">最小值</label>
          <input v-model="minInput" type="number" class="input" @keyup.enter="roll" />
        </div>
        <span class="range-dash">~</span>
        <div class="range-field">
          <label class="label">最大值</label>
          <input v-model="maxInput" type="number" class="input" @keyup.enter="roll" />
        </div>
      </div>

      <p class="range-note" :class="{ 'range-note-error': error }">
        {{ error || rangeNote }}
      </p>

      <button class="btn btn-warning roll-btn" :disabled="!!error" @click="roll">
        🎲 抽一个
      </button>
    </div>

    <div v-if="result !== null" class="card result-card">
      <div class="result-label">抽到的数</div>
      <!-- 换 key 让每次结果都重播一遍弹出动画 -->
      <div :key="rollCount" class="result-value number">{{ result }}</div>
    </div>

    <p class="footnote">
      实验性功能：纯本地计算，不消耗星星，也不记入流水和记录。
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const minInput = ref('1')
const maxInput = ref('100')
const result = ref(null)
const rollCount = ref(0)

// 本次抽卡的跨度上限。随机数取 53 位精度，所以结果个数不能超过 2^53
const MAX_RANGE = 2 ** 53

// 把输入解析成 { min, max }，不合法时给出 { error }
const parsed = computed(() => {
  if (minInput.value === '' || maxInput.value === '') {
    return { error: '最小值和最大值都要填' }
  }

  const min = Number(minInput.value)
  const max = Number(maxInput.value)

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return { error: '只能填整数' }
  }
  if (min > max) {
    return { error: '最小值不能大于最大值' }
  }
  if (max - min + 1 > MAX_RANGE) {
    return { error: '范围太大，跨度最多 2^53' }
  }

  return { min, max }
})

const error = computed(() => parsed.value.error || '')

const rangeNote = computed(() => {
  const { min, max } = parsed.value
  return `范围 ${min} ~ ${max}，共 ${max - min + 1} 个数，两端都算在内，每个数概率相同`
})

// 取一个 [0, 2^53) 的均匀随机整数
function random53() {
  const buf = new Uint32Array(2)
  crypto.getRandomValues(buf)
  // 第一个数占高 32 位，第二个数取高 21 位补足，拼成 53 位
  return buf[0] * 2 ** 21 + (buf[1] >>> 11)
}

// 含两端的均匀随机整数。
// 用拒绝采样而不是直接取模：range 通常除不尽 2^53，直接 % 会让靠前的几个数
// 概率略高一点点。这里把落在末尾不完整区间的值丢掉重抽，保证严格等概率。
function randomIntInclusive(min, max) {
  const range = max - min + 1
  const limit = Math.floor(MAX_RANGE / range) * range
  let v
  do {
    v = random53()
  } while (v >= limit)
  return min + (v % range)
}

const roll = () => {
  if (error.value) return
  const { min, max } = parsed.value
  result.value = randomIntInclusive(min, max)
  rollCount.value++
}
</script>

<style scoped>
.random-page {
  max-width: 560px;
}

.range-card {
  margin-bottom: 1.5rem;
}

.range-row {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}

.range-field {
  flex: 1;
  min-width: 0;
}

.range-dash {
  padding-bottom: 0.9rem;
  color: #B0B0B0;
}

.range-note {
  margin: 0.9rem 0 1.2rem;
  font-size: 0.85rem;
  color: #B0B0B0;
  text-align: center;
}

.range-note-error {
  color: #E74C3C;
}

.roll-btn {
  width: 100%;
}

.result-card {
  text-align: center;
  margin-bottom: 1.5rem;
}

.result-label {
  font-size: 0.85rem;
  color: #B0B0B0;
  margin-bottom: 0.5rem;
}

.result-value {
  font-size: 4rem;
  line-height: 1.1;
  color: #FFD700;
  text-shadow: 0 0 24px rgba(255, 215, 0, 0.35);
  animation: pop 0.28s ease-out;
  word-break: break-all;
}

@keyframes pop {
  from {
    transform: scale(0.75);
    opacity: 0.3;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.footnote {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}
</style>
