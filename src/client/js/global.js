module.exports = {
    // Atalhos/teclas e outras constantes matemáticas
    KEY_ESC: 27,
    KEY_ENTER: 13,
    desenharBorda: false,
    spin: -Math.PI,
    ladosComida: 10,  

    // Canvas
    larguraTela: window.innerWidth - 10,
    alturaTela: window.innerHeight - 10,
    larguraJogo: 0,
    alturaJogo: 0,
    xoffset: -0,
    yoffset: -0,
    jogoIniciado: false,
    desconectado: false,
    morreu: false,
    kickado: false,
    alternarEstadoMassa: 0,
    backgroundColor: '#000000',
    lineColor: '#ffffff',
};
