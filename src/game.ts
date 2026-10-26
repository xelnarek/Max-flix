import * as THREE from 'three';
import { CHARACTERS } from './characters.ts';
import { sound } from './sound.ts';
import {
  ActivePerks,
  CharacterDef,
  CharacterId,
  CollectibleItem,
  EnemyItem,
  GameState,
  HazardItem,
  PlatformBlock,
} from './types.ts';
import {
  createArchitectEnemyModel,
  createAgvRobotModel,
  createAisleArrow,
  createBathtubModel,
  createCarraraCollectible,
  createCharacterModel,
  createCustomerEnemyModel,
  createDeliveryVan,
  createEspressoCollectible,
  createFinishGate,
  createForkliftModel,
  createGoldenCutterCollectible,
  createGoldenThroneEasterEgg,
  createGroutCollectible,
  createHighBayLamp,
  createInspectorEnemyModel,
  createMagnetCollectible,
  createPenaltyNoticeProjectile,
  createSecretFolderEasterEgg,
  createTilePallet,
  createVintageCoffeeCornerEasterEgg,
  createVolumetricLightBeam,
  createWalczakBossModel,
  createWarehouseRack,
  getFloorTexture,
  getHazardStripeTexture,
  getMaxFlizLogoTexture,
  getWallTexture,
} from './warehouseAssets.ts';

export interface GameCallbacks {
  onScoreUpdate: (score: number, collectedVip: number, totalVip: number) => void;
  onHpUpdate: (hp: number, maxHp: number) => void;
  onAbilityCooldown: (progress: number, ready: boolean) => void;
  onSpeechBubble: (text: string) => void;
  onLevelComplete: (levelId: number, score: number, timeStr: string) => void;
  onGameOver: (reason: string) => void;
  onBossUpdate?: (name: string, hp: number, maxHp: number, visible: boolean) => void;
  onPerksUpdate?: (perks: ActivePerks) => void;
  onFloatingText?: (text: string, x: number, y: number, z: number, type?: 'points' | 'vip' | 'easter-egg') => void;
}

export class MaxFlizGameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public container: HTMLElement;

  private state: GameState = 'title';
  private currentCharacterId: CharacterId = 'marcin';
  private charDef: CharacterDef;

  // Player state
  private playerPos = new THREE.Vector3(0, 1, 0);
  private playerVel = new THREE.Vector3(0, 0, 0);
  private playerRot = 0;
  private isGrounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private hp = 3;
  private maxHp = 3;
  private score = 0;
  private comboStreak = 0;
  private comboTimer = 0;
  private collectedVipCount = 0;
  private totalVipCount = 0;
  private invulnerableTimer = 0;
  private abilityTimer = 0;
  private abilityActiveDuration = 0;
  private attackCooldownTimer = 0;
  private attackSwingTimer = 0;
  private walkCycle = 0;
  private speechBubbleTimer = 0;
  private levelStartTime = 0;
  private cameraShake = 0;
  private cameraMode: 'iso' | 'close' = 'iso';

  // Active Perks & Jump Modifiers
  private activePerks: ActivePerks = {
    doubleJump: 0,
    shield: false,
    magnet: 0,
    speedBoost: 0,
  };
  private hasDoubleJumped = false;

  // 3D Player Meshes
  private playerGroup: THREE.Group | null = null;
  private leftLeg: THREE.Mesh | null = null;
  private rightLeg: THREE.Mesh | null = null;
  private leftArm: THREE.Mesh | null = null;
  private rightArm: THREE.Mesh | null = null;
  private playerHead: THREE.Mesh | null = null;
  private playerBody: THREE.Mesh | null = null;

  // Level geometry & entities
  private currentLevelId = 1;
  private levelRoot = new THREE.Group();
  private platforms: PlatformBlock[] = [];
  private collectibles: CollectibleItem[] = [];
  private hazards: HazardItem[] = [];
  private enemies: EnemyItem[] = [];
  private enemyProjectiles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private particles: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
    maxLife: number;
  }[] = [];
  private projectiles: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
  }[] = [];

  // Input state
  private keys: Record<string, boolean> = {};
  private virtualJoystick = { x: 0, y: 0 };
  private callbacks: GameCallbacks;

  // Lighting
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private rimLight!: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, container: HTMLElement, callbacks: GameCallbacks) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.callbacks = callbacks;
    this.charDef = CHARACTERS[this.currentCharacterId];

    this.camera.far = 160;
    this.scene.background = new THREE.Color(0x07131d);
    this.scene.add(this.levelRoot);
    this.setupLighting();
    this.setupInput();
    this.loadLevel(1);
  }

  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xcfe8ff, 0.7);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xbfe6ff, 0x101827, 1.45);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4d6, 3.6);
    this.dirLight.position.set(18, 28, 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    const d = 22;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 1.2);
    this.rimLight.position.set(-18, 10, -16);
    this.scene.add(this.rimLight);

    this.scene.fog = new THREE.Fog(0x091827, 18, 90);
  }

  private setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        this.jumpBufferTimer = 0.16;
        e.preventDefault();
      }
      if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.triggerAbility();
      }
      if (e.code === 'KeyF' || e.code === 'KeyJ' || e.code === 'KeyX' || e.code === 'Numpad0') {
        this.triggerAttack();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.togglePause();
      }
      if (e.code === 'KeyC') {
        this.toggleCameraMode();
      }
      if (e.code === 'KeyM') {
        sound.toggleMute();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Space') {
        if (this.playerVel.y > 2.0) {
          this.playerVel.y *= 0.52;
        }
      }
    });

    const canvasContainer = document.getElementById('game-canvas-container');
    canvasContainer?.addEventListener('pointerdown', (e) => {
      if (this.state === 'playing' && e.button === 0) {
        const target = e.target as HTMLElement | null;
        if (target && (target.closest('.hud-layer') || target.closest('.touch-layer') || target.closest('.game-modal') || target.closest('.game-screen'))) {
          return;
        }
        this.triggerAttack();
      }
    });

    window.addEventListener('blur', () => {
      this.keys = {};
      this.virtualJoystick = { x: 0, y: 0 };
    });
  }

  public setVirtualInput(x: number, y: number) {
    this.virtualJoystick.x = x;
    this.virtualJoystick.y = y;
  }

  public selectCharacter(id: CharacterId) {
    this.currentCharacterId = id;
    this.charDef = CHARACTERS[id];
    this.rebuildPlayerMesh();
    this.sayRandomVoiceLine();
  }

  public getCharacterDef(): CharacterDef {
    return this.charDef;
  }

  public toggleCameraMode(): 'iso' | 'close' {
    this.cameraMode = this.cameraMode === 'iso' ? 'close' : 'iso';
    return this.cameraMode;
  }

  public getCameraMode(): 'iso' | 'close' {
    return this.cameraMode;
  }

  public isPaused(): boolean {
    return this.state === 'paused';
  }

  private rebuildPlayerMesh() {
    if (this.playerGroup) {
      this.levelRoot.remove(this.playerGroup);
    }
    const built = createCharacterModel(this.charDef);
    this.playerGroup = built.group;
    this.leftLeg = built.leftLeg;
    this.rightLeg = built.rightLeg;
    this.leftArm = built.leftArm;
    this.rightArm = built.rightArm;
    this.playerHead = built.head;
    this.playerBody = built.body;
    this.playerGroup.position.copy(this.playerPos);
    this.levelRoot.add(this.playerGroup);
  }

  public startTitle() {
    this.state = 'title';
    this.rebuildPlayerMesh();
    this.playerPos.set(0, 0.5, 0);
    this.callbacks.onBossUpdate?.('', 0, 0, false);
  }

  public startGame(levelId = 1) {
    this.state = 'playing';
    this.hp = this.maxHp;
    this.score = 0;
    this.comboStreak = 0;
    this.collectedVipCount = 0;
    this.abilityTimer = 0;
    this.levelStartTime = performance.now();
    this.loadLevel(levelId);
    this.callbacks.onHpUpdate(this.hp, this.maxHp);
    this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
    sound.startMusic();
    this.sayRandomVoiceLine();
  }

  public togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  private clearLevel() {
    while (this.levelRoot.children.length > 0) {
      this.levelRoot.remove(this.levelRoot.children[0]);
    }
    this.platforms = [];
    this.collectibles = [];
    this.hazards = [];
    this.enemies = [];
    this.enemyProjectiles = [];
    this.particles = [];
    this.projectiles = [];
    this.totalVipCount = 0;
    this.collectedVipCount = 0;
  }

  public loadLevel(levelId: number) {
    this.currentLevelId = levelId;
    this.clearLevel();
    this.rebuildPlayerMesh();

    if (levelId === 1) {
      this.buildLevel1();
    } else if (levelId === 2) {
      this.buildLevel2();
    } else {
      this.buildLevel3();
    }

    this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
  }

  private addEasterEgg(id: string, x: number, y: number, z: number, name: string, eggType: 'throne' | 'coffee' | 'folder', points = 500) {
    let group: THREE.Group;
    if (eggType === 'throne') {
      group = createGoldenThroneEasterEgg();
    } else if (eggType === 'coffee') {
      group = createVintageCoffeeCornerEasterEgg();
    } else {
      group = createSecretFolderEasterEgg();
    }
    group.position.set(x, y, z);
    this.levelRoot.add(group);

    this.collectibles.push({
      id,
      type: 'easter_egg',
      name,
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points,
    });
  }

  private emitFloatingToast(text: string, worldX: number, worldY: number, worldZ: number, type: 'points' | 'vip' | 'easter-egg' = 'points') {
    this.callbacks.onFloatingText?.(text, worldX, worldY, worldZ, type);
  }

  private buildLevel1() {
    const floorGeo = new THREE.PlaneGeometry(48, 22);
    const floorMat = new THREE.MeshStandardMaterial({
      map: getFloorTexture(),
      roughness: 0.28,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.levelRoot.add(floor);
    this.platforms.push({ x: 0, y: 0, z: 0, width: 48, height: 0.2, depth: 22, type: 'floor' });

    const wallGeo = new THREE.BoxGeometry(48, 7.5, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ map: getWallTexture(), roughness: 0.7 });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 3.75, -11);
    this.levelRoot.add(backWall);

    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 2.5),
      new THREE.MeshBasicMaterial({ map: getMaxFlizLogoTexture() })
    );
    logo.position.set(0, 5.0, -10.78);
    this.levelRoot.add(logo);

    [-18, -9, 0, 9, 18].forEach((lx) => {
      const lamp = createHighBayLamp();
      lamp.position.set(lx, 6.2, 0);
      const beam = createVolumetricLightBeam();
      beam.position.set(lx, 6.2, 0);
      this.levelRoot.add(lamp, beam);
    });

    [-14, -6, 2, 10, 16].forEach((ax) => {
      const arrow = createAisleArrow(1.4);
      arrow.position.set(ax, 0.015, -1.8);
      this.levelRoot.add(arrow);
    });

    this.playerPos.set(-20, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    const palletPositions = [
      { x: -18, z: -2.5, tier: 1 },
      { x: -15, z: 2.2, tier: 2 },
      { x: -12, z: -2.0, tier: 1 },
      { x: -9, z: 2.5, tier: 2 },
      { x: -6, z: -1.8, tier: 1 },
      { x: -3, z: 2.2, tier: 2 },
      { x: 0, z: -2.0, tier: 1 },
      { x: 3, z: 2.5, tier: 2 },
      { x: 6, z: -1.8, tier: 1 },
      { x: 9, z: 2.2, tier: 2 },
      { x: 12, z: -2.0, tier: 1 },
      { x: 15, z: 2.5, tier: 2 },
    ];
    palletPositions.forEach((p, idx) => {
      const pallet = createTilePallet(p.tier);
      pallet.position.set(p.x, 0, p.z);
      this.levelRoot.add(pallet);
      const h = p.tier === 1 ? 0.6 : 0.95;
      this.platforms.push({ x: p.x, y: h / 2, z: p.z, width: 1.25, height: h, depth: 1.05, type: 'pallet' });
      this.addGroutItem(`grout_l1_${idx}`, p.x, h + 0.35, p.z, 50);
    });

    const rack1 = createWarehouseRack(5.5, 3.8, 1.4);
    rack1.position.set(-11, 0, -7.0);
    const rack2 = createWarehouseRack(5.5, 3.8, 1.4);
    rack2.position.set(2, 0, -7.0);
    const rack3 = createWarehouseRack(5.5, 3.8, 1.4);
    rack3.position.set(-11, 0, 7.0);
    this.levelRoot.add(rack1, rack2, rack3);

    this.platforms.push({ x: -11, y: 1.25, z: -7.0, width: 5.5, height: 0.15, depth: 1.4, type: 'shelf' });
    this.platforms.push({ x: 2, y: 1.25, z: -7.0, width: 5.5, height: 0.15, depth: 1.4, type: 'shelf' });
    this.platforms.push({ x: -11, y: 1.25, z: 7.0, width: 5.5, height: 0.15, depth: 1.4, type: 'shelf' });

    this.addVipItem('vip_tile1', -11, 1.55, -7.0, 'Gres Hiszpański 120x60 Calacatta');
    this.addVipItem('vip_tile2', 2, 1.55, -7.0, 'Mozaika Złota Gres Max-Fliz');
    this.addVipItem('vip_tile3', 6, 1.25, 2.2, 'Klej do Wielkiego Formatu Pro');

    this.addEspressoItem('esp_1', -11, 2.6, -7.0);
    this.addMagnetItem('mag_1', 2, 2.6, -7.0);
    this.addGoldenCutterItem('cutter_1', -11, 2.6, 7.0);

    this.addEasterEgg('egg_coffee_1', -16, 0.05, -7.5, 'Ukryty Kącik Kawowy Zdzicha', 'coffee', 400);
    this.addEasterEgg('egg_wz_1', 8, 1.75, 7.0, 'Zaginiona WZ-tka z 2012 Roku', 'folder', 450);

    this.addForkliftHazard('forklift_1', -16, 12, 0, 4.2, 0xf59e0b);

    this.addCustomerEnemy('cust_1', -9, -1, 2.2, 'Klient z Reklamacją na Fugi');
    this.addCustomerEnemy('cust_2', 3, 11, -2.5, 'Pan Janusz (Gdzie moja faktura?!)');
    this.addArchitectEnemy('arch_1', -4, 4, -2.2, 'Architekt z próbnikami beżu');
    this.addAgvRobotEnemy('agv_1', 0, 9, 2.6, 'Autonomiczny AGV ze zlewami');

    const finishGate = createFinishGate();
    finishGate.position.set(19, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(20.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 20.5, y: 0.8, z: 0, width: 3.2, height: 1.6, depth: 2.4, type: 'finish_truck' });
  }

  private updatePlayerMovement(dt: number) {
    let inputX = 0;
    let inputZ = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      inputX += 0.707;
      inputZ -= 0.707;
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      inputX -= 0.707;
      inputZ += 0.707;
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      inputX -= 0.707;
      inputZ -= 0.707;
    }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      inputX += 0.707;
      inputZ += 0.707;
    }

    if (Math.abs(this.virtualJoystick.x) > 0.08 || Math.abs(this.virtualJoystick.y) > 0.08) {
      const jx = this.virtualJoystick.x;
      const jy = this.virtualJoystick.y;
      inputX = jx * 0.707 + jy * 0.707;
      inputZ = -jx * 0.707 + jy * 0.707;
    }

    const inputLen = Math.hypot(inputX, inputZ);
    if (inputLen > 1) {
      inputX /= inputLen;
      inputZ /= inputLen;
    }

    let speed = this.charDef.speed;
    if (this.charDef.id === 'mateusz' && this.invulnerableTimer > 0) {
      speed *= 1.45;
    }
    if (this.activePerks.speedBoost > 0) {
      speed *= 1.35;
      if (Math.random() < 0.25) {
        this.spawnDust(this.playerPos.x, this.playerPos.y, this.playerPos.z, 0xec4899);
      }
    }

    if (inputLen > 0.1) {
      const targetX = inputX * speed;
      const targetZ = inputZ * speed;
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, targetX, 12, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, targetZ, 12, dt);
      this.playerVel.x = THREE.MathUtils.clamp(this.playerVel.x, -speed * 1.35, speed * 1.35);
      this.playerVel.z = THREE.MathUtils.clamp(this.playerVel.z, -speed * 1.35, speed * 1.35);
      this.playerRot = Math.atan2(this.playerVel.x, this.playerVel.z);

      this.walkCycle += dt * 14;
      if (this.leftLeg && this.rightLeg && this.leftArm && this.rightArm) {
        this.leftLeg.rotation.x = Math.sin(this.walkCycle) * 0.6;
        this.rightLeg.rotation.x = -Math.sin(this.walkCycle) * 0.6;
        this.leftArm.rotation.x = -Math.sin(this.walkCycle) * 0.6;
        this.rightArm.rotation.x = Math.sin(this.walkCycle) * 0.6;
      }
    } else {
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, 0, 16, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, 0, 16, dt);
      if (this.leftLeg && this.rightLeg && this.leftArm && this.rightArm) {
        this.leftLeg.rotation.x = 0;
        this.rightLeg.rotation.x = 0;
        this.leftArm.rotation.x = 0;
        this.rightArm.rotation.x = 0;
      }
    }

    if (this.attackCooldownTimer > 0) this.attackCooldownTimer -= dt;
    if (this.attackSwingTimer > 0) {
      this.attackSwingTimer -= dt;
      if (this.rightArm) {
        this.rightArm.rotation.x = -1.8 + (this.attackSwingTimer / 0.25) * 1.5;
        this.rightArm.rotation.z = -0.4;
      }
    } else if (this.rightArm) {
      this.rightArm.rotation.z = 0;
    }

    const gravity = 22.0;
    this.playerVel.y -= gravity * dt;

    if (this.isGrounded) {
      this.coyoteTimer = 0.12;
      this.hasDoubleJumped = false;
    } else {
      this.coyoteTimer -= dt;
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
      if (this.coyoteTimer > 0) {
        this.playerVel.y = this.charDef.jumpForce;
        this.isGrounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        sound.playJump();
        this.spawnDust(this.playerPos.x, this.playerPos.y, this.playerPos.z);
        if (this.playerGroup) this.playerGroup.scale.set(0.82, 1.25, 0.82);
      } else if (this.activePerks.doubleJump > 0 && !this.hasDoubleJumped) {
        this.playerVel.y = this.charDef.jumpForce * 1.05;
        this.hasDoubleJumped = true;
        this.jumpBufferTimer = 0;
        sound.playDoubleJump();
        this.spawnParticleRing(this.playerPos.x, this.playerPos.y, this.playerPos.z, 0x38bdf8);
        this.sayQuote('PODWÓJNY SKOK! Sprężyste odbicie Vibram!');
        if (this.playerGroup) this.playerGroup.scale.set(0.8, 1.3, 0.8);
      }
    }

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextY = this.playerPos.y + this.playerVel.y * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;

    let landed = false;
    const pRadius = 0.28;

    for (const plat of this.platforms) {
      const minX = plat.x - plat.width / 2;
      const maxX = plat.x + plat.width / 2;
      const minZ = plat.z - plat.depth / 2;
      const maxZ = plat.z + plat.depth / 2;
      const topY = plat.y + plat.height / 2;

      if (nextX + pRadius > minX && nextX - pRadius < maxX &&
          nextZ + pRadius > minZ && nextZ - pRadius < maxZ) {

        if (this.playerPos.y >= topY - 0.22 && nextY <= topY) {
          if (plat.type === 'bathtub' && plat.bounce) {
            this.playerVel.y = plat.bounce;
            sound.playBounce();
            this.cameraShake = 0.35;
            this.sayQuote('HOP DO WANNY! Odlot na regał!');
            this.spawnParticleRing(plat.x, topY, plat.z, 0x06b6d4);
          } else {
            this.playerVel.y = 0;
            this.playerPos.y = topY;
            landed = true;
            if (plat.type === 'conveyor') {
              this.playerPos.x += 3.6 * dt;
            }
          }

          if (plat.type === 'finish_truck') {
            this.checkLevelFinish();
          }
        }
      }
    }

    const wasGrounded = this.isGrounded;
    this.isGrounded = landed;
    this.playerPos.x = nextX;
    if (!landed) {
      this.playerPos.y = nextY;
    }
    this.playerPos.z = nextZ;

    if (!wasGrounded && landed && this.playerGroup) {
      this.playerGroup.scale.set(1.2, 0.82, 1.2);
    }

    if (this.playerPos.y < -3.5) {
      this.takeDamage('Wypadłeś z rampy załadunkowej!');
      this.playerPos.set(0, 2, 0);
      this.playerVel.set(0, 0, 0);
    }

    if (this.playerGroup) {
      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.rotation.y = this.playerRot;
      this.playerGroup.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 8);
    }
  }

  private updateCamera(dt: number) {
    let targetX = this.playerPos.x;
    let targetY = this.playerPos.y;
    let targetZ = this.playerPos.z;

    if (this.state === 'title') {
      const t = performance.now() * 0.0004;
      this.camera.position.x = Math.sin(t) * 16;
      this.camera.position.y = 8 + Math.cos(t * 0.5) * 2;
      this.camera.position.z = Math.cos(t) * 16;
      this.camera.lookAt(0, 2, 0);
      return;
    }

    const offsetX = this.cameraMode === 'iso' ? 12 : 7;
    const offsetY = this.cameraMode === 'iso' ? 14 : 8;
    const offsetZ = this.cameraMode === 'iso' ? 12 : 7;

    const camTarget = new THREE.Vector3(targetX + offsetX, targetY + offsetY, targetZ + offsetZ);

    if (this.cameraShake > 0) {
      camTarget.x += (Math.random() - 0.5) * this.cameraShake;
      camTarget.y += (Math.random() - 0.5) * this.cameraShake;
      camTarget.z += (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 1.5);
    }

    this.camera.position.lerp(camTarget, dt * 5.0);
    this.camera.lookAt(targetX, targetY + 0.8, targetZ);

    if (this.dirLight) {
      this.dirLight.position.set(this.playerPos.x + 14, 28, this.playerPos.z + 12);
      this.dirLight.target.position.copy(this.playerPos);
      this.dirLight.target.updateMatrixWorld();
    }
    if (this.rimLight) {
      this.rimLight.position.set(this.playerPos.x - 18, 12, this.playerPos.z - 18);
    }
  }

  public getScore(): number {
    return this.score;
  }

  public getCollectedVipCount(): number {
    return this.collectedVipCount;
  }

  public getElapsedSeconds(): number {
    return Math.max(1, Math.round((performance.now() - this.levelStartTime) / 1000));
  }

  public isBossDefeated(): boolean {
    return this.enemies.some((e) => e.type === 'walczak' && e.state === 'defeated');
  }

  public getActivePerks(): ActivePerks {
    return { ...this.activePerks };
  }

  public activatePerk(perkId: 'hardhat' | 'vibram_boots' | 'order_magnet' | 'espresso_boost', duration: number = 20): boolean {
    if (perkId === 'hardhat') {
      this.activePerks.shield = true;
      sound.playPerkPickup();
      this.sayQuote('Założono atestowany kask BHP!');
    } else if (perkId === 'vibram_boots') {
      this.activePerks.doubleJump = Math.max(this.activePerks.doubleJump, duration);
      sound.playDoubleJump();
      this.sayQuote('Buty robocze Vibram: podwójny skok w powietrzu aktywny!');
    } else if (perkId === 'order_magnet') {
      this.activePerks.magnet = Math.max(this.activePerks.magnet, duration);
      sound.playMagnetHum();
      this.sayQuote('Skaner radiowy przyciąga zamówienia!');
    } else if (perkId === 'espresso_boost') {
      this.activePerks.speedBoost = Math.max(this.activePerks.speedBoost, duration);
      sound.playPerkPickup();
      this.sayQuote('Podwójne espresso: sprint po korytarzu!');
    }

    this.callbacks.onPerksUpdate?.(this.activePerks);
    return true;
  }
}
