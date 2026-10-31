/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  EventShockResult,
  IntersectionClient,
  RoundLog,
  SimulationStatus,
  SimulatorConfig,
} from '../types/simulator';
import {
  Camera,
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Eye,
  Sliders,
  Sparkles,
  MapPin,
  Layers,
  Activity,
  CheckCircle2,
  Maximize2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { useFL } from '../context/FLContext';

interface City3DCanvasProps {
  clients: IntersectionClient[];
  currentRound: number;
  totalRounds: number;
  simulationStatus: SimulationStatus;
  roundLogs: RoundLog[];
  config: SimulatorConfig;
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  isCompareMode?: boolean;
  onToggleCompare?: () => void;
  shockResult?: EventShockResult | null;
  isSecondViewport?: boolean;
}

// Pre-allocated math objects to guarantee zero garbage collection
const _dummy = new THREE.Object3D();
const _tempVec = new THREE.Vector3();
const _color = new THREE.Color();

const ARCHETYPE_COLOR_MAP: Record<string, number> = {
  'Downtown Crossing': 0x8b5cf6, // Violet
  'Highway Corridor': 0xec4899, // Pink / Magenta
  'Commercial / Financial': 0xf59e0b, // Amber Gold
  'School Zone': 0x06b6d4, // Cyan
  Residential: 0x10b981, // Emerald Green
};

export const City3DCanvas: React.FC<City3DCanvasProps> = ({
  clients,
  currentRound,
  totalRounds,
  simulationStatus,
  roundLogs,
  config,
  selectedClientId,
  onSelectClient,
  isCompareMode = false,
  onToggleCompare,
  shockResult,
  isSecondViewport = false,
}) => {
  const { stepRound, toggleSimulation, resetSimulation, theme } = useFL();
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const fpsTextRef = useRef<HTMLSpanElement | null>(null);
  const qualityTextRef = useRef<HTMLSpanElement | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Mutable refs so loop reads latest state without component re-renders
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const simulationStatusRef = useRef(simulationStatus);
  simulationStatusRef.current = simulationStatus;
  const selectedClientIdRef = useRef(selectedClientId);
  selectedClientIdRef.current = selectedClientId;
  const shockResultRef = useRef(shockResult);
  shockResultRef.current = shockResult;

  // 3D references
  const towerMeshesRef = useRef<
    Map<
      string,
      {
        group: THREE.Group;
        tx: number;
        tz: number;
        baseRing: THREE.Mesh;
        colorHex: number;
        beacon: THREE.Mesh;
      }
    >
  >(new Map());

  const serverRingsRef = useRef<THREE.Mesh[]>([]);
  const instancedCarsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedPacketsRef = useRef<THREE.InstancedMesh | null>(null);

  const carDataRef = useRef<
    {
      x: number;
      z: number;
      speed: number;
      dir: 'x' | 'z';
      laneOffset: number;
    }[]
  >([]);

  const packetDataRef = useRef<
    {
      clientId: string;
      curve: THREE.QuadraticBezierCurve3;
      progress: number;
      speed: number;
      direction: 'uplink' | 'downlink';
      color: number;
    }[]
  >([]);

  const trafficSignalsRef = useRef<
    {
      intersectionId: string;
      redMesh: THREE.Mesh;
      yellowMesh: THREE.Mesh;
      greenMesh: THREE.Mesh;
    }[]
  >([]);

  // Smooth camera transition state
  const camTransitionRef = useRef<{
    active: boolean;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
    progress: number;
  }>({
    active: false,
    targetPos: new THREE.Vector3(65, 55, 70),
    targetLook: new THREE.Vector3(0, 6, 0),
    progress: 1,
  });

  const clientLabelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const serverLabelRef = useRef<HTMLDivElement | null>(null);
  const buildingsGroupRef = useRef<THREE.Group | null>(null);

  // UI state (only updated on explicit user interaction, never in render loop)
  const [activeViewPreset, setActiveViewPreset] = useState<string>('iso');
  const [ultraClearMode, setUltraClearMode] = useState<boolean>(false);
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(false);

  const latestLog = roundLogs[roundLogs.length - 1];

  const getTowerPos = (client: IntersectionClient) => {
    return {
      x: (client.coordinates.x - 50) * 1.5,
      z: (client.coordinates.y - 50) * 1.5,
    };
  };

  // Mount Three.js Scene ONCE on mount, dispose cleanly on unmount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = isSecondViewport ? 360 : 560;

    // Prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Scene Setup - Adaptive Palette
    const scene = new THREE.Scene();
    const bgColor = theme === 'dark' ? 0x070b14 : 0xf1f5f9;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.Fog(bgColor, 160, 420);
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1200);
    camera.position.set(65, 55, 70);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 15;
    controls.maxDistance = 220;
    controls.target.set(0, 5, 0);
    controlsRef.current = controls;

    // 5. Lighting: 1 HemisphereLight + Neon Emissives (Replaces 6 costly pointlights!)
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x080e1a, 2.8);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight.position.set(60, 100, 70);
    scene.add(dirLight);

    // 6. Base Ground Plane
    const groundMat = new THREE.MeshStandardMaterial({
      color: theme === 'dark' ? 0x080e1a : 0xe2e8f0,
      roughness: 0.5,
      metalness: 0.3,
    });
    const groundGeo = new THREE.PlaneGeometry(320, 320);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);
    groundRef.current = ground;

    const gridHelper = new THREE.GridHelper(300, 60, 0x0284c7, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // 7. Wide Asphalt Roads
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x121927,
      roughness: 0.7,
      metalness: 0.2,
    });
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const roadGroup = new THREE.Group();

    // Highway East-West
    const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(260, 14), roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.set(0, 0.02, 0);
    roadGroup.add(ewRoad);

    const ewYellow = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.4), yellowMat);
    ewYellow.rotation.x = -Math.PI / 2;
    ewYellow.position.set(0, 0.03, 0);
    roadGroup.add(ewYellow);

    // Boulevard North-South
    const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, 260), roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.02, 0);
    roadGroup.add(nsRoad);

    const nsYellow = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 260), yellowMat);
    nsYellow.rotation.x = -Math.PI / 2;
    nsYellow.position.set(0, 0.03, 0);
    roadGroup.add(nsYellow);

    // Arterial outer avenues
    [-42, 42].forEach((coord) => {
      const avX = new THREE.Mesh(new THREE.PlaneGeometry(180, 10), roadMat);
      avX.rotation.x = -Math.PI / 2;
      avX.position.set(0, 0.015, coord);
      roadGroup.add(avX);

      const avZ = new THREE.Mesh(new THREE.PlaneGeometry(10, 180), roadMat);
      avZ.rotation.x = -Math.PI / 2;
      avZ.position.set(coord, 0.015, 0);
      roadGroup.add(avZ);
    });
    scene.add(roadGroup);

    // 8. Central FedAvg Aggregator Spire & Plaza
    const serverPlazaGroup = new THREE.Group();
    const plazaGeo = new THREE.CylinderGeometry(14, 15, 0.8, 36);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0x0f1c33,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.y = 0.4;
    serverPlazaGroup.add(plazaMesh);

    const plazaBorderGeo = new THREE.RingGeometry(14.2, 14.8, 48);
    const plazaBorderMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const plazaBorder = new THREE.Mesh(plazaBorderGeo, plazaBorderMat);
    plazaBorder.rotation.x = -Math.PI / 2;
    plazaBorder.position.y = 0.82;
    serverPlazaGroup.add(plazaBorder);

    // Monolith Spire
    const spireGeo = new THREE.CylinderGeometry(1.8, 3.8, 28, 8);
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.8,
      metalness: 0.9,
    });
    const spireMesh = new THREE.Mesh(spireGeo, spireMat);
    spireMesh.position.y = 14.8;
    serverPlazaGroup.add(spireMesh);

    // Rotating Torus Rings
    const rings: THREE.Mesh[] = [];
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.2,
      metalness: 0.8,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.4, 16, 40), ringMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 19;
    serverPlazaGroup.add(ring1);
    rings.push(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.35, 16, 40), ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 15;
    serverPlazaGroup.add(ring2);
    rings.push(ring2);
    serverRingsRef.current = rings;
    scene.add(serverPlazaGroup);

    // 9. Client Intersection Towers & Communication Curves
    const towerMeshes = new Map();
    const packetData: typeof packetDataRef.current = [];
    const trafficSignals: typeof trafficSignalsRef.current = [];

    clientsRef.current.forEach((client, idx) => {
      const { x: tx, z: tz } = getTowerPos(client);
      const colHex = ARCHETYPE_COLOR_MAP[client.archetype] || 0x0ea5e9;
      const towerGroup = new THREE.Group();
      towerGroup.position.set(tx, 0, tz);

      // Pedestal
      const podGeo = new THREE.CylinderGeometry(7, 7.5, 0.9, 6);
      const podMat = new THREE.MeshStandardMaterial({
        color: 0x111c30,
        metalness: 0.7,
        emissive: colHex,
        emissiveIntensity: 0.3,
      });
      const podMesh = new THREE.Mesh(podGeo, podMat);
      podMesh.position.y = 0.45;
      towerGroup.add(podMesh);

      // Base Neon Pulsing Ring
      const ringGeo = new THREE.RingGeometry(7.2, 8.2, 32);
      const baseRingMat = new THREE.MeshBasicMaterial({
        color: colHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const baseRing = new THREE.Mesh(ringGeo, baseRingMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.92;
      towerGroup.add(baseRing);

      // Tower body
      const cTowerGeo = new THREE.CylinderGeometry(1.9, 3.2, 20, 8);
      const cTowerMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: colHex,
        emissiveIntensity: 0.6,
        metalness: 0.8,
      });
      const tMesh = new THREE.Mesh(cTowerGeo, cTowerMat);
      tMesh.position.y = 10.5;
      towerGroup.add(tMesh);

      // Apex beacon
      const topBeacon = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 16),
        new THREE.MeshBasicMaterial({ color: colHex })
      );
      topBeacon.position.y = 21.5;
      towerGroup.add(topBeacon);

      // Signal fixture
      const signalBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 2.4, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      );
      signalBox.position.set(5.5, 6.2, 5.5);
      towerGroup.add(signalBox);

      const lensGeo = new THREE.SphereGeometry(0.25, 8, 8);
      const redMesh = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      redMesh.position.set(5.5, 7.0, 5.92);
      towerGroup.add(redMesh);

      const yellowMesh = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0x78350f }));
      yellowMesh.position.set(5.5, 6.2, 5.92);
      towerGroup.add(yellowMesh);

      const greenMesh = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0x064e3b }));
      greenMesh.position.set(5.5, 5.4, 5.92);
      towerGroup.add(greenMesh);

      trafficSignals.push({ intersectionId: client.id, redMesh, yellowMesh, greenMesh });
      scene.add(towerGroup);

      towerMeshes.set(client.id, {
        group: towerGroup,
        tx,
        tz,
        baseRing,
        colorHex: colHex,
        beacon: topBeacon,
      });

      // Conduit Arch
      const startPos = new THREE.Vector3(tx, 15, tz);
      const endPos = new THREE.Vector3(0, 19, 0);
      const midPos = new THREE.Vector3(tx * 0.45, 27, tz * 0.45);
      const curve = new THREE.QuadraticBezierCurve3(startPos, midPos, endPos);
      const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.3, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: colHex,
        emissive: colHex,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.8,
      });
      scene.add(new THREE.Mesh(tubeGeo, tubeMat));

      // 4 packets per client
      for (let p = 0; p < 4; p++) {
        const isUplink = p % 2 === 0;
        packetData.push({
          clientId: client.id,
          curve,
          progress: p / 4 + idx * 0.08,
          speed: prefersReducedMotion ? 0 : 0.012 + (idx % 3) * 0.003,
          direction: isUplink ? 'uplink' : 'downlink',
          color: isUplink ? 0x10b981 : 0x00f0ff,
        });
      }
    });

    towerMeshesRef.current = towerMeshes;
    packetDataRef.current = packetData;
    trafficSignalsRef.current = trafficSignals;

    // 10. Instanced Packets (High performance, 1 single draw call for all packets!)
    const totalPackets = packetData.length;
    const packetGeo = new THREE.SphereGeometry(0.85, 8, 8);
    const packetMat = new THREE.MeshBasicMaterial();
    const instancedPackets = new THREE.InstancedMesh(packetGeo, packetMat, totalPackets);
    for (let i = 0; i < totalPackets; i++) {
      instancedPackets.setColorAt(i, _color.setHex(packetData[i].color));
    }
    instancedPackets.instanceColor!.needsUpdate = true;
    scene.add(instancedPackets);
    instancedPacketsRef.current = instancedPackets;

    // 11. Merged Static Buildings Group
    const buildingsGroup = new THREE.Group();
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x101726,
      roughness: 0.4,
      metalness: 0.3,
    });
    const blockEdgeMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f });

    const quadrantCenters = [
      { x: -55, z: -55 },
      { x: 55, z: -55 },
      { x: -55, z: 55 },
      { x: 55, z: 55 },
    ];
    quadrantCenters.forEach((qc, qIdx) => {
      for (let b = 0; b < 6; b++) {
        const offX = ((b % 3) - 1) * 14;
        const offZ = (Math.floor(b / 3) - 0.5) * 16;
        const bx = qc.x + offX;
        const bz = qc.z + offZ;
        const bw = 8 + ((b + qIdx) % 4) * 2;
        const bd = 8 + ((b * 3 + qIdx) % 4) * 2;
        const bh = 10 + ((b * 7 + qIdx * 5) % 24);

        const bBox = new THREE.BoxGeometry(bw, bh, bd);
        const bMesh = new THREE.Mesh(bBox, blockMat);
        bMesh.position.set(bx, bh / 2, bz);
        buildingsGroup.add(bMesh);

        const bEdges = new THREE.EdgesGeometry(bBox);
        const bLine = new THREE.LineSegments(bEdges, blockEdgeMat);
        bLine.position.copy(bMesh.position);
        buildingsGroup.add(bLine);
      }
    });
    scene.add(buildingsGroup);
    buildingsGroupRef.current = buildingsGroup;

    // 12. Instanced Vehicles (90 cars)
    const carCount = 80;
    const carGeo = new THREE.BoxGeometry(1.4, 0.75, 2.8);
    const carMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });
    const instancedCars = new THREE.InstancedMesh(carGeo, carMat, carCount);
    scene.add(instancedCars);
    instancedCarsRef.current = instancedCars;

    const carData: typeof carDataRef.current = [];
    const carColors = [
      new THREE.Color(0x38bdf8),
      new THREE.Color(0xfbbf24),
      new THREE.Color(0xf43f5e),
      new THREE.Color(0x10b981),
      new THREE.Color(0xa855f7),
      new THREE.Color(0xffffff),
    ];

    for (let i = 0; i < carCount; i++) {
      const isX = i % 2 === 0;
      const lane = ((i % 4) - 1.5) * 3.4;
      const speed = (0.28 + Math.random() * 0.35) * (i % 4 < 2 ? 1 : -1);
      carData.push({
        x: isX ? (Math.random() - 0.5) * 190 : lane,
        z: isX ? lane : (Math.random() - 0.5) * 190,
        speed: prefersReducedMotion ? 0 : speed,
        dir: isX ? 'x' : 'z',
        laneOffset: lane,
      });
      instancedCars.setColorAt(i, carColors[i % carColors.length]);
    }
    instancedCars.instanceColor!.needsUpdate = true;
    carDataRef.current = carData;

    // Cached container dimensions to avoid layout thrashing in 60fps animate loop
    let cachedWidth = width;
    let cachedHeight = height;

    // Resize
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      cachedWidth = container.clientWidth || 800;
      cachedHeight = isSecondViewport ? 360 : 560;
      cameraRef.current.aspect = cachedWidth / cachedHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(cachedWidth, cachedHeight);
    };
    window.addEventListener('resize', handleResize);

    // 13. High-Performance Render Loop with Adaptive Quality Check
    let lastTime = performance.now();
    let frameCount = 0;
    let lowFpsCounter = 0;
    let isAdaptiveLowered = false;

    const animate = (time: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      // Check tab visibility - pause when tab is hidden
      if (document.hidden) return;

      frameCount++;
      if (time - lastTime >= 1000) {
        const currentFps = frameCount;
        if (fpsTextRef.current) {
          fpsTextRef.current.textContent = `${currentFps} FPS`;
        }

        // Adaptive Quality: if FPS stays < 40 for 3 seconds, lower pixel ratio
        if (currentFps < 40 && !isAdaptiveLowered) {
          lowFpsCounter++;
          if (lowFpsCounter >= 3) {
            renderer.setPixelRatio(1.0);
            isAdaptiveLowered = true;
            if (qualityTextRef.current) {
              qualityTextRef.current.textContent = 'Auto (1.0x)';
            }
          }
        } else {
          lowFpsCounter = 0;
        }

        frameCount = 0;
        lastTime = time;
      }

      const tSec = time * 0.001;
      const isRunning = simulationStatusRef.current === 'running';

      // Camera Glide
      if (camTransitionRef.current.active && cameraRef.current && controlsRef.current) {
        const trans = camTransitionRef.current;
        trans.progress += 0.05;
        if (trans.progress >= 1.0) {
          trans.progress = 1.0;
          trans.active = false;
        }
        cameraRef.current.position.lerp(trans.targetPos, 0.12);
        controlsRef.current.target.lerp(trans.targetLook, 0.12);
      }

      // Aggregator Rings
      if (!prefersReducedMotion) {
        serverRingsRef.current.forEach((ring, idx) => {
          const speed = (idx === 0 ? 1 : -1) * (isRunning ? 2.4 : 0.8);
          ring.rotation.z = tSec * speed;
        });
      }

      // Traffic Signals
      const cycleTime = tSec % 8;
      const isGreen = cycleTime < 4.5;
      const isYellow = cycleTime >= 4.5 && cycleTime < 6.0;

      trafficSignalsRef.current.forEach((sig) => {
        const rMat = sig.redMesh.material as THREE.MeshBasicMaterial;
        const yMat = sig.yellowMesh.material as THREE.MeshBasicMaterial;
        const gMat = sig.greenMesh.material as THREE.MeshBasicMaterial;
        if (isGreen) {
          gMat.color.setHex(0x10b981);
          yMat.color.setHex(0x332000);
          rMat.color.setHex(0x330000);
        } else if (isYellow) {
          gMat.color.setHex(0x003311);
          yMat.color.setHex(0xfbbf24);
          rMat.color.setHex(0x330000);
        } else {
          gMat.color.setHex(0x003311);
          yMat.color.setHex(0x332000);
          rMat.color.setHex(0xef4444);
        }
      });

      // Animate Vehicles with Event Shock slowing/surging
      const activeShock = shockResultRef.current?.type || 'none';
      const affectedNode = shockResultRef.current?.affectedClientId;

      if (instancedCarsRef.current && carDataRef.current && !prefersReducedMotion) {
        const cars = carDataRef.current;
        const isRed = cycleTime >= 6.0;

        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          let currentSpd = c.speed * (isRunning ? 1.25 : 1.0);

          // Check if affected by event shock
          if (activeShock === 'accident' && (affectedNode === 'client_3' || affectedNode === 'all')) {
            if (Math.abs(c.x) > 40 && Math.abs(c.z) > 40) currentSpd *= 0.25; // accident crawl
          } else if (activeShock === 'heavy_rain') {
            currentSpd *= 0.6; // citywide weather slow down
          } else if (activeShock === 'festival' && (affectedNode === 'client_5' || affectedNode === 'all')) {
            if (Math.abs(c.x) < 30 && Math.abs(c.z) < 30) currentSpd *= 1.8; // festival rush
          }

          if (isRed && ((c.dir === 'x' && Math.abs(c.x) > 12 && Math.abs(c.x) < 24) || (c.dir === 'z' && Math.abs(c.z) > 12 && Math.abs(c.z) < 24))) {
            currentSpd *= 0.15;
          }

          if (c.dir === 'x') {
            c.x += currentSpd;
            if (c.x > 105) c.x = -105;
            if (c.x < -105) c.x = 105;
            _dummy.position.set(c.x, 0.45, c.laneOffset);
            _dummy.rotation.set(0, c.speed > 0 ? 0 : Math.PI, 0);
          } else {
            c.z += currentSpd;
            if (c.z > 105) c.z = -105;
            if (c.z < -105) c.z = 105;
            _dummy.position.set(c.laneOffset, 0.45, c.z);
            _dummy.rotation.set(0, c.speed > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
          }
          _dummy.updateMatrix();
          instancedCarsRef.current.setMatrixAt(i, _dummy.matrix);
        }
        instancedCarsRef.current.instanceMatrix.needsUpdate = true;
      }

      // Animate Packets InstancedMesh
      if (instancedPacketsRef.current && packetDataRef.current && !prefersReducedMotion) {
        const packets = packetDataRef.current;
        for (let i = 0; i < packets.length; i++) {
          const p = packets[i];
          const baseSpd = isRunning ? p.speed * 2.2 : p.speed * 0.9;
          p.progress = (p.progress + baseSpd) % 1.0;
          const t = p.direction === 'uplink' ? p.progress : 1.0 - p.progress;
          const pos = p.curve.getPoint(t);
          _dummy.position.copy(pos);
          _dummy.updateMatrix();
          instancedPacketsRef.current.setMatrixAt(i, _dummy.matrix);
        }
        instancedPacketsRef.current.instanceMatrix.needsUpdate = true;
      }

      // Update Screen Projections for DOM Badges using cached dimensions (zero reflows!)
      if (cameraRef.current && mountRef.current) {
        const width = cachedWidth;
        const height = cachedHeight;
        const cam = cameraRef.current;
        const currentClients = clientsRef.current;

        currentClients.forEach((c) => {
          const el = clientLabelRefs.current[c.id];
          const tower = towerMeshesRef.current.get(c.id);
          if (!el || !tower) return;

          _tempVec.set(tower.tx, 23.5, tower.tz);
          _tempVec.project(cam);
          const isVisible = _tempVec.z < 1.0 && _tempVec.z > -1.0;
          if (isVisible) {
            const screenX = (_tempVec.x * 0.5 + 0.5) * width;
            const screenY = (-(_tempVec.y * 0.5) + 0.5) * height;
            el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0px) translate(-50%, -100%)`;
            el.style.opacity = '1';
          } else {
            el.style.opacity = '0';
          }
        });

        if (serverLabelRef.current) {
          _tempVec.set(0, 32.5, 0);
          _tempVec.project(cam);
          const isVisible = _tempVec.z < 1.0 && _tempVec.z > -1.0;
          if (isVisible) {
            const screenX = (_tempVec.x * 0.5 + 0.5) * width;
            const screenY = (-(_tempVec.y * 0.5) + 0.5) * height;
            serverLabelRef.current.style.transform = `translate3d(${screenX}px, ${screenY}px, 0px) translate(-50%, -100%)`;
            serverLabelRef.current.style.opacity = '1';
          } else {
            serverLabelRef.current.style.opacity = '0';
          }
        }
      }

      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // Full disposal on unmount (Phase 2 Requirement 4)
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);

      groundGeo.dispose();
      groundMat.dispose();
      plazaGeo.dispose();
      plazaMat.dispose();
      spireGeo.dispose();
      roadMat.dispose();
      carGeo.dispose();
      carMat.dispose();
      packetGeo.dispose();
      packetMat.dispose();
      renderer.dispose();
    };
  }, [isSecondViewport]);

  // Zero-cost dynamic theme update (no WebGL context recreation, 0ms lag!)
  useEffect(() => {
    if (!sceneRef.current) return;
    const isDark = theme === 'dark';
    const bg = isDark ? 0x070b14 : 0xf1f5f9;
    sceneRef.current.background = new THREE.Color(bg);
    if (sceneRef.current.fog) {
      sceneRef.current.fog.color.setHex(bg);
    }
    if (groundRef.current) {
      const mat = groundRef.current.material as THREE.MeshStandardMaterial;
      mat.color.setHex(isDark ? 0x080e1a : 0xe2e8f0);
    }
  }, [theme]);

  // Toggle building visibility in ultra-clear mode
  useEffect(() => {
    if (buildingsGroupRef.current) {
      buildingsGroupRef.current.visible = !ultraClearMode;
    }
  }, [ultraClearMode]);

  const handleFlyTo = useCallback(
    (presetKey: string, pos: [number, number, number], look: [number, number, number]) => {
      setActiveViewPreset(presetKey);
      camTransitionRef.current = {
        active: true,
        targetPos: new THREE.Vector3(...pos),
        targetLook: new THREE.Vector3(...look),
        progress: 0,
      };
    },
    []
  );

  const handleFocusClient = (clientId: string) => {
    onSelectClient(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const { x, z } = getTowerPos(client);
    handleFlyTo(`client-${clientId}`, [x + 22, 24, z + 24], [x, 12, z]);
  };

  const handleCaptureScreenshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `cogniflow_3d_round_${currentRound}.png`;
    a.click();
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#060911] shadow-2xl select-none transition-colors">
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={mountRef}
        className={`w-full ${isSecondViewport ? 'h-[360px]' : 'h-[560px]'} cursor-grab active:cursor-grabbing`}
      />

      {/* Screen-Projected DOM Badges */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Central Server Spire Projected Badge */}
        <div
          ref={serverLabelRef}
          className="absolute top-0 left-0 pointer-events-auto"
          style={{ willChange: 'transform' }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border border-cyan-400/80 bg-white/95 dark:bg-slate-950/90 text-cyan-700 dark:text-cyan-200 shadow-xl shadow-cyan-950/30">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span>Central FedAvg Hub</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-600 dark:text-cyan-300">
              θ_global (961 params)
            </span>
          </div>
        </div>

        {/* 5 Edge Client Intersections Projected Badges */}
        {clients.map((client) => {
          const isSelected = selectedClientId === client.id;
          return (
            <div
              key={client.id}
              ref={(el) => {
                clientLabelRefs.current[client.id] = el;
              }}
              className="absolute top-0 left-0 pointer-events-auto"
              style={{ willChange: 'transform' }}
            >
              <button
                onClick={() => handleFocusClient(client.id)}
                className={`flex flex-col items-start p-1.5 px-2.5 rounded-xl shadow-xl border transition-all text-left cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 border-cyan-200 ring-2 ring-cyan-300 scale-105'
                    : 'bg-white/95 dark:bg-slate-950/90 text-slate-800 dark:text-white border-slate-300 dark:border-slate-700 hover:border-cyan-400'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: client.color }} />
                  <span className="font-bold text-[11px] whitespace-nowrap">
                    {client.name.split(':')[0]}
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                      isSelected
                        ? 'bg-slate-950 text-cyan-300'
                        : client.isOnline
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {client.isOnline ? client.status : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono opacity-90">
                  <span className="opacity-75">{client.archetype.split('/')[0].trim()}</span>
                  <span>·</span>
                  <span className="font-bold">
                    {client.currentMae > 0 ? `${client.currentMae.toFixed(1)} v/h` : '--'}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Top HUD: Real-time Live Round, FPS via DOM ref, and Quality Indicator */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/90 text-xs shadow-lg text-slate-800 dark:text-white">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span className="font-bold tracking-tight">CogniFlow 3D Engine</span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="font-mono text-cyan-600 dark:text-cyan-300 font-bold">
            Round {currentRound}/{totalRounds}
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span ref={fpsTextRef} className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
            60 FPS
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span ref={qualityTextRef} className="font-mono text-slate-500 dark:text-slate-400 text-[10px]">
            Quality: Auto
          </span>
        </div>

        {/* Top-Right Quick View Mode Toggles */}
        {!isSecondViewport && (
          <div className="flex items-center gap-2 pointer-events-auto">
            {onToggleCompare && (
              <button
                onClick={onToggleCompare}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-md transition-all cursor-pointer ${
                  isCompareMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-white/95 dark:bg-slate-950/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-cyan-500 dark:hover:text-white'
                }`}
                title="Toggle side-by-side synchronized comparison"
              >
                {isCompareMode ? 'Exit Compare' : 'Compare View'}
              </button>
            )}

            <button
              onClick={() => setIsCinemaMode(!isCinemaMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-md transition-all cursor-pointer ${
                isCinemaMode
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-white/95 dark:bg-slate-950/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-cyan-500 dark:hover:text-white'
              }`}
              title="Toggle Clean View (Hides HUD overlays for 100% unobstructed view)"
            >
              {isCinemaMode ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              <span>{isCinemaMode ? 'Show Controls' : 'Clean View'}</span>
            </button>

            <button
              onClick={handleCaptureScreenshot}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/90 text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-300 text-xs shadow-md transition-colors cursor-pointer"
              title="Export 3D PNG Screenshot"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Node Jump Pills */}
      {!isCinemaMode && !isSecondViewport && (
        <div className="absolute top-16 left-4 right-4 flex items-center gap-1.5 overflow-x-auto pb-1 pointer-events-none no-scrollbar">
          <span className="text-[10px] font-mono px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/85 text-slate-600 dark:text-slate-400 pointer-events-auto shadow-xs">
            Focus:
          </span>
          {clients.map((c) => (
            <button
              key={`jump-${c.id}`}
              onClick={() => handleFocusClient(c.id)}
              className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shadow-md border cursor-pointer ${
                selectedClientId === c.id
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 scale-105'
                  : 'bg-white/90 dark:bg-slate-950/85 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.name.split(':')[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Simulator HUD Telemetry Strip & Unified Bottom Dock */}
      {!isCinemaMode && !isSecondViewport && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-col md:flex-row md:items-end justify-between gap-3 pointer-events-none">
          {/* Real-time Simulator HUD: live round, cumulative bytes, current MAE + RMSE strictly live here */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 text-slate-700 dark:text-slate-300 text-[11px] pointer-events-auto space-y-1.5 max-w-sm shadow-xl font-mono">
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between font-sans">
              <span>Live Simulator Telemetry</span>
              <span className="text-cyan-600 dark:text-cyan-400">
                FedAvg · {config.modelArchitecture === 'mlp' ? 'MLP (961p)' : 'GRU (881p)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">Current MAE</span>
                <span className="text-cyan-600 dark:text-cyan-300 font-bold">
                  {latestLog ? `${latestLog.globalTestMae.toFixed(1)} veh/hr` : '--'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Current RMSE</span>
                <span className="text-slate-800 dark:text-slate-200 font-bold">
                  {latestLog ? `${latestLog.globalTestRmse.toFixed(1)} veh/hr` : '--'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Cumulative Payload</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {latestLog ? `${(latestLog.cumulativeBytes / 1024).toFixed(1)} KB` : '0 KB'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Consensus Drift</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  {latestLog ? latestLog.clientDrift.toFixed(4) : '0.0000'}
                </span>
              </div>
            </div>
          </div>

          {/* Consolidated Playback Controls */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 text-slate-800 dark:text-slate-200 shadow-2xl pointer-events-auto">
            <button
              onClick={() => stepRound()}
              disabled={simulationStatus === 'running'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-500 text-slate-800 dark:text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
              title="Step 1 federated round"
            >
              <StepForward className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Step</span>
            </button>

            <button
              onClick={toggleSimulation}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer ${
                simulationStatus === 'running'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              }`}
            >
              {simulationStatus === 'running' ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{currentRound >= totalRounds ? 'Restart' : 'Run Sim'}</span>
                </>
              )}
            </button>

            <div className="flex items-center p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs">
              <button
                onClick={() => handleFlyTo('iso', [65, 55, 70], [0, 6, 0])}
                className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeViewPreset === 'iso' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => handleFlyTo('top', [0, 135, 0.1], [0, 0, 0])}
                className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeViewPreset === 'top' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Top-Down
              </button>
              <button
                onClick={() => handleFlyTo('server', [18, 22, 22], [0, 18, 0])}
                className={`px-2.5 py-1 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeViewPreset === 'server' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Server Spire
              </button>
            </div>

            <button
              onClick={() => setUltraClearMode(!ultraClearMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                ultraClearMode
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-slate-950 dark:hover:text-white'
              }`}
              title="Toggle high-contrast schematic mode"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{ultraClearMode ? 'Schematic: ON' : 'Clear Mode'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
