/* global TrelloPowerUp */
var Promise = TrelloPowerUp.Promise;

/* ==============================
   CONFIG
================================ */
const NODE_API_BASE_URL = 'https://miguel-powerup-trello.jcceou.easypanel.host';
const GITHUB_PAGES_BASE = 'https://agencia-massi.github.io/powerup-timer';

/* ==============================
   CACHE GLOBAL
================================ */
const STATUS_CACHE = {};
let LAST_SYNC = 0;
const POLL_INTERVAL = 5000; // 5 segundos

let CURRENT_MEMBER = null;
let CURRENT_CARDS = [];

/* ==============================
   HELPERS
================================ */
function getSafeId(obj) {
  if (typeof obj === 'object' && obj !== null) return obj.id;
  return obj;
}

/* ==============================
   BULK SYNC
================================ */
function syncStatus() {
  const now = Date.now();

  if (now - LAST_SYNC < POLL_INTERVAL) {
    return Promise.resolve();
  }

  if (!CURRENT_MEMBER || CURRENT_CARDS.length === 0) {
    return Promise.resolve();
  }

  LAST_SYNC = now;

  const url =
    `${NODE_API_BASE_URL}/timer/status/bulk` +
    `?memberId=${CURRENT_MEMBER}` +
    `&cardIds=${CURRENT_CARDS.join(',')}`;

  return fetch(url)
    .then(r => r.json())
    .then(data => {
      Object.assign(STATUS_CACHE, data);
    })
    .catch(() => {});
}

/* ==============================
   POWER-UP INIT
================================ */
TrelloPowerUp.initialize({

  /* ==========================
     CARD BUTTONS
  =========================== */
  'card-buttons': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) {
        CURRENT_CARDS.push(cardId);
      }

      return [{
        icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
        text: 'Timer',
        callback: function () {
          return t.modal({
            title: 'Timer do Cartão',
            url: `${GITHUB_PAGES_BASE}/dashboard/dashboard.html?cardId=${cardId}`,
            height: 500,
            fullscreen: false
          });
        }
      }];
    });
  },

  /* ==========================
     CARD BADGES
  =========================== */
  'card-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) {
        CURRENT_CARDS.push(cardId);
      }

      return syncStatus().then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status) return [];

        if (status.activeTimerData) {
          return [{
            text: '⏱️ em andamento',
            color: 'green',
            refresh: 60
          }];
        }

        if (status.totalPastSeconds > 0) {
          return [{
            text: `⏸️ ${Math.floor(status.totalPastSeconds / 60)} min`,
            refresh: 300
          }];
        }

        return [];
      });
    });
  },

  /* ==========================
     CARD DETAIL BADGES
  =========================== */
  'card-detail-badges': function (t) {
    return t.card('id').then(card => {
      const cardId = getSafeId(card.id);
      const memberId = getSafeId(t.getContext().member);

      CURRENT_MEMBER = memberId;
      if (!CURRENT_CARDS.includes(cardId)) {
        CURRENT_CARDS.push(cardId);
      }

      return syncStatus().then(() => {
        const status = STATUS_CACHE[cardId];
        if (!status || !status.activeTimerData) return [];

        return [{
          title: 'Tempo',
          text: 'Timer ativo',
          color: 'green',
          refresh: 60
        }];
      });
    });
  }

});
