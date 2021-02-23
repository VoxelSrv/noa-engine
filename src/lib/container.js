

import EventEmitter from 'events'
var MicroShell = require('micro-game-shell').MicroGameShell



export default function (noa, opts) {
    return new Container(noa, opts)
}

/**
 * @class
 * @typicalname noa.container
 * @emits DOMready, gainedPointerLock, PointerLock
 * @classdesc Wraps `game-shell` module 
 * and manages HTML container, canvas, etc.
 */

function Container(noa, opts) {
    opts = opts || {}
    this._noa = noa

    this.element = opts.domElement || createContainerDiv()
    this.canvas = getOrCreateCanvas(this.element)

    // shell manages tick/render rates, and pointerlock/fullscreen
    var pollTime = 10
    this._shell = new MicroShell(this.element, pollTime)
    this._shell.tickRate = opts.tickRate
    this._shell.maxRenderRate = opts.maxRenderRate
    this._shell.stickyPointerLock = opts.stickyPointerLock
    this._shell.stickyFullscreen = opts.stickyFullscreen

    // mouse state/feature detection
    this.supportsPointerLock = false
    this.pointerInGame = false
    this.isFocused = document.hasFocus()
    this.hasPointerLock = false

    // core timing events
    this._shell.onTick = (dt) => {
        noa.tick(dt)
    }
    this._shell.onRender = (dt, framePart) => {
        noa.render(framePart, dt)
    }

    // shell listeners
    this._shell.onPointerLockChanged = (hasPL) => {
        this.hasPointerLock = hasPL
        this.emit((hasPL) ? 'gainedPointerLock' : 'lostPointerLock')
        // this works around a Firefox bug where no mouse-in event 
        // gets issued after starting pointerlock
        if (hasPL) this.pointerInGame = true
    }
    this._shell.onResize = () => {
        noa.rendering.resize()
    }

    // catch and relay domReady event
    this._shell.onInit = () => {
        // listeners to track when game has focus / pointer
        detectPointerLock(this)
        this.element.addEventListener('mouseenter', () => { this.pointerInGame = true })
        this.element.addEventListener('mouseleave', () => { this.pointerInGame = false })
        window.addEventListener('focus', () => { this.isFocused = true })
        window.addEventListener('blur', () => { this.isFocused = false })
        // catch edge cases for initial states
        var onFirstMousedown = () => {
            this.pointerInGame = true
            this.isFocused = true
            this.element.removeEventListener('mousedown', onFirstMousedown)
        }
        this.element.addEventListener('mousedown', onFirstMousedown)
        // emit for engine core
        this.emit('DOMready')
    }
}

Container.prototype = Object.create(EventEmitter.prototype)





/*
 *   PUBLIC API 
 */

Container.prototype.appendTo = function (htmlElement) {
    this.element.appendChild(htmlElement)
}



Container.prototype.setPointerLock = function (lock) {
    // not sure if this will work robustly
    this._shell.pointerLock = !!lock
}





/*
 *   INTERNALS
 */



function createContainerDiv() {
    // based on github.com/mikolalysenko/game-shell - makeDefaultContainer()
    var container = document.createElement("div")
    container.tabindex = 1
    container.style.position = "fixed"
    container.style.left = "0px"
    container.style.right = "0px"
    container.style.top = "0px"
    container.style.bottom = "0px"
    container.style.height = "100%"
    container.style.overflow = "hidden"
    document.body.appendChild(container)
    document.body.style.overflow = "hidden" //Prevent bounce
    document.body.style.height = "100%"
    container.id = 'noa-container'
    return container
}


function getOrCreateCanvas(el) {
    // based on github.com/stackgl/gl-now - default canvas
    var canvas = el.querySelector('canvas')
    if (!canvas) {
        canvas = document.createElement('canvas')
        canvas.style.position = "absolute"
        canvas.style.left = "0px"
        canvas.style.top = "0px"
        canvas.style.height = "100%"
        canvas.style.width = "100%"
        canvas.id = 'noa-canvas'
        el.insertBefore(canvas, el.firstChild)
    }
    return canvas
}


// set up stuff to detect pointer lock support.
// Needlessly complex because Chrome/Android claims to support but doesn't.
// For now, just feature detect, but assume no support if a touch event occurs
// TODO: see if this makes sense on hybrid touch/mouse devices
function detectPointerLock(self) {
    var lockElementExists =
        ('pointerLockElement' in document) ||
        ('mozPointerLockElement' in document) ||
        ('webkitPointerLockElement' in document)
    if (lockElementExists) {
        self.supportsPointerLock = true
        var listener = function (e) {
            self.supportsPointerLock = false
            document.removeEventListener(e.type, listener)
        }
        document.addEventListener('touchmove', listener)
    }
}
