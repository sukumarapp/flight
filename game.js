import * as THREE from 'three';

// --- Basic Setup ---
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1a2a, 100, 600); // Add fog for depth perception

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(scene.fog.color); // Set background color to fog color

const gameContainer = document.getElementById('game-container');
renderer.setSize(window.innerWidth, window.innerHeight);
gameContainer.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xcccccc); // Softer ambient
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Brighter sun
directionalLight.position.set(5, 15, 10);
scene.add(directionalLight);

// --- Game Constants ---
const PLAYER_MOVE_SPEED = 0.3; // Sideways and vertical speed
const PLAYER_ROLL_SPEED = 0.05; // How fast the plane banks
const MAX_ROLL = Math.PI / 6; // Max bank angle (30 degrees)
const FORWARD_SPEED = 1.5; // How fast the world moves towards the player
const BULLET_SPEED = 3.0;
const ENEMY_BASE_SPEED = 0.8;
const ENEMY_SPAWN_INTERVAL = 800; // milliseconds
const BULLET_COOLDOWN = 150; // milliseconds
const GAME_BOUNDS = { x: 25, y: 15 }; // Play area boundaries relative to player
const ENEMY_SPAWN_Z = -300; // How far ahead enemies spawn

// --- Game State ---
let score = 0;
let bullets = [];
let enemies = [];
let worldObjects = []; // To move background elements
let lastShotTime = 0;
let lastEnemySpawnTime = 0;
let keysPressed = {};
let gameOver = true;
let gameRunning = false;
const clock = new THREE.Clock(); // For delta time (smoother movement)

// --- UI Elements ---
const scoreElement = document.getElementById('score');
const gameOverOverlay = document.getElementById('game-over');
const finalScoreElement = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const startScreenOverlay = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');


// --- Helper: Create Simple Plane Mesh ---
function createPlaneMesh(color, scale = 1) {
    const bodyGeo = new THREE.BoxGeometry(1.5 * scale, 0.5 * scale, 0.5 * scale);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, flatShading: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);

    const wingGeo = new THREE.BoxGeometry(0.5 * scale, 0.15 * scale, 3 * scale);
    const wingMat = new THREE.MeshStandardMaterial({ color: color, flatShading: true });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.y = 0;

    const tailWingGeo = new THREE.BoxGeometry(0.3 * scale, 0.1 * scale, 1.5 * scale);
    const tailWing = new THREE.Mesh(tailWingGeo, wingMat);
    tailWing.position.x = -0.8 * scale; // Move tail wing back

    const tailFinGeo = new THREE.BoxGeometry(0.3 * scale, 0.5 * scale, 0.1 * scale);
    const tailFin = new THREE.Mesh(tailFinGeo, wingMat);
    tailFin.position.x = -0.8 * scale;
    tailFin.position.y = 0.3 * scale;


    const planeGroup = new THREE.Group();
    planeGroup.add(body);
    planeGroup.add(wing);
    planeGroup.add(tailWing);
    planeGroup.add(tailFin);

    // Add bounding box for collision
    planeGroup.userData.boundingBox = new THREE.Box3();
    planeGroup.userData.getHit = function() { // Function enemies can call on collision
        // Could add visual effect here
    }
    // Rotate group so Z is forward
    planeGroup.rotation.y = Math.PI / 2;

    return planeGroup;
}

// --- Player Setup ---
const player = createPlaneMesh(0x0077ff, 1.2); // Blue, slightly larger
scene.add(player);
player.position.z = -5; // Player is reference point, stays near origin Z


// --- Camera Positioning ---
// Camera is positioned relative to the player group but doesn't move with it
camera.position.set(0, 3, 8); // Slightly above and behind the player's initial conceptual position
camera.lookAt(0, 1, -10); // Look slightly down and ahead

// --- Background Elements (Clouds, Ground etc.) ---
function createCloud() {
    const cloudGeo = new THREE.SphereGeometry(THREE.MathUtils.randFloat(2, 5), 8, 6);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);

    cloud.position.x = THREE.MathUtils.randFloatSpread(GAME_BOUNDS.x * 4);
    cloud.position.y = THREE.MathUtils.randFloat(GAME_BOUNDS.y * 0.5, GAME_BOUNDS.y * 2);
    cloud.position.z = THREE.MathUtils.randFloat(ENEMY_SPAWN_Z, camera.position.z - 50); // Spawn ahead

    scene.add(cloud);
    worldObjects.push(cloud);
}

for (let i = 0; i < 30; i++) { // Add initial clouds
    createCloud();
}

// Simple Ground Plane
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x669944, flatShading: true }); // Greenish
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -GAME_BOUNDS.y - 5; // Position below play area
scene.add(ground);
worldObjects.push(ground); // Add ground to world objects so it moves


// --- Input Handling ---
document.addEventListener('keydown', (event) => {
    keysPressed[event.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
        event.preventDefault();
    }
    if (event.key === ' ' && !gameOver && gameRunning) {
        shoot();
    }
});
document.addEventListener('keyup', (event) => {
    keysPressed[event.key.toLowerCase()] = false;
});

// --- Game Functions ---

function createBullet() {
    const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 }); // Yellow/Orange bullet
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Calculate spawn position relative to player's current rotation
    const offset = new THREE.Vector3(0, 0, -1.5); // Offset in front of plane nose
    offset.applyQuaternion(player.quaternion); // Apply player's rotation to offset
    bullet.position.copy(player.position).add(offset); // Add offset to player's position

    // Calculate initial velocity direction based on player rotation
    const direction = new THREE.Vector3(0, 0, -1); // Base direction (forward)
    direction.applyQuaternion(player.quaternion); // Rotate direction vector
    bullet.userData.velocity = direction.multiplyScalar(BULLET_SPEED); // Store velocity

    bullet.userData.isBullet = true; // Flag for collision checking
    bullet.userData.boundingBox = new THREE.Box3().setFromObject(bullet);

    scene.add(bullet);
    bullets.push(bullet);
}

function shoot() {
    const now = Date.now();
    if (now - lastShotTime > BULLET_COOLDOWN) {
        lastShotTime = now;
        createBullet();
    }
}

function createEnemy() {
    const enemy = createPlaneMesh(0xff0000, 1); // Red enemy, standard size
    enemy.userData.isEnemy = true;

    // Position enemy ahead, random X/Y within wider bounds initially
    enemy.position.x = THREE.MathUtils.randFloatSpread(GAME_BOUNDS.x * 1.5);
    enemy.position.y = THREE.MathUtils.randFloat(0, GAME_BOUNDS.y * 1.5);
    enemy.position.z = ENEMY_SPAWN_Z; // Start far ahead

    enemy.rotation.y = -Math.PI / 2; // Point towards player (positive Z)

    scene.add(enemy);
    enemies.push(enemy);
}

function updatePlayer(deltaTime) {
    let targetRoll = 0;
    let moveX = 0;
    let moveY = 0;

    // Calculate movement based on input
    if (keysPressed['arrowleft'] && player.position.x > -GAME_BOUNDS.x) {
        moveX = -PLAYER_MOVE_SPEED;
        targetRoll = MAX_ROLL;
    }
    if (keysPressed['arrowright'] && player.position.x < GAME_BOUNDS.x) {
        moveX = PLAYER_MOVE_SPEED;
        targetRoll = -MAX_ROLL;
    }
    if (keysPressed['arrowup'] && player.position.y < GAME_BOUNDS.y) {
        moveY = PLAYER_MOVE_SPEED;
    }
    if (keysPressed['arrowdown'] && player.position.y > -GAME_BOUNDS.y) {
        moveY = -PLAYER_MOVE_SPEED;
    }

    // Apply movement
    player.position.x += moveX;
    player.position.y += moveY;

    // Smoothly interpolate roll (banking) towards the target roll
    player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, targetRoll, PLAYER_ROLL_SPEED);

    // Keep player within bounds (redundant check, but safe)
    player.position.clamp(
        new THREE.Vector3(-GAME_BOUNDS.x, -GAME_BOUNDS.y, player.position.z),
        new THREE.Vector3(GAME_BOUNDS.x, GAME_BOUNDS.y, player.position.z)
    );

    // Update player bounding box after movement/rotation
    player.userData.boundingBox.setFromObject(player);
}


function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        // Move bullet based on its velocity
        bullet.position.addScaledVector(bullet.userData.velocity, deltaTime);

        // Simplified forward movement relative to world scroll
        bullet.position.z -= FORWARD_SPEED * deltaTime * 60; // Adjust Z based on world speed

        // Update bounding box
        bullet.userData.boundingBox.setFromObject(bullet);

        // Remove bullets that go too far ahead or behind
        if (bullet.position.z < ENEMY_SPAWN_Z - 50 || bullet.position.z > camera.position.z + 20) {
            scene.remove(bullet);
            disposeObject(bullet);
            bullets.splice(i, 1);
        }
    }
}

function updateEnemies(deltaTime) {
    const now = Date.now();
    // Spawn new enemies
    if (now - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL && enemies.length < 20) { // Limit max enemies
        lastEnemySpawnTime = now;
        createEnemy();
    }

    // Update existing enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        // Move enemy towards player (positive Z) + world scroll
        const speedMultiplier = 1 + score / 500; // Increase speed with score
        enemy.position.z += (ENEMY_BASE_SPEED * speedMultiplier + FORWARD_SPEED) * deltaTime * 60; // Adjusted for deltaTime

        // Optional: Add slight weaving/homing behavior here later

        // Update bounding box
        enemy.userData.boundingBox.setFromObject(enemy);

        // Remove enemies that pass the player
        if (enemy.position.z > camera.position.z + 10) {
            scene.remove(enemy);
            disposeObject(enemy);
            enemies.splice(i, 1);
        }
    }
}

// Function to move background elements
function updateWorld(deltaTime) {
    // Move clouds and ground towards the player
    for (let i = worldObjects.length - 1; i >= 0; i--) {
        const obj = worldObjects[i];
        obj.position.z += FORWARD_SPEED * deltaTime * 60; // Use deltaTime for frame independence

        // Recycle clouds that go behind the camera
        if (obj !== ground && obj.position.z > camera.position.z + 50) {
            // Reposition cloud far ahead again
            obj.position.x = THREE.MathUtils.randFloatSpread(GAME_BOUNDS.x * 4);
            obj.position.y = THREE.MathUtils.randFloat(GAME_BOUNDS.y * 0.5, GAME_BOUNDS.y * 2);
            obj.position.z = ENEMY_SPAWN_Z - THREE.MathUtils.randFloat(0, 100);
        }
    }
}


function checkCollisions() {
    // Bullet-Enemy Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletHit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (bullet.userData.boundingBox.intersectsBox(enemy.userData.boundingBox)) {
                // Collision detected!
                scene.remove(enemy);
                disposeObject(enemy);
                enemies.splice(j, 1);

                scene.remove(bullet);
                disposeObject(bullet);
                bullets.splice(i, 1);

                score += 10;
                scoreElement.innerText = `Score: ${score}`;
                bulletHit = true;
                // Add explosion effect here later
                break; // Bullet hit one enemy
            }
        }
        if (bulletHit) continue; // Move to next bullet if this one hit
    }

    // Player-Enemy Collisions
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (player.userData.boundingBox.intersectsBox(enemy.userData.boundingBox)) {
            // Collision!
            enemy.userData.getHit?.(); // Call enemy's hit function if exists
            triggerGameOver(); // Game Over
            // Add player hit effect?
            break;
        }
    }
}

// Helper to dispose of object resources
function disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
        } else {
            obj.material.dispose();
        }
    }
    if (obj.children) {
        obj.children.forEach(child => disposeObject(child)); // Recursively dispose children
    }
}


function triggerGameOver() {
    gameOver = true;
    gameRunning = false;
    finalScoreElement.innerText = `Final Score: ${score}`;
    gameOverOverlay.classList.remove('hidden');
}

function resetGame() {
    score = 0;
    scoreElement.innerText = `Score: ${score}`;

    // Remove all existing bullets
    bullets.forEach(bullet => {
        scene.remove(bullet);
        disposeObject(bullet);
    });
    bullets = [];

    // Remove all existing enemies
    enemies.forEach(enemy => {
        scene.remove(enemy);
        disposeObject(enemy);
    });
    enemies = [];

    // Reset player position and rotation
    player.position.set(0, 0, -5);
    player.rotation.set(0, 0, 0); // Reset roll

    // Reset timers
    lastShotTime = 0;
    lastEnemySpawnTime = 0;
    clock.start(); // Restart clock

    // Reset keys
    keysPressed = {};

    // Hide overlays
    gameOverOverlay.classList.add('hidden');
    startScreenOverlay.classList.add('hidden');

    // Start game state
    gameOver = false;
    gameRunning = true;
    animate(); // Restart animation loop
}

// --- Event Listeners for Buttons ---
restartButton.addEventListener('click', resetGame);
startButton.addEventListener('click', () => {
    startScreenOverlay.classList.add('hidden');
    resetGame();
});

// --- Animation Loop ---
function animate() {
    if (!gameRunning && gameOver) {
        renderer.render(scene, camera); // Keep rendering for overlays
        requestAnimationFrame(animate);
        return;
    }
    if (gameOver && !gameRunning) return; // Stop loop if game over processed

    const deltaTime = clock.getDelta(); // Time since last frame
    requestAnimationFrame(animate);

    // Update game logic only if not game over
    if (!gameOver) {
        updatePlayer(deltaTime);
        updateBullets(deltaTime);
        updateEnemies(deltaTime);
        updateWorld(deltaTime); // Move background elements
        checkCollisions();
    }

    renderer.render(scene, camera);
}

// --- Initial Setup ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Initial render for start screen
renderer.render(scene, camera);
startScreenOverlay.classList.remove('hidden');
// animate() loop starts via button clicks -> resetGame()
