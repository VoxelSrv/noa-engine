
var vec3 = require('gl-vec3')
var EntComp = require('ent-comp')
// var EntComp = require('../../../../npm-modules/ent-comp')


import { updatePositionExtents } from '../components/position'
import { setPhysicsFromPosition } from '../components/physics'



export default function (noa, opts) {
    return new Entities(noa, opts)
}



var defaults = {
    shadowDistance: 10,
}


/**
 * @class Entities
 * @typicalname noa.ents
 * @classdesc Wrangles entities. Aliased as `noa.ents`.
 * 
 * This class is an instance of [ECS](https://github.com/andyhall/ent-comp), 
 * and as such implements the usual ECS methods.
 * It's also decorated with helpers and accessor functions for getting component existence/state.
 * 
 * Expects entity definitions in a specific format - see source `components` folder for examples.
 */

function Entities(noa, opts) {
    // inherit from the ECS library
    EntComp.call(this)

    this.noa = noa
    opts = Object.assign({}, defaults, opts)

    // properties
    /** Hash containing the component names of built-in components. */
    this.names = {}

    // optional arguments to supply to component creation functions
    var componentArgs = {
        'shadow': opts.shadowDistance,
    }

    // Bundler magic to import everything in the ../components directory
    // each component module exports a default function: (noa) => compDefinition
    var reqContext = require.context('../components/', false, /\.js$/)
    for (var name of reqContext.keys()) {
        // convert name ('./foo.js') to bare name ('foo')
        var bareName = /\.\/(.*)\.js/.exec(name)[1]
        var arg = componentArgs[bareName] || undefined
        var compFn = reqContext(name)
        if (compFn.default) compFn = compFn.default
        var compDef = compFn(noa, arg)
        var comp = this.createComponent(compDef)
        this.names[bareName] = comp
    }


    // decorate the entities object with accessor functions
    /** @param id */
    this.isPlayer = function (id) { return id === noa.playerEntity }

    /** @param id */
    this.hasPhysics = this.getComponentAccessor(this.names.physics)

    /** @param id */
    this.cameraSmoothed = this.getComponentAccessor(this.names.smoothCamera)

    /** @param id */
    this.hasMesh = this.getComponentAccessor(this.names.mesh)

    // position functions
    /** @param id */
    this.hasPosition = this.getComponentAccessor(this.names.position)
    var getPos = this.getStateAccessor(this.names.position)

    /** @param id */
    this.getPositionData = getPos

    /** @param id */
    this._localGetPosition = function (id) {
        return getPos(id)._localPosition
    }

    /** @param id */
    this.getPosition = function (id) {
        return getPos(id).position
    }

    /** @param id */
    this._localSetPosition = function (id, pos) {
        var posDat = getPos(id)
        vec3.copy(posDat._localPosition, pos)
        updateDerivedPositionData(id, posDat)
    }

    /** @param id, positionArr */
    this.setPosition = function (id, pos, _yarg, _zarg) {
        // check if called with "x, y, z" args
        if (typeof pos === 'number') pos = [pos, _yarg, _zarg]
        // convert to local and defer impl
        var loc = noa.globalToLocal(pos, null, [])
        this._localSetPosition(id, loc)
    }

    /** @param id, xs, ys, zs */
    this.setEntitySize = function (id, xs, ys, zs) {
        var posDat = getPos(id)
        posDat.width = (xs + zs) / 2
        posDat.height = ys
        updateDerivedPositionData(id, posDat)
    }

    // called when engine rebases its local coords
    this._rebaseOrigin = function (delta) {
        for (var state of this.getStatesList(this.names.position)) {
            var locPos = state._localPosition
            var hw = state.width / 2
            nudgePosition(locPos, 0, -hw, hw, state.__id)
            nudgePosition(locPos, 1, 0, state.height, state.__id)
            nudgePosition(locPos, 2, -hw, hw, state.__id)
            vec3.subtract(locPos, locPos, delta)
            updateDerivedPositionData(state.__id, state)
        }
    }

    // safety helper - when rebasing, nudge extent away from 
    // voxel boudaries, so floating point error doesn't carry us accross
    function nudgePosition(pos, index, dmin, dmax, id) {
        var min = pos[index] + dmin
        var max = pos[index] + dmax
        if (Math.abs(min - Math.round(min)) < 0.002) pos[index] += 0.002
        if (Math.abs(max - Math.round(max)) < 0.001) pos[index] -= 0.001
    }

    // helper to update everything derived from `_localPosition`
    function updateDerivedPositionData(id, posDat) {
        vec3.copy(posDat._renderPosition, posDat._localPosition)
        vec3.add(posDat.position, posDat._localPosition, noa.worldOriginOffset)
        updatePositionExtents(posDat)
        var physDat = getPhys(id)
        if (physDat) setPhysicsFromPosition(physDat, posDat)
    }



    // physics
    var getPhys = this.getStateAccessor(this.names.physics)
    this.getPhysics = getPhys
    this.getPhysicsBody = function (id) { return getPhys(id).body }

    // misc
    this.getMeshData = this.getStateAccessor(this.names.mesh)
    this.getMovement = this.getStateAccessor(this.names.movement)
    this.getCollideTerrain = this.getStateAccessor(this.names.collideTerrain)
    this.getCollideEntities = this.getStateAccessor(this.names.collideEntities)

    // pairwise collideEntities event - this is for client to override
    this.onPairwiseEntityCollision = function (id1, id2) { }
}

// inherit from EntComp
Entities.prototype = Object.create(EntComp.prototype)
Entities.prototype.constructor = Entities




/*
 *
 *    ENTITY MANAGER API
 * 
 *  note most APIs are on the original ECS module (ent-comp)
 *  these are some overlaid extras for noa
 *
 */


/** @param id,name,state */
Entities.prototype.addComponentAgain = function (id, name, state) {
    // removes component first if necessary
    if (this.hasComponent(id, name)) this.removeComponent(id, name, true)
    this.addComponent(id, name, state)
}


/** @param x,y,z */
Entities.prototype.isTerrainBlocked = function (x, y, z) {
    // checks if terrain location is blocked by entities
    var off = this.noa.worldOriginOffset
    var xlocal = Math.floor(x - off[0])
    var ylocal = Math.floor(y - off[1])
    var zlocal = Math.floor(z - off[2])
    var blockExt = [
        xlocal + 0.001, ylocal + 0.001, zlocal + 0.001,
        xlocal + 0.999, ylocal + 0.999, zlocal + 0.999,
    ]
    var list = this.getStatesList(this.names.collideTerrain)
    for (var i = 0; i < list.length; i++) {
        var id = list[i].__id
        var ext = this.getPositionData(id)._extents
        if (extentsOverlap(blockExt, ext)) return true
    }
    return false
}



function extentsOverlap(extA, extB) {
    if (extA[0] > extB[3]) return false
    if (extA[1] > extB[4]) return false
    if (extA[2] > extB[5]) return false
    if (extA[3] < extB[0]) return false
    if (extA[4] < extB[1]) return false
    if (extA[5] < extB[2]) return false
    return true
}




/** @param box */
Entities.prototype.getEntitiesInAABB = function (box, withComponent) {
    // extents to test against
    var off = this.noa.worldOriginOffset
    var testExtents = [
        box.base[0] + off[0], box.base[1] + off[1], box.base[2] + off[2],
        box.max[0] + off[0], box.max[1] + off[1], box.max[2] + off[2],
    ]
    // entity position state list
    var entStates
    if (withComponent) {
        entStates = []
        for (var compState of this.getStatesList(withComponent)) {
            var pdat = this.getPositionData(compState.__id)
            if (pdat) entStates.push(pdat)
        }
    } else {
        entStates = this.getStatesList(this.names.position)
    }

    // run each test
    var hits = []
    for (var i = 0; i < entStates.length; i++) {
        var state = entStates[i]
        if (extentsOverlap(testExtents, state._extents)) {
            hits.push(state.__id)
        }
    }
    return hits
}



/** 
 * Helper to set up a general entity, and populate with some common components depending on arguments.
 * 
 * Parameters: position, width, height [, mesh, meshOffset, doPhysics, shadow]
 * 
 * @param position
 * @param width
 * @param height..
 */
Entities.prototype.add = function (position, width, height, // required
    mesh, meshOffset, doPhysics, shadow) {

    var self = this

    // new entity
    var eid = this.createEntity()

    // position component
    this.addComponent(eid, this.names.position, {
        position: position || [0, 0, 0],
        width: width,
        height: height
    })

    // rigid body in physics simulator
    if (doPhysics) {
        // body = this.noa.physics.addBody(box)
        this.addComponent(eid, this.names.physics)
        var body = this.getPhysicsBody(eid)

        // handler for physics engine to call on auto-step
        var smoothName = this.names.smoothCamera
        body.onStep = function () {
            self.addComponentAgain(eid, smoothName)
        }
    }

    // mesh for the entity
    if (mesh) {
        if (!meshOffset) meshOffset = vec3.create()
        this.addComponent(eid, this.names.mesh, {
            mesh: mesh,
            offset: meshOffset
        })
    }

    // add shadow-drawing component
    if (shadow) {
        this.addComponent(eid, this.names.shadow, { size: width })
    }

    return eid
}
