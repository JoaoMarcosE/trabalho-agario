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
var food = [];
var sockets = {};

var V = SAT.Vector;
var C = SAT.Circle;

var initMassLog = util.dividirLog(c.massaPadraoJogador, c.slowBase);

app.use(express.static(__dirname + '/../client'));

// Cria e adiciona na lista de comida a quantidade informada como parametro
function addComida(qtdAdicionar) {
    var raio = util.calculaRaio(c.foodMass);
    while (qtdAdicionar--) {
        var ponto = c.foodUniformDisposition ? util.uniformPosition(food, raio) : util.gerarPontoAleatoria(raio);
        food.push({
            // Gera um ID unico
            id: ((new Date()).getTime() + '' + food.length) >>> 0,
            x: ponto.x,
            y: ponto.y,
            radius: raio,
            mass: Math.random() + 2,
            hue: Math.round(Math.random() * 360)
        });
    }
}

// Remove da lista de comida a quantidade informada como parametro
function removeComida(qtdRemover) {
    while (qtdRemover--) {
        food.pop();
    }
}

function moveJogador(player) {
    var x =0,y =0;
    for(var i=0; i<player.cells.length; i++)
    {
        var target = {
            x: player.x - player.cells[i].x + player.target.x,
            y: player.y - player.cells[i].y + player.target.y
        };
        var dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
        var deg = Math.atan2(target.y, target.x);
        var slowDown = 1;
        if(player.cells[i].speed <= 6.25) {
            slowDown = util.dividirLog(player.cells[i].mass, c.slowBase) - initMassLog + 1;
        }

        var deltaY = player.cells[i].speed * Math.sin(deg)/ slowDown;
        var deltaX = player.cells[i].speed * Math.cos(deg)/ slowDown;

        if(player.cells[i].speed > 6.25) {
            player.cells[i].speed -= 0.5;
        }
        if (dist < (50 + player.cells[i].radius)) {
            deltaY *= dist / (50 + player.cells[i].radius);
            deltaX *= dist / (50 + player.cells[i].radius);
        }
        if (!isNaN(deltaY)) {
            player.cells[i].y += deltaY;
        }
        if (!isNaN(deltaX)) {
            player.cells[i].x += deltaX;
        }
        // Acha a melhor solução
        for(var j=0; j<player.cells.length; j++) {
            if(j != i && player.cells[i] !== undefined) {
                var distance = Math.sqrt(Math.pow(player.cells[j].y-player.cells[i].y,2) + Math.pow(player.cells[j].x-player.cells[i].x,2));
                var radiusTotal = (player.cells[i].radius + player.cells[j].radius);
                if(distance < radiusTotal) {
                    if(player.lastSplit > new Date().getTime() - 1000 * c.mergeTimer) {
                        if(player.cells[i].x < player.cells[j].x) {
                            player.cells[i].x--;
                        } else if(player.cells[i].x > player.cells[j].x) {
                            player.cells[i].x++;
                        }
                        if(player.cells[i].y < player.cells[j].y) {
                            player.cells[i].y--;
                        } else if((player.cells[i].y > player.cells[j].y)) {
                            player.cells[i].y++;
                        }
                    }
                    else if(distance < radiusTotal / 1.75) {
                        player.cells[i].mass += player.cells[j].mass;
                        player.cells[i].radius = util.calculaRaio(player.cells[i].mass);
                        player.cells.splice(j, 1);
                    }
                }
            }
        }
        if(player.cells.length > i) {
            var borderCalc = player.cells[i].radius / 3;
            if (player.cells[i].x > c.larguraJogo - borderCalc) {
                player.cells[i].x = c.larguraJogo - borderCalc;
            }
            if (player.cells[i].y > c.alturaJogo - borderCalc) {
                player.cells[i].y = c.alturaJogo - borderCalc;
            }
            if (player.cells[i].x < borderCalc) {
                player.cells[i].x = borderCalc;
            }
            if (player.cells[i].y < borderCalc) {
                player.cells[i].y = borderCalc;
            }
            x += player.cells[i].x;
            y += player.cells[i].y;
        }
    }
    player.x = x/player.cells.length;
    player.y = y/player.cells.length;
}

function moveMassa(mass) {
    var deg = Math.atan2(mass.target.y, mass.target.x);
    var deltaY = mass.speed * Math.sin(deg);
    var deltaX = mass.speed * Math.cos(deg);

    mass.speed -= 0.5;
    if(mass.speed < 0) {
        mass.speed = 0;
    }
    if (!isNaN(deltaY)) {
        mass.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        mass.x += deltaX;
    }

    var borderCalc = mass.radius + 5;

    if (mass.x > c.larguraJogo - borderCalc) {
        mass.x = c.larguraJogo - borderCalc;
    }
    if (mass.y > c.alturaJogo - borderCalc) {
        mass.y = c.alturaJogo - borderCalc;
    }
    if (mass.x < borderCalc) {
        mass.x = borderCalc;
    }
    if (mass.y < borderCalc) {
        mass.y = borderCalc;
    }
}

// Adiciona ou remove o numero de massa do jogo,
// adicionando ou removendo a comida do jogo
function balanceiaMassa() {
    var totalMassaUtilizada = food.length * c.foodMass +
        usuarios
            .map(function(u) {return u.massTotal; })
            .reduce(function(massaAcumulada, massaAtual) { return massaAcumulada+massaAtual;}, 0);

    var massaSobrando = c.gameMass - totalMassaUtilizada;
    var maxComidaSobrando = c.qtdMaxComida - food.length;
    var comidaSobrando = parseInt(massaSobrando / c.foodMass) - maxComidaSobrando;
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
    console.log('A user connected!', socket.handshake.query.type);

    var type = socket.handshake.query.type;
    var radius = util.calculaRaio(c.massaPadraoJogador);
    var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(usuarios, radius) : util.gerarPontoAleatoria(radius);

    var cells = [];
    var massTotal = 0;
    if(type === 'player') {
        cells = [{
            mass: c.massaPadraoJogador,
            x: position.x,
            y: position.y,
            radius: radius
        }];
        massTotal = c.massaPadraoJogador;
    }

    var currentPlayer = {
        id: socket.id,
        x: position.x,
        y: position.y,
        w: c.massaPadraoJogador,
        h: c.massaPadraoJogador,
        cells: cells,
        massTotal: massTotal,
        hue: Math.round(Math.random() * 360),
        type: type,
        lastHeartbeat: new Date().getTime(),
        target: {
            x: 0,
            y: 0
        }
    };

    socket.on('gotit', function (player) {
        console.log('[INFO] Player ' + player.name + ' connecting!');

        if (util.buscaPorId(usuarios, player.id) > -1) {
            console.log('[INFO] Player ID is already connected, kicking.');
            socket.disconnect();
        } else {
            console.log('[INFO] Player ' + player.name + ' connected!');
            sockets[player.id] = socket;

            var radius = util.calculaRaio(c.massaPadraoJogador);
            var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(usuarios, radius) : util.gerarPontoAleatoria(radius);

            player.x = position.x;
            player.y = position.y;
            player.target.x = 0;
            player.target.y = 0;
            if(type === 'player') {
                player.cells = [{
                    mass: c.massaPadraoJogador,
                    x: position.x,
                    y: position.y,
                    radius: radius
                }];
                player.massTotal = c.massaPadraoJogador;
            }
            else {
                 player.cells = [];
                 player.massTotal = 0;
            }
            player.hue = Math.round(Math.random() * 360);
            currentPlayer = player;
            currentPlayer.lastHeartbeat = new Date().getTime();
            usuarios.push(currentPlayer);

            io.emit('playerJoin', { name: currentPlayer.name });

            socket.emit('gameSetup', {
                larguraJogo: c.larguraJogo,
                alturaJogo: c.alturaJogo
            });
            console.log('Total players: ' + usuarios.length);
        }

    });

    socket.on('windowResized', function (data) {
        currentPlayer.larguraTela = data.larguraTela;
        currentPlayer.alturaTela = data.alturaTela;
    });

    socket.on('respawn', function () {
        if (util.buscaPorId(usuarios, currentPlayer.id) > -1)
            usuarios.splice(util.buscaPorId(usuarios, currentPlayer.id), 1);
        socket.emit('welcome', currentPlayer);
        console.log('[INFO] User ' + currentPlayer.name + ' respawned!');
    });

    socket.on('disconnect', function () {
        if (util.buscaPorId(usuarios, currentPlayer.id) > -1)
            usuarios.splice(util.buscaPorId(usuarios, currentPlayer.id), 1);
        console.log('[INFO] User ' + currentPlayer.name + ' disconnected!');

        socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
    });

    socket.on('playerChat', function(data) {
        var _sender = data.sender.replace(/(<([^>]+)>)/ig, '');
        var _message = data.message.replace(/(<([^>]+)>)/ig, '');
        if (c.logChat === 1) {
            console.log('[CHAT] [' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + '] ' + _sender + ': ' + _message);
        }
        socket.broadcast.emit('serverSendPlayerChat', {sender: _sender, message: _message.substring(0,35)});
    });

    socket.on('pass', function(data) {
        if (data[0] === c.adminPass) {
            console.log('[ADMIN] ' + currentPlayer.name + ' just logged in as an admin!');
            socket.emit('serverMSG', 'Welcome back ' + currentPlayer.name);
            socket.broadcast.emit('serverMSG', currentPlayer.name + ' just logged in as admin!');
            currentPlayer.admin = true;
        } else {
            console.log('[ADMIN] ' + currentPlayer.name + ' attempted to log in with incorrect password.');
            socket.emit('serverMSG', 'Password incorrect, attempt logged.');
        }
    });

   // Função "Heartbeat" faz update a todo tempo
    socket.on('0', function(target) {
        currentPlayer.lastHeartbeat = new Date().getTime();
        if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
            currentPlayer.target = target;
        }
    });
});

function tickJogador(currentPlayer) {
    if(currentPlayer.lastHeartbeat < new Date().getTime() - c.maxHeartbeatInterval) {
        sockets[currentPlayer.id].emit('kick', 'Last heartbeat received over ' + c.maxHeartbeatInterval + ' ago.');
        sockets[currentPlayer.id].disconnect();
    }

    moveJogador(currentPlayer);

    function funcComida(f) {
        return SAT.pointInCircle(new V(f.x, f.y), playerCircle);
    }

    function deletaComida(f) {
        food[f] = {};
        food.splice(f, 1);
    }

    function comeMassa(m) {
        if(SAT.pointInCircle(new V(m.x, m.y), playerCircle)){
            if(m.id == currentPlayer.id && m.speed > 0 && z == m.num)
                return false;
            if(currentCell.mass > m.masa * 1.1)
                return true;
        }
        return false;
    }

    function checa(user) {
        for(var i=0; i<user.cells.length; i++) {
            if(user.cells[i].mass > 10 && user.id !== currentPlayer.id) {
                var response = new SAT.Response();
                var collided = SAT.testCircleCircle(playerCircle,
                    new C(new V(user.cells[i].x, user.cells[i].y), user.cells[i].radius),
                    response);
                if (collided) {
                    response.aUser = currentCell;
                    response.bUser = {
                        id: user.id,
                        name: user.name,
                        x: user.cells[i].x,
                        y: user.cells[i].y,
                        num: i,
                        mass: user.cells[i].mass
                    };
                    playerCollisions.push(response);
                }
            }
        }
        return true;
    }

    function checaColisao(collision) {
        if (collision.aUser.mass > collision.bUser.mass * 1.1  && collision.aUser.radius > Math.sqrt(Math.pow(collision.aUser.x - collision.bUser.x, 2) + Math.pow(collision.aUser.y - collision.bUser.y, 2))*1.75) {
            console.log('[DEBUG] Killing user: ' + collision.bUser.id);
            console.log('[DEBUG] Collision info:');
            console.log(collision);

            var numUser = util.buscaPorId(usuarios, collision.bUser.id);
            if (numUser > -1) {
                if(usuarios[numUser].cells.length > 1) {
                    usuarios[numUser].massTotal -= collision.bUser.mass;
                    usuarios[numUser].cells.splice(collision.bUser.num, 1);
                } else {
                    usuarios.splice(numUser, 1);
                    io.emit('playerDied', { name: collision.bUser.name });
                    sockets[collision.bUser.id].emit('RIP');
                }
            }
            currentPlayer.massTotal += collision.bUser.mass;
            collision.aUser.mass += collision.bUser.mass;
        }
    }

    for(var z=0; z<currentPlayer.cells.length; z++) {
        var currentCell = currentPlayer.cells[z];
        var playerCircle = new C(
            new V(currentCell.x, currentCell.y),
            currentCell.radius
        );

        var foodEaten = food.map(funcComida)
            .reduce( function(a, b, c) { return b ? a.concat(c) : a; }, []);

        foodEaten.forEach(deletaComida);

        var massEaten = massaComidas.map(comeMassa)
            .reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);

        var masaGanada = 0;
        for(var m=0; m<massEaten.length; m++) {
            masaGanada += massaComidas[massEaten[m]].masa;
            massaComidas[massEaten[m]] = {};
            massaComidas.splice(massEaten[m],1);
            for(var n=0; n<massEaten.length; n++) {
                if(massEaten[m] < massEaten[n]) {
                    massEaten[n]--;
                }
            }
        }

        if(typeof(currentCell.speed) == "undefined")
            currentCell.speed = 6.25;
        masaGanada += (foodEaten.length * c.foodMass);
        currentCell.mass += masaGanada;
        currentPlayer.massTotal += masaGanada;
        currentCell.radius = util.calculaRaio(currentCell.mass);
        playerCircle.r = currentCell.radius;

        tree.clear();
        usuarios.forEach(tree.put);
        var playerCollisions = [];

        var otherusuarios =  tree.get(currentPlayer, checa);

        playerCollisions.forEach(checaColisao);
    }
}

function loopMovimento() {
    for (var i = 0; i < usuarios.length; i++) {
        tickJogador(usuarios[i]);
    }
    for (i=0; i < massaComidas.length; i++) {
        if(massaComidas[i].speed > 0) moveMassa(massaComidas[i]);
    }
}

function loopJogo() {
    if (usuarios.length > 0) {
        usuarios.sort( function(a, b) { return b.massTotal - a.massTotal; });

        var topusuarios = [];

        for (var i = 0; i < Math.min(10, usuarios.length); i++) {
            if(usuarios[i].type == 'player') {
                topusuarios.push({
                    id: usuarios[i].id,
                    name: usuarios[i].name
                });
            }
        }
        
        for (i = 0; i < usuarios.length; i++) {
            for(var z=0; z < usuarios[i].cells.length; z++) {
                if (usuarios[i].cells[z].mass * (1 - (c.massLossRate / 1000)) > c.massaPadraoJogador && usuarios[i].massTotal > c.minMassLoss) {
                    var massLoss = usuarios[i].cells[z].mass * (1 - (c.massLossRate / 1000));
                    usuarios[i].massTotal -= usuarios[i].cells[z].mass - massLoss;
                    usuarios[i].cells[z].mass = massLoss;
                }
            }
        }
    }
    balanceiaMassa();
}

function enviaUpdates() {
    usuarios.forEach( function(u) {
        // centraliza a view se x/y for indefinido, isso vai acontecer para os espectadores
        u.x = u.x || c.larguraJogo / 2;
        u.y = u.y || c.alturaJogo / 2;

        var visibleFood  = food
            .map(function(f) {
                if ( f.x > u.x - u.larguraTela/2 - 20 &&
                    f.x < u.x + u.larguraTela/2 + 20 &&
                    f.y > u.y - u.alturaTela/2 - 20 &&
                    f.y < u.y + u.alturaTela/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleMass = massaComidas
            .map(function(f) {
                if ( f.x+f.radius > u.x - u.larguraTela/2 - 20 &&
                    f.x-f.radius < u.x + u.larguraTela/2 + 20 &&
                    f.y+f.radius > u.y - u.alturaTela/2 - 20 &&
                    f.y-f.radius < u.y + u.alturaTela/2 + 20) {
                    return f;
                }
            })
            .filter(function(f) { return f; });

        var visibleCells  = usuarios
            .map(function(f) {
                for(var z=0; z<f.cells.length; z++)
                {
                    if ( f.cells[z].x+f.cells[z].radius > u.x - u.larguraTela/2 - 20 &&
                        f.cells[z].x-f.cells[z].radius < u.x + u.larguraTela/2 + 20 &&
                        f.cells[z].y+f.cells[z].radius > u.y - u.alturaTela/2 - 20 &&
                        f.cells[z].y-f.cells[z].radius < u.y + u.alturaTela/2 + 20) {
                        z = f.cells.lenth;
                        if(f.id !== u.id) {
                            return {
                                id: f.id,
                                x: f.x,
                                y: f.y,
                                cells: f.cells,
                                massTotal: Math.round(f.massTotal),
                                hue: f.hue,
                                name: f.name
                            };
                        } else {
                            return {
                                x: f.x,
                                y: f.y,
                                cells: f.cells,
                                massTotal: Math.round(f.massTotal),
                                hue: f.hue,
                            };
                        }
                    }
                }
            })
            .filter(function(f) { return f; });

        sockets[u.id].emit('serverTellPlayerMove', visibleCells, visibleFood, visibleMass);
    });
}

setInterval(loopMovimento, 1000 / 60);
setInterval(loopJogo, 1000);
setInterval(enviaUpdates, 1000 / c.networkUpdateFactor);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || c.host;
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || c.port;
http.listen( serverport, ipaddress, function() {
    console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport);
});
