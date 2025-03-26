import * as THREE from 'three';
// Optional: Add OrbitControls for debugging camera movement
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const GRID_SIZE = 20; // Play area size (GRID_SIZE x GRID_SIZE)
const BOX_SIZE = 1; // Size of each snake segment and grid cell
const GAME_SPEED_MS = 150; // Lower is faster
const SNAKE_COLOR = 0x00ff00;
const FOOD_COLOR = 0xff0000;
const FLOOR_TEXTURE_URL = 'https://threejs.org/examples/textures/hardwood2_diffuse.jpg'; // Example texture
const SKYBOX_PATH = 'https://threejs.org/examples/textures/cube/Park3Med/'; // Example skybox path
const SKYBOX_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']; // Right, Left, Top, Bottom, Front, Back

// --- Global Variables ---
let scene, camera, renderer, /* controls, */ clock;
let snake = []; // Array of snake segment meshes
let snakeLogic = []; // Array of {x, z} positions for snake logic
let direction = { x: 1, z: 0 }; // Initial direction (moving right)
let pendingDirection = null; // Store next direction change
let food = null; // Food mesh
let foodLogic = { x: 0, z: 0 }; // Food position for logic
let score = 0;
let isGameOver = false;
let gameLoopInterval = null;
const gameBounds = GRID_SIZE * BOX_SIZE / 2 - BOX_SIZE / 2;
const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');
const restartButton = document.getElementById('restart-button');
const loadingScreen = document.getElementById('loading-screen');

// --- Initialization ---
function init() {
    // Basic Scene Setup
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    // Position camera for an isometric-like view
    camera.position.set(GRID_SIZE * 0.6, GRID_SIZE * 0.8, GRID_SIZE * 0.6);
    camera.lookAt(0, 0, 0); // Look at the center of the grid

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Sun-like light
    directionalLight.position.set(15, 25, 20);
    directionalLight.castShadow = true;
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 60;
    const shadowCamSize = GRID_SIZE * 0.7;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);
    // Optional: Add a light helper to visualize
    // const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // scene.add(lightHelper);
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // scene.add(shadowHelper);


    // Optional: Orbit Controls (for debugging)
    // controls = new OrbitControls(camera, renderer.domElement);
    // controls.target.set(0, 0, 0);
    // controls.update();

    // Asset Loading (Floor Texture & Skybox)
    const textureLoader = new THREE.TextureLoader();
    const cubeTextureLoader = new THREE.CubeTextureLoader();

    // --- Skybox ---
    cubeTextureLoader.setPath(SKYBOX_PATH);
    const skyboxTexture = cubeTextureLoader.load(SKYBOX_FILES, () => {
        // This callback runs *after* skybox is loaded
        scene.background = skyboxTexture;
        // --- Floor --- (Load floor after skybox or handle loading state)
        textureLoader.load(FLOOR_TEXTURE_URL, (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(GRID_SIZE / 4, GRID_SIZE / 4); // Adjust texture tiling

            const floorGeometry = new THREE.PlaneGeometry(GRID_SIZE * BOX_SIZE, GRID_SIZE * BOX_SIZE);
            const floorMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                side: THREE.DoubleSide,
                roughness: 0.8,
                metalness: 0.2
            });
            const floor = new THREE.Mesh(floorGeometry, floorMaterial);
            floor.rotation.x = -Math.PI / 2; // Rotate flat
            floor.position.y = -BOX_SIZE / 2; // Position slightly below snake origin
            floor.receiveShadow = true; // Floor receives shadows
            scene.add(floor);

            // --- Start Game Logic Only After Assets are Loaded ---
            hideLoadingScreen();
            setupGame();
            startGameLoop();
            animate(); // Start the rendering loop
        },
        undefined, // onProgress callback (optional)
        (error) => {
            console.error('Error loading floor texture:', error);
            // Handle error: maybe use a plain color floor
            createFallbackFloor();
            hideLoadingScreen();
            setupGame();
            startGameLoop();
            animate(); // Start the rendering loop
            }
        );
    },
    undefined, // onProgress callback (optional)
    (error) => {
        console.error('Error loading skybox:', error);
        scene.background = new THREE.Color(0x333333); // Fallback background
        // Try loading floor anyway or create fallback
        textureLoader.load(FLOOR_TEXTURE_URL, (texture) => { /*...*/ }, undefined, () => { createFallbackFloor(); /*...*/ });
        hideLoadingScreen();
        setupGame();
        startGameLoop();
        animate(); // Start the rendering loop
    });



    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    restartButton.addEventListener('click', restartGame);
}

function createFallbackFloor() {
    console.warn("Using fallback floor color.");
    const floorGeometry = new THREE.PlaneGeometry(GRID_SIZE * BOX_SIZE, GRID_SIZE * BOX_SIZE);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555, // Dark grey
        side: THREE.DoubleSide,
        roughness: 0.9
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -BOX_SIZE / 2;
    floor.receiveShadow = true;
    scene.add(floor);
}

function hideLoadingScreen() {
    loadingScreen.style.opacity = '0';
    // Remove from DOM after transition
    setTimeout(() => {
       if(loadingScreen.parentNode) {
            loadingScreen.parentNode.removeChild(loadingScreen);
       }
    }, 500); // Match CSS transition duration
}


// --- Game Setup ---
function setupGame() {
    // Reset state
    isGameOver = false;
    score = 0;
    scoreElement.textContent = score;
    gameOverElement.style.display = 'none';
    direction = { x: 1, z: 0 };
    pendingDirection = null;

    // Clear previous game objects
    snake.forEach(segment => scene.remove(segment));
    if (food) scene.remove(food);
    snake = [];
    snakeLogic = [];

    // Create initial snake
    const startLength = 3;
    for (let i = 0; i < startLength; i++) {
        const segmentLogic = { x: startLength - 1 - i, z: 0 }; // Start horizontally
        snakeLogic.push(segmentLogic);
        createSnakeSegment(segmentLogic.x, segmentLogic.z, i === 0); // Mark head
    }

    // Create initial food
    spawnFood();
}

// --- Game Loop ---
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval); // Clear existing loop if any
    gameLoopInterval = setInterval(updateGame, GAME_SPEED_MS);
}

function stopGameLoop() {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
}

function updateGame() {
    if (isGameOver) return;

    // Apply pending direction change if valid
    if (pendingDirection) {
        // Prevent reversing direction
        if ( (pendingDirection.x !== 0 && direction.x === 0) ||
             (pendingDirection.z !== 0 && direction.z === 0) ) {
            direction = pendingDirection;
        }
        pendingDirection = null; // Reset pending direction
    }


    // Calculate new head position (logic)
    const headLogic = snakeLogic[0];
    const newHeadLogic = {
        x: headLogic.x + direction.x,
        z: headLogic.z + direction.z
    };

    // --- Collision Detection ---
    // 1. Wall Collision
    if ( newHeadLogic.x >= GRID_SIZE / 2 || newHeadLogic.x < -GRID_SIZE / 2 ||
         newHeadLogic.z >= GRID_SIZE / 2 || newHeadLogic.z < -GRID_SIZE / 2 ) {
        triggerGameOver();
        return;
    }

    // 2. Self Collision
    // Check if new head position overlaps with any existing body segment
    for (let i = 1; i < snakeLogic.length; i++) {
        if (newHeadLogic.x === snakeLogic[i].x && newHeadLogic.z === snakeLogic[i].z) {
            triggerGameOver();
            return;
        }
    }

    // --- Food Collision ---
    let ateFood = false;
    if (newHeadLogic.x === foodLogic.x && newHeadLogic.z === foodLogic.z) {
        ateFood = true;
        score++;
        scoreElement.textContent = score;
        scene.remove(food); // Remove old food mesh
        spawnFood(); // Spawn new food
    }

    // --- Update Snake Logic Array ---
    snakeLogic.unshift(newHeadLogic); // Add new head

    // --- Update Snake Meshes ---
    // Add new head mesh
    createSnakeSegment(newHeadLogic.x, newHeadLogic.z, true); // New head

    // Remove old head material (no longer the head)
    if (snake.length > 1) {
         snake[1].material = createSnakeMaterial(false); // Second element is the old head
    }


    if (!ateFood) {
        // Remove tail logic
        snakeLogic.pop();
        // Remove tail mesh
        const tailMesh = snake.pop();
        scene.remove(tailMesh);
    }
}

// --- Object Creation ---
function createSnakeSegment(gridX, gridZ, isHead = false) {
    const geometry = new THREE.BoxGeometry(BOX_SIZE * 0.9, BOX_SIZE * 0.9, BOX_SIZE * 0.9); // Slightly smaller than cell
    const material = createSnakeMaterial(isHead);
    const segment = new THREE.Mesh(geometry, material);

    // Convert grid coordinates to world coordinates
    segment.position.set(
        gridX * BOX_SIZE,
        0, // Centered vertically on the grid plane
        gridZ * BOX_SIZE
    );

    segment.castShadow = true;
    segment.receiveShadow = false; // Segments usually don't receive shadows from themselves

    scene.add(segment);
    snake.unshift(segment); // Add new segment to the beginning of the mesh array
}

function createSnakeMaterial(isHead) {
     // Make head slightly different - maybe brighter or different shape later
     const color = isHead ? lightenColor(SNAKE_COLOR, 0.3) : SNAKE_COLOR;
     return new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.3
    });
}

function spawnFood() {
    let foodPos = { x: 0, z: 0 };
    let validPosition = false;

    // Keep trying random positions until one is not inside the snake
    while (!validPosition) {
        foodPos.x = Math.floor(Math.random() * GRID_SIZE) - GRID_SIZE / 2;
        foodPos.z = Math.floor(Math.random() * GRID_SIZE) - GRID_SIZE / 2;

        validPosition = true; // Assume valid initially
        for (const segmentLogic of snakeLogic) {
            if (segmentLogic.x === foodPos.x && segmentLogic.z === foodPos.z) {
                validPosition = false; // Found collision, try again
                break;
            }
        }
    }

    foodLogic = foodPos; // Store the logic position

    // Create food mesh (e.g., a sphere or icosahedron)
    // const foodGeometry = new THREE.SphereGeometry(BOX_SIZE * 0.4, 16, 16);
    const foodGeometry = new THREE.IcosahedronGeometry(BOX_SIZE * 0.45, 0); // A bit more interesting
    const foodMaterial = new THREE.MeshStandardMaterial({
        color: FOOD_COLOR,
        roughness: 0.2,
        metalness: 0.1,
        emissive: FOOD_COLOR, // Make it glow slightly
        emissiveIntensity: 0.4
    });
    food = new THREE.Mesh(foodGeometry, foodMaterial);

    food.position.set(
        foodLogic.x * BOX_SIZE,
        0,
        foodLogic.z * BOX_SIZE
    );
    food.castShadow = true;
    scene.add(food);
}


// --- Game State ---
function triggerGameOver() {
    isGameOver = true;
    stopGameLoop();
    gameOverElement.style.display = 'block';
    console.log("Game Over! Score:", score);
}

function restartGame() {
    setupGame();
    startGameLoop();
}

// --- Rendering Loop ---
function animate() {
    requestAnimationFrame(animate); // Loop

    // Optional: Update controls if using OrbitControls
    // controls.update();

    // Optional: Add subtle animation to food (e.g., rotation, bobbing)
    if (food && !isGameOver) {
        food.rotation.y += 0.02;
        food.rotation.x += 0.01;
        // Bobbing effect
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

    let requestedDirection = null;

    switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            requestedDirection = { x: 0, z: -1 }; // Move forward (negative Z)
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            requestedDirection = { x: 0, z: 1 }; // Move backward (positive Z)
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            requestedDirection = { x: -1, z: 0 }; // Move left (negative X)
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            requestedDirection = { x: 1, z: 0 }; // Move right (positive X)
            break;
        default:
            return; // Ignore other keys
    }

     // Store the requested direction to be applied at the start of the next game tick
     // This prevents issues with very fast key presses within a single game tick
     // Also check if the requested direction is not the direct opposite of the current one
    if (requestedDirection &&
        !(direction.x === -requestedDirection.x && direction.x !== 0) &&
        !(direction.z === -requestedDirection.z && direction.z !== 0))
    {
        pendingDirection = requestedDirection;
    }
}

// --- Utility ---
function lightenColor(hex, amount) {
    const color = new THREE.Color(hex);
    color.lerp(new THREE.Color(0xffffff), amount); // Lerp towards white
    return color;
}


// --- Start Everything ---
init();