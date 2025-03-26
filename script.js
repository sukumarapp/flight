// <<< Import THREE via module specifier from importmap >>>
import * as THREE from 'three';

// --- Configuration ---
const GRID_SIZE = 1;
const PLANE_SIZE = 100;
const SNAKE_SPEED = 8;
const INITIAL_SNAKE_LENGTH = 3;
const BASE_SNAKE_SIZE_MULTIPLIER = 0.8;

const MAX_FOOD_COUNT = 20;
const MAX_POWERUP_COUNT = 3;
const POWERUP_SPAWN_CHANCE = 0.003;
const POWERUP_DURATION = 10000;
const SPEED_UP_FACTOR = 1.5;
const SLOW_DOWN_FACTOR = 0.5;
const SHRINK_FACTOR = 0.5;

const NUM_HOUSES = 8;
const NUM_STONE_CLUSTERS = 15;
const NUM_BUSHES = 25;

const POWERUP_TYPE_SHRINK = 'shrink';
const POWERUP_TYPE_SPEEDUP = 'speedup';
const POWERUP_TYPE_SLOWDOWN = 'slowdown';

// Colors (remain the same)
const SNAKE_COLOR = 0x00cc00; const FOOD_COLOR = 0xff00ff; const PLANT_COLOR_TRUNK = 0x8B4513; const PLANT_COLOR_LEAVES = 0x228B22; const STONE_COLOR = 0x888890; const BUSH_COLOR = 0x206020; const HOUSE_BASE_COLOR = 0xffccaa; const HOUSE_ROOF_COLOR = 0xaa4444; const POWERUP_SHRINK_COLOR = 0x0000ff; const POWERUP_SPEEDUP_COLOR = 0xffff00; const POWERUP_SLOWDOWN_COLOR = 0xff8800;

// --- Game State ---
let scene, camera, renderer;
let snake = []; let foods = []; let powerUps = []; let sceneryObjects = [];
let direction = new THREE.Vector3(GRID_SIZE, 0, 0);
let turnRequested = null;
let activePowerUp = null; let powerUpExpiryTime = 0;
let currentSnakeSpeed = SNAKE_SPEED; let currentSnakeSizeMultiplier = BASE_SNAKE_SIZE_MULTIPLIER;
let score = 0; let gameRunning = false; let gameOver = false;
let lastUpdateTime = 0; let updateInterval = 1000 / currentSnakeSpeed;

// --- Camera State ---
let currentTargetCameraPos = new THREE.Vector3();
let currentLookAtTarget = new THREE.Vector3();
let firstFrameAfterStart = true;

// --- Camera Config ---
const CAMERA_FOLLOW_DISTANCE = 20; const CAMERA_SMOOTH_FACTOR = 0.07;

// --- UI Elements ---
const scoreElement = document.getElementById('score');
const instructionsElement = document.getElementById('instructions');
const gameOverElement = document.getElementById('game-over');
const finalScoreElement = document.getElementById('final-score');
const playMusicBtn = document.getElementById('playMusicBtn'); // <<< Audio Button Refs
const pauseMusicBtn = document.getElementById('pauseMusicBtn');
const musicStatus = document.getElementById('musicStatus');

// --- Audio Elements --- <<< NEW >>>
const bgMusic = new Audio('background.mp3'); // Replace with your music file path
bgMusic.loop = true;
bgMusic.volume = 0.2; // Adjust volume (0.0 to 1.0)

const eatSound = new Audio('eat.wav'); // Replace with your eat sound file path
eatSound.volume = 1.0; // Adjust volume

// --- Initialization ---
function init() {
    // Scene, Camera, Renderer setup (remains mostly the same)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, PLANE_SIZE * 0.6, PLANE_SIZE * 1.2);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, CAMERA_FOLLOW_DISTANCE, CAMERA_FOLLOW_DISTANCE);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // <<< Set pixel ratio for sharper rendering on high DPI mobile screens >>>
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Lighting (remains the same)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); directionalLight.position.set(PLANE_SIZE * 0.3, 50, PLANE_SIZE * 0.2); directionalLight.castShadow = true; directionalLight.shadow.mapSize.width = 2048; directionalLight.shadow.mapSize.height = 2048; const shadowCamSize = PLANE_SIZE * 0.7; directionalLight.shadow.camera.near = 10; directionalLight.shadow.camera.far = 100; directionalLight.shadow.camera.left = -shadowCamSize; directionalLight.shadow.camera.right = shadowCamSize; directionalLight.shadow.camera.top = shadowCamSize; directionalLight.shadow.camera.bottom = -shadowCamSize; scene.add(directionalLight);

    // Ground Plane (remains the same)
    const planeGeometry = new THREE.PlaneGeometry(PLANE_SIZE * GRID_SIZE, PLANE_SIZE * GRID_SIZE); const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x90ee90, side: THREE.DoubleSide }); const plane = new THREE.Mesh(planeGeometry, planeMaterial); plane.rotation.x = -Math.PI / 2; plane.receiveShadow = true; scene.add(plane);

    // Add Scenery & Plants (remains the same)
    createAnimatedPlants(30);
    createScenery();

    // Initial Setup
    resetGame(); // Will position camera

    // --- Event Listeners ---
    window.addEventListener('keydown', handleKeyDown); // Keep for desktop
    window.addEventListener('resize', onWindowResize);
    // <<< Add Touch Listener >>>
    // Listen on the canvas element to avoid interfering with UI buttons
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: false }); // Use passive: false to allow preventDefault

    // <<< Add Audio Button Listeners >>>
    playMusicBtn.addEventListener('click', playBgMusic);
    pauseMusicBtn.addEventListener('click', pauseBgMusic);

    // Start Animation Loop
    animate(0);
}

// --- Audio Control Functions --- <<< NEW >>>
function playBgMusic() {
    bgMusic.play().then(() => {
        if(musicStatus) musicStatus.textContent = 'Playing';
        console.log("Background music playing.");
    }).catch(error => {
        console.error("Background music play failed:", error);
        if(musicStatus) musicStatus.textContent = 'Play Failed (Interact?)';
        // Maybe show instructions element again briefly if play fails?
        // instructionsElement.classList.remove('hidden');
        // setTimeout(() => instructionsElement.classList.add('hidden'), 3000);
    });
}

function pauseBgMusic() {
    bgMusic.pause();
    if(musicStatus) musicStatus.textContent = 'Paused';
    console.log("Background music paused.");
}

function playEatSound() {
    eatSound.currentTime = 0; // Rewind to start
    eatSound.play().catch(error => {
        // Don't worry too much if eat sound fails occasionally
        console.warn("Eat sound play failed:", error);
    });
}

// --- Touch Handling --- <<< NEW >>>
function handleTouchStart(event) {
    // Prevent default touch behavior like scrolling/zooming on the canvas
    event.preventDefault();

    if (gameOver) {
        resetGame(); // Tap screen to restart when game over
        return;
    }

    if (!gameRunning) {
        // Try starting game AND music on first touch
        // Using touch to start should satisfy browser autoplay policies
        startGame();
        // Attempt to play music here as it's user-initiated
        playBgMusic();
        return;
    }

    // Game is running, handle turns
    if (event.touches.length > 0) {
        const touchX = event.touches[0].clientX;
        const screenWidth = window.innerWidth;

        if (!turnRequested) { // Prevent queuing multiple turns
            if (touchX < screenWidth / 2) {
                // Tap on left half
                turnRequested = 'left';
                // console.log("Touch Turn: Left"); // Debugging
            } else {
                // Tap on right half
                turnRequested = 'right';
                // console.log("Touch Turn: Right"); // Debugging
            }
        }
    }
}


// --- Game Object Creation ---
// (createSnakeSegment, createSingleFood, createPowerUp, scenery functions remain the same)
function createSnakeSegment(position) { const radius=(GRID_SIZE/2*0.9)*currentSnakeSizeMultiplier; const geometry=new THREE.SphereGeometry(radius,12,12); const material=new THREE.MeshStandardMaterial({color:SNAKE_COLOR,roughness:0.4,metalness:0.1}); const segment=new THREE.Mesh(geometry,material); segment.position.copy(position); segment.castShadow=true; segment.receiveShadow=true; scene.add(segment); return segment; }
function createSingleFood(position) { const geometry=new THREE.IcosahedronGeometry(GRID_SIZE/2*0.7,0); const material=new THREE.MeshStandardMaterial({color:FOOD_COLOR,emissive:FOOD_COLOR,emissiveIntensity:0.5,roughness:0.1,metalness:0.1}); const foodItem=new THREE.Mesh(geometry,material); foodItem.position.copy(position); foodItem.castShadow=true; const pointLight=new THREE.PointLight(FOOD_COLOR,1,GRID_SIZE*2); foodItem.add(pointLight); scene.add(foodItem); foods.push(foodItem); }
function createPowerUp(position,type) { let geometry,color; switch(type){ case POWERUP_TYPE_SHRINK: geometry=new THREE.SphereGeometry(GRID_SIZE/2*0.6,16,16); color=POWERUP_SHRINK_COLOR; break; case POWERUP_TYPE_SPEEDUP: geometry=new THREE.ConeGeometry(GRID_SIZE/2*0.5,GRID_SIZE*0.8,16); color=POWERUP_SPEEDUP_COLOR; break; case POWERUP_TYPE_SLOWDOWN: geometry=new THREE.BoxGeometry(GRID_SIZE*0.7,GRID_SIZE*0.7,GRID_SIZE*0.7); color=POWERUP_SLOWDOWN_COLOR; break; default: geometry=new THREE.TorusKnotGeometry(GRID_SIZE/2*0.4,GRID_SIZE/2*0.15,64,8); color=0xffffff;} const material=new THREE.MeshStandardMaterial({color:color,emissive:color,emissiveIntensity:0.6,roughness:0.2,metalness:0.1}); const powerUpItem=new THREE.Mesh(geometry,material); powerUpItem.position.copy(position); powerUpItem.position.y=GRID_SIZE/2; powerUpItem.castShadow=true; powerUpItem.userData.type=type; const pointLight=new THREE.PointLight(color,0.8,GRID_SIZE*2.5); powerUpItem.add(pointLight); scene.add(powerUpItem); powerUps.push(powerUpItem); }
function createHouse(position) { const houseGroup=new THREE.Group(); houseGroup.position.copy(position); const baseWidth=GRID_SIZE*(2.5+Math.random()*1.5); const baseHeight=GRID_SIZE*(1.5+Math.random()*0.8); const baseDepth=GRID_SIZE*(2.0+Math.random()*1.0); const baseGeo=new THREE.BoxGeometry(baseWidth,baseHeight,baseDepth); const baseMat=new THREE.MeshStandardMaterial({color:HOUSE_BASE_COLOR,roughness:0.8}); const baseMesh=new THREE.Mesh(baseGeo,baseMat); baseMesh.position.y=baseHeight/2; baseMesh.castShadow=true; baseMesh.receiveShadow=true; houseGroup.add(baseMesh); const roofHeight=baseHeight*0.6; const roofGeo=new THREE.ConeGeometry(baseWidth*0.7,roofHeight,4); const roofMat=new THREE.MeshStandardMaterial({color:HOUSE_ROOF_COLOR,roughness:0.7}); const roofMesh=new THREE.Mesh(roofGeo,roofMat); roofMesh.position.y=baseHeight+roofHeight/2-GRID_SIZE*0.05; roofMesh.rotation.y=Math.PI/4; roofMesh.castShadow=true; houseGroup.add(roofMesh); scene.add(houseGroup); sceneryObjects.push(houseGroup); }
function createStoneCluster(position) { const clusterGroup=new THREE.Group(); clusterGroup.position.copy(position); const stoneCount=3+Math.floor(Math.random()*4); for(let i=0; i<stoneCount; i++){ const radius=GRID_SIZE*(0.3+Math.random()*0.5); const stoneGeo=new THREE.IcosahedronGeometry(radius,0); const stoneMat=new THREE.MeshStandardMaterial({color:STONE_COLOR,roughness:0.9,flatShading:true}); const stoneMesh=new THREE.Mesh(stoneGeo,stoneMat); const offsetRadius=GRID_SIZE*0.5; stoneMesh.position.x=(Math.random()-0.5)*offsetRadius*2; stoneMesh.position.z=(Math.random()-0.5)*offsetRadius*2; stoneMesh.position.y=radius*0.6; stoneMesh.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI); stoneMesh.castShadow=true; stoneMesh.receiveShadow=true; clusterGroup.add(stoneMesh); } scene.add(clusterGroup); sceneryObjects.push(clusterGroup); }
function createBush(position) { const radius=GRID_SIZE*(0.6+Math.random()*0.6); const bushGeo=new THREE.SphereGeometry(radius,8,6); const bushMat=new THREE.MeshStandardMaterial({color:BUSH_COLOR,roughness:0.8}); const bushMesh=new THREE.Mesh(bushGeo,bushMat); bushMesh.position.copy(position); bushMesh.position.y=radius*0.5; bushMesh.castShadow=true; bushMesh.receiveShadow=true; scene.add(bushMesh); sceneryObjects.push(bushMesh); }
function createScenery() { for(let i=0; i<NUM_HOUSES; i++)createHouse(findValidSceneryPosition(GRID_SIZE*3)); for(let i=0; i<NUM_STONE_CLUSTERS; i++)createStoneCluster(findValidSceneryPosition(GRID_SIZE*1.5)); for(let i=0; i<NUM_BUSHES; i++)createBush(findValidSceneryPosition(GRID_SIZE*1)); }
function findValidSceneryPosition(minClearance) { let position,valid=false; const maxAttempts=50; let attempts=0; const halfPlane=PLANE_SIZE/2*GRID_SIZE; const edgeBuffer=GRID_SIZE*2; while(!valid&&attempts<maxAttempts){ attempts++; const x=(Math.random()*(halfPlane-edgeBuffer)*2)-(halfPlane-edgeBuffer); const z=(Math.random()*(halfPlane-edgeBuffer)*2)-(halfPlane-edgeBuffer); position=new THREE.Vector3(x,0,z); if(position.length()<GRID_SIZE*10)continue; valid=true; for(const obj of sceneryObjects){ if(position.distanceTo(obj.position)<minClearance*2){ valid=false; break; } } } if(!valid){ console.warn("Could not find ideal scenery position, placing semi-randomly."); position=new THREE.Vector3((Math.random()*(halfPlane-edgeBuffer)*2)-(halfPlane-edgeBuffer),0,(Math.random()*(halfPlane-edgeBuffer)*2)-(halfPlane-edgeBuffer)); } return position; }
function createAnimatedPlant(position) { const plantGroup=new THREE.Group(); plantGroup.position.copy(position); const scaleFactor=0.6+Math.random()*0.4; const trunkHeight=GRID_SIZE*(1+Math.random()*1)*scaleFactor; const trunkRadius=GRID_SIZE*0.15*scaleFactor; const trunkGeometry=new THREE.CylinderGeometry(trunkRadius,trunkRadius*0.8,trunkHeight,6); const trunkMaterial=new THREE.MeshStandardMaterial({color:PLANT_COLOR_TRUNK,roughness:0.8}); const trunk=new THREE.Mesh(trunkGeometry,trunkMaterial); trunk.position.y=trunkHeight/2; trunk.castShadow=true; plantGroup.add(trunk); const leavesHeight=GRID_SIZE*(1.5+Math.random()*1.5)*scaleFactor; const leavesRadius=GRID_SIZE*0.6*scaleFactor; const leavesGeometry=new THREE.ConeGeometry(leavesRadius,leavesHeight,7); const leavesMaterial=new THREE.MeshStandardMaterial({color:PLANT_COLOR_LEAVES,roughness:0.6}); const leaves=new THREE.Mesh(leavesGeometry,leavesMaterial); leaves.position.y=trunkHeight+leavesHeight/2-0.1*scaleFactor; leaves.castShadow=true; plantGroup.add(leaves); plantGroup.userData.swaySpeed=0.5+Math.random(); plantGroup.userData.swayAmount=(Math.PI/180)*(5+Math.random()*10); scene.add(plantGroup); return plantGroup; }
function createAnimatedPlants(count) { for(let i=0; i<count; i++){ let plantPos,validPosition=false; while(!validPosition){ plantPos=findValidSceneryPosition(GRID_SIZE*2); plantPos.y=0; validPosition=true; } createAnimatedPlant(plantPos); } }


// --- Game Logic ---

function resetGame() {
    // Clear objects and dispose geometry
    snake.forEach(segment => { scene.remove(segment); segment.geometry.dispose(); }); snake = [];
    foods.forEach(foodItem => { const light=foodItem.children.find(c=>c instanceof THREE.PointLight); if(light)foodItem.remove(light); scene.remove(foodItem); foodItem.geometry.dispose(); }); foods = [];
    powerUps.forEach(powerUpItem => { const light=powerUpItem.children.find(c=>c instanceof THREE.PointLight); if(light)powerUpItem.remove(light); scene.remove(powerUpItem); powerUpItem.geometry.dispose(); }); powerUps = [];

    // Reset state
    score = 0; scoreElement.innerText = score;
    gameOver = false; gameRunning = false;
    turnRequested = null; direction.set(GRID_SIZE, 0, 0);
    activePowerUp = null; powerUpExpiryTime = 0;
    currentSnakeSpeed = SNAKE_SPEED; currentSnakeSizeMultiplier = BASE_SNAKE_SIZE_MULTIPLIER;
    updateInterval = 1000 / currentSnakeSpeed;

    // <<< Stop music on reset >>>
    pauseBgMusic(); // Pause instead of stop, reset currentTime
    bgMusic.currentTime = 0;

    // Create initial snake
    const startZ = 0;
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
        const position = new THREE.Vector3((INITIAL_SNAKE_LENGTH - 1 - i) * GRID_SIZE, GRID_SIZE / 2, startZ);
        snake.push(createSnakeSegment(position));
    }

    // Spawn initial food
    manageFoodSpawning();

    // Initial Camera Setup (Fixed Orientation)
    if (snake.length > 0) {
        const headPos = snake[0].position;
        const initialCameraPos = headPos.clone().add(new THREE.Vector3(0, CAMERA_FOLLOW_DISTANCE, CAMERA_FOLLOW_DISTANCE));
        const initialLookAt = headPos.clone();
        camera.position.copy(initialCameraPos);
        currentTargetCameraPos.copy(initialCameraPos);
        currentLookAtTarget.copy(initialLookAt);
        camera.lookAt(currentLookAtTarget);
    }
    firstFrameAfterStart = true;

    gameOverElement.classList.add('hidden');
    instructionsElement.classList.remove('hidden');
}

function startGame() {
    if (!gameRunning) {
        gameRunning = true; gameOver = false;
        instructionsElement.classList.add('hidden');
        gameOverElement.classList.add('hidden');
        lastUpdateTime = performance.now();
        firstFrameAfterStart = true;
        // <<< Attempt to play music when game starts via interaction >>>
        // This might be redundant if handleTouchStart already calls it,
        // but good fallback for spacebar start.
        // playBgMusic(); // Moved to handleTouchStart and playMusicBtn
    }
}

function manageFoodSpawning() { while (foods.length < MAX_FOOD_COUNT) spawnSingleFood(); }
function managePowerUpSpawning() { if(powerUps.length>=MAX_POWERUP_COUNT||Math.random()>POWERUP_SPAWN_CHANCE)return; const types=[POWERUP_TYPE_SHRINK,POWERUP_TYPE_SPEEDUP,POWERUP_TYPE_SLOWDOWN]; const randomType=types[Math.floor(Math.random()*types.length)]; spawnSinglePowerUp(randomType); }
function spawnSingleFood() { let foodPos,validPosition=false; const maxAttempts=50; let attempts=0; while(!validPosition&&attempts<maxAttempts){ attempts++; foodPos=getRandomGridPosition(); validPosition=isPositionValid(foodPos,GRID_SIZE*0.5); } if(!validPosition){console.warn("Could not find valid food position."); return;} createSingleFood(foodPos); }
function spawnSinglePowerUp(type) { let powerUpPos,validPosition=false; const maxAttempts=50; let attempts=0; while(!validPosition&&attempts<maxAttempts){ attempts++; powerUpPos=getRandomGridPosition(); validPosition=isPositionValid(powerUpPos,GRID_SIZE*0.6); } if(!validPosition){console.warn("Could not find valid power-up position."); return;} createPowerUp(powerUpPos,type); }
function isPositionValid(pos,clearance) { for(const segment of snake)if(segment.position.distanceTo(pos)<clearance+(GRID_SIZE/2*currentSnakeSizeMultiplier))return false; for(const foodItem of foods)if(foodItem.position.distanceTo(pos)<clearance)return false; for(const powerUpItem of powerUps)if(powerUpItem.position.distanceTo(pos)<clearance)return false; for(const obj of sceneryObjects)if(pos.distanceTo(obj.position)<clearance+GRID_SIZE*1.5)return false; const halfPlane=PLANE_SIZE/2*GRID_SIZE; if(pos.x>=halfPlane||pos.x<-halfPlane||pos.z>=halfPlane||pos.z<-halfPlane)return false; return true; }

function moveSnake() {
    if (!gameRunning || gameOver) return;
    if (turnRequested) { const currentDir=direction; const newDir=new THREE.Vector3(); if(currentDir.x!==0){if(turnRequested==='left')newDir.set(0,0,-Math.sign(currentDir.x)*GRID_SIZE);else newDir.set(0,0,Math.sign(currentDir.x)*GRID_SIZE);}else if(currentDir.z!==0){if(turnRequested==='left')newDir.set(Math.sign(currentDir.z)*GRID_SIZE,0,0);else newDir.set(-Math.sign(currentDir.z)*GRID_SIZE,0,0);} if(newDir.lengthSq()>0)direction.copy(newDir); turnRequested=null;}
    const head = snake[0]; const newHeadPos = head.position.clone().add(direction);
    const halfPlane=(PLANE_SIZE/2)*GRID_SIZE; if(newHeadPos.x>=halfPlane)newHeadPos.x=-halfPlane+GRID_SIZE*0.5;else if(newHeadPos.x<-halfPlane)newHeadPos.x=halfPlane-GRID_SIZE*0.5; if(newHeadPos.z>=halfPlane)newHeadPos.z=-halfPlane+GRID_SIZE*0.5;else if(newHeadPos.z<-halfPlane)newHeadPos.z=halfPlane-GRID_SIZE*0.5;
    const selfCollisionDistance=GRID_SIZE*0.4*currentSnakeSizeMultiplier; for(let i=1;i<snake.length;i++)if(newHeadPos.distanceTo(snake[i].position)<selfCollisionDistance){triggerGameOver();return;}

    // Food Collision
    let ateFood = false;
    for (let i = foods.length - 1; i >= 0; i--) {
        const foodItem = foods[i];
        if (newHeadPos.distanceTo(foodItem.position) < GRID_SIZE * 0.8 * currentSnakeSizeMultiplier) {
            ateFood = true; score++; scoreElement.innerText = score;
            const light=foodItem.children.find(c=>c instanceof THREE.PointLight); if(light)foodItem.remove(light);
            scene.remove(foodItem); foodItem.geometry.dispose(); foods.splice(i, 1);
            playEatSound(); // <<< Play sound on eat >>>
            manageFoodSpawning(); break;
        }
    }

    // Power-Up Collision
     for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUpItem = powerUps[i];
        if (newHeadPos.distanceTo(powerUpItem.position) < GRID_SIZE * 0.8 * currentSnakeSizeMultiplier) {
            const type = powerUpItem.userData.type;
            const light=powerUpItem.children.find(c=>c instanceof THREE.PointLight); if(light)powerUpItem.remove(light);
            scene.remove(powerUpItem); powerUpItem.geometry.dispose(); powerUps.splice(i, 1);
            playEatSound(); // <<< Play sound on eat powerup too >>>
            activatePowerUp(type); break;
        }
    }

    // Move Snake Body
    let lastPos = head.position.clone(); head.position.copy(newHeadPos);
    for (let i = 1; i < snake.length; i++) { const currentPos = snake[i].position.clone(); snake[i].position.copy(lastPos); lastPos = currentPos; }

    // Grow Snake
    if (ateFood) snake.push(createSnakeSegment(lastPos));
}

// --- Power-up Activation & Deactivation ---
// (activatePowerUp, checkPowerUpExpiry, deactivateCurrentPowerUp, updateSnakeSegmentSizes remain the same)
function activatePowerUp(type){console.log("Activating PowerUp:",type);deactivateCurrentPowerUp();activePowerUp=type;powerUpExpiryTime=performance.now()+POWERUP_DURATION;switch(type){case POWERUP_TYPE_SHRINK:currentSnakeSizeMultiplier=BASE_SNAKE_SIZE_MULTIPLIER*SHRINK_FACTOR;updateSnakeSegmentSizes();break;case POWERUP_TYPE_SPEEDUP:currentSnakeSpeed=SNAKE_SPEED*SPEED_UP_FACTOR;updateInterval=1000/currentSnakeSpeed;break;case POWERUP_TYPE_SLOWDOWN:currentSnakeSpeed=SNAKE_SPEED*SLOW_DOWN_FACTOR;updateInterval=1000/currentSnakeSpeed;break;}}
function checkPowerUpExpiry(){if(activePowerUp&&performance.now()>powerUpExpiryTime){console.log("Deactivating PowerUp:",activePowerUp);deactivateCurrentPowerUp();}}
function deactivateCurrentPowerUp(){if(!activePowerUp)return;switch(activePowerUp){case POWERUP_TYPE_SHRINK:currentSnakeSizeMultiplier=BASE_SNAKE_SIZE_MULTIPLIER;updateSnakeSegmentSizes();break;case POWERUP_TYPE_SPEEDUP:case POWERUP_TYPE_SLOWDOWN:currentSnakeSpeed=SNAKE_SPEED;updateInterval=1000/currentSnakeSpeed;break;}activePowerUp=null;powerUpExpiryTime=0;}
function updateSnakeSegmentSizes(){snake.forEach(segment=>{const oldGeometry=segment.geometry;const radius=(GRID_SIZE/2*0.9)*currentSnakeSizeMultiplier;segment.geometry=new THREE.SphereGeometry(radius,12,12);oldGeometry.dispose();});}

// (getRandomGridPosition, snapToGrid remain the same)
function getRandomGridPosition(){const buffer=1;const maxCoord=Math.floor(PLANE_SIZE/2)-buffer;const x=Math.round(Math.random()*(maxCoord*2)-maxCoord)*GRID_SIZE;const z=Math.round(Math.random()*(maxCoord*2)-maxCoord)*GRID_SIZE;return new THREE.Vector3(x,GRID_SIZE/2,z);}
function snapToGrid(position){const snappedX=Math.round(position.x/GRID_SIZE)*GRID_SIZE;const snappedZ=Math.round(position.z/GRID_SIZE)*GRID_SIZE;return new THREE.Vector3(snappedX,GRID_SIZE/2,snappedZ);}

function triggerGameOver() {
    gameRunning = false; gameOver = true;
    finalScoreElement.innerText = score;
    gameOverElement.classList.remove('hidden');
    deactivateCurrentPowerUp();
    // <<< Stop music on game over >>>
    pauseBgMusic();
    bgMusic.currentTime = 0;
}


// --- Animation & Rendering ---
function animate(time) {
    requestAnimationFrame(animate);
    const now=performance.now(); const delta=now-lastUpdateTime;
    if(gameRunning&&delta>=updateInterval){lastUpdateTime=now-(delta%updateInterval);moveSnake();}
    if(gameRunning){checkPowerUpExpiry();managePowerUpSpawning();}
    const elapsedTime=now*0.001;
    foods.forEach(foodItem=>{const sf=1+Math.sin(elapsedTime*5+foodItem.id*0.1)*0.15;foodItem.scale.set(sf,sf,sf);foodItem.rotation.y=elapsedTime*1.5+foodItem.id*0.2;foodItem.rotation.x=elapsedTime*1.0+foodItem.id*0.1;});
    powerUps.forEach(powerUpItem=>{powerUpItem.rotation.y=elapsedTime*2.0+powerUpItem.id*0.3;powerUpItem.position.y=GRID_SIZE/2+Math.sin(elapsedTime*3+powerUpItem.id*0.5)*0.15;});
    scene.traverse((object)=>{if(object.userData.swaySpeed){const sway=Math.sin(elapsedTime*object.userData.swaySpeed)*object.userData.swayAmount;if(object.children[0])object.children[0].rotation.z=sway*0.5;if(object.children[1])object.children[1].rotation.z=sway;}});
    snake.forEach((segment,index)=>{segment.position.y=GRID_SIZE/2+Math.sin(elapsedTime*4+index*0.5)*0.08;});

    // Update Camera Position (Fixed Orientation)
    if(snake.length>0){const head=snake[0];const headPos=head.position;const newTargetCameraPos=headPos.clone().add(new THREE.Vector3(0,CAMERA_FOLLOW_DISTANCE,CAMERA_FOLLOW_DISTANCE));const newLookAtTarget=headPos.clone();if(firstFrameAfterStart&&gameRunning){currentTargetCameraPos.copy(newTargetCameraPos);currentLookAtTarget.copy(newLookAtTarget);firstFrameAfterStart=false;}else{currentTargetCameraPos.lerp(newTargetCameraPos,CAMERA_SMOOTH_FACTOR);currentLookAtTarget.lerp(newLookAtTarget,CAMERA_SMOOTH_FACTOR);}camera.position.copy(currentTargetCameraPos);camera.lookAt(currentLookAtTarget);}

    renderer.render(scene, camera);
}

// --- Event Handlers ---
// <<< handleKeyDown remains for desktop >>>
function handleKeyDown(event) {
    const key = event.key;
    if (!gameRunning && !gameOver && (key === ' ' || key === 'Spacebar')) {
        startGame();
        playBgMusic(); // Try playing music on spacebar start too
        return;
    }
    if (gameOver && (key === ' ' || key === 'Spacebar')) {
        resetGame(); return;
    }
    if (gameRunning) {
        switch (key) {
            case 'ArrowLeft': case 'a': case 'A': if (!turnRequested) turnRequested = 'left'; break;
            case 'ArrowRight': case 'd': case 'D': if (!turnRequested) turnRequested = 'right'; break;
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // <<< Update pixel ratio on resize too, although less common >>>
    // renderer.setPixelRatio(window.devicePixelRatio); // Usually set once
}

// --- Start the game ---
init();
