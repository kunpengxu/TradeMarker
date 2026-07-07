const TORONTO_TIME_ZONE = 'America/Toronto'

export const byteSize = (text) => new Blob([String(text || '')]).size

export function formatTorontoFileStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`
}

export function downloadTextFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadJsonFile(filename, data) {
  downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8')
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

export function analysisPackageFilenames(mode, date = new Date()) {
  const cleanMode = String(mode || 'quick').toLowerCase()
  const stamp = formatTorontoFileStamp(date)
  return {
    snapshot: `trademarker-ai-${cleanMode}-${stamp}.json`,
    prompt: `prompt-${cleanMode}-${stamp}.txt`,
    metadata: `metadata-${cleanMode}-${stamp}.json`,
  }
}
