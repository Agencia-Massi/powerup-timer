var Promise = TrelloPowerUp.Promise

const API = 'https://miguel-powerup-trello.jcceou.easypanel.host'
const ASSETS = 'https://agencia-massi.github.io/powerup-timer'

const CACHE = {}
let LAST_FETCH = 0
const TTL = 10000

let DEBOUNCE = null
let QUEUE = new Set()
let RESOLVERS = {}

function fetchBatch(memberId) {
  const ids = Array.from(QUEUE)
  QUEUE.clear()

  if (!ids.length) return

  fetch(`${API}/timer/status/bulk?memberId=${memberId}&cardIds=${ids.join(',')}`)
    .then(r => r.json())
    .then(data => {
      LAST_FETCH = Date.now()
      Object.assign(CACHE, data)

      ids.forEach(id => {
        if (RESOLVERS[id]) {
          RESOLVERS[id]()
          delete RESOLVERS[id]
        }
      })
    })
    .catch(() => {
      ids.forEach(id => {
        if (RESOLVERS[id]) {
          RESOLVERS[id]()
          delete RESOLVERS[id]
        }
      })
    })
}

function getStatus(cardId, memberId) {
  QUEUE.add(cardId)

  if (CACHE[cardId] && Date.now() - LAST_FETCH < TTL) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    RESOLVERS[cardId] = resolve
    clearTimeout(DEBOUNCE)
    DEBOUNCE = setTimeout(() => fetchBatch(memberId), 150)
  })
}

function formatMinutes(seconds) {
  return Math.floor(seconds / 60) + ' min'
}

function invalidateCache(cardId) {
  delete CACHE[cardId]
  LAST_FETCH = 0
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

        if (status.isRunningHere) {
          return [{
            icon: `${ASSETS}/img/icon.svg`,
            text: 'Pausar',
            callback: () =>
              fetch(`${API}/timer/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId, cardId })
              }).then(() => {
                invalidateCache(cardId)
                return t.set('board', 'shared', 'refresh', Math.random())
              })
          }]
        }

        return [{
          icon: `${ASSETS}/img/icon.svg`,
          text: status.isOtherTimerRunning ? 'Iniciar (pausa outro)' : 'Iniciar',
          callback: () =>
            fetch(`${API}/timer/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId, cardId, memberName })
            }).then(() => {
              invalidateCache(cardId)
              return t.set('board', 'shared', 'refresh', Math.random())
            })
        }]
      })
    })
  },

  'card-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = card.id
      const memberId = t.getContext().member

      return getStatus(cardId, memberId).then(() => {
        const status = CACHE[cardId]

        if (!status) {
          return [{
            text: '--',
            refresh: 30
          }]
        }

        if (status.activeTimerData) {
          const start = new Date(status.activeTimerData.startTime)
          const now = new Date()
          const running = Math.floor((now - start) / 1000)
          const total = running + (status.totalPastSeconds || 0)

          return [{
            text: formatMinutes(total),
            color: 'green',
            refresh: 60
          }]
        }

        if (status.totalPastSeconds > 0) {
          return [{
            text: formatMinutes(status.totalPastSeconds),
            color: 'green',
            refresh: 60
          }]
        }

        return [{
          text: '--',
          refresh: 60
        }]
      })
    })
  }

})
