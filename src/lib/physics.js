
var createPhysics
createPhysics = require('./voxel-physics-engine')
// It errors for me otherwise...


export default function (noa, opts) {
    return makePhysics(noa, opts)
}


/**
 * @class Physics
 * @typicalname noa.physics
 * @classdesc Wrapper module for the physics engine. For docs see 
 * [andyhall/voxel-physics-engine](https://github.com/andyhall/voxel-physics-engine)
 */


var defaults = {
    gravity: [0, -10, 0],
    airDrag: 0.1,
}


function makePhysics(noa, opts) {
    opts = Object.assign({}, defaults, opts)
    var world = noa.world
    var solidLookup = noa.registry._solidityLookup
    var fluidLookup = noa.registry._fluidityLookup
    var colisionLookup = noa.registry._colisionLookup

    // physics engine runs in offset coords, so voxel getters need to match
    var offset = noa.worldOriginOffset

    var blockGetter = (x, y, z) => {
        var id = world.getBlockID(x + offset[0], y + offset[1], z + offset[2])
        return solidLookup[id] ? true : false
    }
    var isFluidGetter = (x, y, z) => {
        var id = world.getBlockID(x + offset[0], y + offset[1], z + offset[2])
        return fluidLookup[id]
    }
    var customColisionGetter = (x, y, z) => {
        var id = world.getBlockID(x + offset[0], y + offset[1], z + offset[2])
        return colisionLookup[id]
    }

    var physics = createPhysics(opts, blockGetter, isFluidGetter, customColisionGetter)

    return physics
}
