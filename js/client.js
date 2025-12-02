var Promise = TrelloPowerUp.Promise

const GITHUB_PAGES_BASE = 'https://miguelnsimoes.github.io/meu-trello-timer';

TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
        return t.get('card', 'shared', 'startTime').then(function(startTime) {
            
            if(startTime){
                return[{
                    icon:`${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Pausar',
                    callback: function(t) {
                        var endTime = new Date()
                        var start = new Date(startTime)
                        var durationSeconds = Math.round((endTime - start) / 1000)

                        return t.remove('card', 'shared', 'startTime').then(function(){
                            return t.alert({
                                message: `Tempo Registrado: ${durationSeconds} segundos!`,
                                duration: 5,
                                display: 'sucess'
                            })
                        })
                    }
                }]
            }
            
            else{
                return[{
                    icon: `${GITHUB_PAGES_BASE}/img/icon.svg`,
                    text: 'Iniciar',
                    callback: function(t){
                        var now = new Date().toDateString()

                        return t.set('card', 'shared', 'startTime', now).then(function(){
                            return t.alert({
                                message: 'Timer iniciado!',
                                duration: 3
                            })
                        })
                    }
                }]
            }
            
        }
    )}
})


/*
TrelloPowerUp.initialize({
    'card-buttons': function(t, options) {
        return [{
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
});*/