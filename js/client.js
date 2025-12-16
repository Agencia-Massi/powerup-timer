var Promise = TrelloPowerUp.Promise

const API = 'https://miguel-powerup-trello.jcceou.easypanel.host'
const ASSETS = 'https://agencia-massi.github.io/powerup-timer'

const CACHE = {}
let LAST = 0
let WAIT = null
let IDS = new Set()
let RESOLVERS = []
let MEMBER = null
const TTL = 15000

function batch(cardId, memberId) {
  MEMBER = memberId
  IDS.add(cardId)

  if (CACHE[cardId] && Date.now() - LAST < TTL) {
    return Promise.resolve(CACHE[cardId])
  }

  return new Promise(resolve => {
    RESOLVERS.push(resolve)
    clearTimeout(WAIT)
    WAIT = setTimeout(fetchBatch, 150)
  })
}

function fetchBatch() {
  const ids = Array.from(IDS)
  IDS.clear()

  fetch(`${API}/timer/status/bulk?memberId=${MEMBER}&cardIds=${ids.join(',')}`)
    .then(r => r.json())
    .then(data => {
      LAST = Date.now()
      Object.assign(CACHE, data)
      RESOLVERS.forEach(r => r(data))
      RESOLVERS = []
    })
    .catch(() => {
      RESOLVERS.forEach(r => r({}))
      RESOLVERS = []
    })
}

function format(sec) {
  const m = Math.floor(sec / 60)
  return `${m} min`
}

TrelloPowerUp.initialize({

  'card-buttons': function (t) {
    return Promise.all([t.card('id'), t.member('all'), t.getContext()])
      .then(([card, member, ctx]) => {
        const cid = card.id
        const mid = ctx.member
        const name = member.fullName || 'Usuário'

        return batch(cid, mid).then(() => {
          const s = CACHE[cid] || {}
          if (s.isRunningHere) {
            return [{
              icon: `${ASSETS}/img/icon.svg`,
              text: 'Pausar',
              callback: () => fetch(`${API}/timer/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: mid, cardId: cid })
              }).then(() => t.set('board', 'shared', 'refresh', Math.random()))
            }]
          }

          return [{
            icon: `${ASSETS}/img/icon.svg`,
            text: 'Iniciar',
            callback: () => fetch(`${API}/timer/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId: mid, cardId: cid, memberName: name })
            }).then(() => t.set('board', 'shared', 'refresh', Math.random()))
          }]
        })
      })
  },

  'card-badges': function (t) {
    return t.card('id').then(c => {
      const cid = c.id
      const mid = t.getContext().member

      return batch(cid, mid).then(() => {
        const s = CACHE[cid]
        if (!s) return []

        if (s.activeTimerData) {
          const start = new Date(s.activeTimerData.startTime)
          const now = new Date()
          const current = Math.floor((now - start) / 1000)
          return [{
            text: format(current + (s.totalPastSeconds || 0)),
            refresh: 60
          }]
        }

        if (s.totalPastSeconds > 0) {
          return [{ text: format(s.totalPastSeconds), refresh: 60 }]
        }

        return []
      })
    })
  }

})
