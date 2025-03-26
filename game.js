import * as THREE from 'three';

// --- Basic Setup ---
let scene, camera, renderer;
let playerPlane, ground;
const enemies = [];
const bullets = [];
const keysPressed = {};
const clock = new THREE.Clock();

const BULLET_SPEED = 50;
const PLANE_SPEED_MIN = 5;
const PLANE_SPEED_MAX = 30;
let currentPlaneSpeed = 10;
const FIRE_RATE_LIMIT = 0.15; // Seconds between shots
let lastFiredTime = 0;

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, -15); // Initial position relative to the plane's start

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide }); // Forest green
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = -10; // Position below the plane start
    scene.add(ground);

    // Player Airplane
    playerPlane = createAirplane(0x0000ff); // Blue color for player
    playerPlane.position.set(0, 0, 0);
    playerPlane.rotation.order = 'YXZ'; // Set rotation order for intuitive controls
    scene.add(playerPlane);

    // Spawn Initial Enemies
    spawnEnemies(5);

    // Event Listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Start the game loop
    animate();
}

// --- Object Creation ---
function createAirplane(color) {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(1, 0.5, 3);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Wings
    const wingGeometry = new THREE.BoxGeometry(5, 0.1, 1);
    const wingMaterial = new THREE.MeshStandardMaterial({ color: color });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-2.5, 0, 0);
    group.add(leftWing);
    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(2.5, 0, 0);
    group.add(rightWing);

     // Tail Wing (Horizontal Stabilizer)
    const tailWingGeometry = new THREE.BoxGeometry(2, 0.1, 0.5);
    const tailWing = new THREE.Mesh(tailWingGeometry, wingMaterial);
    tailWing.position.set(0, 0.1, 1.7); // Position it towards the back
    group.add(tailWing);

    // Tail Fin (Vertical Stabilizer)
    const tailFinGeometry = new THREE.BoxGeometry(0.1, 0.5, 0.5);
    const tailFin = new THREE.Mesh(tailFinGeometry, wingMaterial);
    tailFin.position.set(0, 0.35, 1.7); // Position it on top of the tail wing
    group.add(tailFin);

    // Add a helper to visualize the forward direction (optional)
    // const arrowHelper = new THREE.ArrowHelper(
    //     new THREE.Vector3(0, 0, 1), // Direction (local Z is forward)
    //     new THREE.Vector3(0, 0, 0), // Origin
    //     2, // Length
    //     0xffff00 // Color
    // );
    // group.add(arrowHelper);

    return group;
}

function createBullet() {
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red bullets
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);

    // Get plane's world position and direction
    const position = new THREE.Vector3();
    playerPlane.getWorldPosition(position);

    const direction = new THREE.Vector3();
    playerPlane.getWorldDirection(direction); // Gets the local -Z direction in world space

    // Three.jsgetWorldDirection gives the NEGATIVE Z axis. Our model faces +Z
    // So we need to either flip the model or flip the direction vector here.
    // Let's flip the direction vector for simplicity now.
    // direction.negate(); // If model faces -Z
    // OR, if model faces +Z like ours, we DON'T negate.

    // Position bullet slightly in front of the plane
    bullet.position.copy(position).add(direction.multiplyScalar(2)); // Start 2 units in front

    // Set velocity (make sure direction is normalized)
    bullet.userData.velocity = direction.normalize().multiplyScalar(BULLET_SPEED);
    bullet.userData.lifetime = 3; // Seconds before bullet disappears

    scene.add(bullet);
    bullets.push(bullet);
}

function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        const enemy = createAirplane(0xffa500); // Orange color for enemies
        // Random position within a range
        enemy.position.set(
            (Math.random() - 0.5) * 200,
            Math.random() * 20 + 5, // Higher altitude range
            (Math.random() - 0.5) * 200
        );
        // Random initial rotation
        enemy.rotation.y = Math.random() * Math.PI * 2;

        scene.add(enemy);
        enemies.push(enemy);
    }
}

// --- Event Handlers ---
function handleKeyDown(event) {
    keysPressed[event.code] = true;
}

function handleKeyUp(event) {
    keysPressed[event.code] = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Game Logic Update ---
function update(deltaTime) {
    const rotationSpeed = Math.PI * 0.5; // Radians per second
    const thrustAdjustment = 10;

    // --- Player Controls ---
    // Pitch (W/S) - Rotate around local X axis
    if (keysPressed['KeyW']) {
        playerPlane.rotateX(rotationSpeed * deltaTime);
    }
    if (keysPressed['KeyS']) {
        playerPlane.rotateX(-rotationSpeed * deltaTime);
    }

    // Roll (A/D) - Rotate around local Z axis
    if (keysPressed['KeyA']) {
        playerPlane.rotateZ(rotationSpeed * deltaTime);
    }
    if (keysPressed['KeyD']) {
        playerPlane.rotateZ(-rotationSpeed * deltaTime);
    }

    // Yaw (Q/E - Optional, often controlled by rudder pedals/twist stick)
    // if (keysPressed['KeyQ']) {
    //     playerPlane.rotateY(rotationSpeed * deltaTime * 0.5); // Slower yaw
    // }
    // if (keysPressed['KeyE']) {
    //     playerPlane.rotateY(-rotationSpeed * deltaTime * 0.5);
    // }

    // Thrust (Up/Down Arrows)
    if (keysPressed['ArrowUp']) {
        currentPlaneSpeed += thrustAdjustment * deltaTime;
    }
    if (keysPressed['ArrowDown']) {
        currentPlaneSpeed -= thrustAdjustment * deltaTime;
    }
    currentPlaneSpeed = Math.max(PLANE_SPEED_MIN, Math.min(PLANE_SPEED_MAX, currentPlaneSpeed));

    // --- Apply Movement ---
    const forward = new THREE.Vector3();
    playerPlane.getWorldDirection(forward); // Local Z is forward for this model
    // forward.negate(); // Use this if your model's front is its -Z axis

    playerPlane.position.add(forward.multiplyScalar(currentPlaneSpeed * deltaTime));


    // --- Firing ---
    const now = clock.getElapsedTime();
    if (keysPressed['Space'] && (now - lastFiredTime > FIRE_RATE_LIMIT)) {
        createBullet();
        lastFiredTime = now;
    }

    // --- Update Bullets ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.position.add(bullet.userData.velocity.clone().multiplyScalar(deltaTime));
        bullet.userData.lifetime -= deltaTime;

        if (bullet.userData.lifetime <= 0) {
            scene.remove(bullet);
            bullets.splice(i, 1);
            continue; // Skip collision check if removed
        }

        // --- Collision Detection (Bullet vs Enemy) ---
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            // Simple distance check (using bounding sphere radius approximation)
            const distance = bullet.position.distanceTo(enemy.position);
            const collisionThreshold = 3; // Adjust based on plane size

            if (distance < collisionThreshold) {
                console.log("Hit!");
                // Remove enemy and bullet
                scene.remove(enemy);
                enemies.splice(j, 1);
                scene.remove(bullet);
                bullets.splice(i, 1);

                // Optional: Spawn a new enemy
                // spawnEnemies(1);

                break; // Stop checking this bullet against other enemies
            }
        }
    }

    // --- Update Enemies (Simple - could add basic movement later) ---
    // Enemies are currently static

    // --- Update Camera ---
    updateCamera();

}

function updateCamera() {
    // Calculate offset relative to the plane's orientation
    const offset = new THREE.Vector3(0, 3, -10); // Behind and slightly above
    const cameraPosition = offset.applyMatrix4(playerPlane.matrixWorld); // Apply plane's world transform to offset

    // Smoothly move camera to the target position (Lerp)
    camera.position.lerp(cameraPosition, 0.1);

    // Make camera look at a point slightly in front of the plane
    const lookAtTarget = new THREE.Vector3(0, 1, 5); // Point in front of the plane (local space)
    const lookAtPosition = lookAtTarget.applyMatrix4(playerPlane.matrixWorld); // Transform to world space

    camera.lookAt(lookAtPosition);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    update(deltaTime); // Update game logic

    renderer.render(scene, camera);
}

// --- Start the game ---
init();
