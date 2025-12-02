TrelloPowerUp.inicialize({
    'card-buttons': function(t, options){
        return[{
            icon: 'https://cdn.icon-icons.com/icons2/1369/PNG/512/-timer_90562.png',
            text: 'Timer teste',
            callback: function(t){
                return t.alert({
                    message: 'o powerup ta ativo',
                    duration: 5,
                })
            }
        }]
    }
})

