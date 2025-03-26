import * as THREE from 'three';

// --- Basic Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

const gameContainer = document.getElementById('game-container');
renderer.setSize(window.innerWidth, window.innerHeight);
gameContainer.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xaaaaaa); // Soft white light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// --- Game Constants ---
const PLAYER_SPEED = 0.25;
const BULLET_SPEED = 0.8;
const ENEMY_SPEED = 0.05;
const ENEMY_SPAWN_INTERVAL = 1000; // milliseconds
const BULLET_COOLDOWN = 200; // milliseconds
const GAME_BOUNDS = { x: 18, y: 12 }; // Half-width and half-height of play area

// --- Game State ---
let score = 0;
let bullets = [];
let enemies = [];
let lastShotTime = 0;
let lastEnemySpawnTime = 0;
let keysPressed = {};
let gameOver = true; // Start in game over state (shows start screen)
let gameRunning = false; // Control the animation loop logic

// --- UI Elements ---
const scoreElement = document.getElementById('score');
const gameOverOverlay = document.getElementById('game-over');
const finalScoreElement = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const startScreenOverlay = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');


// --- Player Setup ---
const playerGeometry = new THREE.ConeGeometry(0.5, 1.5, 8); // Cone shape for plane body
playerGeometry.rotateX(Math.PI / 2); // Point cone forward (along negative Z)
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff }); // Blue
const player = new THREE.Mesh(playerGeometry, playerMaterial);
// Add cockpit indication (optional)
const cockpitGeo = new THREE.SphereGeometry(0.25, 8, 6);
const cockpitMat = new THREE.MeshStandardMaterial({color: 0xcccccc});
const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
cockpit.position.z = -0.3; // Slightly forward
cockpit.position.y = 0.15; // Slightly up
player.add(cockpit);

scene.add(player);
player.position.z = 8; // Start player further back
player.position.y = -GAME_BOUNDS.y + 2; // Start near bottom

// --- Camera Positioning ---
// Position camera slightly behind and above the player
camera.position.z = player.position.z + 5; // Behind player
camera.position.y = player.position.y + 3; // Above player
camera.lookAt(player.position); // Look towards the player initially

// --- Background (Simple Starfield) ---
const starsGeometry = new THREE.BufferGeometry();
const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
const starVertices = [];
for (let i = 0; i < 10000; i++) {
    const x = THREE.MathUtils.randFloatSpread(200); // Spread them out
    const y = THREE.MathUtils.randFloatSpread(200);
    const z = THREE.MathUtils.randFloatSpread(200);
    starVertices.push(x, y, z);
}
starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starField = new THREE.Points(starsGeometry, starsMaterial);
scene.add(starField);

// --- Ground Plane (Optional) ---
/*
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to be flat
ground.position.y = -GAME_BOUNDS.y - 1; // Position below play area
scene.add(ground);
*/


// --- Input Handling ---
document.addEventListener('keydown', (event) => {
    keysPressed[event.key.toLowerCase()] = true;
    // Prevent browser scrolling with arrow keys/space
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) {
        event.preventDefault();
    }
    // Handle shooting on keydown for responsiveness
    if (event.key === ' ' && !gameOver && gameRunning) {
        shoot();
    }
});
document.addEventListener('keyup', (event) => {
    keysPressed[event.key.toLowerCase()] = false;
});

// --- Game Functions ---

function createBullet() {
    const bulletGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green, emissive
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Position bullet at the tip of the player's cone
    bullet.position.copy(player.position);
    bullet.position.z -= 0.8; // Start slightly in front of the cone tip

    scene.add(bullet);
    bullets.push(bullet);
}

function shoot() {
    const now = Date.now();
    if (now - lastShotTime > BULLET_COOLDOWN) {
        lastShotTime = now;
        createBullet();
        // Add sound effect here if desired
    }
}

function createEnemy() {
    const enemyGeometry = new THREE.BoxGeometry(1, 0.5, 1.5); // Boxy enemy
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red
    const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);

    // Position enemy above the screen, random X, further back in Z
    enemy.position.x = THREE.MathUtils.randFloat(-GAME_BOUNDS.x, GAME_BOUNDS.x);
    enemy.position.y = GAME_BOUNDS.y + 5; // Start above screen
    enemy.position.z = THREE.MathUtils.randFloat(-20, -50); // Start far away

    // Add a bounding box helper for collision detection
    enemy.userData.boundingBox = new THREE.Box3().setFromObject(enemy);

    scene.add(enemy);
    enemies.push(enemy);
}

function updatePlayerPosition() {
    if (keysPressed['arrowleft'] && player.position.x > -GAME_BOUNDS.x) {
        player.position.x -= PLAYER_SPEED;
    }
    if (keysPressed['arrowright'] && player.position.x < GAME_BOUNDS.x) {
        player.position.x += PLAYER_SPEED;
    }
    if (keysPressed['arrowup'] && player.position.y < GAME_BOUNDS.y) {
        player.position.y += PLAYER_SPEED;
    }
    if (keysPressed['arrowdown'] && player.position.y > -GAME_BOUNDS.y) {
        player.position.y -= PLAYER_SPEED;
    }

    // Keep camera following the player smoothly (optional lerp for smoother follow)
    // camera.position.x = player.position.x;
    camera.position.y = player.position.y + 3;
    camera.position.z = player.position.z + 5;
    camera.lookAt(player.position.x, player.position.y, player.position.z - 5); // Look slightly ahead
}


function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.position.z -= BULLET_SPEED; // Move bullets forward (negative Z)

        // Remove bullets that go too far
        if (bullet.position.z < -100) {
            scene.remove(bullet);
            bullet.geometry.dispose(); // Clean up geometry
            bullet.material.dispose(); // Clean up material
            bullets.splice(i, 1);
        }
    }
}

function updateEnemies() {
    const now = Date.now();
    if (now - lastEnemySpawnTime > ENEMY_SPAWN_INTERVAL && enemies.length < 15) { // Limit max enemies
        lastEnemySpawnTime = now;
        createEnemy();
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.position.z += ENEMY_SPEED * (1 + score / 500); // Move enemy towards player, speed increases with score
        enemy.position.y -= ENEMY_SPEED * 0.3; // Slight downward drift

        // Update bounding box position
        enemy.userData.boundingBox.setFromObject(enemy);

        // Remove enemies that pass the player
        if (enemy.position.z > camera.position.z + 10) {
            scene.remove(enemy);
            enemy.geometry.dispose();
            enemy.material.dispose();
            enemies.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // Update player bounding box
    if (!player.userData.boundingBox) {
        player.userData.boundingBox = new THREE.Box3();
    }
    player.userData.boundingBox.setFromObject(player);

    // Bullet-Enemy Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet.userData.boundingBox) {
             bullet.userData.boundingBox = new THREE.Box3();
        }
        bullet.userData.boundingBox.setFromObject(bullet); // Update bullet box

        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];

            if (bullet.userData.boundingBox.intersectsBox(enemy.userData.boundingBox)) {
                // Collision detected!
                scene.remove(bullet);
                bullet.geometry.dispose();
                bullet.material.dispose();
                bullets.splice(i, 1);

                scene.remove(enemy);
                enemy.geometry.dispose();
                enemy.material.dispose();
                enemies.splice(j, 1);

                score += 10;
                scoreElement.innerText = `Score: ${score}`;

                // Add explosion effect here later

                break; // Bullet hit one enemy, no need to check others for this bullet
            }
        }
    }

    // Player-Enemy Collisions
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (player.userData.boundingBox.intersectsBox(enemy.userData.boundingBox)) {
            // Game Over!
            triggerGameOver();
            break; // No need to check further enemies
        }
    }
}


function triggerGameOver() {
    gameOver = true;
    gameRunning = false;
    finalScoreElement.innerText = `Final Score: ${score}`;
    gameOverOverlay.classList.remove('hidden');
    // Optional: Stop background music etc.
}

function resetGame() {
    score = 0;
    scoreElement.innerText = `Score: ${score}`;

    // Remove all existing bullets
    bullets.forEach(bullet => {
        scene.remove(bullet);
        bullet.geometry.dispose();
        bullet.material.dispose();
    });
    bullets = [];

    // Remove all existing enemies
    enemies.forEach(enemy => {
        scene.remove(enemy);
        enemy.geometry.dispose();
        enemy.material.dispose();
    });
    enemies = [];

    // Reset player position
    player.position.set(0, -GAME_BOUNDS.y + 2, 8);

    // Reset timers
    lastShotTime = 0;
    lastEnemySpawnTime = 0;

    // Reset keys
    keysPressed = {};

    // Hide overlays
    gameOverOverlay.classList.add('hidden');
    startScreenOverlay.classList.add('hidden');

    // Start game state
    gameOver = false;
    gameRunning = true; // Allow animation loop to run game logic
    animate(); // Restart animation loop if it was stopped
}

// --- Event Listeners for Buttons ---
restartButton.addEventListener('click', resetGame);
startButton.addEventListener('click', () => {
    startScreenOverlay.classList.add('hidden');
    resetGame(); // Initialize and start the game
});


// --- Animation Loop ---
function animate() {
    if (!gameRunning && gameOver) {
        // If game is over and not running (e.g., showing start/end screen)
        // Still render the scene but don't update game logic
        renderer.render(scene, camera);
        requestAnimationFrame(animate); // Keep rendering loop going for overlays
        return;
    }
    if(gameOver && !gameRunning) { // Should not happen with current logic but safe check
         return;
    }


    requestAnimationFrame(animate);

    // Update game logic only if not game over
    if (!gameOver) {
        updatePlayerPosition();
        updateBullets();
        updateEnemies();
        checkCollisions();

        // Rotate starfield slightly for movement illusion
        starField.rotation.z += 0.0002;
        starField.rotation.x += 0.0001;
    }

    renderer.render(scene, camera);
}

// --- Initial Setup ---
// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Don't start the main game loop immediately, wait for start button.
// Just render the initial scene for the start screen.
renderer.render(scene, camera);
// Show the start screen initially
startScreenOverlay.classList.remove('hidden');

// The actual game loop (calling animate()) will be started by the resetGame function
// when the start or restart button is clicked.