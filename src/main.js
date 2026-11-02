import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./style.css";

const ROOM = { width: 24, depth: 34, height: 9 };
const PLAYER = { radius: 0.45, height: 1.8, speed: 5.2 };
const keys = new Set();
const clock = new THREE.Clock();
const playerPosition = new THREE.Vector3(0, 0, 9);
const cameraTarget = new THREE.Vector3();
let running = false;
let finished = false;
let elapsed = 0;
let distance = 0;
let escapeLine;
let keyLight;
let cameraYaw = 0;
let cameraPitch = 0.18;
let animationMixer;
let movementAction;
let spiderLegs = [];
let spiderWalkTime = 0;
let spiderWalking = false;
let spiderBoneCount = 0;
let spiderLoaded = false;
let surface = "floor";
const surfaceNormal = new THREE.Vector3(0, 1, 0);
const surfaceUp = new THREE.Vector3(0, 1, 0);
const surfaceForward = new THREE.Vector3(0, 0, -1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f4f1);
scene.fog = new THREE.Fog(0xf4f4f1, 24, 55);

const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.2, 14);
cameraYaw = 0;
cameraPitch = 0.18;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
document.querySelector("#game").prepend(renderer.domElement);

const roomMaterial = new THREE.MeshStandardMaterial({ color: 0xf8f8f5, roughness: 0.92, metalness: 0 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e9e5, roughness: 0.97 });
const trimMaterial = new THREE.MeshBasicMaterial({ color: 0xd7d7d2, transparent: true, opacity: 0.35 });

function addRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), roomMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  scene.add(ceiling);

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), roomMaterial);
  backWall.position.set(0, ROOM.height / 2, -ROOM.depth / 2);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const frontWall = backWall.clone();
  frontWall.position.z = ROOM.depth / 2;
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  for (const x of [-ROOM.width / 2, ROOM.width / 2]) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), roomMaterial);
    sideWall.position.set(x, ROOM.height / 2, 0);
    sideWall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    sideWall.receiveShadow = true;
    scene.add(sideWall);
  }

  // Fine seams keep the space legible without breaking its emptiness.
  const seamGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-ROOM.width / 2 + 0.02, 0.01, 0),
    new THREE.Vector3(ROOM.width / 2 - 0.02, 0.01, 0),
  ]);
  for (let z = -ROOM.depth / 2 + 4; z < ROOM.depth / 2; z += 4) {
    const seam = new THREE.Line(seamGeometry, trimMaterial);
    seam.position.z = z;
    scene.add(seam);
  }

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0x181816,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  escapeLine = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.035), lineMaterial);
  escapeLine.position.set(0, 1.15, -ROOM.depth / 2 + 0.06);
  scene.add(escapeLine);
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d2, 1.65));

  keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-5, 8, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.bias = -0.0003;
  scene.add(keyLight);

  const ceilingLight = new THREE.RectAreaLight(0xffffff, 3, 10, 4);
  ceilingLight.position.set(0, ROOM.height - 0.08, -2);
  ceilingLight.rotation.x = Math.PI;
  scene.add(ceilingLight);
}

function addPlaceholderPlayer() {
  const player = new THREE.Group();
  player.position.copy(playerPosition);
  player.rotation.y = Math.PI;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x343432, roughness: 0.78 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xb9a89a, roughness: 0.92 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.76, 8, 16), bodyMaterial);
  body.castShadow = true;
  player.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), skinMaterial);
  head.position.y = 0.78;
  head.castShadow = true;
  player.add(head);

  const legGeometry = new THREE.CapsuleGeometry(0.12, 0.65, 6, 10);
  for (const x of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(legGeometry, bodyMaterial);
    leg.position.set(x, -0.73, 0);
    leg.castShadow = true;
    player.add(leg);
  }
  scene.add(player);
  return player;
}

function loadSpider(player) {
  const loader = new GLTFLoader();
  loader.load(
    "/spider_fully_rigged.glb",
    (gltf) => {
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const largestDimension = Math.max(size.x, size.y, size.z);
      const scale = 2.4 / largestDimension;
      model.scale.setScalar(scale);

      const scaledBounds = new THREE.Box3().setFromObject(model);
      const center = scaledBounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaledBounds.min.y, -center.z);

      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });

      player.clear();
      player.add(model);
      model.rotation.y = Math.PI;
      const legNames = [
        "Bone.003_03", "Bone.007_06", "Bone.010_09", "Bone.014_013",
        "Bone.018_017", "Bone.022_020", "Bone.026_024", "Bone.030_028",
      ];
      spiderLoaded = true;
      const skeletonBones = [];
      model.traverse((object) => {
        if (object.isBone || object.type === "Bone") skeletonBones.push(object);
      });
      const legRoots = legNames
        .map((name) => skeletonBones.find((bone) => bone.name === name))
        .filter(Boolean);
      const branchRoots = skeletonBones.filter((bone) =>
        bone.parent && /spine|Object_4/i.test(bone.parent.name) && !/spine|root/i.test(bone.name),
      );
      const roots = (legRoots.length >= 8 ? legRoots : branchRoots).slice(0, 8);
      spiderLegs = roots.map((root) => {
        const bones = [];
        let current = root;
        while (current) {
          bones.push({
            bone: current,
            x: current.rotation.x,
            y: current.rotation.y,
            z: current.rotation.z,
          });
          current = current.children.find((child) => child.isBone || child.type === "Bone");
        }
        return bones;
      });
      if (spiderLegs.length === 0) {
        const fallbackRoots = skeletonBones.filter((bone) => /^Bone\./i.test(bone.name) && bone.children.some((child) => child.isBone || child.type === "Bone"));
        spiderLegs = fallbackRoots.slice(0, 8).map((root) => {
          const bones = [];
          let current = root;
          while (current) {
            if (!current.isBone) break;
            bones.push({
              bone: current,
              x: current.rotation.x,
              y: current.rotation.y,
              z: current.rotation.z,
            });
            current = current.children.find((child) => child.isBone || child.type === "Bone");
          }
          return bones;
        });
      }
      spiderBoneCount = spiderLegs.reduce((count, leg) => count + leg.length, 0);
      if (gltf.animations.length > 0) {
        animationMixer = new THREE.AnimationMixer(model);
        const walkingClip = gltf.animations.find((clip) => /walk|run|locomotion|move/i.test(clip.name)) ?? gltf.animations[0];
        movementAction = animationMixer.clipAction(walkingClip);
        movementAction.clampWhenFinished = false;
        movementAction.setEffectiveWeight(1);
      }
      statusElement.textContent = `SPIDER LOADED / REAL LEGS: ${spiderBoneCount}`;
    },
    undefined,
    () => {
      spiderLoaded = false;
      statusElement.textContent = "THE SPIDER COULD NOT ENTER";
    },
  );
}

addRoom();
addLighting();
const player = addPlaceholderPlayer();
loadSpider(player);
const elapsedElement = document.querySelector("#elapsed");
const distanceElement = document.querySelector("#distance");
const statusElement = document.querySelector("#status");
const endingElement = document.querySelector("#ending");
const endingTitleElement = document.querySelector("#ending-title");
const endingCopyElement = document.querySelector("#ending-copy");

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function updatePlayer(delta) {
  const pressed = (primary, alternate) => keys.has(primary) || keys.has(alternate);
  const input = new THREE.Vector3(
    (pressed("KeyD", "ArrowRight") ? 1 : 0) - (pressed("KeyA", "ArrowLeft") ? 1 : 0),
    0,
    (pressed("KeyS", "ArrowDown") ? 1 : 0) - (pressed("KeyW", "ArrowUp") ? 1 : 0),
  );
  if (input.lengthSq() === 0) {
    spiderWalking = false;
    movementAction?.stop();
    return;
  }

  input.normalize();
  movementAction?.play();
  const previous = player.position.clone();
  const amount = PLAYER.speed * delta;
  const movement = getSurfaceMovement(input, amount);
  player.position.add(movement);
  updateSurface();
  spiderWalking = previous.distanceTo(player.position) > 0.0001;
  if (movement.lengthSq() > 0) {
    const facing = Math.atan2(movement.x, movement.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, facing, 0.18);
  }
  distance += previous.distanceTo(player.position);
  if (surface === "floor") player.position.y = Math.sin(elapsed * 10) * 0.01;
  checkEnding();
}

function getSurfaceMovement(input, amount) {
  if (surface === "floor" || surface === "ceiling") {
    return new THREE.Vector3(input.x * amount, 0, input.z * amount);
  }
  if (surface === "left" || surface === "right") {
    return new THREE.Vector3(0, -input.z * amount, input.x * amount);
  }
  return new THREE.Vector3(input.x * amount, -input.z * amount, 0);
}

function updateSurface() {
  const edge = PLAYER.radius;
  const halfWidth = ROOM.width / 2 - edge;
  const halfDepth = ROOM.depth / 2 - edge;
  const top = ROOM.height - edge;

  if (surface === "floor") {
    player.position.y = 0;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -halfWidth, halfWidth);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -halfDepth, halfDepth);
    if (player.position.x <= -halfWidth && (keys.has("KeyA") || keys.has("ArrowLeft"))) surface = "left";
    if (player.position.x >= halfWidth && (keys.has("KeyD") || keys.has("ArrowRight"))) surface = "right";
    if (player.position.z <= -halfDepth && (keys.has("KeyW") || keys.has("ArrowUp"))) surface = "back";
    if (player.position.z >= halfDepth && (keys.has("KeyS") || keys.has("ArrowDown"))) surface = "front";
  } else if (surface === "ceiling") {
    player.position.y = top;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -halfWidth, halfWidth);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -halfDepth, halfDepth);
    if (player.position.y <= 0) surface = "floor";
  } else if (surface === "left" || surface === "right") {
    player.position.x = surface === "left" ? -halfWidth : halfWidth;
    player.position.y = THREE.MathUtils.clamp(player.position.y, 0, top);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -halfDepth, halfDepth);
    if (player.position.y >= top) surface = "ceiling";
    if (player.position.y <= 0) surface = "floor";
  } else {
    player.position.z = surface === "back" ? -halfDepth : halfDepth;
    player.position.y = THREE.MathUtils.clamp(player.position.y, 0, top);
    player.position.x = THREE.MathUtils.clamp(player.position.x, -halfWidth, halfWidth);
    if (player.position.y >= top) surface = "ceiling";
    if (player.position.y <= 0) surface = "floor";
  }
}

function updateSpiderAnimation(delta) {
  if (!spiderLegs.length) return;
  const strideSpeed = spiderWalking ? 7 : 0;
  spiderWalkTime += delta * strideSpeed;
  spiderLegs.forEach((leg, legIndex) => {
    const phase = spiderWalkTime + legIndex * Math.PI;
    const step = Math.sin(phase);
    const side = legIndex % 2 ? 1 : -1;

    leg.forEach(({ bone, x, y, z }, jointIndex) => {
      const amount = spiderWalking ? 1 : 0;
      const lift = Math.max(0, step) * side * amount;
      const targetX = x + lift * (jointIndex === 1 ? 0.8 : 0.32);
      const targetZ = z + step * side * amount *
        (jointIndex === 0 ? 0.7 : jointIndex === 1 ? -1.0 : 0.5);
      bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetX, 0.35);
      bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, y, 0.35);
      bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetZ, 0.35);
    });
  });
}

function checkEnding() {
  const atBackWall = player.position.z <= -ROOM.depth / 2 + PLAYER.radius + 0.1;
  const atFrontWall = player.position.z >= ROOM.depth / 2 - PLAYER.radius - 0.1;
  if (surface === "floor" && atBackWall && elapsed >= 30 && Math.abs(player.position.x) < 3) {
    finish("escape");
  } else if (atFrontWall && elapsed >= 10) {
    finish("loop");
  }
}

function finish(type) {
  if (finished) return;
  finished = true;
  running = false;
  document.body.classList.add("finished");
  if (type === "escape") {
    endingTitleElement.textContent = "YOU ESCAPED";
    endingCopyElement.textContent = "The line was waiting for you. The room was never as large as it felt.";
  } else {
    endingTitleElement.textContent = "THE LOOP";
    endingCopyElement.textContent = "You reached the wrong wall. The room has returned you to where you began.";
  }
}

function resetGame() {
  player.position.copy(playerPosition);
  player.position.y = 0;
  player.rotation.y = Math.PI;
  camera.position.set(0, 3.2, 14);
  elapsed = 0;
  distance = 0;
  spiderWalking = false;
  surface = "floor";
  finished = false;
  running = true;
  clock.start();
  document.body.classList.remove("finished");
}

function updateCamera(delta) {
  const cameraDistance = 5.2;
  const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
  const orbitYaw = player.rotation.y + cameraYaw;
  const facing = new THREE.Vector3(Math.sin(orbitYaw), 0, Math.cos(orbitYaw));
  cameraTarget.set(
    player.position.x - facing.x * horizontalDistance,
    player.position.y + 1.15 + Math.sin(cameraPitch) * cameraDistance,
    player.position.z - facing.z * horizontalDistance,
  );
  camera.position.lerp(cameraTarget, 1 - Math.pow(0.001, delta));
  camera.lookAt(player.position.x, player.position.y + 0.2, player.position.z);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  updateSpiderAnimation(delta);
  if (running) {
    elapsed += delta;
    animationMixer?.update(delta);
    updatePlayer(delta);
    updateCamera(delta);
    elapsedElement.textContent = formatTime(elapsed);
    distanceElement.textContent = Math.floor(distance).toString();
    const unease = Math.min(Math.max((elapsed - 30) / 30, 0), 1);
    escapeLine.material.opacity = unease * 0.92;
    roomMaterial.color.setHSL(0.16, 0.04, 0.97 - unease * 0.035);
    scene.fog.density = 0.008 + unease * 0.006;
    keyLight.intensity = 2.4 - unease * 0.45;
    statusElement.textContent = spiderLoaded
      ? `REAL LEGS: ${spiderBoneCount}`
      : elapsed > 30 ? "THE LINE IS REAL" : "KEEP MOVING";
  }
  renderer.render(scene, camera);
}

document.querySelector("#begin").addEventListener("click", () => {
  running = true;
  document.body.classList.add("playing");
  clock.start();
  renderer.domElement.requestPointerLock();
});

renderer.domElement.addEventListener("click", () => {
  if (running && !finished) renderer.domElement.requestPointerLock();
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement || !running || finished) return;
  cameraYaw -= event.movementX * 0.0025;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - event.movementY * 0.0025, -0.5, 0.8);
});
document.querySelector("#restart").addEventListener("click", resetGame);

addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
});
addEventListener("keyup", (event) => keys.delete(event.code));
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

animate();
