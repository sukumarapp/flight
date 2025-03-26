import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Use module import

// --- Configuration ---
const GRID_SIZE = 1; // Size of each grid unit
const PLANE_SIZE = 30; // Width/Height of the game plane in grid units
const SNAKE_SPEED = 8; // Updates per second (lower is faster game tick)
const CAMERA_HEIGHT = 25; // How high the camera is
const INITIAL_SNAKE_LENGTH = 3;

const SNAKE_COLOR = 0x00ff00; // Bright Green
const FOOD_COLOR = 0xff00ff; // Bright Magenta
const PLANT_COLOR_TRUNK = 0x8B4513; // Brown
const PLANT_COLOR_LEAVES = 0x228B22; // Forest Green

// --- Game State ---
let scene, camera, renderer;
let snake = [];
let food;
let plants = [];
let direction = new THREE.Vector3(GRID_SIZE, 0, 0); // Initial direction (right)
let nextDirection = new THREE.Vector3(GRID_SIZE, 0, 0); // Buffer for next input
let score = 0;
let gameRunning = false;
let gameOver = false;
let lastUpdateTime = 0;
const updateInterval = 1000 / SNAKE_SPEED; // Milliseconds between updates

// --- UI Elements ---
const scoreElement = document.getElementById('score');
const instructionsElement = document.getElementById('instructions');
const gameOverElement = document.getElementById('game-over');
const finalScoreElement = document.getElementById('final-score');

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    scene.fog = new THREE.Fog(0x87ceeb, PLANE_SIZE * 0.8, PLANE_SIZE * 1.5);

    // Camera (Perspective for a slightly nicer view from top)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Initial position (will be updated to follow snake)
    camera.position.set(0, CAMERA_HEIGHT, 0);
    camera.lookAt(0, 0, 0); // Look at the center initially

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadows

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    // Configure shadow properties for better quality
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -PLANE_SIZE;
    directionalLight.shadow.camera.right = PLANE_SIZE;
    directionalLight.shadow.camera.top = PLANE_SIZE;
    directionalLight.shadow.camera.bottom = -PLANE_SIZE;
    scene.add(directionalLight);

    // Ground Plane
    const planeGeometry = new THREE.PlaneGeometry(PLANE_SIZE * GRID_SIZE, PLANE_SIZE * GRID_SIZE);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x90ee90, side: THREE.DoubleSide }); // Light green
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    plane.receiveShadow = true;
    scene.add(plane);

    // Add initial plants
    createPlants(15); // Add 15 plants

    // Initial Setup (but don't start game yet)
    resetGame();

    // Event Listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onWindowResize);

    // Start Animation Loop
    animate(0); // Pass initial time
}

// --- Game Object Creation ---

function createSnakeSegment(position) {
    const geometry = new THREE.SphereGeometry(GRID_SIZE / 2 * 0.9, 16, 16); // Slightly smaller sphere
    const material = new THREE.MeshStandardMaterial({
        color: SNAKE_COLOR,
        roughness: 0.3,
        metalness: 0.2
    });
    const segment = new THREE.Mesh(geometry, material);
    segment.position.copy(position);
    segment.castShadow = true;
    segment.receiveShadow = true; // Segments can cast shadows on each other slightly
    scene.add(segment);
    return segment;
}

function createFood(position) {
    const geometry = new THREE.IcosahedronGeometry(GRID_SIZE / 2 * 0.7, 0); // Gem-like shape
    const material = new THREE.MeshStandardMaterial({
        color: FOOD_COLOR,
        emissive: FOOD_COLOR, // Make it glow slightly
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.1
    });
    food = new THREE.Mesh(geometry, material);
    food.position.copy(position);
    food.castShadow = true;
    // Add a point light inside the food for extra glow
    const pointLight = new THREE.PointLight(FOOD_COLOR, 1, 2);
    food.add(pointLight);
    scene.add(food);
}

function createPlant(position) {
    const plantGroup = new THREE.Group();
    plantGroup.position.copy(position);

    // Trunk
    const trunkHeight = GRID_SIZE * (1 + Math.random() * 1);
    const trunkRadius = GRID_SIZE * 0.15;
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 0.8, trunkHeight, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: PLANT_COLOR_TRUNK, roughness: 0.8 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    plantGroup.add(trunk);

    // Leaves (simple cone)
    const leavesHeight = GRID_SIZE * (1.5 + Math.random() * 1.5);
    const leavesRadius = GRID_SIZE * 0.6;
    const leavesGeometry = new THREE.ConeGeometry(leavesRadius, leavesHeight, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: PLANT_COLOR_LEAVES, roughness: 0.6 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = trunkHeight + leavesHeight / 2 - 0.1; // Sit on top of trunk
    leaves.castShadow = true;
    plantGroup.add(leaves);

    // Store animation properties
    plantGroup.userData.swaySpeed = 0.5 + Math.random();
    plantGroup.userData.swayAmount = (Math.PI / 180) * (5 + Math.random() * 10); // 5-15 degrees sway

    scene.add(plantGroup);
    return plantGroup;
}

function createPlants(count) {
    for (let i = 0; i < count; i++) {
        let plantPos;
        let validPosition = false;
        while (!validPosition) {
            plantPos = getRandomGridPosition();
            // Simple check: ensure not too close to center initially
            if (Math.abs(plantPos.x) > GRID_SIZE * 3 || Math.abs(plantPos.z) > GRID_SIZE * 3) {
                 validPosition = true;
            }
        }
       plants.push(createPlant(plantPos));
    }
}


// --- Game Logic ---

function resetGame() {
    // Clear existing snake
    snake.forEach(segment => scene.remove(segment));
    snake = [];

    // Clear existing food
    if (food) {
        // Remove associated light first if it exists
        const pointLight = food.children.find(child => child instanceof THREE.PointLight);
        if (pointLight) food.remove(pointLight);
        scene.remove(food);
        food = null;
    }

    // Reset score
    score = 0;
    scoreElement.innerText = score;

    // Reset state flags
    gameOver = false;
    gameRunning = false; // Don't start immediately

    // Reset direction
    direction.set(GRID_SIZE, 0, 0);
    nextDirection.set(GRID_SIZE, 0, 0);

    // Create initial snake
    const startZ = 0; // Start near center Z
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
        const position = new THREE.Vector3((INITIAL_SNAKE_LENGTH - 1 - i) * GRID_SIZE, GRID_SIZE / 2, startZ);
        const segment = createSnakeSegment(position);
        snake.push(segment);
    }

    // Spawn initial food
    spawnFood();

    // Hide Game Over screen, show instructions
    gameOverElement.classList.add('hidden');
    instructionsElement.classList.remove('hidden');
}

function startGame() {
    if (!gameRunning) {
        gameRunning = true;
        gameOver = false;
        instructionsElement.classList.add('hidden');
        gameOverElement.classList.add('hidden');
        lastUpdateTime = performance.now(); // Reset timer
    }
}

function moveSnake() {
    if (!gameRunning || gameOver) return;

    // Update direction based on buffered input
    // Prevent 180 degree turns
     if (!(direction.x === -nextDirection.x && direction.x !== 0) &&
         !(direction.z === -nextDirection.z && direction.z !== 0)) {
        direction.copy(nextDirection);
     }

    const head = snake[0];
    const newHeadPos = head.position.clone().add(direction);

    // --- Collision Detection ---
    const halfPlane = (PLANE_SIZE / 2) * GRID_SIZE;

    // 1. Boundary Collision
    if (newHeadPos.x >= halfPlane || newHeadPos.x < -halfPlane ||
        newHeadPos.z >= halfPlane || newHeadPos.z < -halfPlane) {
        triggerGameOver();
        return;
    }

    // 2. Self Collision
    for (let i = 1; i < snake.length; i++) {
        if (newHeadPos.distanceTo(snake[i].position) < GRID_SIZE * 0.5) { // Check distance
             triggerGameOver();
             return;
        }
    }

    // 3. Food Collision
    let ateFood = false;
    if (newHeadPos.distanceTo(food.position) < GRID_SIZE * 0.8) { // Generous check for food
        ateFood = true;
        score++;
        scoreElement.innerText = score;

        // Remove old food
        const pointLight = food.children.find(child => child instanceof THREE.PointLight);
        if (pointLight) food.remove(pointLight);
        scene.remove(food);
        food = null;

        // Spawn new food
        spawnFood();
    }

    // --- Move Snake Body ---
    let lastPos = head.position.clone();
    head.position.copy(newHeadPos); // Move head first

    for (let i = 1; i < snake.length; i++) {
        const currentPos = snake[i].position.clone();
        snake[i].position.copy(lastPos);
        lastPos = currentPos;
    }

    // --- Grow Snake if Food Eaten ---
    if (ateFood) {
        const newSegment = createSnakeSegment(lastPos); // Add segment at the previous tail position
        snake.push(newSegment);
    }
}

function spawnFood() {
    let foodPos;
    let validPosition = false;
    const maxAttempts = 50; // Prevent infinite loop if space is tight
    let attempts = 0;

    // Find a position near a plant, not on the snake
    while (!validPosition && attempts < maxAttempts) {
        attempts++;
        // Pick a random plant
        const randomPlant = plants[Math.floor(Math.random() * plants.length)];
        const plantPos = randomPlant.position;

        // Get a random offset around the plant
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetRadius = GRID_SIZE * (1 + Math.random() * 2); // 1 to 3 grid units away
        const potentialX = plantPos.x + Math.cos(offsetAngle) * offsetRadius;
        const potentialZ = plantPos.z + Math.sin(offsetAngle) * offsetRadius;

        // Snap to grid
        foodPos = snapToGrid(new THREE.Vector3(potentialX, GRID_SIZE / 2, potentialZ));

        // Check if position is valid (not on snake)
        validPosition = true;
        for (const segment of snake) {
            if (segment.position.distanceTo(foodPos) < GRID_SIZE * 0.5) {
                validPosition = false;
                break;
            }
        }

        // Check if within bounds
        const halfPlane = (PLANE_SIZE / 2) * GRID_SIZE;
         if (foodPos.x >= halfPlane || foodPos.x < -halfPlane ||
            foodPos.z >= halfPlane || foodPos.z < -halfPlane) {
             validPosition = false;
         }
    }
     // If failed after many attempts, place randomly (less ideal)
     if (!validPosition) {
         console.warn("Could not find ideal food position near plant, placing randomly.");
         while (!validPosition) {
            foodPos = getRandomGridPosition();
            validPosition = true;
            for (const segment of snake) {
                if (segment.position.distanceTo(foodPos) < GRID_SIZE * 0.5) {
                    validPosition = false;
                    break;
                }
            }
         }
     }


    createFood(foodPos);
}

function getRandomGridPosition() {
    const maxCoord = Math.floor(PLANE_SIZE / 2) - 1;
    const x = Math.floor(Math.random() * (maxCoord * 2 + 1) - maxCoord) * GRID_SIZE;
    const z = Math.floor(Math.random() * (maxCoord * 2 + 1) - maxCoord) * GRID_SIZE;
    return new THREE.Vector3(x, GRID_SIZE / 2, z); // Y position is half grid size up
}

function snapToGrid(position) {
    const snappedX = Math.round(position.x / GRID_SIZE) * GRID_SIZE;
    const snappedZ = Math.round(position.z / GRID_SIZE) * GRID_SIZE;
    return new THREE.Vector3(snappedX, GRID_SIZE / 2, snappedZ);
}


function triggerGameOver() {
    gameRunning = false;
    gameOver = true;
    finalScoreElement.innerText = score;
    gameOverElement.classList.remove('hidden');
}

// --- Animation & Rendering ---

function animate(time) { // time is passed by requestAnimationFrame
    requestAnimationFrame(animate);

    const now = performance.now();
    const delta = now - lastUpdateTime;

    // Update game logic at a fixed interval
    if (gameRunning && delta >= updateInterval) {
        lastUpdateTime = now - (delta % updateInterval); // Adjust for potential overshoot
        moveSnake();
    }

    // --- Animations (run every frame) ---
    const elapsedTime = now * 0.001; // Convert time to seconds

    // Animate Food (Pulsating scale and rotation)
    if (food) {
        const scaleFactor = 1 + Math.sin(elapsedTime * 5) * 0.15; // Pulsate between 0.85 and 1.15
        food.scale.set(scaleFactor, scaleFactor, scaleFactor);
        food.rotation.y = elapsedTime * 1.5;
        food.rotation.x = elapsedTime * 1.0;
    }

     // Animate Plants (Swaying)
     plants.forEach(plant => {
         const sway = Math.sin(elapsedTime * plant.userData.swaySpeed) * plant.userData.swayAmount;
         // Sway leaves more than trunk
         plant.children[0].rotation.z = sway * 0.5; // Trunk sway
         plant.children[1].rotation.z = sway;      // Leaves sway
     });

    // Animate Snake Segments (Subtle bobbing) - Optional
    snake.forEach((segment, index) => {
        segment.position.y = GRID_SIZE / 2 + Math.sin(elapsedTime * 4 + index * 0.5) * 0.1; // Bobbing effect
    });


    // Update Camera Position to follow snake head
    if (snake.length > 0) {
        const headPos = snake[0].position;
        // Smoothly interpolate camera position towards target
        const targetCameraPos = new THREE.Vector3(headPos.x, CAMERA_HEIGHT, headPos.z);
        camera.position.lerp(targetCameraPos, 0.1); // Adjust 0.1 for faster/slower follow
        camera.lookAt(headPos); // Always look at the head
    }

    // Render the scene
    renderer.render(scene, camera);
}

// --- Event Handlers ---

function handleKeyDown(event) {
    // Use event.key for modern browsers
    const key = event.key;

    if (!gameRunning && !gameOver && key === ' ') { // Spacebar to Start
        startGame();
        return;
    }
    if (gameOver && key === ' ') { // Spacebar to Restart
        resetGame();
        // No need to call startGame here, resetGame makes it ready, next space will start
        return;
    }


    // Buffer the next direction change, don't change immediately
    switch (key) {
        case 'ArrowUp':    // Up (negative Z)
        case 'w':
            if (direction.z === 0) { // Prevent moving directly backward
                nextDirection.set(0, 0, -GRID_SIZE);
            }
            break;
        case 'ArrowDown':  // Down (positive Z)
        case 's':
             if (direction.z === 0) {
                 nextDirection.set(0, 0, GRID_SIZE);
             }
            break;
        case 'ArrowLeft':  // Left (negative X)
        case 'a':
             if (direction.x === 0) {
                 nextDirection.set(-GRID_SIZE, 0, 0);
             }
            break;
        case 'ArrowRight': // Right (positive X)
        case 'd':
             if (direction.x === 0) {
                 nextDirection.set(GRID_SIZE, 0, 0);
             }
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Start the game ---
init();