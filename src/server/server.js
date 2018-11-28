/*jslint bitwise: true, node: true */
'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SAT = require('sat');

// Importa as configurações do jogo.
var c = require('../../config.json');

// Importa os utilitários.
var util = require('./lib/util');

// Importa a quadtree.
var quadtree = require('simple-quadtree');

var tree = quadtree(0, 0, c.larguraJogo, c.alturaJogo);

var usuarios = [];
var massaComidas = [];
var comidas = [];
var sockets = {};
var cores = [];
var V = SAT.Vector;
var C = SAT.Circle;

var initMassLog = util.dividirLog(c.massaPadraoJogador, c.desaceleracaoBase);

app.use(express.static(__dirname + '/../client'));

// Cria e adiciona na lista de comida a quantidade informada como parametro
function addComida(qtdAdicionar) {
    var raio = util.calculaRaio(c.massaComida);
    while (qtdAdicionar--) {
        var ponto = c.disposicaoUniformeComida ? util.gerarPosicaoUniforme(comidas, raio) : util.gerarPosicaoAleatoria(raio);
        comidas.push({
            // Gera um ID unico
            id: ((new Date()).getTime() + '' + comidas.length) >>> 0,
            x: ponto.x,
            y: ponto.y,
            raio: raio,
            massa: Math.random() + 2,
            hue: cores[Math.round(Math.random() * c.qtdCor)]
        });
    }
}

// Remove da lista de comida a quantidade informada como parametro
function removeComida(qtdRemover) {
    while (qtdRemover--) {
        comidas.pop();
    }
}

function moveJogador(jogador) {
    var x =0,y =0;
    for(var i=0; i<jogador.celulas.length; i++)
    {
        var target = {
            x: jogador.x - jogador.celulas[i].x + jogador.target.x,
            y: jogador.y - jogador.celulas[i].y + jogador.target.y
        };
        var dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
        var deg = Math.atan2(target.y, target.x);
        var desaceleracao = 1;
        if(jogador.celulas[i].velocidade <= 6.25) {
            desaceleracao = util.dividirLog(jogador.celulas[i].massa, c.desaceleracaoBase) - initMassLog + 1;
        }

        var deltaY = jogador.celulas[i].velocidade * Math.sin(deg)/ desaceleracao;
        var deltaX = jogador.celulas[i].velocidade * Math.cos(deg)/ desaceleracao;

        if(jogador.celulas[i].velocidade > 6.25) {
            jogador.celulas[i].velocidade -= 0.5;
        }
        if (dist < (50 + jogador.celulas[i].raio)) {
            deltaY *= dist / (50 + jogador.celulas[i].raio);
            deltaX *= dist / (50 + jogador.celulas[i].raio);
        }
        if (!isNaN(deltaY)) {
            jogador.celulas[i].y += deltaY;
        }
        if (!isNaN(deltaX)) {
            jogador.celulas[i].x += deltaX;
        }
        // Acha a melhor solução
        for(var j=0; j<jogador.celulas.length; j++) {
            if(j != i && jogador.celulas[i] !== undefined) {
                var distance = Math.sqrt(Math.pow(jogador.celulas[j].y-jogador.celulas[i].y,2) + Math.pow(jogador.celulas[j].x-jogador.celulas[i].x,2));
                var raioTotal = (jogador.celulas[i].raio + jogador.celulas[j].raio);
                if(distance < raioTotal) {
                    if(jogador.lastSplit > new Date().getTime() - 1000 * c.mergeTimer) {
                        if(jogador.celulas[i].x < jogador.celulas[j].x) {
                            jogador.celulas[i].x--;
                        } else if(jogador.celulas[i].x > jogador.celulas[j].x) {
                            jogador.celulas[i].x++;
                        }
                        if(jogador.celulas[i].y < jogador.celulas[j].y) {
                            jogador.celulas[i].y--;
                        } else if((jogador.celulas[i].y > jogador.celulas[j].y)) {
                            jogador.celulas[i].y++;
                        }
                    }
                    else if(distance < raioTotal / 1.75) {
                        jogador.celulas[i].massa += jogador.celulas[j].massa;
                        jogador.celulas[i].raio = util.calculaRaio(jogador.celulas[i].massa);
                        jogador.celulas.splice(j, 1);
                    }
                }
            }
        }
        if(jogador.celulas.length > i) {
            var calcBorda = jogador.celulas[i].raio / 3;
            if (jogador.celulas[i].x > c.larguraJogo - calcBorda) {
                jogador.celulas[i].x = c.larguraJogo - calcBorda;
            }
            if (jogador.celulas[i].y > c.alturaJogo - calcBorda) {
                jogador.celulas[i].y = c.alturaJogo - calcBorda;
            }
            if (jogador.celulas[i].x < calcBorda) {
                jogador.celulas[i].x = calcBorda;
            }
            if (jogador.celulas[i].y < calcBorda) {
                jogador.celulas[i].y = calcBorda;
            }
            x += jogador.celulas[i].x;
            y += jogador.celulas[i].y;
        }
    }
    jogador.x = x/jogador.celulas.length;
    jogador.y = y/jogador.celulas.length;
}

function moveMassa(massa) {
    var deg = Math.atan2(massa.target.y, massa.target.x);
    var deltaY = massa.velocidade * Math.sin(deg);
    var deltaX = massa.velocidade * Math.cos(deg);

    massa.velocidade -= 0.5;
    if(massa.velocidade < 0) {
        massa.velocidade = 0;
    }
    if (!isNaN(deltaY)) {
        massa.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        massa.x += deltaX;
    }

    var calcBorda = massa.raio + 5;

    if (massa.x > c.larguraJogo - calcBorda) {
        massa.x = c.larguraJogo - calcBorda;
    }
    if (massa.y > c.alturaJogo - calcBorda) {
        massa.y = c.alturaJogo - calcBorda;
    }
    if (massa.x < calcBorda) {
        massa.x = calcBorda;
    }
    if (massa.y < calcBorda) {
        massa.y = calcBorda;
    }
}

// Adiciona ou remove o numero de massa do jogo,
// adicionando ou removendo a comida do jogo
function balanceiaMassa() {
    var totalMassaUtilizada = comidas.length * c.massaComida +
        usuarios
            .map(function(u) {return u.massaTotal; })
            .reduce(function(massaAcumulada, massaAtual) { return massaAcumulada+massaAtual;}, 0);

    var massaSobrando = c.massaJogo - totalMassaUtilizada;
    var maxComidaSobrando = c.qtdMaxComida - comidas.length;
    var comidaSobrando = parseInt(massaSobrando / c.massaComida) - maxComidaSobrando;
    var qtdAdicionar = Math.min(comidaSobrando, maxComidaSobrando);
    var qtdRemover = -Math.max(comidaSobrando, maxComidaSobrando);

    if (qtdAdicionar > 0) {
        addComida(qtdAdicionar);
    }
    else if (qtdRemover > 0) {
        removeComida(qtdRemover);
    }
}

// 
io.on('connection', function (socket) {
    console.log('Um usuário conectou!', socket.handshake.query.tipo);

    var tipo = socket.handshake.query.tipo;
    var raio = util.calculaRaio(c.massaPadraoJogador);
    var posicao = c.posInicialNovoJogador == 'distante' ? util.gerarPosicaoUniforme(usuarios, raio) : util.gerarPosicaoAleatoria(raio);

    var celulas = [];
    var massaTotal = 0;
    if(tipo === 'jogador') {
        celulas = [{
            massa: c.massaPadraoJogador,
            x: posicao.x,
            y: posicao.y,
            raio: raio
        }];
        massaTotal = c.massaPadraoJogador;
    }

    var jogadorAtual = {
        id: socket.id,
        x: posicao.x,
        y: posicao.y,
        w: c.massaPadraoJogador,
        h: c.massaPadraoJogador,
        celulas: celulas,
        massaTotal: massaTotal,
        hue: cores[Math.round(Math.random() * c.qtdCor)],
        tipo: tipo,
        lastHeartbeat: new Date().getTime(),
        target: {
            x: 0,
            y: 0
        }
    };

    socket.on('entendi', function (jogador) {
        console.log('[INFO] Jogador ' + jogador.nome + ' conectando!');

        if (util.buscaPorId(usuarios, jogador.id) > -1) {
            console.log('[INFO] Esse ID de jogador já está conectado, kickando.');
            socket.disconnect();
        } else {
            console.log('[INFO] Jogador ' + jogador.nome + ' conectou!');
            sockets[jogador.id] = socket;

            var raio = util.calculaRaio(c.massaPadraoJogador);
            var posicao = c.posInicialNovoJogador == 'distante' ? util.gerarPosicaoUniforme(usuarios, raio) : util.gerarPosicaoAleatoria(raio);

            jogador.x = posicao.x;
            jogador.y = posicao.y;
            jogador.target.x = 0;
            jogador.target.y = 0;
            if(tipo === 'jogador') {
                jogador.celulas = [{
                    massa: c.massaPadraoJogador,
                    x: posicao.x,
                    y: posicao.y,
                    raio: raio
                }];
                jogador.massaTotal = c.massaPadraoJogador;
            }
            else {
                 jogador.celulas = [];
                 jogador.massaTotal = 0;
            }
            jogador.hue = cores[Math.round(Math.random() * c.qtdCor)];
            jogadorAtual = jogador;
            jogadorAtual.lastHeartbeat = new Date().getTime();
            usuarios.push(jogadorAtual);

            io.emit('jogadorEntrou', { nome: jogadorAtual.nome });

            socket.emit('configuracaoJogo', {
                larguraJogo: c.larguraJogo,
                alturaJogo: c.alturaJogo
            });
            console.log('Total de jogadores: ' + usuarios.length);
        }

    });

    socket.on('redimensionaJanela', function (data) {
        jogadorAtual.larguraTela = data.larguraTela;
        jogadorAtual.alturaTela = data.alturaTela;
    });

    socket.on('respawn', function () {
        if (util.buscaPorId(usuarios, jogadorAtual.id) > -1)
            usuarios.splice(util.buscaPorId(usuarios, jogadorAtual.id), 1);
        socket.emit('bem-vindo', jogadorAtual);
        console.log('[INFO] Usuário ' + jogadorAtual.nome + ' respawnou!');
    });

    socket.on('desconecta', function () {
        if (util.buscaPorId(usuarios, jogadorAtual.id) > -1)
            usuarios.splice(util.buscaPorId(usuarios, jogadorAtual.id), 1);
        console.log('[INFO] Usuário ' + jogadorAtual.nome + ' desconectou!');

        socket.broadcast.emit('jogadorDesconectou', { nome: jogadorAtual.nome });
    });

   // Função "Heartbeat" faz update a todo tempo
    socket.on('0', function(target) {
        jogadorAtual.lastHeartbeat = new Date().getTime();
        if (target.x !== jogadorAtual.x || target.y !== jogadorAtual.y) {
            jogadorAtual.target = target;
        }
    });
});

function tickJogador(jogadorAtual) {
    if(jogadorAtual.lastHeartbeat < (new Date().getTime() - c.intervaloMaxHeartbeat)) {
        sockets[jogadorAtual.id].emit('kick', 'Ultimo heartbeat recebido há ' + c.intervaloMaxHeartbeat + ' milisegundos.');
        sockets[jogadorAtual.id].disconnect();
    }

    moveJogador(jogadorAtual);

    function funcComida(f) {
        return (SAT.pointInCircle(new V(f.x, f.y), playerCircle) && f.hue == jogadorAtual.hue);
    }

    function deletaComida(f) {
        comidas[f] = {};
        comidas.splice(f, 1);
    }

    function comeMassa(m) {
        if(SAT.pointInCircle(new V(m.x, m.y), playerCircle)){
            if(m.id == jogadorAtual.id && m.velocidade > 0 && z == m.num)
                return false;
            if(celulaAtual.massa > m.masa * 1.1)
                return true;
        }
        return false;
    }

    function checa(usuario) {
        for(var i=0; i<usuario.celulas.length; i++) {
            if(usuario.celulas[i].massa > 10 && usuario.id !== jogadorAtual.id) {
                var response = new SAT.Response();
                var collided = SAT.testCircleCircle(playerCircle,
                    new C(new V(usuario.celulas[i].x, usuario.celulas[i].y), usuario.celulas[i].raio),
                    response);
                if (collided) {
                    response.aUser = celulaAtual;
                    response.bUser = {
                        id: usuario.id,
                        nome: usuario.nome,
                        x: usuario.celulas[i].x,
                        y: usuario.celulas[i].y,
                        num: i,
                        massa: usuario.celulas[i].massa
                    };
                    colisoesJogador.push(response);
                }
            }
        }
        return true;
    }

    function checaColisao(collision) {
        if (collision.aUser.massa > collision.bUser.massa * 1.1  && collision.aUser.raio > Math.sqrt(Math.pow(collision.aUser.x - collision.bUser.x, 2) + Math.pow(collision.aUser.y - collision.bUser.y, 2))*1.75) {
            console.log('[DEBUG] Matando usuário: ' + collision.bUser.id);
            console.log('[DEBUG] Informação de colisão:');
            console.log(collision);

            var numUser = util.buscaPorId(usuarios, collision.bUser.id);
            if (numUser > -1) {
                if(usuarios[numUser].celulas.length > 1) {
                    usuarios[numUser].massaTotal -= collision.bUser.massa;
                    usuarios[numUser].celulas.splice(collision.bUser.num, 1);
                } else {
                    usuarios.splice(numUser, 1);
                    io.emit('jogadorMorreu', { nome: collision.bUser.nome });
                    sockets[collision.bUser.id].emit('RIP');
                }
            }
            jogadorAtual.massaTotal += collision.bUser.massa;
            collision.aUser.massa += collision.bUser.massa;
        }
    }

    for(var z=0; z<jogadorAtual.celulas.length; z++) {
        var celulaAtual = jogadorAtual.celulas[z];
        var playerCircle = new C(
            new V(celulaAtual.x, celulaAtual.y),
            celulaAtual.raio
        );

        var comidaDigerida = comidas.map(funcComida)
            .reduce( function(a, b, c) { return b ? a.concat(c) : a; }, []);

        comidaDigerida.forEach(deletaComida);

        var massaDigerida = massaComidas.map(comeMassa)
            .reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);

        var masaGanada = 0;
        for(var m=0; m<massaDigerida.length; m++) {
            masaGanada += massaComidas[massaDigerida[m]].masa;
            massaComidas[massaDigerida[m]] = {};
            massaComidas.splice(massaDigerida[m],1);
            for(var n=0; n<massaDigerida.length; n++) {
                if(massaDigerida[m] < massaDigerida[n]) {
                    massaDigerida[n]--;
                }
            }
        }

        if(typeof(celulaAtual.velocidade) == "undefined")
            celulaAtual.velocidade = 6.25;
        masaGanada += (comidaDigerida.length * c.massaComida);
        celulaAtual.massa += masaGanada;
        jogadorAtual.massaTotal += masaGanada;
        celulaAtual.raio = util.calculaRaio(celulaAtual.massa);
        playerCircle.r = celulaAtual.raio;

        tree.clear();
        usuarios.forEach(tree.put);
        var colisoesJogador = [];

        var outrosusuarios =  tree.get(jogadorAtual, checa);

        colisoesJogador.forEach(checaColisao);
    }
}

function loopMovimento() {
    for (var i = 0; i < usuarios.length; i++) {
        tickJogador(usuarios[i]);
    }
    for (i=0; i < massaComidas.length; i++) {
        if(massaComidas[i].velocidade > 0) moveMassa(massaComidas[i]);
    }
}

function loopJogo() {
    if (usuarios.length > 0) {
        usuarios.sort( function(a, b) { return b.massaTotal - a.massaTotal; });

        var topusuarios = [];

        for (var i = 0; i < Math.min(10, usuarios.length); i++) {
            if(usuarios[i].tipo == 'jogador') {
                topusuarios.push({
                    id: usuarios[i].id,
                    nome: usuarios[i].nome
                });
            }
        }
        
        for (i = 0; i < usuarios.length; i++) {
            for(var z=0; z < usuarios[i].celulas.length; z++) {
                if (usuarios[i].celulas[z].massa * (1 - (c.taxaPerdaMassa / 1000)) > c.massaPadraoJogador && usuarios[i].massaTotal > c.qtdMinPerdaMassa) {
                    var perdaMassa = usuarios[i].celulas[z].massa * (1 - (c.taxaPerdaMassa / 1000));
                    usuarios[i].massaTotal -= usuarios[i].celulas[z].massa - perdaMassa;
                    usuarios[i].celulas[z].massa = perdaMassa;
                }
            }
        }
    }
    balanceiaMassa();
}

function enviaUpdates() {
    usuarios.forEach( function(u) {
        u.x = u.x || c.larguraJogo / 2;
        u.y = u.y || c.alturaJogo / 2;

        var comidasVisiveis  = comidas
            .map(function(f) {
                if ( f.x > u.x - u.larguraTela/2 - 20 &&
                    f.x < u.x + u.larguraTela/2 + 20 &&
                    f.y > u.y - u.alturaTela/2 - 20 &&
                    f.y < u.y + u.alturaTela/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var massaVisivel = massaComidas
            .map(function(f) {
                if ( f.x+f.raio > u.x - u.larguraTela/2 - 20 &&
                    f.x-f.raio < u.x + u.larguraTela/2 + 20 &&
                    f.y+f.raio > u.y - u.alturaTela/2 - 20 &&
                    f.y-f.raio < u.y + u.alturaTela/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var celulasVisiveis  = usuarios
            .map(function(f) {
                for(var z=0; z<f.celulas.length; z++)
                {
                    if ( f.celulas[z].x+f.celulas[z].raio > u.x - u.larguraTela/2 - 20 &&
                        f.celulas[z].x-f.celulas[z].raio < u.x + u.larguraTela/2 + 20 &&
                        f.celulas[z].y+f.celulas[z].raio > u.y - u.alturaTela/2 - 20 &&
                        f.celulas[z].y-f.celulas[z].raio < u.y + u.alturaTela/2 + 20) {
                        z = f.celulas.lenth;
                        if(f.id !== u.id) {
                            return {
                                id: f.id,
                                x: f.x,
                                y: f.y,
                                celulas: f.celulas,
                                massaTotal: Math.round(f.massaTotal),
                                hue: f.hue,
                                nome: f.nome
                            };
                        } else {
                            return {
                                x: f.x,
                                y: f.y,
                                celulas: f.celulas,
                                massaTotal: Math.round(f.massaTotal),
                                hue: f.hue,
                            };
                        }
                    }
                }
            })
            .filter(function(f) { return f; });

        sockets[u.id].emit('moveJogador', celulasVisiveis, comidasVisiveis, massaVisivel);
    });
}

setInterval(loopMovimento, 1000 / 60);
setInterval(loopJogo, 1000);
setInterval(enviaUpdates, 1000 / c.fatorAtualizacaoRede);

// Configurações de IP.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || c.host;
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || c.port;
http.listen( serverport, ipaddress, function() {
    console.log('[DEBUG] Ouvindo em ' + ipaddress + ':' + serverport);

    let proxCor = 360 / c.qtdCor;
    for (let i = 1; i < 360; i+=proxCor) {
        console.log(Math.round(i));
        cores.push(Math.round(i));
    }
});
