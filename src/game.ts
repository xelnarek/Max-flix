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

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, container: HTMLElement, callbacks: GameCallbacks) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.callbacks = callbacks;
    this.charDef = CHARACTERS[this.currentCharacterId];

    this.scene.add(this.levelRoot);
    this.setupLighting();
    this.setupInput();
    this.loadLevel(1);
  }

  private setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x0f172a, 2.8);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 3.2);
    this.dirLight.position.set(18, 28, 16);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    const d = 18; // Focused crisp shadow coverage around player
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0003;
    this.scene.add(this.dirLight);

    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.012);
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
        // Variable jump height cutoff for super responsive platformer controls
        if (this.playerVel.y > 2.0) {
          this.playerVel.y *= 0.52;
        }
      }
    });

    // Pointer down on canvas container for melee attack
    const canvasContainer = document.getElementById('game-canvas-container');
    canvasContainer?.addEventListener('pointerdown', (e) => {
      if (this.state === 'playing' && e.button === 0) {
        // Prevent click when touching UI buttons
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

  /**
   * LEVEL 1: Aleja Płytek Hiszpańskich (Expanded Spanish Tile Alley)
   * Size: 48m x 22m. High detail, forklift hazard lane, directional safety arrows, 2 Easter eggs!
   */
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

    // Warehouse Wall & Giant Logo
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

    // Overhead High-Bay Lamps & Light Beams
    [-18, -9, 0, 9, 18].forEach((lx) => {
      const lamp = createHighBayLamp();
      lamp.position.set(lx, 6.2, 0);
      const beam = createVolumetricLightBeam();
      beam.position.set(lx, 6.2, 0);
      this.levelRoot.add(lamp, beam);
    });

    // Green Directional Safety Arrows on Floor
    [-14, -6, 2, 10, 16].forEach((ax) => {
      const arrow = createAisleArrow(1.4);
      arrow.position.set(ax, 0.015, -1.8);
      this.levelRoot.add(arrow);
    });

    this.playerPos.set(-20, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    // Stacks of Pallets (stepping stones from -18 to +16)
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

    // High Shelves / Warehouse Racks
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

    // VIP Order Items (3 required)
    this.addVipItem('vip_tile1', -11, 1.55, -7.0, 'Gres Hiszpański 120x60 Calacatta');
    this.addVipItem('vip_tile2', 2, 1.55, -7.0, 'Mozaika Złota Gres Max-Fliz');
    this.addVipItem('vip_tile3', 6, 1.25, 2.2, 'Klej do Wielkiego Formatu Pro');

    // COLLECTIBLES & PERKS in Level 1
    this.addEspressoItem('esp_1', -11, 2.6, -7.0);
    this.addMagnetItem('mag_1', 2, 2.6, -7.0);
    this.addGoldenCutterItem('cutter_1', -11, 2.6, 7.0);

    // EASTER EGGS LEVEL 1:
    // Easter Egg 1: Vintage Coffee Corner behind Rack 1
    this.addEasterEgg('egg_coffee_1', -16, 0.05, -7.5, 'Ukryty Kącik Kawowy Zdzicha', 'coffee', 400);
    // Easter Egg 2: Zaginiona WZ-tka z 2012 roku
    this.addEasterEgg('egg_wz_1', 8, 1.75, 7.0, 'Zaginiona WZ-tka z 2012 Roku', 'folder', 450);

    // Hazard: Forklift Zdzichu cruising the lower aisle
    this.addForkliftHazard('forklift_1', -16, 12, 0, 4.2, 0xf59e0b);

    // ENEMIES: Angry Customers + Architect + AGV Robot!
    this.addCustomerEnemy('cust_1', -9, -1, 2.2, 'Klient z Reklamacją na Fugi');
    this.addCustomerEnemy('cust_2', 3, 11, -2.5, 'Pan Janusz (Gdzie moja faktura?!)');
    this.addArchitectEnemy('arch_1', -4, 4, -2.2, 'Architekt z próbnikami beżu');
    this.addAgvRobotEnemy('agv_1', 0, 9, 2.6, 'Autonomiczny AGV ze zlewami');

    // Holographic Finish Gate & Loading Dock Van
    const finishGate = createFinishGate();
    finishGate.position.set(19, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(20.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 20.5, y: 0.8, z: 0, width: 3.2, height: 1.6, depth: 2.4, type: 'finish_truck' });
  }

  /**
   * LEVEL 2: Dział Sanitarny i Armatura (Expanded Luxury Bathroom Showroom)
   * Size: 56m x 26m. 5 Trampoline Bathtubs with bubbles, elevated catwalks, 2 Easter eggs!
   */
  private buildLevel2() {
    const floorGeo = new THREE.PlaneGeometry(56, 26);
    const floorMat = new THREE.MeshStandardMaterial({ map: getFloorTexture(), roughness: 0.22, metalness: 0.15 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.levelRoot.add(floor);
    this.platforms.push({ x: 0, y: 0, z: 0, width: 56, height: 0.2, depth: 26, type: 'floor' });

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(56, 8, 0.4),
      new THREE.MeshStandardMaterial({ map: getWallTexture(), roughness: 0.7 })
    );
    wall.position.set(0, 4.0, -13);
    this.levelRoot.add(wall);

    this.playerPos.set(-24, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    // 5 Trampoline Bathtubs with Hydro-bounce & bubbles!
    const tubs = [
      { x: -18, z: 3.5 },
      { x: -9, z: -4.0 },
      { x: 0, z: 4.5 },
      { x: 9, z: -4.0 },
      { x: 18, z: 3.5 },
    ];
    tubs.forEach((t, i) => {
      const tub = createBathtubModel();
      tub.position.set(t.x, 0, t.z);
      this.levelRoot.add(tub);
      this.platforms.push({
        x: t.x,
        y: 0.55,
        z: t.z,
        width: 1.8,
        height: 0.6,
        depth: 1.2,
        type: 'bathtub',
        bounce: 18.2,
      });
      this.addGroutItem(`grout_tub_${i}`, t.x, 3.6, t.z, 75);
    });

    // High Display Shelves reachable via Bathtub leaps
    const highShelves = [
      { x: -18, y: 2.8, z: -6.5, w: 4.5, d: 2.2 },
      { x: -9, y: 3.0, z: 6.5, w: 4.5, d: 2.2 },
      { x: 0, y: 3.2, z: -6.5, w: 4.5, d: 2.2 },
      { x: 9, y: 3.2, z: 6.5, w: 4.5, d: 2.2 },
      { x: 18, y: 3.4, z: -6.5, w: 4.5, d: 2.2 },
    ];
    highShelves.forEach((s, idx) => {
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(s.w, 0.2, s.d),
        new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3, metalness: 0.4 })
      );
      shelf.position.set(s.x, s.y, s.z);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      this.levelRoot.add(shelf);
      this.platforms.push({ x: s.x, y: s.y, z: s.z, width: s.w, height: 0.2, depth: s.d, type: 'shelf' });

      [-s.w / 2 + 0.15, s.w / 2 - 0.15].forEach((lx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, s.y, 0.12), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }));
        leg.position.set(s.x + lx, s.y / 2, s.z);
        this.levelRoot.add(leg);
      });

      this.addGroutItem(`grout_shelf_${idx}`, s.x, s.y + 0.55, s.z, 100);
    });

    // Elevated Glass Catwalk Bridge connecting middle shelves
    const catwalk = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.15, 13.0),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, transparent: true, opacity: 0.75 })
    );
    catwalk.position.set(0, 3.2, 0);
    this.levelRoot.add(catwalk);
    this.platforms.push({ x: 0, y: 3.2, z: 0, width: 1.6, height: 0.15, depth: 13.0, type: 'shelf' });

    // VIP Bathroom Items (4 items)
    this.addVipItem('vip_tub', -18, 3.1, -6.5, 'Wanna Wolnostojąca Owalna');
    this.addVipItem('vip_faucet', -9, 3.3, 6.5, 'Bateria Umywalkowa Złota');
    this.addVipItem('vip_mirror', 0, 3.5, -6.5, 'Lustro Podświetlane LED');
    this.addVipItem('vip_radiator', 9, 3.5, 6.5, 'Grzejnik Designerski Czarny');

    // COLLECTIBLES & PERKS in Level 2
    this.addGoldenCutterItem('cutter_2', -18, 3.8, -6.5);
    this.addEspressoItem('esp_2', 18, 4.0, -6.5);
    this.addMagnetItem('mag_2', -9, 3.9, 6.5);

    // EASTER EGGS LEVEL 2:
    // Easter Egg 3: Złoty Tron Prezesa Max-Fliz (24-karatowa toaleta)
    this.addEasterEgg('egg_throne_2', -9, 3.5, -7.5, 'Złoty Tron Prezesa Max-Fliz (24k)', 'throne', 600);
    // Easter Egg 4: Złoty Próbnik Beżu Architekta
    this.addEasterEgg('egg_swatches_2', 18, 3.8, 7.5, 'Złoty Próbnik Beżu Architekta', 'folder', 450);

    // Hazards: 2 Forklifts cruising opposite aisles
    this.addForkliftHazard('forklift_2a', -15, 0, 1.2, 4.0, 0xef4444);
    this.addForkliftHazard('forklift_2b', 2, 16, -1.2, 4.4, 0x10b981);

    // ENEMIES: Customers + Inspektor BHP + Architekt + Mini-Walczak!
    this.addCustomerEnemy('cust_2a', -14, -4, -2.5, 'Klient żądający rabatu 50%');
    this.addCustomerEnemy('cust_2b', 2, 12, 2.5, 'Pani z pękniętą umywalką');
    this.addInspectorEnemy('insp_2', -6, 4, -2.0, 'Inspektor BHP z gwizdkiem');
    this.addArchitectEnemy('arch_2', 6, 14, 2.0, 'Projektant luksusowych łazienek');
    this.addWalczakBoss('walczak_mini', 10, 0, 2); // 2 HP in level 2

    // Holographic Finish Gate & Delivery Van
    const finishGate = createFinishGate();
    finishGate.position.set(23, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(24.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 24.5, y: 0.8, z: 0, width: 3.2, height: 1.6, depth: 2.4, type: 'finish_truck' });
  }

  /**
   * LEVEL 3: Magazyn Wysokiego Składowania (Expanded High-Bay Warehouse & Walczak Grand Showdown)
   * Size: 68m x 30m. Central Conveyor Belt, 4-tier racks, spring AGV, 2 Easter eggs, 3-phase Boss Arena!
   */
  private buildLevel3() {
    const floorGeo = new THREE.PlaneGeometry(68, 30);
    const floorMat = new THREE.MeshStandardMaterial({ map: getFloorTexture(), roughness: 0.32 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.levelRoot.add(floor);
    this.platforms.push({ x: 0, y: 0, z: 0, width: 68, height: 0.2, depth: 30, type: 'floor' });

    this.playerPos.set(-29, 0.5, 0);
    this.playerVel.set(0, 0, 0);

    // 4 Mega Multi-Tier Racks
    [-22, -9, 4, 16].forEach((rx) => {
      const r1 = createWarehouseRack(6.5, 4.8, 1.5);
      r1.position.set(rx, 0, -7.5);
      const r2 = createWarehouseRack(6.5, 4.8, 1.5);
      r2.position.set(rx, 0, 7.5);
      this.levelRoot.add(r1, r2);

      [1.25, 2.6, 3.9].forEach((ry) => {
        this.platforms.push({ x: rx, y: ry, z: -7.5, width: 6.5, height: 0.15, depth: 1.5, type: 'shelf' });
        this.platforms.push({ x: rx, y: ry, z: 7.5, width: 6.5, height: 0.15, depth: 1.5, type: 'shelf' });
      });
    });

    // Connecting Wooden Walkway Catwalks
    const bridge1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.15, 13.5),
      new THREE.MeshStandardMaterial({ color: 0x92653a, roughness: 0.8 })
    );
    bridge1.position.set(-22, 2.6, 0);
    bridge1.castShadow = true;
    this.levelRoot.add(bridge1);
    this.platforms.push({ x: -22, y: 2.6, z: 0, width: 1.5, height: 0.15, depth: 13.5, type: 'shelf' });

    const bridge2 = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.15, 13.5),
      new THREE.MeshStandardMaterial({ color: 0x92653a, roughness: 0.8 })
    );
    bridge2.position.set(-9, 2.6, 0);
    bridge2.castShadow = true;
    this.levelRoot.add(bridge2);
    this.platforms.push({ x: -9, y: 2.6, z: 0, width: 1.5, height: 0.15, depth: 13.5, type: 'shelf' });

    // Central Moving Conveyor Belt (from -18 to -2)
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.35, 2.2),
      new THREE.MeshStandardMaterial({ map: getHazardStripeTexture(), roughness: 0.5 })
    );
    belt.position.set(-10, 1.25, 0);
    this.levelRoot.add(belt);
    this.platforms.push({ x: -10, y: 1.25, z: 0, width: 16, height: 0.35, depth: 2.2, type: 'conveyor' });

    // Launchpad Tub to reach high tier 3
    const tub = createBathtubModel();
    tub.position.set(0, 0, 0);
    this.levelRoot.add(tub);
    this.platforms.push({ x: 0, y: 0.55, z: 0, width: 1.8, height: 0.6, depth: 1.2, type: 'bathtub', bounce: 19.5 });

    // VIP Luxury Grand Order Items (5 items)
    this.addVipItem('vip_marmur', -22, 4.1, -7.5, 'Płyta Marmur Carrara Extra');
    this.addVipItem('vip_armatura', -22, 4.1, 7.5, 'Bateria Wolnostojąca Axor');
    this.addVipItem('vip_drzwi', -9, 2.8, -7.5, 'Drzwi Szklane Loft Max-Fliz');
    this.addVipItem('vip_lampa', 4, 4.1, 7.5, 'Żyrandol Kryształowy 120cm');
    this.addVipItem('vip_wz', 16, 4.1, -7.5, 'Złota Faktura WZ od Klienta VIP');

    // SPECIAL COLLECTIBLES in Level 3
    this.addCarraraItem('carr_3', -22, 4.5, 0);
    this.addGoldenCutterItem('cutter_3', -9, 3.5, -7.5);
    this.addEspressoItem('esp_3', 16, 4.5, -7.5);
    this.addMagnetItem('mag_3', 0, 2.2, 0);

    // EASTER EGGS LEVEL 3:
    // Easter Egg 5: Certyfikat Jakości Majstrów Piotra i Dawida
    this.addEasterEgg('egg_cert_3', -22, 4.8, 0, 'Certyfikat Jakości Majstrów Piotra i Dawida', 'folder', 500);
    // Easter Egg 6: Tajna Teczka Walczaka ze Starą Pieczątką
    this.addEasterEgg('egg_walczak_secret_3', 4, 4.8, -7.5, 'Tajna Teczka Walczaka ze Starą Pieczątką', 'throne', 550);

    // Forklifts cruising lower aisles
    this.addForkliftHazard('forklift_3a', -24, -4, -3.0, 5.0, 0xf59e0b);
    this.addForkliftHazard('forklift_3b', -6, 12, 3.0, 5.4, 0xd97706);

    // Grand Boss Walczak Showdown Arena (HP 4)
    this.addWalczakBoss('boss_walczak_main', 16, 0, 4);

    // Opponents crew
    this.addCustomerEnemy('cust_3a', -16, -6, 2.2, 'Inwestor ze spóźnioną fakturą');
    this.addInspectorEnemy('insp_3', -12, -2, 0, 'Główny Audytor Bezpieczeństwa BHP');
    this.addArchitectEnemy('arch_3', 2, 10, 2.2, 'Projektant Penthouse’u');
    this.addAgvRobotEnemy('agv_3', -6, 4, -2.0, 'Szybki AGV z marmurami');

    // Holographic Finish Gate & Grand Delivery Truck at exit
    const finishGate = createFinishGate();
    finishGate.position.set(28, 0, 0);
    this.levelRoot.add(finishGate);

    const van = createDeliveryVan();
    van.position.set(29.5, 0, 0);
    van.rotation.y = -Math.PI / 2;
    this.levelRoot.add(van);
    this.platforms.push({ x: 29.5, y: 0.8, z: 0, width: 3.4, height: 1.8, depth: 2.4, type: 'finish_truck' });
  }

  private addGroutItem(id: string, x: number, y: number, z: number, points = 50) {
    const group = createGroutCollectible();
    group.position.set(x, y, z);
    this.levelRoot.add(group);
    this.collectibles.push({
      id,
      type: 'grout',
      name: 'Złota Fuga',
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points,
    });
  }

  private addVipItem(id: string, x: number, y: number, z: number, name: string) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.2,
        emissive: 0x78350f,
        emissiveIntensity: 0.35,
      })
    );
    group.add(box);
    group.position.set(x, y, z);
    this.levelRoot.add(group);

    this.collectibles.push({
      id,
      type: 'vip_item',
      name,
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points: 250,
    });
    this.totalVipCount++;
  }

  private addForkliftHazard(id: string, startX: number, endX: number, z: number, speed: number, color = 0xf59e0b) {
    const { group } = createForkliftModel(color);
    group.position.set(startX, 0, z);
    this.levelRoot.add(group);
    this.hazards.push({
      id,
      type: 'forklift',
      mesh: group,
      startX,
      endX,
      startZ: z,
      x: startX,
      y: 0.5,
      z,
      speed,
      width: 1.4,
      length: 0.9,
      dir: 1,
      active: true,
    });
  }

  private addCustomerEnemy(id: string, startX: number, endX: number, z: number, name: string) {
    const built = createCustomerEnemyModel();
    built.group.position.set(startX, 0, z);
    this.levelRoot.add(built.group);

    this.enemies.push({
      id,
      type: 'customer',
      name,
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      x: startX,
      y: 0,
      z,
      startX,
      endX,
      speed: 2.6,
      dir: 1,
      hp: 1,
      maxHp: 1,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 2.0,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
    });
  }

  private addWalczakBoss(id: string, x: number, z: number, maxHp = 3) {
    const built = createWalczakBossModel();
    built.group.position.set(x, 0, z);
    this.levelRoot.add(built.group);

    this.enemies.push({
      id,
      type: 'walczak',
      name: 'Były Kierownik Walczak',
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      x,
      y: 0,
      z,
      startX: x - 4,
      endX: x + 4,
      speed: 3.2,
      dir: 1,
      hp: maxHp,
      maxHp,
      state: 'chase',
      stunTimer: 0,
      shoutTimer: 1.5,
      shoutText: '',
      attackCooldown: 3.5,
      walkCycle: 0,
    });

    this.callbacks.onBossUpdate?.('Były Kierownik Walczak', maxHp, maxHp, true);
  }

  private addArchitectEnemy(id: string, startX: number, endX: number, z: number, name = 'Architekt Wnętrz') {
    const built = createArchitectEnemyModel();
    built.group.position.set(startX, 0, z);
    this.levelRoot.add(built.group);

    this.enemies.push({
      id,
      type: 'architect',
      name,
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      x: startX,
      y: 0,
      z,
      startX,
      endX,
      speed: 3.0,
      dir: 1,
      hp: 1,
      maxHp: 1,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 2.2,
      shoutText: '',
      attackCooldown: 4.0,
      walkCycle: 0,
      specialActionTimer: 0,
    });
  }

  private addInspectorEnemy(id: string, startX: number, endX: number, z: number, name = 'Inspektor BHP') {
    const built = createInspectorEnemyModel();
    built.group.position.set(startX, 0, z);
    this.levelRoot.add(built.group);

    this.enemies.push({
      id,
      type: 'inspector',
      name,
      mesh: built.group,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      x: startX,
      y: 0,
      z,
      startX,
      endX,
      speed: 2.4,
      dir: 1,
      hp: 2,
      maxHp: 2,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 3.0,
      shoutText: '',
      attackCooldown: 4.5,
      walkCycle: 0,
      specialActionTimer: 0,
    });
  }

  private addAgvRobotEnemy(id: string, startX: number, endX: number, z: number, name = 'Autonomiczny AGV') {
    const built = createAgvRobotModel();
    built.group.position.set(startX, 0, z);
    this.levelRoot.add(built.group);

    this.enemies.push({
      id,
      type: 'agv_robot',
      name,
      mesh: built.group,
      x: startX,
      y: 0,
      z,
      startX,
      endX,
      speed: 2.2,
      dir: 1,
      hp: 999, // indestructible moving platform/hazard
      maxHp: 999,
      state: 'patrol',
      stunTimer: 0,
      shoutTimer: 999,
      shoutText: '',
      attackCooldown: 0,
      walkCycle: 0,
      specialActionTimer: 0,
    });
  }

  private addEspressoItem(id: string, x: number, y: number, z: number) {
    const group = createEspressoCollectible();
    group.position.set(x, y, z);
    this.levelRoot.add(group);
    this.collectibles.push({
      id,
      type: 'espresso',
      name: 'Podwójne Espresso Max-Fliz',
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points: 120,
    });
  }

  private addMagnetItem(id: string, x: number, y: number, z: number) {
    const group = createMagnetCollectible();
    group.position.set(x, y, z);
    this.levelRoot.add(group);
    this.collectibles.push({
      id,
      type: 'magnet',
      name: 'Magnetyczny Pas Narzędziowy',
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points: 150,
    });
  }

  private addGoldenCutterItem(id: string, x: number, y: number, z: number) {
    const group = createGoldenCutterCollectible();
    group.position.set(x, y, z);
    this.levelRoot.add(group);
    this.collectibles.push({
      id,
      type: 'golden_cutter',
      name: 'Złoty Przecinak do Gresu',
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points: 250,
    });
  }

  private addCarraraItem(id: string, x: number, y: number, z: number) {
    const group = createCarraraCollectible();
    group.position.set(x, y, z);
    this.levelRoot.add(group);
    this.collectibles.push({
      id,
      type: 'carrara',
      name: 'Włoski Marmur Carrara Gold',
      x,
      y,
      z,
      mesh: group,
      collected: false,
      points: 350,
    });
  }

  public triggerAbility() {
    if (this.state !== 'playing' || this.abilityTimer > 0) return;

    this.abilityTimer = this.charDef.abilityCooldown;
    this.abilityActiveDuration = 3.5;
    sound.playAbility(this.charDef.id);

    if (this.charDef.id === 'marcin') {
      // Marcin Stamp: Stuns all nearby forklifts AND satisfies angry customers with official stamp!
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y, this.playerPos.z, 0x3b82f6);
      this.cameraShake = 0.45;
      this.sayQuote('PODPIS WZ-TKI! Wszystkie reklamacje załatwione!');

      this.hazards.forEach((h) => {
        const dist = Math.hypot(h.x - this.playerPos.x, h.z - this.playerPos.z);
        if (dist < 8.0) {
          h.speed = 0.3;
          setTimeout(() => {
            h.speed = 4.0;
          }, 4000);
        }
      });

      // Pacify & Stun Customers
      this.enemies.forEach((en) => {
        const dist = Math.hypot(en.x - this.playerPos.x, en.z - this.playerPos.z);
        if (dist < 8.5) {
          en.stunTimer = 5.0;
          en.state = 'stunned';
          this.spawnParticleRing(en.x, en.y + 0.8, en.z, 0x22c55e);
        }
      });
    } else if (this.charDef.id === 'grzesiek') {
      // Grzesiek Turbo Paleciak Dash!
      const angle = this.playerRot;
      this.playerVel.x = Math.sin(angle) * 17.0;
      this.playerVel.z = Math.cos(angle) * 17.0;
      this.invulnerableTimer = 1.3;
      this.cameraShake = 0.3;
      sound.playHonk();
      this.sayQuote('DRIFT PALECIAKIEM! Rozpędzam klientów!');
      this.spawnDust(this.playerPos.x, this.playerPos.y, this.playerPos.z, 0x22c55e);
    } else if (this.charDef.id === 'dawid') {
      // Dawid Bouncing Tile Projectile
      this.sayQuote('RZUT GRESEM WIELKOFORMATOWYM!');
      const tileMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 })
      );
      tileMesh.position.copy(this.playerPos);
      tileMesh.position.y += 0.6;
      this.levelRoot.add(tileMesh);
      const angle = this.playerRot;
      this.projectiles.push({
        mesh: tileMesh,
        vel: new THREE.Vector3(Math.sin(angle) * 15.0, 1.2, Math.cos(angle) * 15.0),
        life: 2.8,
      });
    } else if (this.charDef.id === 'mateusz') {
      // Mateusz Espresso Overdrive!
      this.invulnerableTimer = 4.2;
      this.sayQuote('POTRÓJNE ESPRESSO! Widzę dźwięki!');
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y, this.playerPos.z, 0xec4899);
    } else {
      // Piotr Laser Level Blast!
      this.sayQuote('LASEROWA POZIOMICA! Trzymać pion w alei!');
      sound.playAbility('piotr');
      this.cameraShake = 0.55;

      const angle = this.playerRot;
      for (let offset = -0.35; offset <= 0.35; offset += 0.35) {
        const laserMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8),
          new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        laserMesh.rotation.x = Math.PI / 2;
        laserMesh.rotation.z = angle + offset;
        laserMesh.position.copy(this.playerPos);
        laserMesh.position.y += 0.6;
        this.levelRoot.add(laserMesh);

        const beamAngle = angle + offset;
        this.projectiles.push({
          mesh: laserMesh,
          vel: new THREE.Vector3(Math.sin(beamAngle) * 22.0, 0, Math.cos(beamAngle) * 22.0),
          life: 2.2,
        });
      }

      this.enemies.forEach((en) => {
        const dist = Math.hypot(en.x - this.playerPos.x, en.z - this.playerPos.z);
        if (dist < 9.5) {
          en.stunTimer = 5.0;
          en.state = 'stunned';
          this.spawnParticleRing(en.x, en.y + 0.8, en.z, 0xef4444);
        }
      });
    }
  }

  public triggerAttack(): boolean {
    if (this.state !== 'playing' || this.attackCooldownTimer > 0) return false;

    this.attackCooldownTimer = 0.28;
    this.attackSwingTimer = 0.25;

    sound.playAttackWhoosh();

    // Calculate attack origin in front of player
    const forwardX = Math.sin(this.playerRot);
    const forwardZ = Math.cos(this.playerRot);
    const slashX = this.playerPos.x + forwardX * 0.95;
    const slashZ = this.playerPos.z + forwardZ * 0.95;
    const slashY = this.playerPos.y + 0.55;

    this.spawnSlashEffect(slashX, slashY, slashZ, this.playerRot);

    // Voice lines on attack
    const quotes: Record<CharacterId, string[]> = {
      marcin: ['PODPISANO WZ!', 'PIECZĘĆ!', 'REKLAMACJA ODRZUCONA!'],
      grzesiek: ['ŁATA BRUKARSKA!', 'MIEJSCE NA PALECIAKA!', 'BUM!'],
      dawid: ['CIĘCIE GRESU!', 'PROSTY FAZ!', 'TWARDY MARMUR!'],
      mateusz: ['GORĄCA KAWA!', 'ESPRESSO SHOT!', 'CIEPŁY STRUMIEŃ!'],
      piotr: ['POZIOMICA W PIONIE!', 'CZYSTA PRECYZJA!', 'PIOTR TU BYŁ!'],
    };
    if (Math.random() < 0.45) {
      const qList = quotes[this.charDef.id];
      if (qList) {
        this.sayQuote(qList[Math.floor(Math.random() * qList.length)]);
      }
    }

    // Hit detection cone in front of player
    let hitAny = false;
    const attackRange = 2.4;
    const attackConeAngle = 1.6; // ~90deg

    for (const en of this.enemies) {
      if (en.state === 'defeated' || !en.mesh) continue;

      const dx = en.x - this.playerPos.x;
      const dz = en.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      const dy = Math.abs((en.y + 0.5) - (this.playerPos.y + 0.5));

      if (dist <= attackRange && dy < 1.6) {
        const angleToEnemy = Math.atan2(dx, dz);
        let angleDiff = Math.abs(angleToEnemy - this.playerRot);
        while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

        if (angleDiff <= attackConeAngle || dist < 1.1) {
          hitAny = true;
          en.hp--;
          en.stunTimer = 0.85;
          en.state = 'stunned';

          // Knockback
          const knockLen = Math.hypot(dx, dz) || 1;
          const knockStrength = en.type === 'walczak' ? 0.8 : 2.2;
          en.x += (dx / knockLen) * knockStrength;
          en.z += (dz / knockLen) * knockStrength;
          if (en.mesh) {
            en.mesh.position.x = en.x;
            en.mesh.position.z = en.z;
          }

          sound.playSmack();
          this.cameraShake = 0.25;
          this.spawnParticleRing(en.x, en.y + 0.7, en.z, 0xf59e0b);

          if (en.type === 'walczak') {
            this.callbacks.onBossUpdate?.(en.name, en.hp, en.maxHp, en.hp > 0);
          }

          if (en.hp <= 0) {
            en.state = 'defeated';
            en.mesh.visible = false;
            const pts = en.type === 'walczak' ? 500 : (en.type === 'inspector' ? 180 : (en.type === 'architect' ? 150 : 100));
            this.score += pts;
            this.spawnParticleRing(en.x, en.y + 0.5, en.z, 0x22c55e);
            this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);

            if (en.type === 'inspector') {
              this.activePerks.shield = true;
              this.callbacks.onPerksUpdate?.(this.activePerks);
              sound.playPerkPickup();
              this.sayQuote('INSPEKTOR BHP POKONANY! Zdobyto kask BHP!');
            } else if (en.type === 'architect') {
              this.addEspressoItem(`esp_drop_${Date.now()}`, en.x, 0.4, en.z);
              this.sayQuote('ARCHITEKTKA UCIEKŁA! Zostawiła espresso!');
            } else if (en.type === 'walczak') {
              sound.playWin();
              this.sayQuote('WALCZAK POKONANY! Rampa odblokowana!');
              this.callbacks.onBossUpdate?.(en.name, 0, en.maxHp, false);
            } else {
              this.sayQuote('KLIENT USPOKOJONY! Punktacja doliczona!');
            }
          }
        }
      }
    }

    return hitAny;
  }

  private spawnSlashEffect(x: number, y: number, z: number, rotY: number) {
    const slashGeo = new THREE.TorusGeometry(0.65, 0.06, 6, 16, Math.PI * 0.8);
    const colorMap: Record<CharacterId, number> = {
      marcin: 0x38bdf8,
      grzesiek: 0xf59e0b,
      dawid: 0xfde047,
      mateusz: 0xec4899,
      piotr: 0xef4444,
    };
    const slashMat = new THREE.MeshBasicMaterial({
      color: colorMap[this.charDef.id] || 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const slashMesh = new THREE.Mesh(slashGeo, slashMat);
    slashMesh.position.set(x, y, z);
    slashMesh.rotation.y = rotY;
    slashMesh.rotation.x = Math.PI * 0.5;
    this.levelRoot.add(slashMesh);

    this.particles.push({
      mesh: slashMesh,
      vel: new THREE.Vector3(Math.sin(rotY) * 3.5, 0, Math.cos(rotY) * 3.5),
      life: 0.22,
      maxLife: 0.22,
    });

    for (let i = 0; i < 4; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xfffbeb })
      );
      spark.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      this.levelRoot.add(spark);
      this.particles.push({
        mesh: spark,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.0, Math.random() * 2.0, (Math.random() - 0.5) * 4.0),
        life: 0.25,
        maxLife: 0.25,
      });
    }
  }

  private sayQuote(text: string) {
    this.callbacks.onSpeechBubble(text);
    this.speechBubbleTimer = 3.5;
  }

  private sayRandomVoiceLine() {
    const lines = this.charDef.voiceLines;
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.sayQuote(line);
  }

  private spawnDust(x: number, y: number, z: number, color = 0x94a3b8) {
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.SphereGeometry(0.08, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.1, z + (Math.random() - 0.5) * 0.3);
      this.levelRoot.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 1.5),
        life: 0.45,
        maxLife: 0.45,
      });
    }
  }

  private spawnParticleRing(x: number, y: number, z: number, color: number) {
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.12, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.2, z);
      this.levelRoot.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * 5.0, 1.0, Math.sin(ang) * 5.0),
        life: 0.7,
        maxLife: 0.7,
      });
    }
  }

  public update(dtRaw: number) {
    const dt = Math.min(dtRaw, 0.05);

    if (this.speechBubbleTimer > 0) {
      this.speechBubbleTimer -= dt;
      if (this.speechBubbleTimer <= 0) {
        this.callbacks.onSpeechBubble('');
      }
    }
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
      if (this.playerGroup) {
        this.playerGroup.visible = Math.floor(performance.now() / 80) % 2 === 0;
      }
    } else if (this.playerGroup) {
      this.playerGroup.visible = true;
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboStreak = 0;
      }
    }

    if (this.abilityTimer > 0) {
      this.abilityTimer -= dt;
      const progress = Math.max(0, 1 - this.abilityTimer / this.charDef.abilityCooldown);
      this.callbacks.onAbilityCooldown(progress, this.abilityTimer <= 0);
    } else {
      this.callbacks.onAbilityCooldown(1, true);
    }

    // Countdown active perks
    let perkChanged = false;
    if (this.activePerks.speedBoost > 0) {
      this.activePerks.speedBoost = Math.max(0, this.activePerks.speedBoost - dt);
      perkChanged = true;
    }
    if (this.activePerks.magnet > 0) {
      this.activePerks.magnet = Math.max(0, this.activePerks.magnet - dt);
      perkChanged = true;
    }
    if (this.activePerks.doubleJump > 0) {
      this.activePerks.doubleJump = Math.max(0, this.activePerks.doubleJump - dt);
      perkChanged = true;
    }
    if (perkChanged || this.activePerks.shield) {
      this.callbacks.onPerksUpdate?.(this.activePerks);
    }

    if (this.state === 'playing') {
      this.updatePlayerMovement(dt);
      this.updateCollectibles(dt);
      this.updateHazards(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updateParticles(dt);
    }

    this.updateCamera(dt);
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
      this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, inputX * speed, 12, dt);
      this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, inputZ * speed, 12, dt);
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

    // Landing squash effect
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
          c.x = THREE.MathUtils.damp(c.x, this.playerPos.x, 7.0, dt);
          c.z = THREE.MathUtils.damp(c.z, this.playerPos.z, 7.0, dt);
          c.mesh.position.x = c.x;
          c.mesh.position.z = c.z;
        }
      }

      c.mesh.position.y = c.y + Math.sin(performance.now() * 0.004 + c.x) * 0.08;

      const dist = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
      const dy = Math.abs((c.y + 0.2) - this.playerPos.y);

      if (dist < 0.95 && dy < 1.3) {
        c.collected = true;
        c.mesh.visible = false;
        this.comboStreak++;
        this.comboTimer = 3.0;

        const bonus = this.comboStreak > 1 ? (this.comboStreak - 1) * 20 : 0;
        this.score += c.points + bonus;

        sound.playPickup(this.comboStreak);
        this.spawnParticleRing(c.x, c.y, c.z, c.type === 'vip_item' ? 0xf59e0b : (c.type === 'espresso' ? 0xec4899 : 0xfde047));

        if (c.type === 'vip_item') {
          this.collectedVipCount++;
          this.sayQuote(`Skompletowano: ${c.name}!`);
          this.callbacks.onFloatingText?.(`📦 VIP: ${c.name} +${c.points}`, c.x, c.y + 0.8, c.z, 'vip');
        } else if (c.type === 'easter_egg') {
          sound.playEasterEgg();
          this.cameraShake = 0.45;
          this.spawnParticleRing(c.x, c.y + 0.5, c.z, 0xa855f7);
          this.spawnParticleRing(c.x, c.y + 0.8, c.z, 0xf59e0b);
          this.sayQuote(`🎉 EASTER EGG ODKRYTY: ${c.name}! +${c.points} PKT!`);
          this.callbacks.onFloatingText?.(`🎉 ${c.name} +${c.points}`, c.x, c.y + 0.8, c.z, 'easter-egg');
        } else if (c.type === 'espresso') {
          this.hp = Math.min(this.maxHp, this.hp + 1);
          this.callbacks.onHpUpdate(this.hp, this.maxHp);
          this.activePerks.speedBoost = 12.0;
          this.callbacks.onPerksUpdate?.(this.activePerks);
          sound.playPerkPickup();
          this.sayQuote('PODWÓJNE ESPRESSO! +1 Kawa i Turbo Krok!');
          this.callbacks.onFloatingText?.('☕ PODWÓJNE ESPRESSO! +12s SPRINT', c.x, c.y + 0.6, c.z, 'points');
        } else if (c.type === 'magnet') {
          this.activePerks.magnet = 16.0;
          this.callbacks.onPerksUpdate?.(this.activePerks);
          sound.playMagnetHum();
          this.sayQuote('PAS MAGNETYCZNY! Przyciągam zlecenia!');
          this.callbacks.onFloatingText?.('🧲 PAS MAGNETYCZNY! +16s', c.x, c.y + 0.6, c.z, 'points');
        } else if (c.type === 'golden_cutter') {
          this.abilityTimer = 0;
          this.activePerks.doubleJump = 20.0;
          this.callbacks.onPerksUpdate?.(this.activePerks);
          sound.playPerkPickup();
          this.sayQuote('ZŁOTY PRZECINAK! Reset mocy i podwójny skok!');
          this.callbacks.onFloatingText?.('👟 2x SKOK VIBRAM + RESET MOCY', c.x, c.y + 0.6, c.z, 'points');
        } else if (c.type === 'carrara') {
          sound.playPerkPickup();
          this.sayQuote('MARMUR CARRARA GOLD! Ekskluzywny gres!');
          this.callbacks.onFloatingText?.(`🏛️ MARMUR CARRARA +${c.points}`, c.x, c.y + 0.6, c.z, 'points');
        } else {
          this.callbacks.onFloatingText?.(`+${c.points + bonus}`, c.x, c.y + 0.5, c.z, 'points');
        }

        this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
      }
    });
  }

  private updateHazards(dt: number) {
    this.hazards.forEach((h) => {
      if (!h.mesh) return;

      if (h.type === 'forklift' && h.endX !== undefined) {
        h.x += h.speed * h.dir * dt;
        if (h.dir > 0 && h.x >= h.endX) {
          h.dir = -1;
          h.mesh.rotation.y = Math.PI;
        } else if (h.dir < 0 && h.x <= h.startX) {
          h.dir = 1;
          h.mesh.rotation.y = 0;
        }
        h.mesh.position.x = h.x;

        const dist = Math.hypot(h.x - this.playerPos.x, h.z - this.playerPos.z);
        const dy = Math.abs(h.y - this.playerPos.y);

        if (dist < 1.3 && dy < 1.0) {
          if (this.invulnerableTimer <= 0) {
            sound.playHonk();
            this.takeDamage('Potrącił cię wózek widłowy pana Zdzicha!');
            this.playerVel.x = (this.playerPos.x - h.x) * 8;
            this.playerVel.z = (this.playerPos.z - h.z) * 8;
            this.playerVel.y = 5.0;
          }
        }
      }
    });
  }

  /**
   * ENEMY AI, STOMPING, AND WALCZAK 3-PHASE BOSS MECHANICS
   */
  private updateEnemies(dt: number) {
    const customerQuotes = [
      'Gdzie jest moja mozaika?!',
      'Chcę natychmiast rozmawiać z kierownikiem!',
      'Czekam na ten gres od 3 tygodni!',
      'Rabat 40% albo dzwonię prosto do UOKiK!',
      'Kto pakował te kafelki?! Trzy są wyszczerbione!',
      'Ekipa remontowa czeka, a kleju wciąż brak!',
      'Żądam zwrotu za pękniętą fugę epoksydową!',
      'Mój majster twierdzi, że te płytki mają krzywe krawędzie!',
      'Czy ten gres na pewno ma klasę ścieralności PEI 5?!',
      'Przyjechałem z drugiego końca Krakowa, a rampa pusta?!',
      'W katalogu ten beż wyglądał zupełnie inaczej!',
      'Jak to nie ma transportu HDS na jutro rano na budowę?!',
      'Gdzie podział się mój rabat dla stałego klienta?!',
      'Kto mi zapłaci za przestój glazurnika?!',
    ];

    const walczakQuotes = [
      'Ja tu byłem kierownikiem magazynu przez 10 lat!',
      'Raport niezgodności! Mandat 500 zł na konto zmiany!',
      'Walczak nie przepuści tego załadunku bez potrójnego podpisu!',
      'Protokół reklamacyjny natychmiast na moje biurko!',
      'Moja pieczątka była tu jedynym prawem i porządkiem!',
      'Żadna ciężarówka nie wyjedzie bez parafki dyrekcji!',
      'Sprawdzę każdy dokument magazynowy co do milimetra!',
      'Wracam na stanowisko głównego dyrektora logistyki!',
      'Moje WZ-tki nie miały ani jednej literówki!',
      'Gres wielkoformatowy? Za moich czasów nosiło się go na plecach!',
      'Ten regał nie spełnia moich norm obciążeniowych z 2014 roku!',
      'Zarząd jeszcze usłyszy o tym samowolnym załadunku!',
    ];

    const architectQuotes = [
      'Za mało beżowy ten gres! Wpadający w zbyt chłodny taupe!',
      'Ten odcień fugi gryzie się z mosiężną armaturą!',
      'Gdzie jest wzornik w odcieniu kaszmiru i ciepłego piasku?!',
      'Musimy natychmiast przeprojektować całą tę aleję ekspozycyjną!',
      'To nie jest ciepły szary, to jest bezduszny beton deweloperski!',
      'Moi klienci z penthouse’u wymagają heksagonów z fazą!',
      'Wizualizacja na iPadzie Pro wyglądała zdecydowanie bardziej organicznie!',
      'Zaprojektujmy tu strefę wellness z wolnostojącą wanną z kompozytu!',
      'Światło w tej alei ma zły współczynnik CRI!',
    ];

    const inspectorQuotes = [
      'Brak atestowanego kasku na alei! -100 zł natychmiastowego mandatu!',
      'Przejście ewakuacyjne zastawione paletą z klinkierem!',
      'Protokół doraźnej kontroli BHP sporządzony od ręki!',
      'Gdzie są aktualne badania wysokościowe dla tej drabiny?!',
      'Prowadzenie paleciaka bez uprawnień UDT kat. II?!',
      'Proszę natychmiast okazać ważny atest gaśnicy proszkowej!',
      'Ta sterta palet przekracza dopuszczalną normę PN-EN o 12 cm!',
      'Żółto-czarna taśma ostrzegawcza na posadzce jest starta o 4 milimetry!',
    ];

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      if (en.state === 'defeated' || !en.mesh) continue;

      // Stun countdown
      if (en.stunTimer > 0) {
        en.stunTimer -= dt;
        en.mesh.rotation.z = Math.sin(performance.now() * 0.02) * 0.22;
        if (Math.random() < 0.2) {
          this.spawnDust(en.x, en.y + 0.9, en.z, 0xfacc15);
        }
        if (en.stunTimer <= 0) {
          en.state = 'patrol';
          en.mesh.rotation.z = 0;
        }
        continue;
      }

      // Voice shouts
      en.shoutTimer -= dt;
      if (en.shoutTimer <= 0) {
        en.shoutTimer = Math.random() * 4.5 + 3.5;
        let quotes = customerQuotes;
        if (en.type === 'walczak') {
          quotes = walczakQuotes;
        } else if (en.type === 'architect') {
          quotes = architectQuotes;
        } else if (en.type === 'inspector') {
          quotes = inspectorQuotes;
        }
        en.shoutText = quotes[Math.floor(Math.random() * quotes.length)];
        this.sayQuote(`${en.name}: "${en.shoutText}"`);
      }

      // Movement & AI
      const distToPlayer = Math.hypot(en.x - this.playerPos.x, en.z - this.playerPos.z);

      if (en.type === 'customer') {
        if (distToPlayer < 7.0) {
          en.state = 'chase';
          const dx = this.playerPos.x - en.x;
          const dz = this.playerPos.z - en.z;
          const len = Math.hypot(dx, dz) || 1;
          en.x += (dx / len) * en.speed * dt;
          en.z += (dz / len) * en.speed * dt;
          en.mesh.rotation.y = Math.atan2(dx, dz);
        } else {
          // Patrol
          en.x += en.speed * en.dir * dt;
          if (en.dir > 0 && en.x >= en.endX) {
            en.dir = -1;
            en.mesh.rotation.y = Math.PI;
          } else if (en.dir < 0 && en.x <= en.startX) {
            en.dir = 1;
            en.mesh.rotation.y = 0;
          }
        }
      } else if (en.type === 'architect') {
        if (distToPlayer < 6.5) {
          const dx = this.playerPos.x - en.x;
          const dz = this.playerPos.z - en.z;
          const angle = Math.atan2(dx, dz);
          en.mesh.rotation.y = angle;
          en.x += Math.cos(angle) * en.speed * dt;
          en.z -= Math.sin(angle) * en.speed * dt;
        } else {
          en.x += en.speed * en.dir * dt;
          if (en.dir > 0 && en.x >= en.endX) {
            en.dir = -1;
            en.mesh.rotation.y = Math.PI;
          } else if (en.dir < 0 && en.x <= en.startX) {
            en.dir = 1;
            en.mesh.rotation.y = 0;
          }
        }
      } else if (en.type === 'inspector') {
        en.specialActionTimer = (en.specialActionTimer || 0) + dt;
        if (en.specialActionTimer > 4.5) {
          en.specialActionTimer = 0;
          sound.playWhistle();
          this.spawnParticleRing(en.x, en.y + 0.8, en.z, 0xfacc15);
          this.sayQuote('INSPEKTOR BHP: *GWIZD!* "Kontrola bezpieczeństwa na alei!"');
          if (distToPlayer < 6.0 && !this.activePerks.shield) {
            this.playerVel.x *= 0.35;
            this.playerVel.z *= 0.35;
          }
        }

        en.x += en.speed * en.dir * dt;
        if (en.dir > 0 && en.x >= en.endX) {
          en.dir = -1;
          en.mesh.rotation.y = Math.PI;
        } else if (en.dir < 0 && en.x <= en.startX) {
          en.dir = 1;
          en.mesh.rotation.y = 0;
        }
      } else if (en.type === 'agv_robot') {
        en.x += en.speed * en.dir * dt;
        if (en.dir > 0 && en.x >= en.endX) {
          en.dir = -1;
          en.mesh.rotation.y = Math.PI;
        } else if (en.dir < 0 && en.x <= en.startX) {
          en.dir = 1;
          en.mesh.rotation.y = 0;
        }
      } else if (en.type === 'walczak') {
        // WALCZAK 3-PHASE BOSS MECHANICS:
        // Phase 1 (HP 4): Penalty notices barrage
        // Phase 2 (HP 3): Ground shockwave stomp (must jump to avoid!)
        // Phase 3 (HP 2 & 1): Charging bull sprint across arena -> stun crash on edge!

        const dx = this.playerPos.x - en.x;
        const dz = this.playerPos.z - en.z;
        const angle = Math.atan2(dx, dz);

        if (en.state === 'charging') {
          // Phase 3 Charging sprint
          en.chargeTimer = (en.chargeTimer || 0) + dt;
          const chargeSpeed = 9.5;
          en.x += (en.chargeDir || 1) * chargeSpeed * dt;
          if (Math.random() < 0.35) {
            this.spawnDust(en.x, en.y + 0.1, en.z, 0xef4444);
          }

          // Check if reached wall/rack bounds to crash and stun!
          if (en.x <= en.startX || en.x >= en.endX || en.chargeTimer > 2.5) {
            en.state = 'stunned';
            en.stunTimer = 2.8;
            sound.playHit();
            this.cameraShake = 0.55;
            this.spawnParticleRing(en.x, en.y + 0.8, en.z, 0xf59e0b);
            this.sayQuote('WALCZAK: "Urrgh! Mój kręgosłup i segregator! (OGŁUSZONY!)"');
            this.callbacks.onFloatingText?.('💫 WALCZAK OGŁUSZONY!', en.x, en.y + 1.2, en.z, 'points');
          }
        } else if (en.hp >= 4) {
          // Phase 1: Throws penalty notices
          en.attackCooldown -= dt;
          if (en.attackCooldown <= 0) {
            en.attackCooldown = 3.2;
            this.shootWalczakPenalty(en);
          }
          en.mesh.rotation.y = angle;
          if (distToPlayer > 5.5) {
            en.x += Math.sin(angle) * en.speed * dt;
            en.z += Math.cos(angle) * en.speed * dt;
          } else if (distToPlayer < 3.5) {
            en.x -= Math.sin(angle) * en.speed * dt;
            en.z -= Math.cos(angle) * en.speed * dt;
          }
        } else if (en.hp === 3) {
          // Phase 2: Shockwave Megaphone Stomp
          en.specialActionTimer = (en.specialActionTimer || 0) + dt;
          en.mesh.rotation.y = angle;

          if (en.specialActionTimer > 4.2) {
            en.specialActionTimer = 0;
            sound.playHonk();
            this.cameraShake = 0.45;
            this.sayQuote('WALCZAK: "OGŁASZAM EWAKUACJĘ MAGAZYNU! (FALA UDERZENIOWA!)"');
            this.spawnParticleRing(en.x, en.y + 0.2, en.z, 0xef4444);
            this.spawnParticleRing(en.x, en.y + 0.4, en.z, 0xf59e0b);

            // Shockwave hits if player is grounded and near
            if (distToPlayer < 7.5 && this.playerPos.y < 0.4 && this.invulnerableTimer <= 0) {
              this.takeDamage('Fala dźwiękowa z megafonu Walczaka cię powaliła! (Przeskocz ją!)');
              this.playerVel.x = (this.playerPos.x - en.x) * 6;
              this.playerVel.z = (this.playerPos.z - en.z) * 6;
              this.playerVel.y = 5.0;
            }
          }

          if (distToPlayer > 4.5) {
            en.x += Math.sin(angle) * en.speed * dt;
            en.z += Math.cos(angle) * en.speed * dt;
          }
        } else {
          // Phase 3: Charges towards player!
          en.specialActionTimer = (en.specialActionTimer || 0) + dt;
          en.mesh.rotation.y = angle;

          if (en.specialActionTimer > 3.0) {
            en.specialActionTimer = 0;
            en.state = 'charging';
            en.chargeDir = this.playerPos.x > en.x ? 1 : -1;
            en.chargeTimer = 0;
            sound.playHonk();
            this.sayQuote('WALCZAK: "SZARŻA BYŁEGO KIEROWNIKA! ROZSTĄPIĆ SIĘ!"');
            this.spawnParticleRing(en.x, en.y + 0.5, en.z, 0xef4444);
          } else {
            // Circle cautiously before sprint
            en.x += Math.cos(angle) * en.speed * 0.8 * dt;
            en.z -= Math.sin(angle) * en.speed * 0.8 * dt;
          }
        }
      }

      en.mesh.position.set(en.x, en.y, en.z);

      // Walk animation
      en.walkCycle += dt * 10;
      if (en.legL && en.legR && en.armL && en.armR) {
        en.legL.rotation.x = Math.sin(en.walkCycle) * 0.5;
        en.legR.rotation.x = -Math.sin(en.walkCycle) * 0.5;
        en.armL.rotation.x = -Math.sin(en.walkCycle) * 0.5;
        en.armR.rotation.x = Math.sin(en.walkCycle) * 0.7;
      }

      // COLLISION WITH PLAYER
      const horizontalDist = Math.hypot(en.x - this.playerPos.x, en.z - this.playerPos.z);
      const dy = this.playerPos.y - en.y;

      if (horizontalDist < 0.95) {
        if (en.type === 'agv_robot') {
          // AGV Robot is a moving spring launchpad!
          if (dy > 0.3) {
            this.playerVel.y = 12.5; // High bounce jump!
            sound.playBounce();
            this.cameraShake = 0.3;
            this.spawnParticleRing(en.x, en.y + 0.4, en.z, 0x0284c7);
            this.score += 40;
            this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
            this.sayQuote('SPRĘŻYSTY SKOK Z AGV! Płyniemy na górę!');
            this.callbacks.onFloatingText?.('🚀 WYBICIE Z AGV! +40', en.x, en.y + 0.8, en.z, 'points');
          } else {
            this.playerVel.x = (this.playerPos.x - en.x) * 4;
            this.playerVel.z = (this.playerPos.z - en.z) * 4;
          }
          continue;
        }

        // MARIO STOMP CHECK: Player is above enemy and falling downward!
        if (dy > 0.45 && this.playerVel.y < -0.2) {
          this.playerVel.y = 10.5;
          sound.playBounce();
          sound.playHit();
          this.cameraShake = 0.35;
          this.spawnParticleRing(en.x, en.y + 0.8, en.z, 0xf59e0b);

          en.hp--;
          if (en.type === 'walczak') {
            this.callbacks.onBossUpdate?.(en.name, en.hp, en.maxHp, en.hp > 0);
            this.sayQuote('TRAFIONY WALCZAK! "Moje okulary i faktura!"');
            this.callbacks.onFloatingText?.('💥 WALCZAK -1 HP!', en.x, en.y + 1.0, en.z, 'points');
          } else if (en.type === 'architect') {
            this.sayQuote('USPOKOJONY ARCHITEKT! "Zgoda, beż jest w porządku!"');
            this.callbacks.onFloatingText?.('💥 USPOKOJONY! +150', en.x, en.y + 1.0, en.z, 'points');
          } else if (en.type === 'inspector') {
            this.sayQuote('INSPEKTOR BHP SKASOWANY! Przejąłeś Kask Majstra!');
            this.callbacks.onFloatingText?.('⛑️ TARCZA BHP ZDOBYTA!', en.x, en.y + 1.0, en.z, 'points');
          } else {
            this.sayQuote(`SKASOWANA REKLAMACJA! +100 pkt!`);
            this.callbacks.onFloatingText?.('💥 SKASOWANA REKLAMACJA +100', en.x, en.y + 1.0, en.z, 'points');
          }

          if (en.hp <= 0) {
            en.state = 'defeated';
            en.mesh.visible = false;
            const pts = en.type === 'walczak' ? 500 : (en.type === 'inspector' ? 180 : (en.type === 'architect' ? 150 : 100));
            this.score += pts;
            this.spawnParticleRing(en.x, en.y + 0.5, en.z, 0x22c55e);
            this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);

            if (en.type === 'inspector') {
              this.activePerks.shield = true;
              this.callbacks.onPerksUpdate?.(this.activePerks);
              sound.playPerkPickup();
            } else if (en.type === 'architect') {
              this.addEspressoItem(`esp_drop_${Date.now()}`, en.x, 0.4, en.z);
            } else if (en.type === 'walczak') {
              sound.playWin();
              this.sayQuote('WALCZAK POKONANY! Rampa załadunkowa odblokowana!');
              this.callbacks.onBossUpdate?.(en.name, 0, en.maxHp, false);
              this.callbacks.onFloatingText?.('🏆 POKONANO WALCZAKA! +500', en.x, en.y + 1.2, en.z, 'vip');
            }
          }
        } else {
          // Horizontal body hit
          if (this.invulnerableTimer <= 0) {
            const reason = en.type === 'walczak'
              ? 'Walczak wręczył ci karę umowną i wezwanie do zarządu!'
              : (en.type === 'inspector'
                ? 'Inspektor BHP wstrzymał twoją zmianę za brak procedury!'
                : (en.type === 'architect'
                  ? 'Architekt zasypał cię toną próbek niepasującego gresu!'
                  : `Klient z fakturą (${en.name}) zablokował cię awanturą!`));
            this.takeDamage(reason);
            this.playerVel.x = (this.playerPos.x - en.x) * 7;
            this.playerVel.z = (this.playerPos.z - en.z) * 7;
            this.playerVel.y = 4.0;
          }
        }
      }
    }

    // UPDATE ENEMY PROJECTILES (Walczak's flying penalty notices)
    for (let pIdx = this.enemyProjectiles.length - 1; pIdx >= 0; pIdx--) {
      const ep = this.enemyProjectiles[pIdx];
      ep.life -= dt;
      ep.mesh.position.addScaledVector(ep.vel, dt);
      ep.mesh.rotation.y += dt * 8;
      ep.mesh.rotation.z += dt * 6;

      const pDist = ep.mesh.position.distanceTo(this.playerPos);
      if (pDist < 0.8 && this.invulnerableTimer <= 0) {
        this.takeDamage('Trafiła cię kara umowna wystawiona przez Walczaka!');
        ep.life = 0;
      }

      if (ep.life <= 0) {
        this.levelRoot.remove(ep.mesh);
        this.enemyProjectiles.splice(pIdx, 1);
      }
    }
  }

  private shootWalczakPenalty(walczak: EnemyItem) {
    const penaltyMesh = createPenaltyNoticeProjectile();
    penaltyMesh.position.set(walczak.x, walczak.y + 0.8, walczak.z);
    this.levelRoot.add(penaltyMesh);

    const dx = this.playerPos.x - walczak.x;
    const dz = this.playerPos.z - walczak.z;
    const len = Math.hypot(dx, dz) || 1;
    const speed = 7.5;

    this.enemyProjectiles.push({
      mesh: penaltyMesh,
      vel: new THREE.Vector3((dx / len) * speed, 0.4, (dz / len) * speed),
      life: 3.5,
    });

    sound.playHonk();
    this.sayQuote('WALCZAK: "KARA UMOWNA ZA OPÓŹNIENIE!"');
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 10;

      // Check hit with enemies!
      this.enemies.forEach((en) => {
        if (en.state !== 'defeated' && en.mesh) {
          if (p.mesh.position.distanceTo(en.mesh.position) < 1.1) {
            en.hp--;
            sound.playHit();
            this.spawnParticleRing(en.x, en.y + 0.5, en.z, 0xf59e0b);
            p.life = 0;

            if (en.type === 'walczak') {
              this.callbacks.onBossUpdate?.(en.name, en.hp, en.maxHp, en.hp > 0);
            }

            if (en.hp <= 0) {
              en.state = 'defeated';
              en.mesh.visible = false;
              this.score += en.type === 'walczak' ? 500 : 100;
              this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
              if (en.type === 'walczak') {
                sound.playWin();
                this.callbacks.onBossUpdate?.(en.name, 0, en.maxHp, false);
              }
            }
          }
        }
      });

      // Check hit with collectibles
      this.collectibles.forEach((c) => {
        if (!c.collected && c.mesh) {
          if (p.mesh.position.distanceTo(c.mesh.position) < 1.0) {
            c.collected = true;
            c.mesh.visible = false;
            this.score += c.points;
            sound.playPickup();
            this.spawnParticleRing(c.x, c.y, c.z, 0xf59e0b);
            if (c.type === 'vip_item') {
              this.collectedVipCount++;
            }
            this.callbacks.onScoreUpdate(this.score, this.collectedVipCount, this.totalVipCount);
          }
        }
      });

      if (p.life <= 0) {
        this.levelRoot.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.life -= dt;
      part.mesh.position.addScaledVector(part.vel, dt);
      part.vel.y -= 9.8 * dt;
      const scale = Math.max(0.01, part.life / part.maxLife);
      part.mesh.scale.setScalar(scale);

      if (part.life <= 0) {
        this.levelRoot.remove(part.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  private takeDamage(reason: string) {
    if (this.invulnerableTimer > 0) return;

    // Hardhat Shield absorption perk
    if (this.activePerks.shield) {
      this.activePerks.shield = false;
      this.invulnerableTimer = 1.0;
      this.cameraShake = 0.35;
      sound.playShieldBreak();
      this.spawnParticleRing(this.playerPos.x, this.playerPos.y + 0.6, this.playerPos.z, 0x38bdf8);
      this.sayQuote('KASK BHP OCHRONIŁ CIĘ PRZED CISEM!');
      this.callbacks.onPerksUpdate?.(this.activePerks);
      return;
    }

    this.hp--;
    this.invulnerableTimer = 1.8;
    this.cameraShake = 0.55;
    sound.playHit();
    this.callbacks.onHpUpdate(this.hp, this.maxHp);
    this.sayQuote('AUĆ! Moje dokumenty i gres!');

    if (this.hp <= 0) {
      this.state = 'gameover';
      sound.stopMusic();
      sound.playGameOver();
      this.callbacks.onGameOver(reason);
    }
  }

  private checkLevelFinish() {
    if (this.collectedVipCount < this.totalVipCount) {
      this.sayQuote(`Brakuje jeszcze zamówień! Masz ${this.collectedVipCount}/${this.totalVipCount}`);
      return;
    }

    this.state = 'victory';
    sound.stopMusic();
    sound.playWin();
    const elapsedSec = Math.round((performance.now() - this.levelStartTime) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
    this.callbacks.onLevelComplete(this.currentLevelId, this.score, timeStr);
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

