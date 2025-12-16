var t = TrelloPowerUp.iframe()
const API = 'https://miguel-powerup-trello.jcceou.easypanel.host'

function getParam(name) {
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function parseTime(str) {
  const parts = str.split(':').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

const cardId = getParam('cardId')

function loadLogs() {
  fetch(`${API}/timer/logs/${cardId}`)
    .then(r => r.json())
    .then(data => {
      const tbody = document.getElementById('logsTableBody')
      tbody.innerHTML = ''

      if (!data.logs.length) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum registro</td></tr>'
        return
      }

      data.logs.forEach((log, index) => {
        const tr = document.createElement('tr')

        tr.innerHTML = `
          <td>${log.memberName}</td>
          <td>${new Date(log.date).toLocaleTimeString()}</td>
          <td>${formatTime(log.duration)}</td>
          <td>
            <button class="btn-edit" data-log-id="${log.id}">Editar</button>
            <button class="btn-delete" data-log-id="${log.id}">Excluir</button>
          </td>
        `

        tbody.appendChild(tr)
      })

      document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const logId = btn.dataset.logId
          editLog(logId)
        })
      })

      document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const logId = btn.dataset.logId
          deleteLog(logId)
        })
      })

      document.getElementById('timeLimit').value = data.timeLimit || ''
    })
}

function editLog(logId) {
  const value = prompt('Digite o tempo (HH:MM:SS)')
  if (!value) return

  const seconds = parseTime(value)
  if (seconds === null) {
    alert('Formato inválido')
    return
  }

  fetch(`${API}/timer/logs/${logId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: seconds })
  })
    .then(() => {
      loadLogs()
      t.set('board', 'shared', 'refresh', Math.random())
    })
}

function deleteLog(logId) {
  if (!confirm('Excluir registro?')) return

  fetch(`${API}/timer/logs/${logId}`, { method: 'DELETE' })
    .then(() => {
      loadLogs()
      t.set('board', 'shared', 'refresh', Math.random())
    })
}

function saveSettings() {
  const value = document.getElementById('timeLimit').value

  fetch(`${API}/timer/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, timeLimit: value })
  }).then(() => alert('Configuração salva'))
}

document.addEventListener('DOMContentLoaded', () => {
  loadLogs()
  document.getElementById('btnSaveConfig').addEventListener('click', saveSettings)
})
