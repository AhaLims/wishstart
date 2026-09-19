<template>
  <div class="settings">
    <h1 class="page-title">设置与同步</h1>

    <div class="card">
      <h3 class="card-title">双端数据同步</h3>
      <p class="card-desc">
        桌面端与网页端通过统一的 JSON 快照互通。导出后可在另一端「导入快照」恢复。
        导入为覆盖式，导入前会自动备份当前数据。
      </p>
      <div class="actions">
        <button class="btn btn-primary" @click="exportSnapshot">导出快照</button>
        <label class="btn btn-import">
          导入快照
          <input type="file" accept=".json,application/json" class="hidden-input" @change="onImportFile" />
        </label>
      </div>
      <div v-if="importing" class="import-status">正在导入…</div>
      <div v-if="importResult" class="import-status success">导入完成：{{ importResult }}</div>
      <div v-if="importError" class="import-status error">导入失败：{{ importError }}</div>
    </div>

    <div v-if="dataPath" class="card">
      <h3 class="card-title">本地数据</h3>
      <p class="card-desc">桌面端数据保存在下面的文件里，备份时直接复制该文件即可。</p>
      <div class="data-path">{{ dataPath }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { syncApi } from '../api'

const importing = ref(false)
const importResult = ref('')
const importError = ref('')
const dataPath = ref('')

const desktopApi = window.wishstarDesktop || null

onMounted(async () => {
  if (desktopApi && desktopApi.getDataPath) {
    try {
      dataPath.value = await desktopApi.getDataPath()
    } catch (error) {
      console.error('获取数据路径失败:', error)
    }
  }
})

async function exportSnapshot() {
  try {
    const res = await syncApi.exportSnapshot()
    if (res.code !== 0) {
      alert(res.message || '导出失败')
      return
    }
    const json = JSON.stringify(res.data, null, 2)
    const fileName = `wishstar-snapshot-${new Date().toISOString().slice(0, 10)}.json`

    if (desktopApi && desktopApi.saveFile) {
      const saved = await desktopApi.saveFile(json, fileName)
      if (saved) alert('快照已导出')
      return
    }

    // 网页端：浏览器下载
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    alert('快照已导出')
  } catch (error) {
    alert('导出失败')
  }
}

async function onImportFile(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return
  event.target.value = ''

  try {
    const text = await file.text()
    const snapshot = JSON.parse(text)
    importing.value = true
    importResult.value = ''
    importError.value = ''

    const res = await syncApi.importSnapshot(snapshot)
    if (res.code === 0) {
      importResult.value = `已导入 ${res.data.imported} 个数据键`
    } else {
      importError.value = res.message || '导入失败'
    }
  } catch (error) {
    importError.value = '文件解析失败，请确认是导出的快照 JSON'
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.card {
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(74, 144, 217, 0.2);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  max-width: 640px;
}

.card-title {
  font-size: 1.15rem;
  margin-bottom: 0.5rem;
}

.card-desc {
  color: #B0B0B0;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  gap: 1rem;
}

.btn-import {
  cursor: pointer;
}

.hidden-input {
  display: none;
}

.import-status {
  margin-top: 1rem;
  color: #B0B0B0;
  font-size: 0.9rem;
}

.import-status.success {
  color: #2ECC71;
}

.import-status.error {
  color: #E74C3C;
}

.data-path {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: #B0B0B0;
  word-break: break-all;
}
</style>
