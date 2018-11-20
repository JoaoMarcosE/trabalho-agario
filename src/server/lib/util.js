/* jslint node: true */

'use strict';

var cfg = require('../../../config.json');

// Determina o raio do circulo de acordo com a massa
exports.calculaRaio = function (massa) {
    return 4 + Math.sqrt(massa) * 6;
};


// Calcula a divisao do logaritmo por outro logaritmo
exports.dividirLog = (function () {
    var log = Math.log;
    return function (n, base) {
        return log(n) / (base ? log(base) : 1);
    };
})();

// calcula a distancia entre dois pontos
exports.calcularDistancia = function (p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) - p1.radius - p2.radius;
};

// Gera um numero aleatorio dentro de um perimetro
exports.gerarNumeroAleatorio = function (maior, menor) {
    return Math.floor(Math.random() * (menor - maior)) + maior;
};

// Gera um ponto aleatorio dentro da area do jogo
exports.gerarPontoAleatoria = function (raio) {
    return {
        x: exports.gerarNumeroAleatorio(raio, cfg.larguraJogo - raio),
        y: exports.gerarNumeroAleatorio(raio, cfg.alturaJogo - raio)
    };
};

exports.uniformPosition = function(points, radius) {
    var bestCandidate, maxDistance = 0;
    var numberOfCandidates = 10;

    if (points.length === 0) {
        return exports.gerarPontoAleatoria(radius);
    }

    // Generate the candidates
    for (var ci = 0; ci < numberOfCandidates; ci++) {
        var minDistance = Infinity;
        var candidate = exports.gerarPontoAleatoria(radius);
        candidate.radius = radius;

        for (var pi = 0; pi < points.length; pi++) {
            var distance = exports.calcularDistancia(candidate, points[pi]);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }

        if (minDistance > maxDistance) {
            bestCandidate = candidate;
            maxDistance = minDistance;
        } else {
            return exports.gerarPontoAleatoria(radius);
        }
    }

    return bestCandidate;
};

// Busca o indice do array do item que tem o mesmo id informado por parametro
exports.buscaPorId = function(array, id) {
    var i = array.length;

    while (i--) {
        if (array[i].id === id) {
            return i;
        }
    }

    return -1;
};

// Gera um cor aleatoria
exports.randomColor = function() {
    var color = '#' + ('00000' + (Math.random() * (1 << 24) | 0).toString(16)).slice(-6);
    var c = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    var r = (parseInt(c[1], 16) - 32) > 0 ? (parseInt(c[1], 16) - 32) : 0;
    var g = (parseInt(c[2], 16) - 32) > 0 ? (parseInt(c[2], 16) - 32) : 0;
    var b = (parseInt(c[3], 16) - 32) > 0 ? (parseInt(c[3], 16) - 32) : 0;

    return {
        fill: color,
        border: '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
    };
};
