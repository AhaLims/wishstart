<template>
  <Transition name="toast-fade">
    <div v-if="notice" class="toast" :class="notice.type || 'success'">
      <div v-if="thumbVisible" class="toast-thumb">
        <img :src="notice.thumb" :alt="notice.title || ''" @error="thumbBroken = true" />
      </div>

      <div class="toast-body">
        <div v-if="notice.title" class="toast-title">{{ notice.title }}</div>
        <div class="toast-text">
          <span class="toast-content">{{ notice.text }}</span>
          <!-- 倍率小标（抽到精灵才有）。title 里是后端拆开的加成说明，见 docs 7.6/7.8 -->
          <span v-if="notice.badge" class="toast-badge" :title="notice.badge.title">
            {{ notice.badge.text }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// 全站共用的「下方小浮窗」：贴在屏幕底部中间，不挡任何操作，几秒后自己淡出。
//
// 三处提示都走它（任务完成 / 抽到精灵 / 补记碎片 + 转换），以前任务页和星光值页
// 各写了一份顶部内嵌卡（`.result-card` + `.result-fade`），两份都删了，见 docs 第 2 条。
//
// 状态由调用方持有（各页的 `notice` ref + 定时器），这个组件只管画和淡出：
// 各页的 notice 内容差别很大（精灵头像 / 倍率 / 奖励标签），把定时器和内容一起
// 塞进来反而要开一堆口子。各页那 5 行 `showNotice` 是照抄 Wishes.vue 的写法。
const props = defineProps({
  // { text, title?, thumb?, badge?: { text, title }, type?: 'success' | 'error' } | null
  notice: { type: Object, default: null }
})

// 头像加载失败（图没拷全）就整块不显示，留出占位宽度，不要一个破图。
// 每次换新提示都要复位 —— 不复位的话上一张失败会把后面所有提示的头像一起吃掉。
const thumbBroken = ref(false)
watch(() => props.notice, () => { thumbBroken.value = false })

const thumbVisible = computed(() => !!props.notice?.thumb && !thumbBroken.value)
</script>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 2rem;
  transform: translateX(-50%);
  z-index: 100;
  /* 固定定位且不给 width 时是 shrink-to-fit 尺寸，算出来的宽度比内容需要的窄，
     长文案会多折好几行（变成一根竖条）。max-content 让它按内容撑开，
     再由 max-width 兜住 —— 短文案还是一颗小药丸，长文案才占满可用宽度 */
  width: max-content;
  max-width: min(90vw, 480px);
  padding: 0.85rem 1.25rem;
  border-radius: 12px;
  background: rgba(22, 33, 62, 0.96);
  border: 1px solid rgba(74, 144, 217, 0.5);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

/* 抽到精灵时左边那格头像。固定 48px，不加头像的提示（任务完成等）整块不渲染，
   于是文字自然占满整条 —— 用 v-if 而不是留一个空盒子 */
.toast-thumb {
  width: 48px;
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.25);
}

.toast-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.toast-body {
  min-width: 0;
}

.toast-title {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.2rem;
  color: #2ECC71;
}

.toast-text {
  color: #E8E8E8;
}

/* 金额（+N 洛克贝 / +N 颗星星）那截要能选中、能被 tooltip 命中，
   所以倍率小标是兄弟节点而不是包在外面的容器上 */
.toast-content {
  word-break: break-word;
}

.toast-badge {
  margin-left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.15);
  color: #FFD700;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.toast.error {
  border-color: rgba(231, 76, 60, 0.6);
  color: #FF8A80;
}

.toast.error .toast-text {
  color: #FF8A80;
}

/* 淡出（0.5s）比淡入（0.2s）慢 —— 「慢慢消失」而不是啪一下没了。
   原来 Wishes.vue 那个提示条只有淡入、到点是 v-if 直接摘节点，这里补上淡出 */
.toast-fade-enter-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.toast-fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}
</style>
