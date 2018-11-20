var global = require('./global');

class Canvas {
    constructor(params) {
        this.directionLock = false;
        this.alvo = global.alvo;
        this.socket = global.socket;
        var self = this;

        this.cv = document.getElementById('cvs');
        this.cv.width = global.larguraTela;
        this.cv.height = global.alturaTela;
        this.cv.addEventListener('mousemove', this.mouseInput, false);
        this.cv.parent = self;
        global.canvas = this;
    }

    mouseInput(mouse) {
    	if (!this.directionLock) {
    		this.parent.alvo.x = mouse.clientX - this.width / 2;
    		this.parent.alvo.y = mouse.clientY - this.height / 2;
            global.alvo = this.parent.alvo;
    	}
    }
}

module.exports = Canvas;
