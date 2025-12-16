var Promise = TrelloPowerUp.Promise

const API = 'https://miguel-powerup-trello.jcceou.easypanel.host'
const ASSETS = 'https://agencia-massi.github.io/powerup-timer'

const CACHE = {}
let LAST_FETCH = 0
const TTL = 15000

let DEBOUNCE = null
let QUEUE = new Set()
let RESOLVERS = []
let CURRENT_MEMBER = null

function forceRefresh(t) {
  LAST_FETCH = 0
  return Promise.all([
    t.set('board', 'shared', 'refresh', Math.random()),
    t.set('card', 'shared', 'refresh', Math.random())
  ])
}

function formatMinutes(seconds) {
  if (seconds < 0) seconds = 0
  return Math.floor(seconds / 60) + ' min'
}

function formatTimeFull(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0
  var h = Math.floor(totalSeconds / 3600)
  var m = Math.floor((totalSeconds % 3600) / 60)
  var s = Math.floor(totalSeconds % 60)
  var hh = h > 0 ? h + ':' : ''
  var mm = (m < 10 ? '0' : '') + m
  var ss = (s < 10 ? '0' : '') + s
  return hh + mm + ':' + ss
}

function fetchBatch() {
  const ids = Array.from(QUEUE)
  QUEUE.clear()
  if (!ids.length) return

  fetch(`${API}/timer/status/bulk?memberId=${CURRENT_MEMBER}&cardIds=${ids.join(',')}`)
    .then(r => r.json())
    .then(data => {
      LAST_FETCH = Date.now()
      ids.forEach(id => {
        CACHE[id] = data[id] || null
      })
      RESOLVERS.forEach(r => r())
      RESOLVERS = []
    })
    .catch(() => {
      RESOLVERS.forEach(r => r())
      RESOLVERS = []
    })
}

function getStatus(cardId, memberId) {
  CURRENT_MEMBER = memberId
  QUEUE.add(cardId)

  if (CACHE[cardId] && Date.now() - LAST_FETCH < TTL) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    RESOLVERS.push(resolve)
    clearTimeout(DEBOUNCE)
    DEBOUNCE = setTimeout(fetchBatch, 150)
  })
}

TrelloPowerUp.initialize({

  'card-buttons': function (t) {
    return Promise.all([
      t.card('id'),
      t.member('all'),
      t.getContext()
    ]).then(([card, member, ctx]) => {
      const cardId = card.id
      const memberId = ctx.member
      const memberName = member.fullName || 'Usuário'

      return getStatus(cardId, memberId).then(() => {
        const status = CACHE[cardId] || {}
        let timerBtn

        if (status.isRunningHere) {
          timerBtn = {
            icon: `${ASSETS}/img/icon.svg`,
            text: 'Pausar Timer',
            callback: () =>
              fetch(`${API}/timer/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, cardId })
              })
              .then(r => r.json())
              .then(data =>
                forceRefresh(t).then(() =>
                  t.alert({
                    message: `⏸️ Pausado: ${formatTimeFull(data.newTotalSeconds)}`,
                    duration: 3,
                    display: 'success'
                  })
                )
              )
          }
        } else {
          timerBtn = {
            icon: `${ASSETS}/img/icon.svg`,
            text: status.isOtherTimerRunning ? 'Iniciar (pausa outro)' : 'Iniciar Timer',
            callback: () =>
              fetch(`${API}/timer/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, cardId, memberName })
              }).then(() =>
                forceRefresh(t).then(() =>
                  t.alert({
                    message: '⏱️ Timer iniciado',
                    duration: 2,
                    display: 'info'
                  })
                )
              )
          }
        }

        const settingsBtn = {
          icon: `${ASSETS}/img/settings.svg`,
          text: 'Configurar / Logs',
          callback: () =>
            t.modal({
              title: 'Gestão de Tempo',
              url: `${ASSETS}/dashboard/dashboard.html?cardId=${cardId}`,
              accentColor: '#0079BF',
              height: 500,
              fullscreen: false
            })
        }

        return [timerBtn, settingsBtn]
      })
    })
  },

  'card-badges': function (t) {
    return t.card('id').then(card => {
      const status = CACHE[card.id]
      if (!status) return []

      if (status.activeTimerData) {
        let startStr = status.activeTimerData.startTime
        if (!startStr.endsWith('Z')) startStr += 'Z'
        const start = new Date(startStr)
        const now = new Date()
        const running = Math.floor((now - start) / 1000)
        const total = running + (status.totalPastSeconds || 0)

        let label = '⏱️ '
        if (!status.isRunningHere) {
          label = `👤 ${status.activeTimerData.memberName}: `
        }

        return [{
          text: label + formatMinutes(total),
          color: 'green',
          refresh: 60
        }]
      }

      if (status.totalPastSeconds > 0) {
        return [{
          text: '⏸️ ' + formatMinutes(status.totalPastSeconds),
          color: 'light-gray',
          refresh: 60
        }]
      }

      return []
    })
  },

  'card-detail-badges': function (t) {
    return t.card('id').then(card => {
      const status = CACHE[card.id]
      if (!status || !status.activeTimerData) return []

      let startStr = status.activeTimerData.startTime
      if (!startStr.endsWith('Z')) startStr += 'Z'
      const start = new Date(startStr)
      const now = new Date()
      const running = Math.floor((now - start) / 1000)
      const total = running + (status.totalPastSeconds || 0)

      return [{
        title: 'Tempo Total',
        text: formatMinutes(total),
        color: 'green',
        refresh: 60
      }]
    })
  }

})
