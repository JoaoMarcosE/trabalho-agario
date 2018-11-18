module.exports = {
    // Keys and other mathematical constants
    KEY_ESC: 27,
    KEY_ENTER: 13,
    KEY_LEFT: 37,
    KEY_UP: 38,
    KEY_RIGHT: 39,
    KEY_DOWN: 40,
    borderDraw: false,
    spin: -Math.PI,
    enemySpin: -Math.PI,
    foodSides: 10,  

    // Canvas
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    gameWidth: 0,
    gameHeight: 0,
    xoffset: -0,
    yoffset: -0,
    gameStart: false,
    disconnected: false,
    died: false,
    kicked: false,
    continuity: false,
    toggleMassState: 0,
    backgroundColor: '#f2fbff',
    lineColor: '#000000',
};
