// NOVO CÓDIGO para o seu js/client.js
const GITHUB_PAGES_BASE = 'https://miguelnsimoes.github.io/meu-trello-timer';

TrelloPowerUp.initialize({
    'card-buttons': function(t, options) {
        return [{
            // Aponta para o arquivo SVG no seu próprio GitHub Pages
            icon: `${GITHUB_PAGES_BASE}/img/icon.svg`, 
            text: 'Timer teste',
            callback: function(t) {
                return t.alert({
                    message: 'O powerup está ativo!',
                    duration: 5,
                });
            }
        }];
    },
    // ... outras capabilities
});