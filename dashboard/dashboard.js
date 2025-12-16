var t = TrelloPowerUp.iframe()
const API = 'https://miguel-powerup-trello.jcceou.easypanel.host'

function formatTime(seconds) {
  var h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  var m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  var s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function loadDashboardData() {
  fetch(`${API}/timer/logs/${cardId}`)
    .then(r => r.json())
    .then(data => {
      const tbody = document.getElementById('logsTableBody')
      tbody.innerHTML = ''

      if (!data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum registro</td></tr>'
        return
      }

      data.logs.forEach(log => {
        const tr = document.createElement('tr')

        tr.innerHTML = `
          <td>${log.member_name || 'Usuário'}</td>
          <td>${new Date(log.date).toLocaleTimeString()}</td>
          <td>${formatTime(log.duration)}</td>
          <td>
            <button class="btn-edit" data-log-id="${log.id}" data-duration="${log.duration}">Editar</button>
            <button class="btn-delete" data-log-id="${log.id}">Excluir</button>
          </td>
        `

        tbody.appendChild(tr)
      })

      document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.logId
          const current = formatTime(btn.dataset.duration)
          const input = prompt('HH:MM:SS', current)
          if (!input) return

          const p = input.split(':').map(Number)
          if (p.length !== 3) return alert('Formato inválido')

          const seconds = p[0] * 3600 + p[1] * 60 + p[2]

          fetch(`${API}/timer/logs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration: seconds })
          }).then(loadDashboardData)
        }
      })

      document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Excluir registro?')) return
          fetch(`${API}/timer/logs/${btn.dataset.logId}`, { method: 'DELETE' })
            .then(loadDashboardData)
        }
      })
    })
}

document.addEventListener('DOMContentLoaded', loadDashboardData)
