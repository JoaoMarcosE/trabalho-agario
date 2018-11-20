var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var nomeJogadorInput = document.getElementById('nomeJogadorInput');
var socket;
var reason;

function startGame(type) {
    global.nomeJogador = nomeJogadorInput.value.replace(/(<([^>]+)>)/ig, '').substring(0,25);
    global.tipoJogador = type;

    global.larguraTela = window.innerWidth;
    global.alturaTela = window.innerHeight;

    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('gameAreaWrapper').style.opacity = 1;
	
    if (!socket) {
        socket = io({query:"type=" + type});
        setupSocket(socket);
    }
	
    if (!global.animLoopHandle)
        animloop();
	
    socket.emit('respawn');
    window.canvas.socket = socket;
    global.socket = socket;
}

window.onload = function() {

    var btn = document.getElementById('startButton');

    btn.onclick = function () {
        startGame('player');
    };

    nomeJogadorInput.addEventListener('keypress', function (e) {
        var key = e.which || e.keyCode;

        if (key === global.KEY_ENTER) {
            startGame('player');
        }
    });
};

var configComida = {
    border: 0,
};

var configJogador = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var jogador = {
    id: -1,
    x: global.larguraTela / 2,
    y: global.alturaTela / 2,
    larguraTela: global.larguraTela,
    alturaTela: global.alturaTela,
    alvo: {x: global.larguraTela / 2, y: global.alturaTela / 2}
};
global.jogador = jogador;

var comidas = [];
var usuarios = [];
var alvo = {x: jogador.x, y: jogador.y};
global.alvo = alvo;

window.canvas = new Canvas();

var c = window.canvas.cv;
var graph = c.getContext('2d');

$( "#feed" ).click(function() {
    socket.emit('1');
});

// Configurações do socket
function setupSocket(socket) {
    // Tratamento de erro
    socket.on('connect_failed', function () {
        socket.close();
        global.desconectado = true;
    });

    socket.on('disconnect', function () {
        socket.close();
        global.desconectado = true;
    });

    // Tratamento de conexão
    socket.on('welcome', function (infoJogador) {
        jogador = infoJogador;
        jogador.name = global.nomeJogador;
        jogador.larguraTela = global.larguraTela;
        jogador.alturaTela = global.alturaTela;
        jogador.alvo = window.canvas.alvo;
        global.jogador = jogador;
        socket.emit('gotit', jogador);
        global.gameStart = true;
		c.focus();
    });

    socket.on('gameSetup', function(data) {
        global.larguraJogo = data.larguraJogo;
        global.alturaJogo = data.alturaJogo;
        resize();
    });

    // Tratamento da movimentação
    socket.on('serverTellPlayerMove', function (userData, listaComidas, massList) {
        var dadosJogador;
        for(var i =0; i< userData.length; i++) {
            if(typeof(userData[i].id) == "undefined") {
                dadosJogador = userData[i];
                i = userData.length;
            }
        }
        if(global.tipoJogador == 'player') {
            var xoffset = jogador.x - dadosJogador.x;
            var yoffset = jogador.y - dadosJogador.y;

            jogador.x = dadosJogador.x;
            jogador.y = dadosJogador.y;
            jogador.hue = dadosJogador.hue;
            jogador.massTotal = dadosJogador.massTotal;
            jogador.cells = dadosJogador.cells;
            jogador.xoffset = isNaN(xoffset) ? 0 : xoffset;
            jogador.yoffset = isNaN(yoffset) ? 0 : yoffset;
        }
        usuarios = userData;
        comidas = listaComidas;
    });

    socket.on('RIP', function () {
        global.gameStart = false;
        global.morreu = true;
        window.setTimeout(function() {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            global.morreu = false;
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('kick', function (data) {
        global.gameStart = false;
        reason = data;
        global.kickado = true;
        socket.close();
    });
}

function desenhaCirculo(centerX, centerY, radius, sides) {
    var theta = 0;
    var x = 0;
    var y = 0;

    graph.beginPath();

    for (var i = 0; i < sides; i++) {
        theta = (i / sides) * 2 * Math.PI;
        x = centerX + radius * Math.sin(theta);
        y = centerY + radius * Math.cos(theta);
        graph.lineTo(x, y);
    }

    graph.closePath();
    graph.stroke();
    graph.fill();
}

function desenhaComida(comida) {
    graph.strokeStyle = 'hsl(' + comida.hue + ', 100%, 45%)';
    graph.fillStyle = 'hsl(' + comida.hue + ', 100%, 50%)';
    graph.lineWidth = configComida.border;
    desenhaCirculo(comida.x - jogador.x + global.larguraTela / 2,
               comida.y - jogador.y + global.alturaTela / 2,
               comida.radius, global.ladosComida);
}

function desenhaJogadores(order) {
    var start = {
        x: jogador.x - (global.larguraTela / 2),
        y: jogador.y - (global.alturaTela / 2)
    };

    for(var z=0; z<order.length; z++)
    {
        var userCurrent = usuarios[order[z].nCell];
        var cellCurrent = usuarios[order[z].nCell].cells[order[z].nDiv];

        var x=0;
        var y=0;

        var points = 30 + ~~(cellCurrent.mass/5);
        var increase = Math.PI * 2 / points;

        graph.strokeStyle = 'hsl(' + userCurrent.hue + ', 100%, 45%)';
        graph.fillStyle = 'hsl(' + userCurrent.hue + ', 100%, 50%)';
        graph.lineWidth = configJogador.border;

        var xstore = [];
        var ystore = [];

        global.spin += 0.0;

        var circle = {
            x: cellCurrent.x - start.x,
            y: cellCurrent.y - start.y
        };

        for (var i = 0; i < points; i++) {

            x = cellCurrent.radius * Math.cos(global.spin) + circle.x;
            y = cellCurrent.radius * Math.sin(global.spin) + circle.y;
            if(typeof(userCurrent.id) == "undefined") {
                x = valueInRange(-userCurrent.x + global.larguraTela / 2,
                                 global.larguraJogo - userCurrent.x + global.larguraTela / 2, x);
                y = valueInRange(-userCurrent.y + global.alturaTela / 2,
                                 global.alturaJogo - userCurrent.y + global.alturaTela / 2, y);
            } else {
                x = valueInRange(-cellCurrent.x - jogador.x + global.larguraTela / 2 + (cellCurrent.radius/3),
                                 global.larguraJogo - cellCurrent.x + global.larguraJogo - jogador.x + global.larguraTela / 2 - (cellCurrent.radius/3), x);
                y = valueInRange(-cellCurrent.y - jogador.y + global.alturaTela / 2 + (cellCurrent.radius/3),
                                 global.alturaJogo - cellCurrent.y + global.alturaJogo - jogador.y + global.alturaTela / 2 - (cellCurrent.radius/3) , y);
            }
            global.spin += increase;
            xstore[i] = x;
            ystore[i] = y;
        }

        for (i = 0; i < points; ++i) {
            if (i === 0) {
                graph.beginPath();
                graph.moveTo(xstore[i], ystore[i]);
            } else if (i > 0 && i < points - 1) {
                graph.lineTo(xstore[i], ystore[i]);
            } else {
                graph.lineTo(xstore[i], ystore[i]);
                graph.lineTo(xstore[0], ystore[0]);
            }

        }
        graph.lineJoin = 'round';
        graph.lineCap = 'round';
        graph.fill();
        graph.stroke();
        var nameCell = "";
        if(typeof(userCurrent.id) == "undefined")
            nameCell = jogador.name;
        else
            nameCell = userCurrent.name;

        var fontSize = Math.max(cellCurrent.radius / 3, 12);
        graph.lineWidth = configJogador.textBorderSize;
        graph.fillStyle = configJogador.textColor;
        graph.strokeStyle = configJogador.textBorder;
        graph.miterLimit = 1;
        graph.lineJoin = 'round';
        graph.textAlign = 'center';
        graph.textBaseline = 'middle';
        graph.font = 'bold ' + fontSize + 'px sans-serif';

        if (global.toggleMassState === 0) {
            graph.strokeText(nameCell, circle.x, circle.y);
            graph.fillText(nameCell, circle.x, circle.y);
        } else {
            graph.strokeText(nameCell, circle.x, circle.y);
            graph.fillText(nameCell, circle.x, circle.y);
            graph.font = 'bold ' + Math.max(fontSize / 3 * 2, 10) + 'px sans-serif';
            if(nameCell.length === 0) fontSize = 0;
            graph.strokeText(Math.round(cellCurrent.mass), circle.x, circle.y+fontSize);
            graph.fillText(Math.round(cellCurrent.mass), circle.x, circle.y+fontSize);
        }
    }
}

function valueInRange(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

function desenhaGrid() {
     graph.lineWidth = 1;
     graph.strokeStyle = global.lineColor;
     graph.globalAlpha = 0.15;
     graph.beginPath();

    for (var x = global.xoffset - jogador.x; x < global.larguraTela; x += global.alturaTela / 18) {
        graph.moveTo(x, 0);
        graph.lineTo(x, global.alturaTela);
    }

    for (var y = global.yoffset - jogador.y ; y < global.alturaTela; y += global.alturaTela / 18) {
        graph.moveTo(0, y);
        graph.lineTo(global.larguraTela, y);
    }

    graph.stroke();
    graph.globalAlpha = 1;
}

function desenhaBorda() {
    graph.lineWidth = 1;
    graph.strokeStyle = configJogador.borderColor;

    // Borda da esquerda
    if (jogador.x <= global.larguraTela/2) {
        graph.beginPath();
        graph.moveTo(global.larguraTela/2 - jogador.x, 0 ? jogador.y > global.alturaTela/2 : global.alturaTela/2 - jogador.y);
        graph.lineTo(global.larguraTela/2 - jogador.x, global.alturaJogo + global.alturaTela/2 - jogador.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Borda de cima
    if (jogador.y <= global.alturaTela/2) {
        graph.beginPath();
        graph.moveTo(0 ? jogador.x > global.larguraTela/2 : global.larguraTela/2 - jogador.x, global.alturaTela/2 - jogador.y);
        graph.lineTo(global.larguraJogo + global.larguraTela/2 - jogador.x, global.alturaTela/2 - jogador.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Borda da direita
    if (global.larguraJogo - jogador.x <= global.larguraTela/2) {
        graph.beginPath();
        graph.moveTo(global.larguraJogo + global.larguraTela/2 - jogador.x,
                     global.alturaTela/2 - jogador.y);
        graph.lineTo(global.larguraJogo + global.larguraTela/2 - jogador.x,
                     global.alturaJogo + global.alturaTela/2 - jogador.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Borda de baixo
    if (global.alturaJogo - jogador.y <= global.alturaTela/2) {
        graph.beginPath();
        graph.moveTo(global.larguraJogo + global.larguraTela/2 - jogador.x,
                     global.alturaJogo + global.alturaTela/2 - jogador.y);
        graph.lineTo(global.larguraTela/2 - jogador.x,
                     global.alturaJogo + global.alturaTela/2 - jogador.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }
}

window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.msRequestAnimationFrame     ||
            function( callback ) {
                window.setTimeout(callback, 1000 / 60);
            };
})();

window.cancelAnimFrame = (function(handle) {
    return  window.cancelAnimationFrame     ||
            window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
    if (global.morreu) {
        graph.fillStyle = '#333333';
        graph.fillRect(0, 0, global.larguraTela, global.alturaTela);

        graph.textAlign = 'center';
        graph.fillStyle = '#FFFFFF';
        graph.font = 'bold 30px sans-serif';
        graph.fillText('Você morreu!', global.larguraTela / 2, global.alturaTela / 2);
    }
    else if (!global.desconectado) {
        if (global.gameStart) {
            graph.fillStyle = global.backgroundColor;
            graph.fillRect(0, 0, global.larguraTela, global.alturaTela);

            desenhaGrid();
            comidas.forEach(desenhaComida);
            
            if (global.borderDraw) {
                desenhaBorda();
            }
            var orderMass = [];
            for(var i=0; i<usuarios.length; i++) {
                for(var j=0; j<usuarios[i].cells.length; j++) {
                    orderMass.push({
                        nCell: i,
                        nDiv: j,
                        mass: usuarios[i].cells[j].mass
                    });
                }
            }
            orderMass.sort(function(obj1, obj2) {
                return obj1.mass - obj2.mass;
            });

            desenhaJogadores(orderMass);
            socket.emit('0', window.canvas.alvo);

        } else {
            graph.fillStyle = '#333333';
            graph.fillRect(0, 0, global.larguraTela, global.alturaTela);

            graph.textAlign = 'center';
            graph.fillStyle = '#FFFFFF';
            graph.font = 'bold 30px sans-serif';
            graph.fillText('Game Over!', global.larguraTela / 2, global.alturaTela / 2);
        }
    } else {
        graph.fillStyle = '#333333';
        graph.fillRect(0, 0, global.larguraTela, global.alturaTela);

        graph.textAlign = 'center';
        graph.fillStyle = '#FFFFFF';
        graph.font = 'bold 30px sans-serif';
        if (global.kickado) {
            if (reason !== '') {
                graph.fillText('Você foi kickado por:', global.larguraTela / 2, global.alturaTela / 2 - 20);
                graph.fillText(reason, global.larguraTela / 2, global.alturaTela / 2 + 20);
            }
            else {
                graph.fillText('Você foi kickado!', global.larguraTela / 2, global.alturaTela / 2);
            }
        }
        else {
              graph.fillText('Desconectado!', global.larguraTela / 2, global.alturaTela / 2);
        }
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;

    jogador.larguraTela = c.width = global.larguraTela = global.tipoJogador == 'player' ? window.innerWidth : global.larguraJogo;
    jogador.alturaTela = c.height = global.alturaTela = global.tipoJogador == 'player' ? window.innerHeight : global.alturaJogo;

    socket.emit('windowResized', { larguraTela: global.larguraTela, alturaTela: global.alturaTela });
}
