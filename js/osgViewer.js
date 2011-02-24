/** -*- compile-command: "jslint-cli osgViewer.js" -*-
 *
 * Copyright (C) 2010 Cedric Pinson
 *
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * Authors:
 *  Cedric Pinson <cedric.pinson@plopbyte.net>
 *
 */

var osgViewer = {};

osgViewer.Viewer = function(canvas, canvasStats) {
    gl = WebGLUtils.setupWebGL(canvas, {antialias : true} );
    if (gl) {
        osg.init();
        this.canvas = canvas;
        this.frameRate = 60.0;
        osgUtil.UpdateVisitor = osg.UpdateVisitor;
        osgUtil.CullVisitor = osg.CullVisitor;

        this.canvasStats = canvasStats;
        this.enableStats = true;
    }
};


osgViewer.Viewer.prototype = {
    getScene: function() { return this.scene; },
    setScene: function(scene) { this.scene = scene; },
    init: function() {
        this.state = new osg.State();
        this.view = new osg.View();

        var ratio = this.canvas.width/this.canvas.height;
        this.view.setViewport(new osg.Viewport(0,0, this.canvas.width, this.canvas.height));
        this.view.setViewMatrix(osg.Matrix.makeLookAt([0,0,-10], [0,0,0], [0,1,0]));
        this.view.setProjectionMatrix(osg.Matrix.makePerspective(60, ratio, 1.0, 1000.0));

        this.view.light = new osg.Light();
        this.view.getOrCreateStateSet().setAttributeAndMode(new osg.Material());

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);


        this.updateVisitor = new osgUtil.UpdateVisitor();
        this.cullVisitor = new osgUtil.CullVisitor();

        this.renderStage = new osg.RenderStage();
        this.stateGraph = new osg.StateGraph();
        this.renderStage.setViewport(this.view.getViewport());

        //this.cullTime;
        //this.frameTime;
        //this.drawTime;

        if (this.enableStats) {
            this.initStats();
        }
    },


    initStats: function() {

        var createDomElements = function (elementToAppend) {
            var dom = [
                "<div id='StatsDiv' style='float: left; position: relative; width: 300px; height: 150; z-index: 10;'>",
                "<div id='StatsLegends' style='position: absolute; left: 0px; font-size: 10;color: #ffffff;'>",

                "<div id='frameRate' style='color: #00ff00;' > frameRate </div>",
                "<div id='frameTime' style='color: #ffff00;' > frameTime </div>",
                "<div id='updateTime' style='color: #d07b1f;'> updateTime </div>",
                "<div id='cullTime' style='color: #73e0ff;'> cullTime </div>",
                "<div id='drawTime' style='color: #944b10;'> drawTime </div>",
                "<div id='fps'> </div>",
                
                "</div>",

                "<div id='StatsCanvasDiv' style='background: rgba(14,14,14,0.8); float: left;'>",
                "<canvas id='StatsCanvas' width='300' height='150' ></canvas>",
                "</div>",

                "</div>"
            ].join("\n");
            if (elementToAppend === undefined) {
                elementToAppend = "body";
            }
            jQuery(dom).appendTo(elementToAppend);
            return document.getElementById("StatsCanvas");
        };

        if (this.canvasStats === undefined || this.canvasStats === null) {
            this.canvasStats = createDomElements();
        }
        this.stats = new Stats.Stats(this.canvasStats);
        var that = this;
        this.frameRate = 1;
        this.frameTime = 0;
        this.updateTime = 0;
        this.cullTime = 0;
        this.drawTime = 0;
        var height = this.canvasStats.height-2;
        this.stats.addLayer(jQuery("#frameRate").css("color"), function(t) { 
            var v = height/60.0 * (1000/that.frameRate);
            if (v > height) {
                return height;
            }
            return v;} );
        this.stats.addLayer(jQuery("#frameTime").css("color"), function(t) { 
            if (that.frameTime > height) {
                return height;
            }
            return that.frameTime;} );
        this.stats.addLayer(jQuery("#updateTime").css("color"), function(t) { 
            if (that.updateTime > height) {
                return height;
            }
            return that.updateTime;});
        this.stats.addLayer(jQuery("#cullTime").css("color"), function(t) { 
            if (that.cullTime > height) {
                return height;
            }
            return that.cullTime;} );
        this.stats.addLayer(jQuery("#drawTime").css("color"), function(t) { 
            if (that.drawTime > height) {
                return height;
            }
            return that.drawTime;} );
    },

    update: function() {
        this.view.accept(this.updateVisitor);
    },
    cull: function() {
        this.stateGraph.clean();
        this.renderStage.reset();

        this.cullVisitor.reset();
        this.cullVisitor.setStateGraph(this.stateGraph);
        this.cullVisitor.setRenderStage(this.renderStage);

        //this.renderStage.setViewport(this.view.getClearDepth());
        this.renderStage.setClearDepth(this.view.getClearDepth());
        this.renderStage.setClearColor(this.view.getClearColor());
        this.renderStage.setClearMask(this.view.getClearMask());

        this.view.accept(this.cullVisitor);
    },
    draw: function() {
        this.state.applyWithoutProgram();
        this.renderStage.draw(this.state);
    },

    frame: function() {
        var frameTime, beginFrameTime;
        frameTime = (new Date()).getTime();
        if (this.lastFrameTime === undefined) {
            this.lastFrameTime = 0;
        }
        this.frameRate = frameTime - this.lastFrameTime;
        this.lastFrameTime = frameTime;
        beginFrameTime = frameTime;

        if (this.updateVisitor.getFrameStamp().getFrameNumber() === 0) {
            this.updateVisitor.getFrameStamp().setReferenceTime(frameTime/1000.0);
            this.numberFrame = 0;
        }

        this.updateVisitor.getFrameStamp().setSimulationTime(frameTime/1000.0 - this.updateVisitor.getFrameStamp().getReferenceTime());

        if (this.manipulator) {
            this.view.setViewMatrix(this.manipulator.getInverseMatrix());
        }

        // time the update
        var updateTime = (new Date()).getTime();
        this.update();

        var cullTime = (new Date()).getTime();
        updateTime = cullTime - updateTime;
        this.updateTime = updateTime;

        this.cull();
        var drawTime = (new Date()).getTime();
        cullTime = drawTime - cullTime;
        this.cullTime = cullTime;

        this.draw();
        drawTime = (new Date()).getTime() - drawTime;
        this.drawTime = drawTime;

        var f = this.updateVisitor.getFrameStamp().getFrameNumber()+1;
        this.updateVisitor.getFrameStamp().setFrameNumber(f);

        this.numberFrame++;
        var endFrameTime = (new Date()).getTime();

        frameTime = endFrameTime - beginFrameTime;
        if (this.numberFrame % 60 === 0.0  && (this.disableDisplayFps === undefined || this.disableDisplayFps !== true)) {
            /* Run a test. */
            var nd = endFrameTime;
            var diff = nd - this.statsStartTime;

            if (this.fpsElement === undefined) {
                var element = jQuery("#fps");
                if (element === undefined) {
                    this.disableDisplayFps = true;
                } else {
                    this.fpsElement = element;
                }
            }
            if (this.fpsElement !== undefined) {
                this.fpsElement.text((this.numberFrame*1000/diff).toFixed(1));
            }
            this.statsStartTime = nd;
            this.numberFrame = 0;
        }

        if (this.enableStats && this.stats !== undefined) {
            this.stats.update();
        }
        this.frameTime = (new Date()).getTime() - beginFrameTime;
    },

    run: function() {
        if (this.scene === undefined) {
            this.scene = new osg.Node();
        }
        this.view.addChild(this.scene);
        var that = this;
        var render = function() {
            window.requestAnimationFrame(render, this.canvas);
            that.frame();
        };
        render();
    }, 

    getManipulator: function() { return this.manipulator; },
    setupManipulator: function(manipulator, dontBindDefaultEvent) {
        if (manipulator === undefined) {
            manipulator = new osgGA.OrbitManipulator();
        }

        this.manipulator = manipulator;
        this.manipulator.view = this.view;

        var that = this;
        this.manipulator.convertEventToCanvas = function(e) {
            var myObject = that.canvas;
            var posx,posy;
	    if (e.pageX || e.pageY) {
	        posx = e.pageX;
	        posy = e.pageY;
	    }
	    else if (e.clientX || e.clientY) {
	        posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
	        posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
	    }

            var divGlobalOffset = function(obj) {
                var x=0, y=0;
                x = obj.offsetLeft;
                y = obj.offsetTop;
                var body = document.getElementsByTagName('body')[0];
                while (obj.offsetParent && obj!=body){
                    x += obj.offsetParent.offsetLeft;
                    y += obj.offsetParent.offsetTop;
                    obj = obj.offsetParent;
                }
                return [x,y];
            };
	    // posx and posy contain the mouse position relative to the document
	    // Do something with this information
            var globalOffset = divGlobalOffset(myObject);
            posx = posx - globalOffset[0];
            posy = myObject.height-(posy - globalOffset[1]);
            return [posx,posy];
        };

        if (dontBindDefaultEvent === undefined || dontBindDefaultEvent === false) {

            var disableMouse = false;

            var touchDown = function(ev)
            {
                disableMouse = true;
                return Viewer.getManipulator().touchDown(ev);
            };
            var touchUp = function(ev)
            {
                disableMouse = true;
                return Viewer.getManipulator().touchUp(ev);
            };
            var touchMove = function(ev)
            {
                disableMouse = true;
                return Viewer.getManipulator().touchMove(ev);
            };

            document.addEventListener("MozTouchDown", touchDown, false);
            document.addEventListener("MozTouchUp", touchUp, false);
            document.addEventListener("MozTouchMove", touchMove, false);

            jQuery(this.canvas).bind( {
                mousedown: function(ev) {
                    if (disableMouse === false) {
                        return manipulator.mousedown(ev);
                    }
                },
                mouseup: function(ev) {
                    if (disableMouse === false) {
                        return manipulator.mouseup(ev);
                    }
                },
                mousemove: function(ev) {
                    if (disableMouse === false) {
                        return manipulator.mousemove(ev);
                    }
                },
                dblclick: function(ev) {
                    if (disableMouse === false) {
                        return manipulator.dblclick(ev);
                    }
                }
            });

            if (true) {
                if (jQuery(document).mousewheel !== undefined) {
                    jQuery(document).mousewheel(function(objEvent, intDelta, deltaX, deltaY) {
	                if (intDelta > 0){
                            manipulator.distanceDecrease();
	                }
	                else if (intDelta < 0){
                            manipulator.distanceIncrease();
	                }
                        return false;
	            });
                }
            }

            if (true) {
                jQuery(document).bind({'keydown' : function(event) {
                    if (event.keyCode === 33) { // pageup
                        manipulator.distanceIncrease();
                        return false;
                    } else if (event.keyCode === 34) { //pagedown
                        manipulator.distanceDecrease();
                        return false;
                    }
                }});
            }
        }
    }
};
