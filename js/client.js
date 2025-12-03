var Promise = TrelloPowerUp.Promise;

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
                        var durationMs = endTime - start
                        var durationSeconds = Math.round(durationMs / 1000)

                        var newLog = {
                            duration: durationSeconds,
                            date: new Date().toISOString(),
                        }

                        return t.get('card', 'shared', 'timeLogs', []).then(function(timeLogs){
                            timeLogs.push(newLog)

                            return t.set('card', 'shared', 'timelogs', timeLogs).then(function(){
                                return t.remove('card', 'shared', 'startTime').then(function(){
                                    return t.alert({
                                        message: `Log salvo! Duração: ${durationSeconds} segundos.`,
                                        duration: 5,
                                        display: 'success'
                                    })
                                })
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
                        var now = new Date().toISOString()

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
    )},
    
    'card-detail-badges': function(t, options) {
    // A lógica de estado é a mesma: verifica se há um startTime salvo.
    return t.get('card', 'shared', 'startTime')
    .then(function(startTime) {
        
        if (startTime) {
            // Se estiver rodando, mostra um selo verde
            return [{
                dynamic: function() {
                    // Aqui você pode adicionar lógica de tempo em tempo real, mas por enquanto, só o status
                    return {
                        title: "Tempo Ativo", // Título da tooltip
                        text: "⏳ RODANDO",
                        color: "green", // Cor verde para indicar atividade
                        callback: function(t) {
                            // Clicar no badge pode te levar para o botão de Parar, se necessário.
                            return t.alert({ message: "Use o botão na aba Power-Ups para PAUSAR." });
                        }
                    }
                }
            }];
        } else {
            // Se estiver parado, não mostra selo, ou mostra cinza
            return []; // Array vazio significa que nada será exibido
        }
    });
},
});