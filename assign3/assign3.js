/**
 * Fractal Producer
 * CS 371
 * Professor Thomas Naps
 * Author: Christian Wendlandt
 * Version: 2019.3.14
 *
 * This code is for a GUI that produces fractals based on user input.
 *
 * The program is divided into 4 stages. Stages 2 through 4 can be switched between at will.
 * 1. This is the start up phase. The User can click on the canvas to create a polygon
 *        with up to 10 vertices. The only way to reset this phase is to use ctrl-R.
 *        The user uses SPACE to confirm their polygon and to enter stage 2.
 * 2. This is the cloning phase. The user trasforms a projection of the seed polygon with the
 *        Q, W, E, A, S, D, Z, X, C, uparrow, leftarrow, downarrow, and rightarrow keys, then
 *        places a clone of the seed polygon onto the projection with the SPACE key. Each
 *        of these keys is labeled on the html page. After the user is done placing up 
 *        to 10 child polygons, they use either the P or L keys to fractalize it and enter
 *        stages 3 or 4 respectively.
 * 3. This is the By-Level Fractalization stage, which simply draws the seed polygon and its
 *        children in a depth-first traversal. The number of levels can be adjusted with the -
 *        or + keys before or after the fractal has been drawn.
 * 4. This is the Spray Paint Fractalization stage, which simply draws points based on the
 *        IFS codes created in the cloning phase.
 *
 * For gee-golly-whiz points:
 *     Number of vertices are displayed.
 *     IFS codes are printed directly onto the page.
 *     The By-Level fractal polygons will inherit and mix colors with their parents.
 *     The colors of the Spray Paint points is based on their position on the canvas,
 *         which creates a smooth-shading effect.
 *     You can hold P down to continuously spray paint the canvas,
 *         creating a sort of heatmap effect.
 */

var gl;
var canvas;
var program;
var vBuffer;
var cBuffer;
var cloneProjection = mat4();
var projections = [];
var fractalization = 8;
const DRAW_SCENE = 0;
const CLONE_SCENE = 1;
const FRACTALIZE_SCENE = 2;
const SPRAY_SCENE = 3;
var scene = DRAW_SCENE;
var scenes = [];
const colorFactor = .4; //The mixing rate of the by-level coloring.
const step = 0.01; //How fast the shapes are moved by the user's input.
const rand = Math.floor(Math.random()*6); //Rolls for how colors will be assigned to branches.

/**
 * Loads specified vertices into the graphics buffer and initiates rendering.
 * Ties together the viewport(s) and event listeners with each of their html elements.
 * render() is called onload or on certain events.
 */
window.onload = function init()
{
	canvas = document.getElementById("gl-canvas");
	
	gl = WebGLUtils.setupWebGL(canvas);//More efficient
	//gl = WebGLDebugUtils.makeDebugContext(canvas.getContext("webgl"));//For debugging
	if(!gl){alert("WebGL isn't available");}
	
    scenes.push({"shapes":[],
            "vertexCounts":[],
            "vertices":[],
            "colors":[],
            "projectionFlags":[]});
	
	gl.clearColor(0,0,0,1);
	program = initShaders(gl, "vertex-shader", "fragment-shader");
	gl.useProgram(program);
    
	vBuffer = gl.createBuffer();
    cBuffer = gl.createBuffer();

    makeEvents();
	
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1i(gl.getUniformLocation(program, "sfx"), 0);
	render();
};

/**
 * Clears the canvas and draws the current scene onto the viewport.
 */
function render()
{
    gl.clear(gl.COLOR_BUFFER_BIT);
	drawScene(scene);
}

/**
 * Shapes and vertices are held and maintained in lists before being drawn.
 * This function puts that data where it needs to go while also bunching up the needed
 * inputs into one call.
 *
 * shape : The gl primitive for the shape.
 * vertexList : The array of vertices for the shape.
 * colorList : The array of color vectors that are applied to each vertex.
 * scene : the scene number that the shape belongs to. used for animation.
 *     use -1 for use in all scenes.
 * projectionFlag : A boolean flag that says whether a shape should be affected
 *     by the projection matrix. Useful for changing the position of a single shape
 *     without having to recompute vertices.
 */
function addShapeToScene(shape, vertexList, colorList, scene, projectionFlag)
{
    
    var i, end;
    if(scene >= 0)//add to only that scene
    {
        i = scene;
        end = scene + 1;
    }
    else//add to all scenes
    {
        i = 0;
        end = scenes.length;
    }
    for(; i < end; i++)
    {
        scenes[i].shapes.push(shape);
        vertexList.forEach(function(vertex){scenes[i].vertices.push(vertex);});
        scenes[i].vertexCounts.push(vertexList.length);
        colorList.forEach(function(color){scenes[i].colors.push(color);});
        scenes[i].projectionFlags.push(projectionFlag);
    }
}

/**
 * Removes the last shape to be added to a certian scene.
 *
 * scene : The number of the scene to be popped.
 */
function popShapeFromScene(scene)
{
    var numberOfVertices = scenes[scene].vertexCounts.pop();
    scenes[scene].shapes.pop();
    scenes[scene].projectionFlags.pop();
    for(var i = 0; i < numberOfVertices; i++)
    {
        scenes[scene].vertices.pop();
        scenes[scene].colors.pop();
    }
}

/**
 * Binds buffers and loads vertex and color data for the selected scene.
 * 
 * scene : The number of the scene to be loaded.
 */
function loadSceneToBuffers(scene)
{
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(scenes[scene].vertices), gl.STATIC_DRAW);
	var vPosition = gl.getAttribLocation(program, "vPosition");
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(scenes[scene].colors), gl.STATIC_DRAW);
	var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);
    
    document.getElementById('vertexCounter').innerHTML = 'Vertex Count : ' +
            scenes[scene].vertices.length;
}

/**
 * Takes the list gl primitives and vertex data and draws all stored shapes of a scene.
 *
 * scene : The number of the scene to be drawn.
 */
function drawScene(scene)
{   
    for(shapeIndex = vertexIndex = 0;
            shapeIndex < scenes[scene].shapes.length;
            vertexIndex += scenes[scene].vertexCounts[shapeIndex++])
    {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "projection"),
                false,
                scenes[scene].projectionFlags[shapeIndex] ?
                        flatten(cloneProjection) :
                        flatten(mat4()));
        gl.drawArrays(scenes[scene].shapes[shapeIndex],
                vertexIndex,
                scenes[scene].vertexCounts[shapeIndex]);
    }
}

/**
 * Acts as a helper function that implements each of the events linked to the
 *     keyboard and mouse actions.
 *     These are all hard-coded into this function.
 */
function makeEvents()
{
    canvas.onmousedown = function(event)
    {
        if(scene == DRAW_SCENE && scenes[DRAW_SCENE].vertices.length < 10)
        {
            if(scenes[DRAW_SCENE].shapes.length == 0)
            {
                scenes[DRAW_SCENE].shapes.push(gl.LINE_LOOP);
                scenes[DRAW_SCENE].vertexCounts.push(0);
                scenes[DRAW_SCENE].projectionFlags.push(false);
            }
            var vertices = vec2(
                    2*event.clientX/canvas.width-1,
                    2*(canvas.height-event.clientY)/canvas.height-1);
            scenes[DRAW_SCENE].vertexCounts[0]++;
            scenes[DRAW_SCENE].vertices.push(vec2(
                    2*event.clientX/canvas.width-1,
                    2*(canvas.height-event.clientY)/canvas.height-1));
            scenes[DRAW_SCENE].colors.push(vec4(1,1,1,1));
            loadSceneToBuffers(scene);
            render();
        }
    }

    window.onkeydown = function(event)
    {
        switch(event.keyCode)
        {
            case 37: //left arrow
                cloneProjection = mult(translate(-step,0,0), cloneProjection);
                render();
                break;
            case 38: //up arrow
                cloneProjection = mult(translate(0,step,0), cloneProjection);
                render();
                break;
            case 39: //right arrow
                cloneProjection = mult(translate(step,0,0), cloneProjection);
                render();
                break;
            case 40: //down arrow
                cloneProjection = mult(translate(0,-step,0), cloneProjection);
                render();
                break;
            case 65: //A key
                cloneProjection = mult(scalem(1-2*step,1,1), cloneProjection);
                render();
                break;
            case 68: //D key
                cloneProjection = mult(scalem(1+2*step,1,1), cloneProjection);
                render();
                break;
            case 83: //S key
                cloneProjection = mult(scalem(1,1-2*step,1), cloneProjection);
                render();
                break;
            case 87: //W key
                cloneProjection = mult(scalem(1,1+2*step,1), cloneProjection);
                render();
                break;
            case 90: //Z key
                cloneProjection = mult(scalem(1-2*step,1-2*step,1), cloneProjection);
                render();
                break;
            case 88: //X key
                cloneProjection = mult(scalem(1+2*step,1+2*step,1), cloneProjection);
                render();
                break;
            case 81: //Q key
                cloneProjection = mult(rotate(200*step,0,0,1), cloneProjection);
                render();
                break;
            case 69: //E key
                cloneProjection = mult(rotate(-200*step,0,0,1), cloneProjection);
                render();
                break;
            case 67: //C key
                if(projections.length > 0)
                {
                    cloneProjection = projections[projections.length-1];
                    render();
                }
                break;
            case 189: //- key
                if(fractalization > 1)
                {
                    fractalization--;
                    document.getElementById('fractalLevel')
                            .innerHTML = 'Fractalization Levels : ' + fractalization;
                    if(scene == FRACTALIZE_SCENE)
                        drawByLevelFractal();
                }
                break;
            case 187: //+ key
                fractalization++;
                document.getElementById('fractalLevel')
                        .innerHTML = 'Fractalization Levels : ' + fractalization;
                if(scene == FRACTALIZE_SCENE)
                    drawByLevelFractal();
                break;
            case 32: //Space key
                if(scene != CLONE_SCENE)
                    setUpCloneScene();
                else if(projections.length < 10)
                    makeClone();
                break;
            case 76: //L key
                if(scene != DRAW_SCENE && projections.length > 0)
                    drawByLevelFractal();
                break;
            case 80: //P key
                if(scene != DRAW_SCENE && projections.length > 0)
                    drawSprayPaintFractal();
                break;
        }
    }
}

/**
 * Makes the cloning scene ready for input and adds the green projection to the screen.
 */
function setUpCloneScene()
{
    switchScene(CLONE_SCENE);
    projections = [];
    scenes[CLONE_SCENE] = {"shapes":[],
            "vertexCounts":[],
            "vertices":[],
            "colors":[],
            "projectionFlags":[]};
    addShapeToScene(gl.LINE_LOOP,
            scenes[DRAW_SCENE].vertices,
            scenes[DRAW_SCENE].colors,
            CLONE_SCENE,
            false);  
    addShapeToScene(gl.LINE_LOOP,
            scenes[DRAW_SCENE].vertices,
            copyAsNewColor(scenes[DRAW_SCENE].colors,
            vec4(0,1,0,1)),
            CLONE_SCENE,
            true);
    cloneProjection = translate(.01,.01,0);
    loadSceneToBuffers(scene);
    printProjections();
    render();
}

/**
 * Replaces the projection polygon with a clone, then moves the projection back
 *     to its starting position.
 */
function makeClone()
{
    var projectedVertices = [];
    scenes[DRAW_SCENE].vertices.forEach(function(vertex)
    {
        projectedVertices.push(vec2(mult(cloneProjection, vec4(vertex))));
    });
    popShapeFromScene(CLONE_SCENE);
    addShapeToScene(gl.LINE_LOOP,
            projectedVertices,
            scenes[DRAW_SCENE].colors,
            CLONE_SCENE,
            false);
    projections.push(copyMatrix(cloneProjection));
    addShapeToScene(gl.LINE_LOOP,
            scenes[DRAW_SCENE].vertices,
            copyAsNewColor(scenes[DRAW_SCENE].colors,
            vec4(0,1,0,1)),
            CLONE_SCENE,
            true);
    cloneProjection = translate(.01,.01,0);
    loadSceneToBuffers(scene);
    printProjections();
    render();
}

/**
 * Constructs the scene for which the "by-level" fractalization will be drawn from.
 *     Calls render() after this is done.
 */
function drawByLevelFractal()
{
    switchScene(FRACTALIZE_SCENE);
    scenes[FRACTALIZE_SCENE] = {"shapes":[],
            "vertexCounts":[],
            "vertices":[],
            "colors":[],
            "projectionFlags":[]};
    generateFractalPointsByLevel(scenes[DRAW_SCENE].vertices,
            fractalization,
            vec4(0.2,0.2,0.2,1),
            0);
    loadSceneToBuffers(scene);
    render();
}

/**
 * Constructs the scene for which the "spray paint" fractalization will be drawn from.
 *     Calls render() after this is done.
 */
function drawSprayPaintFractal()
{
    switchScene(SPRAY_SCENE);
    scenes[SPRAY_SCENE] = {"shapes":[],
            "vertexCounts":[],
            "vertices":[],
            "colors":[],
            "projectionFlags":[]};
    generateFractalPoints(2000);
    loadSceneToBuffers(scene);
    gl.uniform1i(gl.getUniformLocation(program, "sfx"), 1);
    render();
    gl.uniform1i(gl.getUniformLocation(program, "sfx"), 0);
}

/**
 * Switchs the global scene variables and updates certain html elements.
 *
 * newScene : The number of the scene that is to be switched to.
 */
function switchScene(newScene)
{
    scene = newScene;
    for(var i = 0; i < 4; i++)
        document.getElementById('lights')
                .getElementsByTagName('td')[2*i]
                .style
                .backgroundColor = 'blue';
    document.getElementById('lights')
            .getElementsByTagName('td')[2*newScene]
            .style
            .backgroundColor = 'lime';
}

/**
 * Creates a copy of a matrix.
 *
 * matrix : The matrix to be copied.
 */
function copyMatrix(matrix)
{
    var newMatrix = [];
    for(var i = 0; i < matrix.length; i++)
    {
        newMatrix.push([]);
        for(var j = 0; j < matrix[i].length; j++)
            newMatrix[i].push(matrix[i][j]);
    }
    newMatrix.matrix = true;
    return newMatrix;
}

/**
 * Copies a list of color vectors but as a new color.
 *
 * colorVectors : The list of color vectors to be copied.
 * newColor : The color that the new vectors will have.
 */
function copyAsNewColor(colorVectors, newColor)
{
    var newVectors = [];
    colorVectors.forEach(function(vector)
    {
        newVectors.push(newColor);
    });
    return newVectors;
}

/**
 * Creates a new color based on the parent color and branch number inputted.
 *
 * color : The old color, typically that of a parent object.
 * branch : The branch number. At startup, 6 semi-random colors are distributed
 *     to each mod of 6.
 */
function branchColorer(color, branch)
{
    var red = color[0];
    var green = color[1];
    var blue = color[2];
    switch((branch + rand) % 6)
    {
        case 0:
            red = red * (1 - colorFactor) + colorFactor;
            break;
        case 1:
            green = green * (1 - colorFactor) + colorFactor;
            break;
        case 2:
            blue = blue * (1 - colorFactor) + colorFactor;
            break;
        case 3:
            red = red * (1 - colorFactor) + colorFactor;
            green = green * (1 - colorFactor) + colorFactor;
            break;
        case 4:
            red = red * (1 - colorFactor) + colorFactor;
            blue = blue * (1 - colorFactor) + colorFactor;
            break;
        case 5:
            green = green * (1 - colorFactor) + colorFactor;
            blue = blue * (1 - colorFactor) + colorFactor;
            break;
    }
    return vec4(red,green,blue,color[3]);
}

/**
 * Prints the IFS codes of current projections to a textbox on the html page.
 */
function printProjections()
{
    var text = '';
    projections.forEach(function(projection)
    {
        text += projection[0][0].toFixed(6).padStart(9, ' ') +
                projection[0][1].toFixed(6).padStart(10, ' ') +
                projection[0][3].toFixed(6).padStart(10, ' ') +
                projection[1][0].toFixed(6).padStart(10, ' ') +
                projection[1][1].toFixed(6).padStart(10, ' ') +
                projection[1][3].toFixed(6).padStart(10, ' ') +
                (1 / projections.length).toFixed(6).padStart(10, ' ') +
                '\n';
    });
    document.getElementById('textbox').value = text;
}

/**
 * Generates fractal polygons by level, based on the projections list.
 *
 * seed : The seed polygon to be copied.
 * level : The number of levels to be fractalized.
 * color : The seed color.
 */
function generateFractalPointsByLevel(seed, level, color)
{
    if(level > 0)
    {
	    addShapeToScene(gl.TRIANGLE_FAN, 
                seed,
                copyAsNewColor(scenes[DRAW_SCENE].colors, color),
                FRACTALIZE_SCENE,
                false);
        var branchNumber = 0;
        projections.forEach(function(projection)
        {
            var projectedVertices = [];
            seed.forEach(function(vertex)
            {
                projectedVertices.push(vec2(mult(projection, vec4(vertex))));
            });
            generateFractalPointsByLevel(projectedVertices,
                    level-1, 
                    branchColorer(color, branchNumber));
            branchNumber++;
        });
    }
}

/**
 * Generates vertices based on the projections list.
 *
 * numpts : The number of vertices to be produced.
 */
function generateFractalPoints(numpts)
{
    var iter, t;
    var oldx = 0;
    var oldy = 0;
    var newx, newy, p;
    var points = [];
    var colors = [];
    var cumulative_prob = [];
    for(var i = 1; i <= projections.length; i++)
        cumulative_prob.push(i / projections.length);

    iter = 0;
    while(iter < numpts + 21)
    {
	    p = Math.random();
            
	    // Select transformation t
	    t = 0;
	    while((p > cumulative_prob[t]) && (t < projections.length - 1))
            t++;
	    
	    // Transform point by transformation t 
        newx = oldx*projections[t][0][0] +
                oldy*projections[t][0][1] +
                projections[t][0][2] +
                projections[t][0][3];
        newy = oldx*projections[t][1][0] +
                oldy*projections[t][1][1] +
                projections[t][1][2] +
                projections[t][1][3];
            
	    // Jump around for awhile without plotting to make sure the
	    // first point seen is attracted into the fractal
	    if(iter > 20)
        {
	        points.push(vec2(newx, newy));
            colors.push(vec4(1,1,1,1));
        }
	    oldx = newx;
	    oldy = newy;
	    iter++;
    }
    addShapeToScene(gl.POINTS, points, colors, SPRAY_SCENE, false);
}
