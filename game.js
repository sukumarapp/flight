import * as THREE from 'three';
// Optional: Add OrbitControls for debugging camera movement (less useful in FP)
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const GRID_SIZE = 20;
const BOX_SIZE = 1;
const GAME_SPEED_MS = 180; // Slightly slower might feel better in FP
const SNAKE_COLOR = 0x00dd00; // Slightly less intense green
const FOOD_COLOR = 0xff4400;
const FLOOR_TEXTURE_URL = 'https://threejs.org/examples/textures/hardwood2_diffuse.jpg';
const SKYBOX_PATH = 'https://threejs.org/examples/textures/cube/Park3Med/';
const SKYBOX_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];

// --- FP Camera Configuration ---
const CAMERA_HEIGHT = BOX_SIZE * 0.3; // How high the camera is relative to the snake body center
const CAMERA_BEHIND_OFFSET = BOX_SIZE * 0.6; // How far behind the head's center the camera is
const CAMERA_LOOKAHEAD = BOX_SIZE * 5; // How far ahead the camera looks
const CAMERA_LERP_FACTOR = 0.08; // How quickly the camera smooths (0 to 1, lower is smoother)

// --- Global Variables ---
let scene, camera, renderer, clock;
let snake = [];
let snakeLogic = [];
let direction = { x: 1, z: 0 }; // Initial direction
let pendingDirection = null;
let food = null;
let foodLogic = { x: 0, z: 0 };
let score = 0;
let isGameOver = false;
let gameLoopInterval = null;
const gameBounds = GRID_SIZE * BOX_SIZE / 2 - BOX_SIZE / 2;
const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');
const restartButton = document.getElementById('restart-button');
const loadingScreen = document.getElementById('loading-screen');
const instructionsElement = document.getElementById('instructions');

// Camera smoothing targets
let targetCameraPosition = new THREE.Vector3();
let targetLookAt = new THREE.Vector3();
let currentLookAt = new THREE.Vector3(); // The point the camera is actually looking at (interpolated)


// --- Initialization ---
function init() {
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    // Camera (Perspective)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 1000); // Slightly wider FOV often good for FP
    // Camera position and lookAt are now set dynamically in animate()

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting (Same as before)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(15, 25, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 60;
    const shadowCamSize = GRID_SIZE * 0.8; // Increase shadow area slightly
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);

    // Asset Loading (Floor Texture & Skybox - Same as before)
    const textureLoader = new THREE.TextureLoader();
    const cubeTextureLoader = new THREE.CubeTextureLoader();

    cubeTextureLoader.setPath(SKYBOX_PATH);
    const skyboxTexture = cubeTextureLoader.load(SKYBOX_FILES, () => {
        scene.background = skyboxTexture;
        textureLoader.load(FLOOR_TEXTURE_URL, (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(GRID_SIZE / 4, GRID_SIZE / 4);
            const floorGeometry = new THREE.PlaneGeometry(GRID_SIZE * BOX_SIZE, GRID_SIZE * BOX_SIZE);
            const floorMaterial = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.2 });
            const floor = new THREE.Mesh(floorGeometry, floorMaterial);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -BOX_SIZE / 2;
            floor.receiveShadow = true;
            scene.add(floor);

            hideLoadingScreen();
            setupGame();
            startGameLoop();
            animate();
        }, undefined, (error) => {
            console.error('Error loading floor texture:', error);
            createFallbackFloor();
            hideLoadingScreen();
            setupGame();
            startGameLoop();
            animate();
            }
        );
    }, undefined, (error) => {
        console.error('Error loading skybox:', error);
        scene.background = new THREE.Color(0x333333);
        textureLoader.load(FLOOR_TEXTURE_URL, (texture) => { /*...*/ }, undefined, () => { createFallbackFloor(); /*...*/ });
        hideLoadingScreen();
        setupGame();
        startGameLoop();
        animate();
    });

    // Update Instructions
    instructionsElement.textContent = "Use Left/Right Arrows or A/D to turn.";

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    restartButton.addEventListener('click', restartGame);
}

// --- Fallback Floor (Same as before) ---
function createFallbackFloor() { /* ... same code ... */ }

// --- Loading Screen (Same as before) ---
function hideLoadingScreen() { /* ... same code ... */ }


// --- Game Setup ---
function setupGame() {
    // Reset state
    isGameOver = false;
    score = 0;
    scoreElement.textContent = score;
    gameOverElement.style.display = 'none';
    direction = { x: 1, z: 0 }; // Start moving right
    pendingDirection = null;

    // Clear previous game objects
    snake.forEach(segment => scene.remove(segment));
    if (food) scene.remove(food);
    snake = [];
    snakeLogic = [];

    // Create initial snake
    const startLength = 3;
    const startX = 0; // Start near center
    const startZ = 0;
    for (let i = 0; i < startLength; i++) {
        // Start horizontally along positive X
        const segmentLogic = { x: startX - i, z: startZ };
        snakeLogic.push(segmentLogic);
        createSnakeSegment(segmentLogic.x, segmentLogic.z, i === 0);
    }

    // Initialize camera position and lookAt based on initial snake head
    if (snake.length > 0) {
        const headMesh = snake[0];
        const headLogic = snakeLogic[0];

        // Set initial camera position slightly behind head
        targetCameraPosition.set(
            headMesh.position.x - direction.x * CAMERA_BEHIND_OFFSET,
            CAMERA_HEIGHT,
            headMesh.position.z - direction.z * CAMERA_BEHIND_OFFSET
        );
        camera.position.copy(targetCameraPosition);

        // Set initial lookAt point ahead of the head
        targetLookAt.set(
            headMesh.position.x + direction.x * CAMERA_LOOKAHEAD,
            0, // Look slightly down towards the plane
            headMesh.position.z + direction.z * CAMERA_LOOKAHEAD
        );
        currentLookAt.copy(targetLookAt);
        camera.lookAt(currentLookAt);
    }


    spawnFood();
}

// --- Game Loop ---
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(updateGame, GAME_SPEED_MS);
}

function stopGameLoop() {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
}

function updateGame() {
    if (isGameOver) return;

    // Apply pending direction change
    if (pendingDirection) {
        // Check if it's actually a different direction (prevents stopping if no turn)
        if (pendingDirection.x !== direction.x || pendingDirection.z !== direction.z) {
             direction = pendingDirection;
        }
        pendingDirection = null;
    }

    // Calculate new head position (logic)
    const headLogic = snakeLogic[0];
    const newHeadLogic = {
        x: headLogic.x + direction.x,
        z: headLogic.z + direction.z
    };

    // Collision Detection (Wall & Self - Same as before)
    if ( newHeadLogic.x >= GRID_SIZE / 2 || newHeadLogic.x < -GRID_SIZE / 2 ||
         newHeadLogic.z >= GRID_SIZE / 2 || newHeadLogic.z < -GRID_SIZE / 2 ) {
        triggerGameOver(); return;
    }
    for (let i = 1; i < snakeLogic.length; i++) {
        if (newHeadLogic.x === snakeLogic[i].x && newHeadLogic.z === snakeLogic[i].z) {
            triggerGameOver(); return;
        }
    }

    // Food Collision (Same as before)
    let ateFood = false;
    if (newHeadLogic.x === foodLogic.x && newHeadLogic.z === foodLogic.z) {
        ateFood = true;
        score++;
        scoreElement.textContent = score;
        scene.remove(food);
        spawnFood();
    }

    // Update Snake Logic Array
    snakeLogic.unshift(newHeadLogic);

    // Update Snake Meshes
    createSnakeSegment(newHeadLogic.x, newHeadLogic.z, true); // New head
    if (snake.length > 1) {
         snake[1].material = createSnakeMaterial(false); // Old head is now body
    }

    if (!ateFood) {
        snakeLogic.pop();
        const tailMesh = snake.pop();
        scene.remove(tailMesh);
    }

     // *** NEW: Update Target Camera Position & LookAt ***
     // Based on the *new* head mesh and current direction
     if (snake.length > 0) {
        const headMesh = snake[0];
        targetCameraPosition.set(
            headMesh.position.x - direction.x * CAMERA_BEHIND_OFFSET,
            CAMERA_HEIGHT,
            headMesh.position.z - direction.z * CAMERA_BEHIND_OFFSET
        );

        targetLookAt.set(
            headMesh.position.x + direction.x * CAMERA_LOOKAHEAD,
            0, // Look slightly down towards the plane
            headMesh.position.z + direction.z * CAMERA_LOOKAHEAD
        );
    }
}

// --- Object Creation (Slight changes maybe for head visibility later) ---
function createSnakeSegment(gridX, gridZ, isHead = false) {
    const geometry = new THREE.BoxGeometry(BOX_SIZE * 0.9, BOX_SIZE * 0.9, BOX_SIZE * 0.9);
    const material = createSnakeMaterial(isHead);
    const segment = new THREE.Mesh(geometry, material);

    segment.position.set(gridX * BOX_SIZE, 0, gridZ * BOX_SIZE);
    segment.castShadow = true;
    segment.receiveShadow = false; // Body segments usually don't receive shadows from self

    // Optional: Make the actual head invisible if camera clipping isn't enough
    // if (isHead) {
    //    segment.visible = false;
    // }

    scene.add(segment);
    snake.unshift(segment);
}

function createSnakeMaterial(isHead) {
     // Maybe make head visually distinct if we end up seeing parts of it
     const color = isHead ? lightenColor(SNAKE_COLOR, 0.2) : SNAKE_COLOR;
     return new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.3
    });
}

// --- Spawn Food (Same as before) ---
function spawnFood() { /* ... same code ... */ }


// --- Game State (Same as before) ---
function triggerGameOver() { /* ... same code ... */ }
function restartGame() {
    setupGame();
    startGameLoop();
}

// --- Rendering Loop (Camera updates here!) ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Can use delta for framerate-independent lerp, but fixed factor is often okay here

    // --- Smooth Camera Movement ---
    if (!isGameOver && snake.length > 0) {
        // Interpolate camera position
        camera.position.lerp(targetCameraPosition, CAMERA_LERP_FACTOR);

        // Interpolate lookAt target
        currentLookAt.lerp(targetLookAt, CAMERA_LERP_FACTOR);
        camera.lookAt(currentLookAt);
    }

    // Food animation (Same as before)
    if (food && !isGameOver) {
        food.rotation.y += 0.02;
        food.rotation.x += 0.01;
        food.position.y = Math.sin(clock.getElapsedTime() * 3) * BOX_SIZE * 0.1;
    }

    renderer.render(scene, camera);
}

// --- Event Handlers ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    if (isGameOver) return;

    let requestedTurn = 0; // -1 for left, 1 for right, 0 for no turn

    switch (event.key) {
        // Turn Left
        case 'ArrowLeft':
        case 'a':
        case 'A':
            requestedTurn = -1;
            break;
        // Turn Right
        case 'ArrowRight':
        case 'd':
        case 'D':
             requestedTurn = 1;
            break;
        // Ignore other keys (W/S/Up/Down do nothing now)
        default:
            return;
    }

    if (requestedTurn !== 0) {
        // Calculate the new direction vector based on rotation
        const currentX = direction.x;
        const currentZ = direction.z;
        let newX, newZ;

        if (requestedTurn === -1) { // Turn Left (Rotate -90 degrees)
            newX = currentZ;
            newZ = -currentX;
        } else { // Turn Right (Rotate 90 degrees)
            newX = -currentZ;
            newZ = currentX;
        }

        // Set pending direction (avoiding direct 180 turns is implicitly handled
        // because you can only turn left or right from the current direction)
         pendingDirection = { x: newX, z: newZ };
    }
}

// --- Utility (Same as before) ---
function lightenColor(hex, amount) { /* ... same code ... */ }


// --- Start Everything ---
init();
