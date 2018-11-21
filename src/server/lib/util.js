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
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) - p1.raio - p2.raio;
};

// Gera um numero aleatorio dentro de um perimetro
exports.gerarNumeroAleatorio = function (maior, menor) {
    return Math.floor(Math.random() * (menor - maior)) + maior;
};

// Gera um ponto aleatorio dentro da area do jogo
exports.gerarPosicaoAleatoria = function (raio) {
    return {
        x: exports.gerarNumeroAleatorio(raio, cfg.larguraJogo - raio),
        y: exports.gerarNumeroAleatorio(raio, cfg.alturaJogo - raio)
    };
};

exports.gerarPosicaoUniforme = function(points, raio) {
    var bestCandidate, maxDistance = 0;
    var numberOfCandidates = 10;

    if (points.length === 0) {
        return exports.gerarPosicaoAleatoria(raio);
    }

    // Gera os candidatos
    for (var ci = 0; ci < numberOfCandidates; ci++) {
        var minDistance = Infinity;
        var candidate = exports.gerarPosicaoAleatoria(raio);
        candidate.raio = raio;

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
            return exports.gerarPosicaoAleatoria(raio);
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
