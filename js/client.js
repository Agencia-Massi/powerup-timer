var Promise = TrelloPowerUp.Promise;

const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';
const GITHUB_PAGES_BASE = 'https://agencia-massi.github.io/powerup-timer';

const STATUS_CACHE = {};
let LAST_FETCH_TIME = 0;
const CACHE_TTL = 15000;

let debounceTimer = null;
let pendingResolveFunctions = [];
let collectedCardIds = new Set();
let currentMemberId = null;

function getSafeId(obj) {
  if (typeof obj === 'object' && obj !== null) return obj.id || JSON.stringify(obj);
  return obj;
}

function getSafeName(memberObj) {
  if (!memberObj) return 'Usuário Trello';
  if (typeof memberObj === 'string') return memberObj;
  return memberObj.fullName || memberObj.username || 'Usuário Trello';
}

function formatTime(totalSeconds) {
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = Math.floor(totalSeconds % 60);
  return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function callBackend(endpoint, method, body = null) {
  return fetch(`${NODE_API_BASE_URL}/${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null
  }).then(r => r.json());
}

function forceGlobalRefresh(t) {
  LAST_FETCH_TIME = 0;
  return Promise.all([
    t.set('board', 'shared', 'refresh', Math.random()),
    t.set('card', 'shared', 'refresh', Math.random())
  ]);
}

function getBatchStatus(cardId, memberId) {
  currentMemberId = memberId;
  collectedCardIds.add(cardId);

  const now = Date.now();
  if (STATUS_CACHE[cardId] && now - LAST_FETCH_TIME < CACHE_TTL) {
    return Promise.resolve(STATUS_CACHE[cardId]);
  }

  return new Promise(resolve => {
    pendingResolveFunctions.push(resolve);

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const ids = Array.from(collectedCardIds);
      const resolvers = [...pendingResolveFunctions];

      collectedCardIds.clear();
      pendingResolveFunctions = [];
      debounceTimer = null;

      fetch(`${NODE_API_BASE_URL}/timer/status/bulk?memberId=${currentMemberId}&cardIds=${ids.join(',')}`)
        .then(r => r.json())
        .then(data => {
          LAST_FETCH_TIME = Date.now();
          Object.assign(STATUS_CACHE, data);
          resolvers.forEach(fn => fn(data));
        })
        .catch(() => resolvers.forEach(fn => fn({})));
    }, 150);
  });
}

TrelloPowerUp.initialize({
  'card-buttons': function (t) {
    return Promise.all([t.card('id'), t.member('all'), t.getContext()])
      .then(([cardObj, memberObj, context]) => {
        const cardId = getSafeId(cardObj.id);
        const memberId = getSafeId(context.member);
        const memberName = getSafeName(memberObj);

        return getBatchStatus(cardId, memberId).then(() => {
          const status = STATUS_CACHE[cardId] || {};
          const buttons = [];

          if (status.isRunningHere) {
            buttons.push({
              icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
              text: 'Pausar Timer',
              callback: () => callBackend('timer/stop', 'POST', { memberId, cardId })
                .then(d => forceGlobalRefresh(t).then(() => {
                  t.alert({ message: `Pausado: ${formatTime(d.newTotalSeconds)}`, duration: 3 });
                }))
            });
          } else {
            buttons.push({
              icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
              text: status.isOtherTimerRunning ? 'Iniciar (Pausará Outro)' : 'Iniciar Timer',
              callback: () => callBackend('timer/start', 'POST', { memberId, cardId, memberName })
                .then(() => forceGlobalRefresh(t))
            });
          }

          buttons.push({
            icon: `${GITHUB_PAGES_BASE}/img/settings.svg`,
            text: 'Configurar Limite',
            callback: () => t.modal({
              title: 'Gestão do Cartão',
              url: `${GITHUB_PAGES_BASE}/dashboard/dashboard.html?cardId=${cardId}`,
              height: 500
            })
          });

          return buttons;
        });
      });
  }
});
