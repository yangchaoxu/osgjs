'use strict';
var CullVisitor = require( 'osg/CullVisitor' );
var mat4 = require( 'osg/glMatrix' ).mat4;
var Node = require( 'osg/Node' );
var NodeVisitor = require( 'osg/NodeVisitor' );
var StateSet = require( 'osg/StateSet' );
var MACROUTILS = require( 'osg/Utils' );
var vec4 = require( 'osg/glMatrix' ).vec4;
var ComputeBoundsVisitor = require( 'osg/ComputeBoundsVisitor' );


/**
 *  ShadowedScene provides a mechanism for decorating a scene that the needs to have shadows cast upon it.
 *  @class ShadowedScene
 *  @{@link [http://trac.openscenegraph.org/projects/osg//wiki/Support/ProgrammingGuide/osgShadow]}
 *  @{@link [http://developer.download.nvidia.com/presentations/2008/GDC/GDC08_SoftShadowMapping.pdf]};
 */
var ShadowedScene = function () {
    Node.call( this );

    // TODO: all  techniques (stencil/projTex/map/vol)
    this._shadowTechniques = [];

    this._optimizedFrustum = false;

    this._frustumReceivers = [ vec4.create(), vec4.create(), vec4.create(), vec4.create(), vec4.create(), vec4.create() ];

    this._tmpMat = mat4.create();

    this._receivingStateset = new StateSet();

    this._computeBoundsVisitor = new ComputeBoundsVisitor();

    this._castsShadowDrawTraversalMask = 0xffffffff;
    this._castsShadowBoundsTraversalMask = 0xffffffff;

    var settings;
    if ( settings && settings.userShadowCasterVisitor !== false ) {

        this._removeNodesNeverCastingVisitor = settings.userShadowCasterVisitor || new ShadowCasterVisitor( this._castsShadowTraversalMask );

    }

};

/** @lends ShadowedScene.prototype */
ShadowedScene.prototype = MACROUTILS.objectLibraryClass( MACROUTILS.objectInherit( Node.prototype, {

    getReceivingStateSet: function () {

        return this._receivingStateset;

    },

    getShadowTechniques: function () {
        return this._shadowTechniques;
    },

    addShadowTechnique: function ( technique ) {
        if ( this._shadowTechniques.length > 0 ) {
            if ( this._shadowTechniques.indexOf( technique ) !== -1 ) return;
        }

        this._shadowTechniques.push( technique );

        if ( technique.valid() ) {
            technique.setShadowedScene( this );
            technique.dirty();
        }
    },
    removeShadowTechnique: function ( technique ) {

        if ( this._shadowTechniques.length > 0 ) {
            var idx = this._shadowTechniques.indexOf( technique );
            if ( idx !== -1 ) {

                if ( this._shadowTechniques[ idx ].valid() ) {
                    this._shadowTechniques[ idx ].cleanSceneGraph();
                }
                this._shadowTechniques.splice( idx, 1 );
            }
        }
    },
    /** Clean scene graph from any shadow technique specific nodes, state and drawables.*/
    cleanSceneGraph: function () {
        for ( var i = 0, lt = this._shadowTechniques.length; i < lt; i++ ) {
            if ( this._shadowTechniques[ i ] && this._shadowTechniques[ i ].valid() ) {
                this._shadowTechniques[ i ].cleanSceneGraph();
            }
        }
    },

    /** Dirty any cache data structures held in the attached ShadowTechnique.*/
    dirty: function () {
        for ( var i = 0; i < this._shadowTechniques.length; i++ )
            this._shadowTechniques[ i ].dirty();
    },

    nodeTraverse: function ( nv ) {
        Node.prototype.traverse.call( this, nv );
    },

    computeShadowedSceneBounds: function ( cullVisitor ) {

        var bbox;

        if ( this._removeNodesNeverCastingVisitor ) {

            this._removeNodesNeverCastingVisitor.setNoCastMask( ~( this._castsShadowBoundsTraversalMask | this._castsShadowDrawTraversalMask ) );
            this._removeNodesNeverCastingVisitor.reset();
            this.accept( this._removeNodesNeverCastingVisitor );

        }

        this._computeBoundsVisitor.setTraversalMask( this._castsShadowBoundsTraversalMask );
        this._computeBoundsVisitor.reset();
        this.accept( this._computeBoundsVisitor );
        bbox = this._computeBoundsVisitor.getBoundingBox();

        if ( !bbox.valid() ) {

            // nothing to draw Early out.
            this.noDraw();

            if ( this._removeNodesNeverCastingVisitor ) {

                // remove our flags changes on any bitmask
                // not to break things
                this._removeNodesNeverCastingVisitor.restore();

            }

            return;

        }


        if ( this._debug ) {

            var min = bbox.getMin();
            var max = bbox.getMax();
            bbox.center( this._tmpVec );
            var matrix = this._debugNodeSceneCast.getMatrix();

            mat4.fromScaling( matrix, [ max[ 0 ] - min[ 0 ],
                max[ 1 ] - min[ 1 ],
                max[ 2 ] - min[ 2 ], 1
            ] );
            mat4.setTranslation( matrix,
                this._tmpVec );

        }

        // HERE we get the shadowedScene Current World Matrix
        // to get any world transform ABOVE the shadowedScene
        var worldMatrix = cullVisitor.getCurrentModelMatrix();
        // it does fuck up the results.
        bbox.transformMat4( bbox, worldMatrix );


        return bbox;
    },

    traverse: function ( nv ) {

        // update the scene
        if ( nv.getVisitorType() === NodeVisitor.CULL_VISITOR ) {

            var i, st, lt = this._shadowTechniques.length;

            // cull Shadowed Scene
            if ( lt ) nv.pushStateSet( this._receivingStateset );
            this.nodeTraverse( nv );
            if ( lt ) nv.popStateSet();

            var isDirty = false;
            for ( i = 0; i < lt; i++ ) {
                st = this._shadowTechniques[ i ];

                // dirty check for user playing with shadows inside update traverse
                if ( !st || !st.valid() ) continue;
                if ( st.isDirty() ) {
                    isDirty = true;
                    break;
                }

                if ( st.isEnabled() || !st.isFilledOnce() ) {
                    isDirty = true;
                    break;
                }
            }
            if ( !isDirty ) return;

            var bbox = this.computeShadowedSceneBounds( nv );
            if ( !bbox ) return;

            // cull Casters
            for ( i = 0; i < lt; i++ ) {
                st = this._shadowTechniques[ i ];
                // dirty check for user playing with shadows inside update traverse
                if ( st && st.valid() ) {

                    // those two checks
                    // here
                    // in case people update it from
                    // any update/cull/callback
                    if ( st.isDirty() )
                        st.init();


                    if ( st.isEnabled() || !st.isFilledOnce() ) {
                        st.updateShadowTechnique( nv );
                        st.cullShadowCasting( nv, bbox );
                    }
                }
            }

        } else {
            this.nodeTraverse( nv );
        }
    }


} ), 'osgShadow', 'ShadowedScene' );
MACROUTILS.setTypeID( ShadowedScene );

// same code like Node
CullVisitor.prototype[ ShadowedScene.typeID ] = CullVisitor.prototype[ Node.typeID ];

module.exports = ShadowedScene;
