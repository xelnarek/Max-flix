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
  private marcinReclamationTimer = 0;
  private grzesiekCrushTimer = 0;
  private grzesiekCrushPulse = 0;

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
  private specialEffects: {
    mesh: THREE.Mesh;
    life: number;
    maxLife: number;
    grow: number;
    spin: number;
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
    this.marcinReclamationTimer = 0;
    this.grzesiekCrushTimer = 0;
    this.grzesiekCrushPulse = 0;
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
    this.specialEffects = [];
    this.totalVipCount = 0;
    this.collectedVipCount = 0;
    this.marcinReclamationTimer = 0;
    this.grzesiekCrushTimer = 0;
    this.grzesiekCrushPulse = 0;
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

  private addGroutItem(id: string, x: number, y: number, z: number, points = 50) {
    const mesh = createGroutCollectible();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    this.collectibles.push({
      id,
      type: 'grout',
      name: 'Puszka Fugi Max-Fliz',
      x,
      y,
      z,
      mesh,
      collected: false,
      points,
    });
  }

  private addVipItem(id: string, x: number, y: number, z: number, name: string, points = 300) {
    const mesh = createCarraraCollectible();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    this.totalVipCount++;
    this.collectibles.push({
      id,
      type: 'vip_item',
      name,
      x,
      y,
      z,
      mesh,
      collected: false,
      points,
    });
  }

  private addEspressoItem(id: string, x: number, y: number, z: number) {
    const mesh = createEspressoCollectible();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    this.collectibles.push({
      id,
      type: 'espresso',
      name: 'Espresso z Showroomu (+Prędkość)',
      x,
      y,
      z,
      mesh,
      collected: false,
      points: 100,
    });
  }

  private addMagnetItem(id: string, x: number, y: number, z: number) {
    const mesh = createMagnetCollectible();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    this.collectibles.push({
      id,
      type: 'magnet',
      name: 'Skaner Radiowy (+Magnes)',
      x,
      y,
      z,
      mesh,
      collected: false,
      points: 120,
    });
  }

  private addGoldenCutterItem(id: string, x: number, y: number, z: number) {
    const mesh = createGoldenCutterCollectible();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    this.collectibles.push({
      id,
      type: 'golden_cutter',
      name: 'Złota Gilotyna do Gresu (+Podwójny Skok)',
      x,
      y,
      z,
      mesh,
      collected: false,
      points: 150,
    });
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

  private addForkliftHazard(id: string, startX: number, endX: number, z: number, speed: number, color = 0xf59e0b) {
    const built = createForkliftModel(color);
    built.group.position.set(startX, 0, z);
    this.levelRoot.add(built.group);
    this.hazards.push({
      id,
      type: 'forklift',
      mesh: built.group,
      startX,
      startZ: z,
      endX,
      endZ: z,
      x: startX,
      y: 0,
      z,
      speed,
      width: 1.8,
      length: 2.8,
      dir: 1,
      active: true,
    });
  }

  private addCustomerEnemy(id: string, x: number, minX: number, maxX: number, name: string) {
    const built = createCustomerEnemyModel();
    built.group.position.set(x, 0.4, minX);
    this.levelRoot.add(built.group);
    this.enemies.push({
      id,
      type: 'customer',
      name,
      mesh: built.group,
      speechMesh: null,
      x,
      y: 0.4,
      z: minX,
      startX: minX,
      endX: maxX,
      speed: 1.8,
      dir: 1,
      hp: 2,
      maxHp: 2,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 0,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
    });
  }

  private addArchitectEnemy(id: string, x: number, maxX: number, z: number, name: string) {
    const built = createArchitectEnemyModel();
    built.group.position.set(x, 0.4, z);
    this.levelRoot.add(built.group);
    this.enemies.push({
      id,
      type: 'architect',
      name,
      mesh: built.group,
      speechMesh: null,
      x,
      y: 0.4,
      z,
      startX: x,
      endX: maxX,
      speed: 2.2,
      dir: 1,
      hp: 3,
      maxHp: 3,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 0,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
    });
  }

  private addAgvRobotEnemy(id: string, minX: number, maxX: number, z: number, name: string) {
    const built = createAgvRobotModel();
    built.group.position.set(minX, 0.2, z);
    this.levelRoot.add(built.group);
    this.enemies.push({
      id,
      type: 'agv_robot',
      name,
      mesh: built.group,
      x: minX,
      y: 0.2,
      z,
      startX: minX,
      endX: maxX,
      speed: 2.6,
      dir: 1,
      hp: 2,
      maxHp: 2,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 0,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
    });
  }

  private addWalczakBossEnemy(id: string, x: number, z: number) {
    const built = createWalczakBossModel();
    built.group.position.set(x, 0.6, z);
    this.levelRoot.add(built.group);
    this.enemies.push({
      id,
      type: 'walczak',
      name: 'Były Kierownik Walczak',
      mesh: built.group,
      speechMesh: null,
      x,
      y: 0.6,
      z,
      startX: x - 12,
      endX: x + 12,
      speed: 3.2,
      dir: -1,
      hp: 8,
      maxHp: 8,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 0,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      specialActionTimer: 3,
      bossPhase: 1,
    });
    this.callbacks.onBossUpdate?.('Były Kierownik Walczak', 8, 8, true);
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

  private buildLevel2() {
    const floorGeo = new THREE.PlaneGeometry(56, 26);
    const floorMat = new THREE.MeshStandardMaterial({
      map: getFloorTexture(),
      roughness: 0.15,
      metalness: 0.2,
      color: 0x0f2b46,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.levelRoot.add(floor);
    this.platforms.push({ x: 0, y: 0, z: 0, width: 56, height: 0.2, depth: 26, type: 'floor' });

    const wallGeo = new THREE.BoxGeometry(56, 8, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ map: getWallTexture(), roughness: 0.5, color: 0x1e3a5f });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4, -13);
    this.levelRoot.add(backWall);

    this.playerPos.set(-24, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    const tubPositions = [
      { x: -18, z: -4 },
      { x: -9, z: 5 },
      { x: 0, z: -5 },
      { x: 9, z: 5 },
      { x: 18, z: -4 },
    ];
    tubPositions.forEach((tp, idx) => {
      const tub = createBathtubModel();
      tub.position.set(tp.x, 0, tp.z);
      this.levelRoot.add(tub);
      this.platforms.push({
        x: tp.x,
        y: 0.5,
        z: tp.z,
        width: 2.2,
        height: 1.0,
        depth: 1.2,
        type: 'bathtub',
        bounce: 16.5,
      });
      this.addGroutItem(`grout_l2_${idx}`, tp.x, 1.4, tp.z, 60);
    });

    const catwalks = [
      { x: -18, y: 3.2, z: -4, w: 4.5, d: 2.5 },
      { x: -9, y: 3.2, z: 5, w: 4.5, d: 2.5 },
      { x: 0, y: 3.2, z: -5, w: 4.5, d: 2.5 },
      { x: 9, y: 3.2, z: 5, w: 4.5, d: 2.5 },
      { x: 18, y: 3.2, z: -4, w: 4.5, d: 2.5 },
    ];
    catwalks.forEach((cw, idx) => {
      const cwGeo = new THREE.BoxGeometry(cw.w, 0.2, cw.d);
      const cwMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.7 });
      const mesh = new THREE.Mesh(cwGeo, cwMat);
      mesh.position.set(cw.x, cw.y, cw.z);
      this.levelRoot.add(mesh);
      this.platforms.push({ x: cw.x, y: cw.y, z: cw.z, width: cw.w, height: 0.2, depth: cw.d, type: 'shelf' });
      this.addGroutItem(`grout_cw_${idx}`, cw.x, cw.y + 0.4, cw.z, 80);
    });

    this.addVipItem('vip_bath1', -18, 3.6, -4, 'Złota Bateria Wolnostojąca Villeroy');
    this.addVipItem('vip_bath2', 0, 3.6, -5, 'Wanna Wolnostojąca z Hydromasażem Marmur');
    this.addVipItem('vip_bath3', 18, 3.6, -4, 'Umywalka Nablatowa z Prawdziwego Onyksu');

    this.addEspressoItem('esp_l2_1', -9, 3.6, 5);
    this.addGoldenCutterItem('cutter_l2_1', 9, 3.6, 5);

    this.addEasterEgg('egg_throne_1', 22, 0.05, -9, 'Złoty Tron Kierownika Regionu', 'throne', 600);

    this.addCustomerEnemy('cust_l2_1', -12, -8, 8, 'Zdezorientowany Klient Szukający Syfonu');
    this.addArchitectEnemy('arch_l2_1', -2, 6, 2, 'Główny Projektant Wnętrz z Warszawy');
    this.addArchitectEnemy('arch_l2_2', 12, 18, -2, 'Krytyk Mieszanek Tynkarskich');

    const finishGate = createFinishGate();
    finishGate.position.set(24, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(25.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 25.5, y: 0.8, z: 0, width: 3.2, height: 1.6, depth: 2.4, type: 'finish_truck' });
  }

  private buildLevel3() {
    const floorGeo = new THREE.PlaneGeometry(64, 28);
    const floorMat = new THREE.MeshStandardMaterial({
      map: getFloorTexture(),
      roughness: 0.35,
      metalness: 0.15,
      color: 0x111827,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.levelRoot.add(floor);
    this.platforms.push({ x: 0, y: 0, z: 0, width: 64, height: 0.2, depth: 28, type: 'floor' });

    const wallGeo = new THREE.BoxGeometry(64, 9, 0.4);
    const wallMat = new THREE.MeshStandardMaterial({ map: getWallTexture(), roughness: 0.8, color: 0x0f172a });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4.5, -14);
    this.levelRoot.add(backWall);

    this.playerPos.set(-28, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    [-20, -10, 0, 10, 20].forEach((rx, idx) => {
      const rack = createWarehouseRack(6.0, 4.2, 1.5);
      rack.position.set(rx, 0, -8);
      this.levelRoot.add(rack);
      this.platforms.push({ x: rx, y: 1.4, z: -8, width: 6.0, height: 0.15, depth: 1.5, type: 'shelf' });
      this.addGroutItem(`grout_l3_${idx}`, rx, 1.8, -8, 70);
    });

    this.addVipItem('vip_l3_1', -20, 1.8, -8, 'Protokół Odbioru Magazynu Główny');
    this.addVipItem('vip_l3_2', 0, 1.8, -8, 'Faktura Korygująca na 2.5 MLN PLN');
    this.addVipItem('vip_l3_3', 20, 1.8, -8, 'Złota Zgrzewarka do Folii Max-Fliz');

    this.addMagnetItem('mag_l3_1', -10, 1.8, -8);
    this.addEspressoItem('esp_l3_1', 10, 1.8, -8);

    this.addForkliftHazard('fork_l3_1', -22, 18, -2, 5.0, 0xef4444);
    this.addForkliftHazard('fork_l3_2', 18, -22, 4, 5.5, 0x3b82f6);

    this.addAgvRobotEnemy('agv_l3_1', -18, -6, 2, 'Roboraptor Paletowy V1');
    this.addArchitectEnemy('arch_l3_1', 6, 18, -2, 'Niezadowolony Generalny Wykonawca');

    this.addWalczakBossEnemy('boss_walczak', 18, 0);

    const finishGate = createFinishGate();
    finishGate.position.set(28, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(29.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 29.5, y: 0.8, z: 0, width: 3.2, height: 1.6, depth: 2.4, type: 'finish_truck' });
  }

  public update(dt: number) {
    if (this.state !== 'playing' && this.state !== 'title') return;

    this.updatePerkTimers(dt);

    if (this.state === 'playing') {
      if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
      if (this.marcinReclamationTimer > 0) this.marcinReclamationTimer = Math.max(0, this.marcinReclamationTimer - dt);
      if (this.grzesiekCrushTimer > 0) this.grzesiekCrushTimer = Math.max(0, this.grzesiekCrushTimer - dt);
      if (this.grzesiekCrushPulse > 0) this.grzesiekCrushPulse = Math.max(0, this.grzesiekCrushPulse - dt);
      if (this.speechBubbleTimer > 0) {
        this.speechBubbleTimer -= dt;
        if (this.speechBubbleTimer <= 0) {
          this.callbacks.onSpeechBubble('');
        }
      }

      this.updatePlayerMovement(dt);
      this.updateCollectibles(dt);
      this.updateHazards(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateSpecialEffects(dt);
      this.updateParticles(dt);
    }

    this.updateCamera(dt);
  }

  private updatePerkTimers(dt: number) {
    let changed = false;
    if (this.activePerks.doubleJump > 0) {
      this.activePerks.doubleJump = Math.max(0, this.activePerks.doubleJump - dt);
      changed = true;
    }
    if (this.activePerks.magnet > 0) {
      this.activePerks.magnet = Math.max(0, this.activePerks.magnet - dt);
      changed = true;
    }
    if (this.activePerks.speedBoost > 0) {
      this.activePerks.speedBoost = Math.max(0, this.activePerks.speedBoost - dt);
      changed = true;
    }
    if (changed) {
      this.callbacks.onPerksUpdate?.(this.activePerks);
    }
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

    if (this.grzesiekCrushTimer > 0) {
      const t = 1 - this.grzesiekCrushTimer / 0.9;
      const swing = Math.sin(t * Math.PI);
      if (this.leftArm && this.rightArm) {
        this.leftArm.rotation.z = -1.2 + swing * 1.5;
        this.rightArm.rotation.z = 1.2 - swing * 1.5;
        this.leftArm.rotation.x = -1.3 + swing * 1.8;
        this.rightArm.rotation.x = -1.3 + swing * 1.8;
      }
    }

    if (this.marcinReclamationTimer > 0 && this.playerGroup) {
      const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.08;
      this.playerGroup.scale.set(pulse, 1.08, pulse);
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

  private updateCollectibles(dt: number) {
    this.collectibles.forEach((c) => {
      if (c.collected || !c.mesh) return;

      c.mesh.rotation.y += dt * 2.5;

      // Magnet Perk pull
      if (this.activePerks.magnet > 0) {
        const magDist = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
        if (magDist < 8.5) {
          const pullSpeed = 9.0 * dt;
          c.x += ((this.playerPos.x - c.x) / magDist) * pullSpeed;
          c.z += ((this.playerPos.z - c.z) / magDist) * pullSpeed;
          c.y += ((this.playerPos.y + 0.5 - c.y) / magDist) * pullSpeed;
          c.mesh.position.set(c.x, c.y, c.z);
        }
      }

      const dist = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
      const dy = Math.abs(c.y - (this.playerPos.y + 0.5));

      if (dist < 0.95 && dy < 1.2) {
        c.collected = true;
        this.levelRoot.remove(c.mesh);

        if (c.type === 'grout') {
          this.score += c.points;
          sound.playPickup();
          this.emitFloatingToast(`+${c.points} Pkt Fuga`, c.x, c.y + 0.5, c.z, 'points');
        } else if (c.type === 'vip_item') {
          this.score += c.points;
          this.collectedVipCount++;
          sound.playPickup(2);
          this.sayQuote(`ZEBRANO VIP: ${c.name}!`);
          this.emitFloatingToast(`📦 VIP ITEM!`, c.x, c.y + 0.5, c.z, 'vip');
        } else if (c.type === 'espresso') {
          this.activatePerk('espresso_boost', 18);
          this.emitFloatingToast(`☕ ESPRESSO!`, c.x, c.y + 0.5, c.z, 'points');
        } else if (c.type === 'magnet') {
          this.activatePerk('order_magnet', 20);
          this.emitFloatingToast(`🧲 RADIOMAGNES!`, c.x, c.y + 0.5, c.z, 'points');
        } else if (c.type === 'golden_cutter') {
          this.activatePerk('vibram_boots', 25);
          this.emitFloatingToast(`👟 VIBRAM BOOTS!`, c.x, c.y + 0.5, c.z, 'points');
        } else if (c.type === 'easter_egg') {
          this.score += c.points;
          sound.playEasterEgg();
          this.sayQuote(`EASTER EGG ODNALEZIONY: ${c.name}! (+${c.points} pkt)`);
          this.emitFloatingToast(`🎉 EASTER EGG!`, c.x, c.y + 0.5, c.z, 'easter-egg');
        }

        this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
      }
    });
  }

  private updateHazards(dt: number) {
    this.hazards.forEach((h) => {
      if (!h.active || !h.mesh) return;

      if (h.type === 'forklift') {
        h.x += h.speed * h.dir * dt;
        if (h.dir > 0 && h.x >= h.endX!) {
          h.dir = -1;
          h.mesh.rotation.y = Math.PI;
        } else if (h.dir < 0 && h.x <= h.startX) {
          h.dir = 1;
          h.mesh.rotation.y = 0;
        }
        h.mesh.position.set(h.x, h.y, h.z);

        const dist = Math.hypot(h.x - this.playerPos.x, h.z - this.playerPos.z);
        if (dist < 1.4 && Math.abs(h.y - this.playerPos.y) < 1.2) {
          this.takeDamage('Zostałeś potrącony przez wózek widłowy!');
        }
      }
    });
  }

  private updateEnemies(dt: number) {
    this.enemies.forEach((e) => {
      if (e.state === 'defeated' || !e.mesh) return;

      e.walkCycle += dt * 8;
      if (e.legL && e.legR) {
        e.legL.rotation.x = Math.sin(e.walkCycle) * 0.5;
        e.legR.rotation.x = -Math.sin(e.walkCycle) * 0.5;
      }

      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        if (e.stunTimer <= 0) e.state = 'patrol';
        return;
      }

      if (e.type === 'customer' || e.type === 'architect' || e.type === 'agv_robot') {
        e.z += e.speed * e.dir * dt;
        if (e.dir > 0 && e.z >= e.endX) {
          e.dir = -1;
          e.mesh.rotation.y = Math.PI;
        } else if (e.dir < 0 && e.z <= e.startX) {
          e.dir = 1;
          e.mesh.rotation.y = 0;
        }
        e.mesh.position.set(e.x, e.y, e.z);

        const dist = Math.hypot(e.x - this.playerPos.x, e.z - this.playerPos.z);
        if (dist < 1.1 && Math.abs(e.y - this.playerPos.y) < 1.0) {
          this.takeDamage(`Potrącił Cię: ${e.name}!`);
        }
      } else if (e.type === 'walczak') {
        e.x += e.speed * e.dir * dt;
        if (e.dir > 0 && e.x >= e.endX) {
          e.dir = -1;
          e.mesh.rotation.y = Math.PI / 2;
        } else if (e.dir < 0 && e.x <= e.startX) {
          e.dir = 1;
          e.mesh.rotation.y = -Math.PI / 2;
        }
        e.mesh.position.set(e.x, e.y, e.z);

        if (e.specialActionTimer !== undefined) {
          e.specialActionTimer -= dt;
          if (e.specialActionTimer <= 0) {
            e.specialActionTimer = 3.5;
            this.spawnPenaltyNotice(e.x, e.y + 1.2, e.z);
          }
        }

        const dist = Math.hypot(e.x - this.playerPos.x, e.z - this.playerPos.z);
        if (dist < 1.6 && Math.abs(e.y - this.playerPos.y) < 1.2) {
          this.takeDamage('Były Kierownik Walczak wręczył Ci naganę z wpisem do akt!');
        }

        this.callbacks.onBossUpdate?.(e.name, e.hp, e.maxHp, true);
      }
    });
  }

  private spawnPenaltyNotice(x: number, y: number, z: number) {
    const mesh = createPenaltyNoticeProjectile();
    mesh.position.set(x, y, z);
    this.levelRoot.add(mesh);
    const dir = new THREE.Vector3(this.playerPos.x - x, 0, this.playerPos.z - z).normalize();
    this.enemyProjectiles.push({ mesh, vel: dir.multiplyScalar(7.5), life: 3.5 });
    sound.playWhistle();
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      let hit = false;
      this.enemies.forEach((e) => {
        if (e.state === 'defeated') return;
        const dist = Math.hypot(p.mesh.position.x - e.x, p.mesh.position.z - e.z);
        if (dist < 1.2 && Math.abs(p.mesh.position.y - e.y) < 1.2) {
          hit = true;
          e.hp--;
          sound.playSmack();
          this.cameraShake = 0.25;
          this.spawnParticleRing(e.x, e.y + 0.8, e.z, 0xf59e0b);

          if (e.hp <= 0) {
            this.defeatEnemy(e, 250, true);
          } else {
            e.stunTimer = 0.6;
            e.state = 'stunned';
          }
        }
      });

      if (hit || p.life <= 0) {
        this.levelRoot.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const ep = this.enemyProjectiles[i];
      ep.life -= dt;
      ep.mesh.position.addScaledVector(ep.vel, dt);

      const dist = Math.hypot(ep.mesh.position.x - this.playerPos.x, ep.mesh.position.z - this.playerPos.z);
      if (dist < 0.85 && Math.abs(ep.mesh.position.y - this.playerPos.y) < 1.0) {
        this.takeDamage('Trafiło Cię wezwanie wyjaśniające od Walczaka!');
        this.levelRoot.remove(ep.mesh);
        this.enemyProjectiles.splice(i, 1);
        continue;
      }

      if (ep.life <= 0) {
        this.levelRoot.remove(ep.mesh);
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  private updateSpecialEffects(dt: number) {
    for (let i = this.specialEffects.length - 1; i >= 0; i--) {
      const effect = this.specialEffects[i];
      effect.life -= dt;
      const t = 1 - effect.life / effect.maxLife;
      effect.mesh.scale.setScalar(1 + t * effect.grow);
      effect.mesh.rotation.z += dt * effect.spin;
      const mat = effect.mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | undefined;
      if (mat && 'opacity' in mat) {
        mat.opacity = Math.max(0, (effect.life / effect.maxLife) * 0.9);
      }
      if (effect.life <= 0) {
        this.levelRoot.remove(effect.mesh);
        this.specialEffects.splice(i, 1);
      }
    }
  }

  private spawnGrzesiekShockwave() {
    const geo = new THREE.TorusGeometry(0.9, 0.12, 14, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(this.playerPos.x, this.playerPos.y + 0.12, this.playerPos.z);
    mesh.scale.setScalar(0.2);
    this.levelRoot.add(mesh);
    this.specialEffects.push({ mesh, life: 0.7, maxLife: 0.7, grow: 7.5, spin: 9.0 });

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.08, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(this.playerPos.x, this.playerPos.y + 0.12, this.playerPos.z);
    ring2.scale.setScalar(0.18);
    this.levelRoot.add(ring2);
    this.specialEffects.push({ mesh: ring2, life: 0.6, maxLife: 0.6, grow: 8.5, spin: -7.0 });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      const scale = (pt.life / pt.maxLife);
      pt.mesh.scale.setScalar(scale);

      if (pt.life <= 0) {
        this.levelRoot.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  public triggerAttack() {
    if (this.state !== 'playing' || this.attackCooldownTimer > 0) return;
    this.attackCooldownTimer = 0.35;
    this.attackSwingTimer = 0.25;

    sound.playAttackWhoosh();

    const forward = new THREE.Vector3(Math.sin(this.playerRot), 0, Math.cos(this.playerRot));
    const projGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const projMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, emissive: 0xf59e0b, emissiveIntensity: 0.5 });
    const proj = new THREE.Mesh(projGeo, projMat);
    proj.position.set(this.playerPos.x, this.playerPos.y + 0.8, this.playerPos.z).addScaledVector(forward, 0.6);
    this.levelRoot.add(proj);

    this.projectiles.push({
      mesh: proj,
      vel: forward.multiplyScalar(14.0),
      life: 0.8,
    });
  }

  public triggerAbility() {
    if (this.state !== 'playing' || this.abilityTimer > 0) return;
    this.abilityTimer = this.charDef.abilityCooldown;

    sound.playAbility(this.currentCharacterId);
    this.cameraShake = 0.45;
    this.spawnParticleRing(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, this.charDef.color);

    if (this.currentCharacterId === 'marcin') {
      this.marcinReclamationTimer = 8;
      this.invulnerableTimer = Math.max(this.invulnerableTimer, 8);
      this.sayQuote('WYJAZD NA REKLAMACJE! Kierownik przejmuje strefę i zamyka sprawę bez zbędnych pytań!');
      sound.playReclamation();
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, 0xcbd5e1);
      const radius = 7.0;
      this.enemies.forEach((e) => {
        if (e.state === 'defeated') return;
        const dist = Math.hypot(e.x - this.playerPos.x, e.z - this.playerPos.z);
        if (dist < radius) {
          e.stunTimer = 4.0;
          e.state = 'stunned';
          e.hp = Math.max(0, e.hp - 1);
          if (e.hp <= 0) {
            this.defeatEnemy(e, 220, false);
          }
        }
      });
    } else if (this.currentCharacterId === 'grzesiek') {
      this.grzesiekCrushTimer = 0.9;
      this.grzesiekCrushPulse = 1.0;
      this.spawnGrzesiekShockwave();
      const forward = new THREE.Vector3(Math.sin(this.playerRot), 0, Math.cos(this.playerRot));
      this.playerPos.x += forward.x * 1.6;
      this.playerPos.z += forward.z * 1.6;
      this.sayQuote('ŚCIŚK ZAGŁADY! 44 cm obwodu ramienia. Tu nie ma już miejsca na wątpliwości!');
      sound.playSciskCrush();
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y + 0.5, this.playerPos.z, 0x4ade80);
      this.enemies.forEach((e) => {
        if (e.state === 'defeated') return;
        const dx = e.x - this.playerPos.x;
        const dz = e.z - this.playerPos.z;
        const dist = Math.hypot(dx, dz);
        const dirDot = (dx * forward.x + dz * forward.z) / Math.max(1, dist);
        if (dist < 4.6 && dirDot > -0.2) {
          e.hp -= 2;
          e.stunTimer = 1.2;
          e.state = 'stunned';
          this.cameraShake = 0.55;
          this.spawnParticleRing(e.x, e.y + 0.6, e.z, 0x86efac);
          if (e.hp <= 0) {
            this.defeatEnemy(e, 280, false);
          }
        }
      });
    } else if (this.currentCharacterId === 'dawid') {
      this.activatePerk('hardhat', 15);
    } else if (this.currentCharacterId === 'mateusz') {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      this.callbacks.onHpUpdate(this.hp, this.maxHp);
    } else if (this.currentCharacterId === 'piotr') {
      this.activatePerk('order_magnet', 12);
    }
  }

  private defeatEnemy(e: EnemyItem, points: number, showToast: boolean = true) {
    if (e.state === 'defeated') return;
    e.state = 'defeated';
    e.mesh.visible = false;
    this.score += points;
    if (showToast) {
      this.emitFloatingToast(`+${points} Pkt Neutralizacja!`, e.x, e.y + 1, e.z, 'points');
    }
    this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
    if (e.type === 'walczak') {
      this.callbacks.onBossUpdate?.(e.name, 0, e.maxHp, false);
      this.sayQuote('BYŁY KIEROWNIK WALCZAK ZANEUTRALIZOWANY! Droga wolna!');
    }
  }

  private takeDamage(reason: string) {
    if (this.invulnerableTimer > 0) return;

    if (this.marcinReclamationTimer > 0) {
      this.cameraShake = 0.12;
      return;
    }

    if (this.activePerks.shield) {
      this.activePerks.shield = false;
      this.invulnerableTimer = 1.2;
      sound.playShieldBreak();
      this.sayQuote('Kask BHP amortyzował uderzenie!');
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y + 1, this.playerPos.z, 0x3b82f6);
      this.callbacks.onPerksUpdate?.(this.activePerks);
      return;
    }

    this.hp--;
    this.invulnerableTimer = 1.8;
    this.cameraShake = 0.6;
    sound.playHit();
    this.callbacks.onHpUpdate(this.hp, this.maxHp);

    if (this.hp <= 0) {
      this.state = 'gameover';
      sound.stopMusic();
      sound.playGameOver();
      this.callbacks.onGameOver(reason);
    }
  }

  private checkLevelFinish() {
    if (this.collectedVipCount < this.totalVipCount) {
      this.sayQuote(`Potrzebujesz jeszcze ${this.totalVipCount - this.collectedVipCount} zamówień VIP!`);
      return;
    }

    this.state = 'victory';
    sound.stopMusic();
    sound.playWin();
    const elapsed = Math.max(1, Math.round((performance.now() - this.levelStartTime) / 1000));
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
    this.callbacks.onLevelComplete(this.currentLevelId, this.score, timeStr);
  }

  private spawnDust(x: number, y: number, z: number, color = 0xd1d5db) {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.1, z);
    this.levelRoot.add(mesh);
    this.particles.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 0.8 + 0.2, (Math.random() - 0.5) * 1.5),
      life: 0.4,
      maxLife: 0.4,
    });
  }

  private spawnParticleRing(x: number, y: number, z: number, color = 0x38bdf8) {
    const num = 16;
    for (let i = 0; i < num; i++) {
      const angle = (i / num) * Math.PI * 2;
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.levelRoot.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * 4.5, Math.random() * 1.2, Math.sin(angle) * 4.5),
        life: 0.6,
        maxLife: 0.6,
      });
    }
  }

  private sayQuote(quote: string) {
    this.speechBubbleTimer = 3.5;
    this.callbacks.onSpeechBubble(quote);
  }

  private sayRandomVoiceLine() {
    if (this.charDef.voiceLines && this.charDef.voiceLines.length > 0) {
      const idx = Math.floor(Math.random() * this.charDef.voiceLines.length);
      this.sayQuote(this.charDef.voiceLines[idx]);
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
