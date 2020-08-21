
// Spark AR Game / Jason Kwok / 20-8-2020

const Scene = require('Scene');
const Time = require('Time')
const CANNON = require('cannon');
const console = require('Diagnostics');
const FaceTracking = require('FaceTracking');
const Patches = require('Patches');
const TouchGestures = require('TouchGestures');
const CameraInfo = require('CameraInfo');
const Reactive = require('Reactive');

// Basket Size and Hitbox Range
const basketSize = new CANNON.Vec3(0.03, 0.005, 0.03);
const hitboxSize = new CANNON.Vec3(0.07, 0.05, 0);

// Stones
const numberOfStone = 10; // stone1, stone2, stone3, stone4, stone5, stone6 (stone_default)

// Spawn Stone Rate
var totalWaitTime = 0;
const spawnTimeInterval = 0.7; // seconds

// Gravity
const gravity = -0.2;

// Time Limit
const TimeLimit = 40; // seconds
var timer = TimeLimit;
var score = 0;

// End Message
const endMessage = "Good Job!";

Promise.all([
    // Find assets from Project
    Scene.root.findFirst('Stone1'),
    Scene.root.findFirst('Stone2'),
    Scene.root.findFirst('Stone3'),
    Scene.root.findFirst('Stone4'),
    Scene.root.findFirst('Stone5'),
    Scene.root.findFirst('Stone6'),
    Scene.root.findFirst('Stone7'),
    Scene.root.findFirst('Stone8'),
    Scene.root.findFirst('Stone9'),
    Scene.root.findFirst('Stone10'),
    Scene.root.findFirst('BasketObject'),
    Scene.root.findFirst('DebugObject'),
    Scene.root.findFirst('ScoreText'),
    Scene.root.findFirst('TimerText'),
    Scene.root.findFirst('gameText'),
    Scene.root.findFirst('endText0'),
    Scene.root.findFirst('endText'),
    Scene.root.findFirst('endScore'),
  ]).then(onReady)
  async function onReady(assets) {
    const [Stone1, Stone2, Stone3, Stone4, Stone5, Stone6, Stone7, Stone8, Stone9, Stone10, BasketObject, DebugObject, 
        ScoreText, TimerText, gameText, endText0, endText, endScore] = assets;

    // Game Start Logic
    const gameStart = await Patches.outputs.getBoolean('gameStart');
    var hasBegan = false;

    // Stone Objects Name (sphereBody.name)
    const stones = [Stone1, Stone2, Stone3, Stone4, Stone5, Stone6, Stone7, Stone8, Stone9, Stone10];

    // Make Basket Follow Forehead
    const face = FaceTracking.face(0);
    const forehead = face.forehead;
    const faceTransform = face.cameraTransform;
    const basketTransform = BasketObject.transform;

    // Create cannon world and setting gravity
    const world = new CANNON.World();
    world.gravity.set(0, gravity, 0);
    world.broadphase = new CANNON.NaiveBroadphase();


    // Create 5 sphere body and setting its shape and properties
    const radius = 0.03;
    const sphereProps = {
        mass: 1,
        radius: radius,
        shape: new CANNON.Sphere(radius),
    }
    var sphereBody = [];
    for (var i=0;i<numberOfStone;i++) {
        sphereBody[i] = new CANNON.Body(sphereProps);
        sphereBody[i].name = "stone" + String(i + 1);
        sphereBody[i].transformObject = stones[i].transform;
        world.addBody(sphereBody[i]);
    }

    // Put Stones in Spawn Queue
    var spawnQueue = [];
    spawnQueue = shuffle(sphereBody);

    // Create basket body
    const basketProps = {
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(basketSize)
    }
    const basketBody = new CANNON.Body(basketProps);
    world.addBody(basketBody);

    // BasketBody track Face
    BasketObject.worldTransform.x.monitor().subscribe(function (posX) {
        basketBody.position.x = posX.newValue * -1;
    });
    BasketObject.worldTransform.y.monitor().subscribe(function (posY) {
        basketBody.position.y = posY.newValue; // Basket Offset
    });

    basketBody.position.z = -0.1;

    // Rotation Follow, Legacy Code.
    /*
    BasketObject.worldTransform.rotationX.monitor().subscribe(function (rotX) {
        basketBody.rotationX = rotX.newValue * -1;
    });
    BasketObject.worldTransform.rotationY.monitor().subscribe(function (rotY) {
        basketBody.rotationY = rotY.newValue * -1;
    });
    BasketObject.worldTransform.rotationZ.monitor().subscribe(function (rotZ) {
        basketBody.rotationZ = rotZ.newValue * -1;
    });
    */

    // Configure time step for Cannon
    const fixedTimeStep = 1.0 / 60.0;
    const maxSubSteps = 3;
    const timeInterval = 30;
    let lastTime;


    // Create time interval loop for cannon 
    Time.setInterval(function (time) {
        if (lastTime !== undefined) {
            let dt = (time - lastTime) / 1000;
            world.step(fixedTimeStep, dt, maxSubSteps);

            // Spark AR 3D Transform Update
            for (var i=0;i<numberOfStone;i++) {
                sphereBody[i].transformObject.x = sphereBody[i].position.x;
                sphereBody[i].transformObject.y = sphereBody[i].position.y;
                sphereBody[i].transformObject.z = sphereBody[i].position.z;
            }

            // For Debug
            //DebugObject.transform.x = basketBody.position.x;
            //DebugObject.transform.y = basketBody.position.y;
            //DebugObject.transform.z = -0.1;

            if (gameStart.pinLastValue()) {
                hasBegan = true;
                Patches.setBooleanValue('confetti', false);
            } else {
                timer = TimeLimit;
                score = 0;
                gameText.text = "";
                ScoreText.text = "Score: "+String(score);
                TimerText.text = String(Math.floor(timer));
            }

            // Game Logic
            if (gameStart.pinLastValue() && timer > 0) {
                gameText.text = "";
                // Stone Object Loop
                for (var i=0;i<numberOfStone;i++) {
                    // Stone-Basket Collision Event -> Push to spawn queue
                    var diffX = sphereBody[i].position.x - basketBody.position.x;
                    var diffY = sphereBody[i].position.y - basketBody.position.y;
                    if (Math.abs(diffX) <= hitboxSize.x && Math.abs(diffY) <= hitboxSize.y) {
                        sphereBody[i].position.x = -0.3;
                        sphereBody[i].position.y = 0.3;
                        scoreAdd(sphereBody[i], ScoreText);
                    }
                    // When ball out of screen area -> Push to spawn queue
                    if (sphereBody[i].position.y <= -0.3 || Math.abs(sphereBody[i].position.x) >= 0.17) {
                        sphereBody.push(sphereBody[i]);
                    }
                    
                    sphereBody[i].position.z = -0.1;
                }

                // Delta Time Timer
                if ((timer - dt) <= 0) {
                    timer = 0;
                } else {
                    timer -= dt;
                }
                TimerText.text = String(Math.floor(timer));

                // Spawner
                if (sphereBody.length > 0) {
                    if (totalWaitTime >= spawnTimeInterval) {
                            reset(sphereBody[0], 0.35);
                            sphereBody.shift();
                        totalWaitTime = 0;
                    } else {
                        totalWaitTime += dt;
                    }
                }

                // Game Logic - End Game
                } else {
                if (timer <= 0) {
                    Patches.setBooleanValue('confetti', true);
                    endText0.text = endMessage;
                    endText.text = "Your Score: ";
                    endScore.text = String(score);
                    TimerText.text = "";
                    ScoreText.text = "";
                } else {
                    for (var i=0;i<numberOfStone;i++) {
                        sphereBody[i].position.y = -1;
                    }
                    if (hasBegan) {
                        gameText.text = "- PAUSED -";
                    }
                }
            }
        }   
        lastTime = time;
    }, timeInterval);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    return array;
}

function reset(object, yPos) {
    object.position.y = yPos;
    object.position.x = (Math.random() * (0.13 + 0.13) - 0.13);
    object.velocity.y = 0;
    object.velocity.x = 0;
}

function scoreAdd(object, scoreText) {
    if (timer > 0) {
        switch(object.name) {
            case "stone1":
                score += 5;
                break;
            case "stone2":
                score += 5;
                break;
            case "stone3":
                score += 5;
                break;
            case "stone4":
                score += 5;
                break;
            case "stone5":
                score += 5;
                break;
            default:
                score += 3;
                break;
        }
        scoreText.text = "Score: " + String(score);
    }
}