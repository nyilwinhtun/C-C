import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm"

export interface LipSyncWeights {
  /** Low-mid vocal openness (300–1000 Hz) */
  aa: number
  /** Rounded vowel openness derived from low-mid */
  oh: number
  /** Tight rounded vowel openness */
  ou: number
  /** High-mid mouth spread (1500–3500 Hz) */
  ee: number
  /** Secondary high-mid spread */
  ih: number
  /** Overall vocal energy (0–1) */
  energy: number
}

export interface LipSyncAnalyzer {
  analyser: AnalyserNode
  update: (delta?: number) => LipSyncWeights
  reset: () => void
  getWeights: () => LipSyncWeights
  dispose: () => void
}

export interface CreateLipSyncAnalyzerOptions {
  audioContext: AudioContext
  sourceNode: AudioNode
  fftSize?: number
  smoothingTimeConstant?: number
  /** Connect analyser output to destination (default: false; caller routes sourceNode directly) */
  connectToDestination?: boolean
}

function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * Math.min(1, Math.max(0, alpha))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Computes average normalized energy (0–1) within [minHz, maxHz] from FFT byte frequency data.
 */
function sampleBandEnergy(
  freqData: Uint8Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
): number {
  const nyquist = sampleRate / 2
  const binCount = freqData.length
  const startBin = Math.max(0, Math.floor((minHz / nyquist) * binCount))
  const endBin = Math.min(binCount - 1, Math.ceil((maxHz / nyquist) * binCount))

  if (endBin < startBin) return 0

  let sum = 0
  let count = 0
  for (let i = startBin; i <= endBin; i++) {
    sum += freqData[i] / 255
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * Web Audio AnalyserNode lip-sync analyzer.
 * Splits playback frequencies into:
 * - Low-mid (300–1000 Hz) -> `aa` / `oh` mouth openness
 * - High-mid (1500–3500 Hz) -> `ee` / `ih` mouth spread
 * with smooth lerp interpolation.
 */
export function createLipSyncAnalyzer({
  audioContext,
  sourceNode,
  fftSize = 1024,
  smoothingTimeConstant = 0.55,
  connectToDestination = false,
}: CreateLipSyncAnalyzerOptions): LipSyncAnalyzer {
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = smoothingTimeConstant

  sourceNode.connect(analyser)
  if (connectToDestination) {
    analyser.connect(audioContext.destination)
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount)

  const state: LipSyncWeights = {
    aa: 0,
    oh: 0,
    ou: 0,
    ee: 0,
    ih: 0,
    energy: 0,
  }

  const update = (delta = 1 / 60): LipSyncWeights => {
    analyser.getByteFrequencyData(freqData)
    const sampleRate = audioContext.sampleRate || 48000

    const lowMidRaw = sampleBandEnergy(freqData, sampleRate, 300, 1000)
    const highMidRaw = sampleBandEnergy(freqData, sampleRate, 1500, 3500)

    // Noise floor gating + expressive gain curve for speech
    const lowMid = clamp01((lowMidRaw - 0.06) * 2.2)
    const highMid = clamp01((highMidRaw - 0.04) * 2.6)

    const targetAa = clamp01(lowMid * 1.05)
    const targetOh = clamp01(lowMid * 0.62 * (1 - highMid * 0.45))
    const targetOu = clamp01(lowMid * 0.48 * (1 - highMid * 0.55))
    const targetEe = clamp01(highMid * 0.95)
    const targetIh = clamp01(highMid * 0.65)
    const targetEnergy = clamp01(Math.max(targetAa, targetEe * 0.85))

    // Frame-rate independent smoothing
    const attackAlpha = 1 - Math.exp(-22 * delta)
    const releaseAlpha = 1 - Math.exp(-14 * delta)

    state.aa = lerp(state.aa, targetAa, targetAa > state.aa ? attackAlpha : releaseAlpha)
    state.oh = lerp(state.oh, targetOh, targetOh > state.oh ? attackAlpha : releaseAlpha)
    state.ou = lerp(state.ou, targetOu, targetOu > state.ou ? attackAlpha : releaseAlpha)
    state.ee = lerp(state.ee, targetEe, targetEe > state.ee ? attackAlpha : releaseAlpha)
    state.ih = lerp(state.ih, targetIh, targetIh > state.ih ? attackAlpha : releaseAlpha)
    state.energy = lerp(
      state.energy,
      targetEnergy,
      targetEnergy > state.energy ? attackAlpha : releaseAlpha
    )

    return { ...state }
  }

  const reset = () => {
    state.aa = 0
    state.oh = 0
    state.ou = 0
    state.ee = 0
    state.ih = 0
    state.energy = 0
  }

  const getWeights = (): LipSyncWeights => ({ ...state })

  const dispose = () => {
    try {
      sourceNode.disconnect(analyser)
    } catch {
      // Ignore if already disconnected
    }
    try {
      analyser.disconnect()
    } catch {
      // Ignore if already disconnected
    }
  }

  return {
    analyser,
    update,
    reset,
    getWeights,
    dispose,
  }
}

export type PresenterStudioSet =
  | "mobile_showroom"
  | "tech_podcast"
  | "soft_bokeh"
  | "custom_photo"

export type BuiltinPresenterId = "preset_1" | "preset_2" | "preset_3"

export interface BuiltinPresenterMeta {
  id: BuiltinPresenterId
  index: 1 | 2 | 3
  palette: {
    bgFrom: string
    bgTo: string
    skin: string
    hair: string
    outfit: string
    accent: string
    eye: string
    lip: string
  }
}

export const BUILTIN_PRESENTER_PRESETS: readonly BuiltinPresenterMeta[] = [
  {
    id: "preset_1",
    index: 1,
    palette: {
      bgFrom: "#FEF3C7",
      bgTo: "#FDE68A",
      skin: "#F4C7A8",
      hair: "#2A1B14",
      outfit: "#FAF5EE",
      accent: "#D97706",
      eye: "#3B2314",
      lip: "#C96B6B",
    },
  },
  {
    id: "preset_2",
    index: 2,
    palette: {
      bgFrom: "#DBEAFE",
      bgTo: "#BFDBFE",
      skin: "#DFA982",
      hair: "#1C1917",
      outfit: "#1E293B",
      accent: "#38BDF8",
      eye: "#1F2937",
      lip: "#A9635B",
    },
  },
  {
    id: "preset_3",
    index: 3,
    palette: {
      bgFrom: "#EDE9FE",
      bgTo: "#DDD6FE",
      skin: "#EFC2A4",
      hair: "#4C3B6E",
      outfit: "#27272A",
      accent: "#F59E0B",
      eye: "#312E81",
      lip: "#B85D6E",
    },
  },
] as const

export interface AvatarController {
  object: THREE.Object3D
  kind: "vrm" | "glb" | "procedural"
  update: (delta: number, elapsed: number, lip: LipSyncWeights) => void
  setOrbitRotation?: (yaw: number, pitch?: number) => void
  setAutoOrbit?: (enabled: boolean) => void
  dispose: () => void
}

interface BlinkState {
  nextBlinkAt: number
  blinkStartAt: number
  isBlinking: boolean
}

function createBlinkState(initialElapsed = 0): BlinkState {
  return {
    nextBlinkAt: initialElapsed + 2.5 + Math.random() * 2.0,
    blinkStartAt: 0,
    isBlinking: false,
  }
}

function sampleBlinkValue(blink: BlinkState, elapsed: number): number {
  const BLINK_DURATION = 0.16
  if (!blink.isBlinking && elapsed >= blink.nextBlinkAt) {
    blink.isBlinking = true
    blink.blinkStartAt = elapsed
  }

  if (!blink.isBlinking) return 0

  const progress = (elapsed - blink.blinkStartAt) / BLINK_DURATION
  if (progress >= 1) {
    blink.isBlinking = false
    blink.nextBlinkAt = elapsed + 3.0 + Math.random() * 2.0
    return 0
  }

  // Smooth triangle/sine pulse peaking at 1.0 mid-blink
  return Math.sin(progress * Math.PI)
}

/**
 * Wraps a loaded @pixiv/three-vrm VRM instance with procedural blinking,
 * head nod/sway on active vocal energy, idle chest breathing, lip-sync, and spring-bone physics.
 */
export function createVrmAvatarController(vrm: VRM): AvatarController {
  VRMUtils.removeUnnecessaryVertices(vrm.scene)
  VRMUtils.combineSkeletons(vrm.scene)

  // Rotate VRM 180 deg if VRM 0.x faces -Z; VRMUtils.rotateVRM0 handles both versions safely
  VRMUtils.rotateVRM0(vrm)

  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false
  })

  // Relax arms out of T-pose if humanoid bones exist
  const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm")
  const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm")
  const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm")
  const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm")

  if (leftUpperArm) {
    leftUpperArm.rotation.z = 1.18
    leftUpperArm.rotation.x = 0.08
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = -1.18
    rightUpperArm.rotation.x = 0.08
  }
  if (leftLowerArm) {
    leftLowerArm.rotation.y = -0.25
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.y = 0.25
  }

  const headBone = vrm.humanoid?.getNormalizedBoneNode("head")
  const neckBone = vrm.humanoid?.getNormalizedBoneNode("neck")
  const chestBone =
    vrm.humanoid?.getNormalizedBoneNode("upperChest") ??
    vrm.humanoid?.getNormalizedBoneNode("chest") ??
    vrm.humanoid?.getNormalizedBoneNode("spine")

  const blink = createBlinkState(0)
  let smoothPitch = 0
  let smoothYaw = 0
  let smoothRoll = 0

  const update = (delta: number, elapsed: number, lip: LipSyncWeights) => {
    const dt = Math.min(delta, 0.05)

    // 1. Lip-sync expressions (aa, ih, ou, ee, oh)
    const em = vrm.expressionManager
    if (em) {
      em.setValue("aa", lip.aa)
      em.setValue("ih", lip.ih)
      em.setValue("ou", lip.ou)
      em.setValue("ee", lip.ee)
      em.setValue("oh", lip.oh)

      // 2. Automatic eye blinking every 3–5s
      const blinkWeight = sampleBlinkValue(blink, elapsed)
      em.setValue("blink", blinkWeight)
    }

    // 3. Subtle head nod/sway proportional to active vocal energy (aa > 0.15)
    const isSpeaking = lip.aa > 0.15
    const vocalBoost = isSpeaking ? (lip.aa - 0.15) * 0.14 : 0
    const targetPitch = Math.sin(elapsed * 5.2) * vocalBoost + Math.sin(elapsed * 0.9) * 0.015
    const targetYaw =
      Math.sin(elapsed * 1.4) * (isSpeaking ? 0.055 : 0.025) +
      Math.cos(elapsed * 2.3) * vocalBoost * 0.35
    const targetRoll = Math.cos(elapsed * 1.1) * (isSpeaking ? 0.035 : 0.012)

    const headAlpha = 1 - Math.exp(-8 * dt)
    smoothPitch = lerp(smoothPitch, targetPitch, headAlpha)
    smoothYaw = lerp(smoothYaw, targetYaw, headAlpha)
    smoothRoll = lerp(smoothRoll, targetRoll, headAlpha)

    if (headBone) {
      headBone.rotation.x = smoothPitch
      headBone.rotation.y = smoothYaw
      headBone.rotation.z = smoothRoll
    }
    if (neckBone) {
      neckBone.rotation.x = smoothPitch * 0.4
      neckBone.rotation.y = smoothYaw * 0.35
    }

    // 4. Gentle idle chest breathing motion
    if (chestBone) {
      const breath = Math.sin(elapsed * 1.6)
      chestBone.rotation.x = breath * 0.018
      chestBone.position.y = breath * 0.0025
    }

    // 5. VRM spring-bone physics & expression updates
    vrm.update(dt)
  }

  const dispose = () => {
    VRMUtils.deepDispose(vrm.scene)
  }

  return {
    object: vrm.scene,
    kind: "vrm",
    update,
    dispose,
  }
}

/**
 * Wraps a generic .glb model with optional morph-target lip-sync (ARKit / ReadyPlayerMe / Viseme)
 * plus procedural breathing, blinking, and vocal head nod.
 */
export function createGlbAvatarController(root: THREE.Object3D): AvatarController {
  // Normalize scale and ground/center the GLB model
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)

  const maxDim = Math.max(size.y, size.x, size.z, 0.001)
  const targetHeight = 1.65
  const scale = targetHeight / maxDim
  root.scale.multiplyScalar(scale)

  // Recompute bounds after scaling so feet/base sit at y = 0
  const scaledBox = new THREE.Box3().setFromObject(root)
  const scaledCenter = new THREE.Vector3()
  scaledBox.getCenter(scaledCenter)
  root.position.x -= scaledCenter.x
  root.position.z -= scaledCenter.z
  root.position.y -= scaledBox.min.y

  const morphMeshes: THREE.Mesh[] = []
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      mesh.frustumCulled = false
      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        morphMeshes.push(mesh)
      }
    }
  })

  const baseY = root.position.y
  const blink = createBlinkState(0)
  let smoothPitch = 0
  let smoothYaw = 0
  let userOrbitYaw = 0
  let userOrbitPitch = 0
  let autoOrbitEnabled = false
  let autoOrbitAngle = 0

  const applyMorph = (names: string[], value: number) => {
    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary
      const infl = mesh.morphTargetInfluences
      if (!dict || !infl) continue
      for (const name of names) {
        if (name in dict) {
          infl[dict[name]] = value
        }
      }
    }
  }

  const update = (delta: number, elapsed: number, lip: LipSyncWeights) => {
    const dt = Math.min(delta, 0.05)
    const blinkWeight = sampleBlinkValue(blink, elapsed)

    applyMorph(["jawOpen", "mouthOpen", "viseme_aa", "aa", "Fcl_MTH_A"], lip.aa)
    applyMorph(["viseme_O", "oh", "Fcl_MTH_O", "mouthFunnel"], lip.oh)
    applyMorph(["viseme_U", "ou", "Fcl_MTH_U", "mouthPucker"], lip.ou)
    applyMorph(["viseme_E", "ee", "mouthSmile", "Fcl_MTH_E"], lip.ee)
    applyMorph(["viseme_I", "ih", "Fcl_MTH_I"], lip.ih)
    applyMorph(["eyeBlinkLeft", "eyeBlinkRight", "blink", "Fcl_EYE_Close"], blinkWeight)

    if (autoOrbitEnabled) {
      autoOrbitAngle = (autoOrbitAngle + dt * 0.75) % (Math.PI * 2)
    }

    const isSpeaking = lip.aa > 0.15 || lip.energy > 0.15
    const vocalBoost = isSpeaking ? Math.max(lip.aa, lip.energy) * 0.08 : 0
    const targetPitch = Math.sin(elapsed * 5.0) * vocalBoost + userOrbitPitch
    const targetYaw =
      Math.sin(elapsed * 1.15) * (isSpeaking ? 0.12 : 0.06) + userOrbitYaw + autoOrbitAngle

    const alpha = 1 - Math.exp(-8 * dt)
    smoothPitch = lerp(smoothPitch, targetPitch, alpha)
    smoothYaw = lerp(smoothYaw, targetYaw, alpha)

    root.rotation.x = smoothPitch
    root.rotation.y = smoothYaw
    root.position.y =
      baseY + Math.sin(elapsed * 1.6) * 0.012 + (isSpeaking ? lip.energy * 0.015 : 0)
  }

  const setOrbitRotation = (yaw: number, pitch = 0) => {
    userOrbitYaw = yaw
    userOrbitPitch = Math.max(-0.55, Math.min(0.55, pitch))
  }

  const setAutoOrbit = (enabled: boolean) => {
    autoOrbitEnabled = enabled
    if (!enabled) {
      autoOrbitAngle = 0
    }
  }

  const dispose = () => {
    disposeObject3D(root)
  }

  return {
    object: root,
    kind: "glb",
    update,
    setOrbitRotation,
    setAutoOrbit,
    dispose,
  }
}

/**
 * Builds one of three distinct, unnamed, instant-ready stylized 3D presenter busts
 * with smooth mouth/jaw lip-sync morphs, blinking eyelids, vocal-reactive head nod,
 * eyebrow expressiveness, idle chest breathing, and full Three.js disposal.
 */
export function createProceduralPresenterController(
  presetId: BuiltinPresenterId = "preset_1"
): AvatarController {
  const root = new THREE.Group()
  root.name = `ProceduralPresenter_${presetId}`

  const meta =
    BUILTIN_PRESENTER_PRESETS.find((p) => p.id === presetId) ?? BUILTIN_PRESENTER_PRESETS[0]
  const pal = meta.palette

  // Shared PBR materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.skin),
    roughness: 0.48,
    metalness: 0.02,
  })
  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.hair),
    roughness: 0.36,
    metalness: 0.14,
  })
  const outfitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.outfit),
    roughness: 0.58,
    metalness: 0.06,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.accent),
    roughness: 0.25,
    metalness: 0.72,
  })
  const innerShirtMat = new THREE.MeshStandardMaterial({
    color: presetId === "preset_2" ? 0xf8fafc : presetId === "preset_1" ? 0x1c1917 : 0x18181b,
    roughness: 0.65,
    metalness: 0.02,
  })
  const scleraMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.15,
    metalness: 0.02,
  })
  const irisMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.eye),
    roughness: 0.14,
    metalness: 0.1,
  })
  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0d,
    roughness: 0.1,
    metalness: 0.05,
  })
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const lipMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.lip),
    roughness: 0.34,
    metalness: 0.04,
  })
  const mouthCavityMat = new THREE.MeshStandardMaterial({
    color: 0x3a1219,
    roughness: 0.85,
    metalness: 0.0,
  })
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xfdfbf7,
    roughness: 0.25,
    metalness: 0.02,
  })
  const blushMat = new THREE.MeshStandardMaterial({
    color: 0xe88b8b,
    roughness: 0.7,
    metalness: 0.0,
    transparent: true,
    opacity: presetId === "preset_2" ? 0.14 : 0.24,
  })
  const browMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.hair).multiplyScalar(0.85),
    roughness: 0.45,
    metalness: 0.05,
  })

  // Torso / Shoulders Group (animated for idle breathing)
  const torsoGroup = new THREE.Group()
  torsoGroup.position.set(0, 1.02, 0)
  root.add(torsoGroup)

  // Sculpted upper torso & rounded shoulders
  const torsoGeom = new THREE.CylinderGeometry(0.185, 0.23, 0.42, 32)
  const torsoMesh = new THREE.Mesh(torsoGeom, outfitMat)
  torsoMesh.position.set(0, -0.02, 0)
  torsoMesh.scale.set(1.18, 1, 0.62)
  torsoGroup.add(torsoMesh)

  const shoulderGeom = new THREE.SphereGeometry(0.115, 24, 18)
  const leftShoulder = new THREE.Mesh(shoulderGeom, outfitMat)
  leftShoulder.position.set(-0.215, 0.13, -0.005)
  leftShoulder.scale.set(1.08, 0.86, 0.78)
  torsoGroup.add(leftShoulder)

  const rightShoulder = new THREE.Mesh(shoulderGeom, outfitMat)
  rightShoulder.position.set(0.215, 0.13, -0.005)
  rightShoulder.scale.set(1.08, 0.86, 0.78)
  torsoGroup.add(rightShoulder)

  // Inner shirt / collar V-panel
  const chestInset = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.055, 0.24, 24),
    innerShirtMat
  )
  chestInset.position.set(0, 0.09, 0.082)
  chestInset.scale.set(1.0, 1.0, 0.42)
  torsoGroup.add(chestInset)

  // Tailored blazer lapels
  const lapelGeom = new THREE.BoxGeometry(0.052, 0.21, 0.024)
  const leftLapel = new THREE.Mesh(lapelGeom, outfitMat)
  leftLapel.position.set(-0.078, 0.095, 0.105)
  leftLapel.rotation.set(0.1, 0.22, -0.26)
  torsoGroup.add(leftLapel)

  const rightLapel = new THREE.Mesh(lapelGeom, outfitMat)
  rightLapel.position.set(0.078, 0.095, 0.105)
  rightLapel.rotation.set(0.1, -0.22, 0.26)
  torsoGroup.add(rightLapel)

  // Preset-specific torso accents
  if (presetId === "preset_1") {
    // Elegant gold lapel pin
    const pin = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), accentMat)
    pin.position.set(0.088, 0.115, 0.125)
    torsoGroup.add(pin)
  } else if (presetId === "preset_2") {
    // Wireless studio lapel mic clip + LED dot
    const micBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.036, 0.016),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.5 })
    )
    micBody.position.set(0.075, 0.095, 0.124)
    torsoGroup.add(micBody)
    const micLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    )
    micLed.position.set(0.075, 0.105, 0.134)
    torsoGroup.add(micLed)
  } else {
    // Turtleneck collar + warm metallic trim ring
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.078, 0.065, 24),
      innerShirtMat
    )
    collar.position.set(0, 0.21, 0.0)
    torsoGroup.add(collar)
    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.006, 12, 32), accentMat)
    trimRing.rotation.x = Math.PI / 2
    trimRing.position.set(0, 0.195, 0.004)
    torsoGroup.add(trimRing)
  }

  // Neck Group
  const neckGroup = new THREE.Group()
  neckGroup.position.set(0, 0.20, 0)
  torsoGroup.add(neckGroup)

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.14, 24), skinMat)
  neckMesh.position.set(0, 0.055, 0)
  neckGroup.add(neckMesh)

  // Head Group (pivots naturally at top of neck for nod & sway)
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.21, 0.01)
  neckGroup.add(headGroup)

  // Main cranium + softer jaw contour
  const headWidth = presetId === "preset_2" ? 0.99 : 0.94
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 36, 32), skinMat)
  headMesh.scale.set(headWidth, 1.07, 0.96)
  headGroup.add(headMesh)

  // Subtle sculpted chin
  const chinMesh = new THREE.Mesh(new THREE.SphereGeometry(0.068, 24, 20), skinMat)
  chinMesh.position.set(0, -0.095, 0.048)
  chinMesh.scale.set(presetId === "preset_2" ? 1.05 : 0.88, 0.78, 0.85)
  headGroup.add(chinMesh)

  // Ears
  const earGeom = new THREE.SphereGeometry(0.028, 16, 14)
  const leftEar = new THREE.Mesh(earGeom, skinMat)
  leftEar.position.set(-0.138 * headWidth, -0.005, -0.01)
  leftEar.scale.set(0.5, 1.15, 0.75)
  headGroup.add(leftEar)

  const rightEar = new THREE.Mesh(earGeom, skinMat)
  rightEar.position.set(0.138 * headWidth, -0.005, -0.01)
  rightEar.scale.set(0.5, 1.15, 0.75)
  headGroup.add(rightEar)

  // Nose (refined stylized bridge + tip)
  const noseMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.024, 8, 14), skinMat)
  noseMesh.position.set(0, -0.012, 0.136)
  noseMesh.rotation.x = -0.18
  headGroup.add(noseMesh)

  // Soft cheek blush
  const blushGeom = new THREE.CircleGeometry(0.028, 20)
  const leftBlush = new THREE.Mesh(blushGeom, blushMat)
  leftBlush.position.set(-0.072, -0.032, 0.123)
  leftBlush.rotation.y = -0.45
  headGroup.add(leftBlush)

  const rightBlush = new THREE.Mesh(blushGeom, blushMat)
  rightBlush.position.set(0.072, -0.032, 0.123)
  rightBlush.rotation.y = 0.45
  headGroup.add(rightBlush)

  // Eyes + Eyelids (rigged for smooth blinking)
  const buildEye = (side: -1 | 1) => {
    const eyeGroup = new THREE.Group()
    eyeGroup.position.set(side * 0.052, 0.022, 0.118)
    eyeGroup.rotation.y = side * 0.16

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 18), scleraMat)
    sclera.scale.set(1.05, 0.92, 0.65)
    eyeGroup.add(sclera)

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 18, 16), irisMat)
    iris.position.set(0, 0, 0.011)
    iris.scale.set(1.0, 1.0, 0.45)
    eyeGroup.add(iris)

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 14, 12), pupilMat)
    pupil.position.set(0, 0, 0.0155)
    pupil.scale.set(1.0, 1.0, 0.35)
    eyeGroup.add(pupil)

    // Specular catchlight
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 10), highlightMat)
    glint.position.set(0.0055, 0.0055, 0.0185)
    eyeGroup.add(glint)

    // Upper eyelid cover (scales smoothly down during blink)
    const upperLid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0265, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      skinMat
    )
    upperLid.scale.set(1.08, 0.95, 0.72)
    upperLid.rotation.x = -0.68
    eyeGroup.add(upperLid)

    // Eyelash rim line
    const lash = new THREE.Mesh(
      new THREE.TorusGeometry(0.023, 0.0024, 8, 18, Math.PI),
      browMat
    )
    lash.position.set(0, 0.004, 0.014)
    lash.rotation.z = 0
    eyeGroup.add(lash)

    headGroup.add(eyeGroup)
    return { eyeGroup, upperLid }
  }

  const leftEye = buildEye(-1)
  const rightEye = buildEye(1)

  // Eyebrows (expressive vertical lift on vocal energy)
  const browGeom = new THREE.CapsuleGeometry(0.0048, 0.032, 6, 12)
  const leftBrow = new THREE.Mesh(browGeom, browMat)
  leftBrow.position.set(-0.052, 0.058, 0.125)
  leftBrow.rotation.set(0, -0.18, Math.PI / 2 - 0.1)
  headGroup.add(leftBrow)

  const rightBrow = new THREE.Mesh(browGeom, browMat)
  rightBrow.position.set(0.052, 0.058, 0.125)
  rightBrow.rotation.set(0, 0.18, Math.PI / 2 + 0.1)
  headGroup.add(rightBrow)

  // Mouth / Jaw Lip-Sync Rig
  const mouthGroup = new THREE.Group()
  mouthGroup.position.set(0, -0.062, 0.124)
  headGroup.add(mouthGroup)

  const mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.024, 18, 14), mouthCavityMat)
  mouthCavity.scale.set(1.15, 0.12, 0.42)
  mouthCavity.position.set(0, 0, -0.002)
  mouthGroup.add(mouthCavity)

  const upperTeeth = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.009, 0.008), teethMat)
  upperTeeth.position.set(0, 0.007, 0.004)
  upperTeeth.visible = false
  mouthGroup.add(upperTeeth)

  const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.036, 8, 14), lipMat)
  upperLip.rotation.z = Math.PI / 2
  upperLip.position.set(0, 0.005, 0.007)
  mouthGroup.add(upperLip)

  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.032, 8, 14), lipMat)
  lowerLip.rotation.z = Math.PI / 2
  lowerLip.position.set(0, -0.005, 0.006)
  mouthGroup.add(lowerLip)

  // Distinct Stylized Hair & Accessories per Preset
  if (presetId === "preset_1") {
    // Sleek side-parted studio bob with soft bangs & framing side strands
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.158, 32, 24), hairMat)
    crown.position.set(0, 0.034, -0.016)
    crown.scale.set(1.03, 1.02, 1.04)
    headGroup.add(crown)

    const backBob = new THREE.Mesh(new THREE.SphereGeometry(0.152, 28, 22), hairMat)
    backBob.position.set(0, -0.06, -0.055)
    backBob.scale.set(1.06, 1.18, 0.85)
    headGroup.add(backBob)

    const sideLeft = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.16, 10, 16), hairMat)
    sideLeft.position.set(-0.128, -0.045, 0.022)
    sideLeft.rotation.z = 0.12
    headGroup.add(sideLeft)

    const sideRight = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.16, 10, 16), hairMat)
    sideRight.position.set(0.128, -0.045, 0.022)
    sideRight.rotation.z = -0.12
    headGroup.add(sideRight)

    const bangSweep = new THREE.Mesh(new THREE.SphereGeometry(0.095, 22, 16), hairMat)
    bangSweep.position.set(0.032, 0.105, 0.086)
    bangSweep.scale.set(1.38, 0.56, 0.72)
    bangSweep.rotation.z = -0.22
    headGroup.add(bangSweep)

    // Subtle pearl/gold earrings
    const earringGeom = new THREE.SphereGeometry(0.011, 14, 12)
    const leftEarring = new THREE.Mesh(earringGeom, accentMat)
    leftEarring.position.set(-0.135, -0.036, 0.002)
    headGroup.add(leftEarring)
    const rightEarring = new THREE.Mesh(earringGeom, accentMat)
    rightEarring.position.set(0.135, -0.036, 0.002)
    headGroup.add(rightEarring)
  } else if (presetId === "preset_2") {
    // Crisp modern short-fade + textured swept quiff
    const baseCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.154, 30, 22, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    )
    baseCap.position.set(0, 0.026, -0.012)
    baseCap.scale.set(1.03, 1.0, 1.02)
    headGroup.add(baseCap)

    const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.092, 24, 18), hairMat)
    quiff.position.set(0.015, 0.136, 0.042)
    quiff.scale.set(1.32, 0.68, 1.12)
    quiff.rotation.set(-0.18, 0, -0.14)
    headGroup.add(quiff)

    const sideWave = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.075, 8, 14), hairMat)
    sideWave.position.set(-0.08, 0.115, 0.05)
    sideWave.rotation.set(0.15, 0, 1.25)
    headGroup.add(sideWave)

    // Stylish thin-frame round studio glasses
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.25,
      metalness: 0.75,
    })
    const ringGeom = new THREE.TorusGeometry(0.036, 0.0032, 10, 28)
    const leftRim = new THREE.Mesh(ringGeom, frameMat)
    leftRim.position.set(-0.052, 0.022, 0.144)
    leftRim.rotation.y = -0.1
    headGroup.add(leftRim)

    const rightRim = new THREE.Mesh(ringGeom, frameMat)
    rightRim.position.set(0.052, 0.022, 0.144)
    rightRim.rotation.y = 0.1
    headGroup.add(rightRim)

    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.034, 10), frameMat)
    bridge.rotation.z = Math.PI / 2
    bridge.position.set(0, 0.026, 0.146)
    headGroup.add(bridge)
  } else {
    // Chic asymmetrical layered studio hair + sleek broadcast earpiece
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.158, 32, 24), hairMat)
    crown.position.set(0, 0.035, -0.014)
    crown.scale.set(1.04, 1.04, 1.04)
    headGroup.add(crown)

    const sweep = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.13, 10, 16), hairMat)
    sweep.position.set(-0.065, 0.095, 0.088)
    sweep.rotation.set(0.22, -0.15, 0.92)
    headGroup.add(sweep)

    const sideAccent = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.14, 10, 16), hairMat)
    sideAccent.position.set(-0.125, -0.025, 0.02)
    sideAccent.rotation.z = 0.15
    headGroup.add(sideAccent)

    const backLayer = new THREE.Mesh(new THREE.SphereGeometry(0.142, 26, 20), hairMat)
    backLayer.position.set(0, -0.03, -0.058)
    backLayer.scale.set(1.02, 1.06, 0.84)
    headGroup.add(backLayer)

    // Sleek broadcast headset earpiece + boom mic
    const earPod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.016, 20),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.25, metalness: 0.7 })
    )
    earPod.rotation.z = Math.PI / 2
    earPod.position.set(0.146, -0.005, 0.002)
    headGroup.add(earPod)

    const earRing = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.003, 10, 22), accentMat)
    earRing.rotation.y = Math.PI / 2
    earRing.position.set(0.155, -0.005, 0.002)
    headGroup.add(earRing)

    const micBoom = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.003, 0.095, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.3, metalness: 0.7 })
    )
    micBoom.position.set(0.118, -0.048, 0.072)
    micBoom.rotation.set(1.1, 0.25, 0.65)
    headGroup.add(micBoom)
  }

  // Animation state
  const blink = createBlinkState(0)
  let smoothPitch = 0
  let smoothYaw = 0
  let smoothRoll = 0
  let smoothOpen = 0
  let smoothRound = 0
  let smoothWide = 0
  let userOrbitYaw = 0
  let userOrbitPitch = 0
  let autoOrbitEnabled = false
  let autoOrbitAngle = 0

  const baseTorsoY = torsoGroup.position.y

  const update = (delta: number, elapsed: number, lip: LipSyncWeights) => {
    const dt = Math.min(delta, 0.05)

    // 1. Blinking eyelids (every 3–5 seconds)
    const blinkWeight = sampleBlinkValue(blink, elapsed)
    const lidRotX = lerp(-0.68, 0.24, blinkWeight)
    leftEye.upperLid.rotation.x = lidRotX
    rightEye.upperLid.rotation.x = lidRotX

    // 2. Smooth mouth/jaw lip-sync morphs
    const mouthAlpha = 1 - Math.exp(-24 * dt)
    const targetOpen = clamp01(lip.aa * 1.1 + lip.oh * 0.35 + lip.energy * 0.25)
    const targetRound = clamp01(lip.oh * 0.85 + lip.ou * 0.95)
    const targetWide = clamp01(lip.ee * 0.9 + lip.ih * 0.6)

    smoothOpen = lerp(smoothOpen, targetOpen, mouthAlpha)
    smoothRound = lerp(smoothRound, targetRound, mouthAlpha)
    smoothWide = lerp(smoothWide, targetWide, mouthAlpha)

    const openPx = smoothOpen * 0.022
    upperLip.position.y = 0.005 + openPx * 0.22
    lowerLip.position.y = -0.005 - openPx * 0.92
    const lipWidthScale = 1 + smoothWide * 0.24 - smoothRound * 0.26
    upperLip.scale.set(1, lipWidthScale, 1)
    lowerLip.scale.set(1, lipWidthScale * 0.96, 1)

    mouthCavity.scale.set(
      1.05 * lipWidthScale,
      Math.max(0.08, 0.1 + smoothOpen * 0.85),
      0.42
    )
    mouthCavity.position.y = -openPx * 0.32
    upperTeeth.visible = smoothOpen > 0.16
    upperTeeth.position.y = 0.003 - openPx * 0.08

    // Subtle eyebrow lift during speech
    const browLift = smoothOpen * 0.006 + lip.energy * 0.004
    leftBrow.position.y = 0.058 + browLift
    rightBrow.position.y = 0.058 + browLift

    // 3. Subtle head nod & natural idle sway
    const isSpeaking = lip.aa > 0.14 || lip.energy > 0.14
    const vocalBoost = isSpeaking ? Math.max(lip.aa, lip.energy) * 0.12 : 0
    const targetPitch = Math.sin(elapsed * 5.0) * vocalBoost + Math.sin(elapsed * 0.9) * 0.018
    const targetYaw =
      Math.sin(elapsed * 1.25) * (isSpeaking ? 0.07 : 0.032) +
      Math.cos(elapsed * 2.1) * vocalBoost * 0.35
    const targetRoll = Math.cos(elapsed * 1.05) * (isSpeaking ? 0.035 : 0.015)

    const headAlpha = 1 - Math.exp(-8 * dt)
    smoothPitch = lerp(smoothPitch, targetPitch, headAlpha)
    smoothYaw = lerp(smoothYaw, targetYaw, headAlpha)
    smoothRoll = lerp(smoothRoll, targetRoll, headAlpha)

    headGroup.rotation.x = smoothPitch
    headGroup.rotation.y = smoothYaw
    headGroup.rotation.z = smoothRoll
    neckGroup.rotation.x = smoothPitch * 0.35
    neckGroup.rotation.y = smoothYaw * 0.3

    // 4. Gentle idle breathing motion
    const breath = Math.sin(elapsed * 1.6)
    torsoGroup.position.y = baseTorsoY + breath * 0.006 + (isSpeaking ? lip.energy * 0.005 : 0)
    torsoGroup.scale.set(1 + breath * 0.007, 1 + breath * 0.005, 1 + breath * 0.008)

    // 5. Optional drag-orbit & 360° auto-orbit
    if (autoOrbitEnabled) {
      autoOrbitAngle = (autoOrbitAngle + dt * 0.75) % (Math.PI * 2)
    }
    root.rotation.y = lerp(root.rotation.y, userOrbitYaw + autoOrbitAngle, headAlpha)
    root.rotation.x = lerp(root.rotation.x, userOrbitPitch, headAlpha)
  }

  const setOrbitRotation = (yaw: number, pitch = 0) => {
    userOrbitYaw = yaw
    userOrbitPitch = Math.max(-0.45, Math.min(0.45, pitch))
  }

  const setAutoOrbit = (enabled: boolean) => {
    autoOrbitEnabled = enabled
    if (!enabled) {
      autoOrbitAngle = 0
    }
  }

  const dispose = () => {
    disposeObject3D(root)
  }

  return {
    object: root,
    kind: "procedural",
    update,
    setOrbitRotation,
    setAutoOrbit,
    dispose,
  }
}

/**
 * Loads a .vrm or .glb 3D model from a local File or remote/public URL
 * and returns a unified AvatarController.
 */
export async function loadAvatarController(source: File | string): Promise<AvatarController> {
  const isFile = source instanceof File
  const url = isFile ? URL.createObjectURL(source) : source
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  try {
    const gltf = await loader.loadAsync(url)
    const vrm = gltf.userData?.vrm as VRM | undefined
    if (vrm) {
      return createVrmAvatarController(vrm)
    }
    return createGlbAvatarController(gltf.scene)
  } finally {
    if (isFile) {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * Recursively disposes geometries and materials of a Three.js Object3D.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const mat of materials) {
        if (!mat) continue
        const record = mat as unknown as Record<string, unknown>
        for (const value of Object.values(record)) {
          if (value && typeof value === "object" && "isTexture" in value) {
            const tex = value as THREE.Texture
            if (typeof HTMLCanvasElement !== "undefined" && tex.image instanceof HTMLCanvasElement) {
              tex.image.width = 0
              tex.image.height = 0
            }
            tex.dispose()
          }
        }
        mat.dispose()
      }
    }
  })
}

export type Presenter3dPopMotionPreset = "orbit_sway" | "slow_push" | "vocal_bounce"

export interface Presenter3dPopOptions {
  depth: number
  motionPreset: Presenter3dPopMotionPreset
  /** Disables heavy canvas shadowBlur and ctx.filter blur for smooth mobile rendering */
  lowPower?: boolean
}

/**
 * Draws the glowing reactive audio spectrum bar beneath the 2D Mascot / 2.5D 3D-Pop stage.
 */
function drawAudioSpectrumBar(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  lip: LipSyncWeights,
  elapsed: number,
  lowPower = false
): void {
  const energy = Math.min(1, Math.max(0, lip.energy))
  const bars = 28
  const barAreaX = canvasW * 0.12
  const barAreaW = canvasW * 0.76
  const baseY = canvasH * 0.80
  const maxH = canvasH * 0.07
  const step = barAreaW / bars
  ctx.save()
  if (!lowPower) {
    ctx.shadowColor = "rgba(251,191,36,0.9)"
    ctx.shadowBlur = 10 + energy * 14
  }
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1)
    const band = t < 0.34 ? lip.aa : t < 0.67 ? lip.oh : lip.ee
    const wave =
      0.5 + 0.5 * Math.sin(elapsed * 7 + i * 0.9) * Math.cos(elapsed * 3.1 + i * 0.37)
    const env = Math.sin(Math.PI * t) * 0.35 + 0.65
    const h = Math.max(canvasH * 0.004, maxH * (0.06 + (energy * 0.55 + band * 0.45) * wave * env))
    const grad = ctx.createLinearGradient(0, baseY - h, 0, baseY + h)
    grad.addColorStop(0, "#fde68a")
    grad.addColorStop(1, "#f59e0b")
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(barAreaX + i * step + step * 0.18, baseY - h, step * 0.64, h * 2, step * 0.32)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * "2D Mascot Motion Card" renderer: keeps the uploaded mascot photo 100% crisp
 * (zero mouth warping or synthetic overlays), animating smooth vocal-reactive
 * breathing bounce (scale & subtle float) driven by Web Audio energy.
 */
export function drawPresenterCardFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  lip: LipSyncWeights,
  elapsed: number,
  options?: { lowPower?: boolean }
): void {
  const lowPower = Boolean(options?.lowPower)
  const energy = Math.min(1, Math.max(0, lip.energy))
  const areaX = canvasW * 0.07
  const areaY = canvasH * 0.08
  const areaW = canvasW * 0.86
  const areaH = canvasH * 0.62
  const fit = Math.min(areaW / img.width, areaH / img.height)
  const pw = img.width * fit
  const ph = img.height * fit
  const px = areaX + (areaW - pw) / 2
  const breathe = Math.sin(elapsed * 1.6) * 0.5 + 0.5
  const floatY = Math.sin(elapsed * 1.6) * (canvasH * 0.004) - energy * (canvasH * 0.008)
  const py = areaY + (areaH - ph) / 2 + floatY
  const bounce = 1 + energy * 0.022 + breathe * 0.005
  const radius = Math.min(pw, ph) * 0.06

  ctx.save()
  ctx.translate(px + pw / 2, py + ph / 2)
  ctx.scale(bounce, bounce)
  ctx.translate(-(px + pw / 2), -(py + ph / 2))
  if (!lowPower) {
    ctx.shadowColor = `rgba(245,158,11,${0.18 + energy * 0.5})`
    ctx.shadowBlur = 18 + energy * 34
  }
  ctx.fillStyle = "#fff"
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, radius)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.clip()
  ctx.drawImage(img, px, py, pw, ph)
  ctx.restore()

  drawAudioSpectrumBar(ctx, canvasW, canvasH, lip, elapsed, lowPower)
}

/**
 * 0-Cost 2.5D 3D-Pop / Parallax Photo renderer:
 * - z = back: blurred & slightly overscaled original photo moving slowly opposite to camera sway
 * - z = front: crisp transparent subject cutout moving with greater parallax amplitude,
 *   3D drop shadow, soft rim highlight, gentle perspective tilt, and vocal-reactive bounce.
 */
export function drawPresenter3dPopFrame(
  ctx: CanvasRenderingContext2D,
  originalImg: HTMLImageElement,
  cutoutImg: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  lip: LipSyncWeights,
  elapsed: number,
  options: Presenter3dPopOptions
): void {
  const energy = clamp01(lip.energy)
  const d = clamp01(options.depth / 100)

  const areaX = canvasW * 0.07
  const areaY = canvasH * 0.08
  const areaW = canvasW * 0.86
  const areaH = canvasH * 0.62
  const fit = Math.min(areaW / originalImg.width, areaH / originalImg.height)
  const pw = originalImg.width * fit
  const ph = originalImg.height * fit
  const px = areaX + (areaW - pw) / 2
  const py = areaY + (areaH - ph) / 2
  const cx = px + pw / 2
  const cy = py + ph / 2
  const radius = Math.min(pw, ph) * 0.06

  // Compute camera sway, zoom, tilt, and vocal bounce per motion preset
  let camX = 0
  let camY = 0
  let backZoom = 1.08 + 0.06 * d
  let frontScale = 1.015 + 0.035 * d
  let tiltRad = 0
  let vocalLiftY = 0

  if (options.motionPreset === "slow_push") {
    const push = 0.5 - 0.5 * Math.cos(elapsed * 0.45)
    camX = Math.sin(elapsed * 0.52) * 0.45
    camY = Math.cos(elapsed * 0.38) * 0.25
    backZoom += push * 0.03 * d
    frontScale += push * 0.085 * d + energy * 0.018
    tiltRad = Math.sin(elapsed * 0.52) * 0.014 * d
    vocalLiftY = -energy * canvasH * 0.008
  } else if (options.motionPreset === "vocal_bounce") {
    camX = Math.sin(elapsed * 0.78) * 0.45
    camY = Math.cos(elapsed * 0.58) * 0.3
    const pop = energy * (0.04 + 0.045 * d)
    backZoom += energy * 0.012 * d
    frontScale += pop + Math.sin(elapsed * 1.6) * 0.004
    tiltRad = Math.sin(elapsed * 3.1) * energy * 0.022 * d + Math.sin(elapsed * 0.78) * 0.008 * d
    vocalLiftY = -energy * canvasH * (0.008 + 0.014 * d)
  } else {
    // orbit_sway (default)
    camX = Math.sin(elapsed * 0.95)
    camY = Math.cos(elapsed * 0.65) * 0.55
    const breathe = Math.sin(elapsed * 0.85) * 0.015 * d
    backZoom += breathe * 0.5
    frontScale += breathe + energy * 0.022
    tiltRad = Math.sin(elapsed * 0.95) * 0.022 * d
    vocalLiftY = -energy * canvasH * 0.009
  }

  const backShiftX = -camX * canvasW * 0.012 * d
  const backShiftY = -camY * canvasH * 0.008 * d
  const frontShiftX = camX * canvasW * 0.024 * d
  const frontShiftY = camY * canvasH * 0.016 * d + vocalLiftY

  const lowPower = Boolean(options.lowPower)

  // 1. Card Frame + Back Layer (z = back)
  ctx.save()
  if (!lowPower) {
    ctx.shadowColor = `rgba(245,158,11,${0.18 + energy * 0.45})`
    ctx.shadowBlur = 18 + energy * 28
  }
  ctx.fillStyle = "#18181b"
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, radius)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.clip()

  ctx.save()
  ctx.translate(cx + backShiftX, cy + backShiftY)
  ctx.scale(backZoom, backZoom)
  ctx.translate(-cx, -cy)
  if (!lowPower) {
    const bgBlur = 2 + d * 7
    ctx.filter = `blur(${bgBlur.toFixed(1)}px) brightness(0.9)`
  }
  ctx.drawImage(originalImg, px, py, pw, ph)
  ctx.restore()

  // Subtle depth vignette over back layer to accentuate subject separation
  const vignette = ctx.createRadialGradient(
    cx,
    cy * 0.95,
    Math.min(pw, ph) * 0.18,
    cx,
    cy,
    Math.max(pw, ph) * 0.72
  )
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
  vignette.addColorStop(1, `rgba(0, 0, 0, ${(0.18 + 0.16 * d).toFixed(2)})`)
  ctx.fillStyle = vignette
  ctx.fillRect(px, py, pw, ph)

  // Subtle inner card border highlight
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(px, py, pw, ph, radius)
  ctx.stroke()
  ctx.restore()

  // 2. Foreground Subject Cutout (z = front) — pops forward with 3D shadow + soft rim highlight
  ctx.save()
  ctx.translate(cx + frontShiftX, cy + frontShiftY)
  ctx.rotate(tiltRad)
  // Gentle 2.5D perspective foreshortening along X/Y based on sway
  const skewX = -camX * 0.012 * d
  ctx.transform(1, 0, skewX, 1, 0, 0)
  ctx.scale(frontScale, frontScale)
  ctx.translate(-cx, -cy)

  if (!lowPower) {
    // Soft warm rim highlight behind subject
    ctx.save()
    ctx.shadowColor = `rgba(253, 230, 138, ${(0.35 + energy * 0.4).toFixed(2)})`
    ctx.shadowBlur = 12 + energy * 16 + d * 8
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = -2
    ctx.drawImage(cutoutImg, px, py, pw, ph)
    ctx.restore()

    // Deep 3D drop shadow + crisp foreground subject
    ctx.shadowColor = `rgba(0, 0, 0, ${(0.32 + 0.22 * d).toFixed(2)})`
    ctx.shadowBlur = 16 + 24 * d
    ctx.shadowOffsetX = -camX * 14 * d
    ctx.shadowOffsetY = 10 + 12 * d
  }
  ctx.drawImage(cutoutImg, px, py, pw, ph)
  ctx.restore()

  drawAudioSpectrumBar(ctx, canvasW, canvasH, lip, elapsed, lowPower)
}

export type CaptionStyle = "classic" | "dynamic_pop"

export interface CaptionBarOptions {
  style?: CaptionStyle
  lip?: LipSyncWeights
  elapsed?: number
  hasLowerThird?: boolean
  lowPower?: boolean
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string[] {
  const lines: string[] = []
  let line = ""
  const tokens = text.includes(" ") ? text.split(/(\s+)/) : Array.from(text)
  for (const tok of tokens) {
    const pieces = ctx.measureText(tok).width > maxW ? Array.from(tok) : [tok]
    for (const p of pieces) {
      if (line && ctx.measureText(line + p).width > maxW) {
        lines.push(line.trim())
        line = p.trimStart()
      } else {
        line += p
      }
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

export function drawCaptionBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  options?: CaptionBarOptions
): void {
  const clean = text.trim()
  if (!clean) return

  const style: CaptionStyle = options?.style ?? "classic"
  const isVertical = canvasH > canvasW

  if (style === "dynamic_pop") {
    const fontSize = Math.round(canvasW * 0.048)
    ctx.save()
    ctx.font = `800 ${fontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const maxW = canvasW * 0.84
    const lines = wrapCaptionLines(ctx, clean, maxW)
    const shown = lines.slice(-3)
    const lh = fontSize * 1.48
    const padY = fontSize * 0.45
    const boxH = shown.length * lh + padY * 2
    const safeBottomOffset = isVertical
      ? canvasH * (options?.hasLowerThird ? 0.25 : 0.225)
      : canvasH * 0.08
    const boxY = canvasH - boxH - safeBottomOffset
    const centerY = boxY + boxH / 2

    const energy = options?.lip?.energy ?? 0
    const popScale = 1 + Math.min(0.085, energy * 0.08)

    ctx.translate(canvasW / 2, centerY)
    ctx.scale(popScale, popScale)
    ctx.translate(-canvasW / 2, -centerY)

    // Sleek dark pill backdrop with subtle gold rim
    if (!options?.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.42)"
      ctx.shadowBlur = 18
    }
    ctx.fillStyle = "rgba(15, 15, 18, 0.78)"
    ctx.beginPath()
    ctx.roundRect(canvasW * 0.06, boxY, canvasW * 0.88, boxH, fontSize * 0.55)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(250, 204, 21, 0.36)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(canvasW * 0.06, boxY, canvasW * 0.88, boxH, fontSize * 0.55)
    ctx.stroke()

    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineJoin = "round"
    ctx.lineWidth = Math.max(4, fontSize * 0.2)
    ctx.strokeStyle = "rgba(9, 9, 11, 0.96)"

    shown.forEach((l, i) => {
      const y = boxY + padY + lh * (i + 0.5)
      const isHighlight =
        shown.length === 1 ? energy > 0.22 : i % 2 === 1
      ctx.strokeText(l, canvasW / 2, y, maxW)
      ctx.fillStyle = isHighlight ? "#FACC15" : "#FFFFFF"
      ctx.fillText(l, canvasW / 2, y, maxW)
    })

    ctx.restore()
    return
  }

  const fontSize = Math.round(canvasW * 0.045)
  ctx.save()
  ctx.font = `600 ${fontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
  const maxW = canvasW * 0.86
  const lines = wrapCaptionLines(ctx, clean, maxW)
  const shown = lines.slice(-4)
  const lh = fontSize * 1.5
  const boxH = shown.length * lh + fontSize * 0.6
  const boxY = canvasH - boxH - canvasH * 0.06
  ctx.fillStyle = "rgba(24,24,27,0.72)"
  ctx.beginPath()
  ctx.roundRect(canvasW * 0.05, boxY, canvasW * 0.9, boxH, fontSize * 0.6)
  ctx.fill()
  ctx.fillStyle = "#FAF8F5"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  shown.forEach((l, i) => {
    ctx.fillText(l, canvasW / 2, boxY + fontSize * 0.3 + lh * (i + 0.5), maxW)
  })
  ctx.restore()
}

export interface StudioBackdropOptions {
  studioSet?: PresenterStudioSet
  logoDataUrl?: string | null
  shopName?: string
}

export interface StudioBackdropController {
  object: THREE.Group
  setStudioSet: (studioSet: PresenterStudioSet) => void
  setLogoDataUrl: (dataUrl: string | null) => void
  setShopName: (name: string) => void
  update: (delta: number, elapsed: number, lip?: LipSyncWeights) => void
  dispose: () => void
}

function createSoftGlowTexture(innerHex: string, outerHex = "rgba(0,0,0,0)"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
    grad.addColorStop(0, innerHex)
    grad.addColorStop(0.45, innerHex)
    grad.addColorStop(1, outerHex)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createGradientBackdropTexture(topHex: string, bottomHex: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, topHex)
    grad.addColorStop(1, bottomHex)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 256, 512)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function drawBackWallShopSignTexture(
  logoImg: HTMLImageElement | null,
  shopName: string
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 640
  canvas.height = 176
  const ctx = canvas.getContext("2d")
  if (ctx) {
    // Sleek dark-bronze illuminated sign plate
    const bg = ctx.createLinearGradient(0, 0, 640, 176)
    bg.addColorStop(0, "#1c1917")
    bg.addColorStop(0.5, "#292524")
    bg.addColorStop(1, "#18181b")
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.roundRect(4, 4, 632, 168, 22)
    ctx.fill()

    // Warm gold inner border
    ctx.strokeStyle = "rgba(251, 191, 36, 0.72)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(10, 10, 620, 156, 18)
    ctx.stroke()

    const cleanName = shopName.trim()
    const displayLabel = cleanName || "CREATOR STUDIO"

    if (logoImg) {
      const logoSize = 96
      const logoX = cleanName ? 36 : (640 - logoSize) / 2
      const logoY = (176 - logoSize) / 2
      ctx.save()
      ctx.fillStyle = "#faf8f5"
      ctx.beginPath()
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)
      ctx.restore()

      if (cleanName) {
        ctx.fillStyle = "#faf8f5"
        ctx.font = '700 40px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif'
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillText(displayLabel, logoX + logoSize + 24, 88, 640 - (logoX + logoSize + 52))
      }
    } else {
      // Default sleek emblem + shop name
      const cx = 84
      const cy = 88
      ctx.fillStyle = "#18181b"
      ctx.beginPath()
      ctx.arc(cx, cy, 42, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "#d4af37"
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(cx, cy, 38, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = "#fde68a"
      ctx.font = "700 38px Georgia, serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("S", cx, cy + 2)

      ctx.fillStyle = "#faf8f5"
      ctx.font = '700 38px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif'
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(displayLabel, 148, 88, 460)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * Builds a modular 3D studio backdrop positioned behind the presenter (z = -1.8 to -3.5)
 * supporting Mobile Showroom, Tech Podcast Studio, Soft Bokeh, and Custom Photo (hidden).
 */
export function createStudioBackdropGroup(
  options: StudioBackdropOptions = {}
): StudioBackdropController {
  const root = new THREE.Group()
  root.name = "studio_backdrop_root"

  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  let currentSet: PresenterStudioSet = options.studioSet ?? "mobile_showroom"
  let currentShopName = options.shopName ?? ""
  let loadedLogoImg: HTMLImageElement | null = null
  let signTexture: THREE.CanvasTexture | null = null

  // --- 1. Mobile Showroom Set ---
  const showroomGroup = new THREE.Group()
  showroomGroup.name = "studio_mobile_showroom"
  root.add(showroomGroup)

  const showroomWallMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd8d1c6,
      roughness: 0.94,
      metalness: 0.02,
    })
  )
  const showroomWall = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 5.2)), showroomWallMat)
  showroomWall.position.set(0, 1.35, -2.85)
  showroomGroup.add(showroomWall)

  const nicheBackMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x262320,
      roughness: 0.85,
      metalness: 0.06,
    })
  )
  const shelfWoodMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x44403c,
      roughness: 0.72,
      metalness: 0.08,
    })
  )
  const shelfLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.45,
      roughness: 0.3,
    })
  )
  const phoneBodyMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.35,
      metalness: 0.7,
    })
  )
  const phoneScreenMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    })
  )

  const nicheBackingGeo = track(new THREE.BoxGeometry(0.92, 1.42, 0.08))
  const shelfPlankGeo = track(new THREE.BoxGeometry(0.84, 0.032, 0.14))
  const ledStripGeo = track(new THREE.BoxGeometry(0.8, 0.012, 0.018))
  const phoneBodyGeo = track(new THREE.BoxGeometry(0.082, 0.165, 0.014))
  const phoneScreenGeo = track(new THREE.PlaneGeometry(0.072, 0.148))

  for (const side of [-1, 1]) {
    const nicheX = side * 1.15
    const nicheBack = new THREE.Mesh(nicheBackingGeo, nicheBackMat)
    nicheBack.position.set(nicheX, 1.32, -2.76)
    showroomGroup.add(nicheBack)

    for (const shelfY of [1.02, 1.48]) {
      const plank = new THREE.Mesh(shelfPlankGeo, shelfWoodMat)
      plank.position.set(nicheX, shelfY, -2.68)
      showroomGroup.add(plank)

      const led = new THREE.Mesh(ledStripGeo, shelfLedMat)
      led.position.set(nicheX, shelfY + 0.32, -2.71)
      showroomGroup.add(led)

      // 3 stylized smartphone display silhouettes per shelf
      for (let p = -1; p <= 1; p++) {
        const phoneX = nicheX + p * 0.24
        const phoneY = shelfY + 0.105
        const phone = new THREE.Mesh(phoneBodyGeo, phoneBodyMat)
        phone.position.set(phoneX, phoneY, -2.65)
        phone.rotation.y = -side * 0.18
        phone.rotation.x = -0.1
        showroomGroup.add(phone)

        const screen = new THREE.Mesh(phoneScreenGeo, phoneScreenMat)
        screen.position.set(phoneX, phoneY, -2.641)
        screen.rotation.y = -side * 0.18
        screen.rotation.x = -0.1
        showroomGroup.add(screen)
      }
    }
  }

  // Framed illuminated back-wall shop sign
  const signFrameMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xb48a3a,
      roughness: 0.35,
      metalness: 0.72,
    })
  )
  const signFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.18, 0.35, 0.045)), signFrameMat)
  signFrame.position.set(0, 1.78, -2.68)
  showroomGroup.add(signFrame)

  signTexture = drawBackWallShopSignTexture(null, currentShopName)
  const signFaceMat = track(
    new THREE.MeshBasicMaterial({
      map: signTexture,
    })
  )
  const signFace = new THREE.Mesh(track(new THREE.PlaneGeometry(1.12, 0.31)), signFaceMat)
  signFace.position.set(0, 1.78, -2.654)
  showroomGroup.add(signFace)

  // --- 2. Tech Podcast Studio Set ---
  const podcastGroup = new THREE.Group()
  podcastGroup.name = "studio_tech_podcast"
  root.add(podcastGroup)

  const podcastWallMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x141418,
      roughness: 0.95,
      metalness: 0.04,
    })
  )
  const podcastWall = new THREE.Mesh(track(new THREE.PlaneGeometry(7.2, 5.2)), podcastWallMat)
  podcastWall.position.set(0, 1.35, -2.85)
  podcastGroup.add(podcastWall)

  // Acoustic slats
  const slatMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x202026,
      roughness: 0.88,
      metalness: 0.05,
    })
  )
  const slatGeo = track(new THREE.BoxGeometry(0.11, 3.8, 0.05))
  for (let i = -9; i <= 9; i++) {
    const slat = new THREE.Mesh(slatGeo, slatMat)
    slat.position.set(i * 0.22, 1.4, -2.74)
    podcastGroup.add(slat)
  }

  // Warm amber & cool cyan vertical LED bars
  const amberLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.75,
      roughness: 0.25,
    })
  )
  const cyanLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.75,
      roughness: 0.25,
    })
  )
  const ledBarGeo = track(new THREE.BoxGeometry(0.036, 2.5, 0.03))

  const leftAmberBar = new THREE.Mesh(ledBarGeo, amberLedMat)
  leftAmberBar.position.set(-0.82, 1.35, -2.62)
  podcastGroup.add(leftAmberBar)

  const rightCyanBar = new THREE.Mesh(ledBarGeo, cyanLedMat)
  rightCyanBar.position.set(0.82, 1.35, -2.62)
  podcastGroup.add(rightCyanBar)

  const outerLeftCyan = new THREE.Mesh(ledBarGeo, cyanLedMat)
  outerLeftCyan.position.set(-1.55, 1.35, -2.66)
  podcastGroup.add(outerLeftCyan)

  const outerRightAmber = new THREE.Mesh(ledBarGeo, amberLedMat)
  outerRightAmber.position.set(1.55, 1.35, -2.66)
  podcastGroup.add(outerRightAmber)

  // Soft ambient studio glow halo
  const haloTex = track(createSoftGlowTexture("rgba(245, 158, 11, 0.28)"))
  const haloMat = track(
    new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
    })
  )
  const haloPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(2.8, 2.8)), haloMat)
  haloPlane.position.set(0, 1.35, -2.76)
  podcastGroup.add(haloPlane)

  // Subtle desk edge & studio mic silhouette in lower corner
  const deskMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.65,
      metalness: 0.25,
    })
  )
  const deskEdge = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 0.08, 0.55)), deskMat)
  deskEdge.position.set(0, 0.68, -1.85)
  podcastGroup.add(deskEdge)

  const micGroup = new THREE.Group()
  micGroup.position.set(0.56, 0.72, -1.78)
  const micStand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.016, 0.28, 12)), deskMat)
  micStand.position.set(0, 0.14, 0)
  micGroup.add(micStand)
  const micArm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 10)), deskMat)
  micArm.position.set(-0.07, 0.31, 0.03)
  micArm.rotation.z = 0.75
  micGroup.add(micArm)
  const micCapsule = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.032, 0.065, 8, 14)), deskMat)
  micCapsule.position.set(-0.14, 0.36, 0.06)
  micCapsule.rotation.z = 0.55
  micGroup.add(micCapsule)
  podcastGroup.add(micGroup)

  // --- 3. Soft Studio Bokeh Set ---
  const bokehGroup = new THREE.Group()
  bokehGroup.name = "studio_soft_bokeh"
  root.add(bokehGroup)

  const bokehBgTex = track(createGradientBackdropTexture("#27272a", "#18181b"))
  const bokehBgMat = track(
    new THREE.MeshBasicMaterial({
      map: bokehBgTex,
    })
  )
  const bokehBg = new THREE.Mesh(track(new THREE.PlaneGeometry(7.6, 5.6)), bokehBgMat)
  bokehBg.position.set(0, 1.35, -3.35)
  bokehGroup.add(bokehBg)

  const bokehCount = 44
  const bokehPositions = new Float32Array(bokehCount * 3)
  const bokehColors = new Float32Array(bokehCount * 3)
  const bokehSpeeds = new Float32Array(bokehCount)
  const bokehPhases = new Float32Array(bokehCount)
  const palette = [
    new THREE.Color(0xfde68a),
    new THREE.Color(0xf59e0b),
    new THREE.Color(0xfaf8f5),
    new THREE.Color(0x93c5fd),
  ]

  for (let i = 0; i < bokehCount; i++) {
    bokehPositions[i * 3] = (Math.random() - 0.5) * 3.8
    bokehPositions[i * 3 + 1] = 0.3 + Math.random() * 2.4
    bokehPositions[i * 3 + 2] = -2.1 - Math.random() * 1.1
    bokehSpeeds[i] = 0.04 + Math.random() * 0.07
    bokehPhases[i] = Math.random() * Math.PI * 2
    const c = palette[i % palette.length]
    bokehColors[i * 3] = c.r
    bokehColors[i * 3 + 1] = c.g
    bokehColors[i * 3 + 2] = c.b
  }

  const bokehGeo = track(new THREE.BufferGeometry())
  bokehGeo.setAttribute("position", new THREE.BufferAttribute(bokehPositions, 3))
  bokehGeo.setAttribute("color", new THREE.BufferAttribute(bokehColors, 3))

  const bokehOrbTex = track(createSoftGlowTexture("rgba(255, 255, 255, 0.88)"))
  const bokehMat = track(
    new THREE.PointsMaterial({
      size: 0.44,
      map: bokehOrbTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  const bokehPoints = new THREE.Points(bokehGeo, bokehMat)
  bokehGroup.add(bokehPoints)

  const releaseSignTexture = () => {
    if (!signTexture) return
    if (
      typeof HTMLCanvasElement !== "undefined" &&
      signTexture.image instanceof HTMLCanvasElement
    ) {
      signTexture.image.width = 0
      signTexture.image.height = 0
    }
    signTexture.dispose()
    signTexture = null
  }

  const refreshSignTexture = () => {
    const nextTex = drawBackWallShopSignTexture(loadedLogoImg, currentShopName)
    releaseSignTexture()
    signTexture = nextTex
    signFaceMat.map = nextTex
    signFaceMat.needsUpdate = true
  }

  const applyStudioVisibility = (set: PresenterStudioSet) => {
    currentSet = set
    root.visible = set !== "custom_photo"
    showroomGroup.visible = set === "mobile_showroom"
    podcastGroup.visible = set === "tech_podcast"
    bokehGroup.visible = set === "soft_bokeh"
  }

  const setLogoDataUrl = (dataUrl: string | null) => {
    if (!dataUrl) {
      loadedLogoImg = null
      refreshSignTexture()
      return
    }
    const img = new Image()
    img.onload = () => {
      loadedLogoImg = img
      refreshSignTexture()
    }
    img.onerror = () => {
      loadedLogoImg = null
      refreshSignTexture()
    }
    img.src = dataUrl
  }

  const setShopName = (name: string) => {
    if (name === currentShopName) return
    currentShopName = name
    refreshSignTexture()
  }

  applyStudioVisibility(currentSet)
  if (options.logoDataUrl) {
    setLogoDataUrl(options.logoDataUrl)
  }

  const update = (delta: number, elapsed: number, lip?: LipSyncWeights) => {
    const energy = lip ? clamp01(lip.energy) : 0
    if (currentSet === "tech_podcast") {
      const pulse = 1.55 + Math.sin(elapsed * 2.1) * 0.2 + energy * 0.65
      amberLedMat.emissiveIntensity = pulse
      cyanLedMat.emissiveIntensity = 1.6 + Math.cos(elapsed * 1.7) * 0.2 + energy * 0.55
    } else if (currentSet === "soft_bokeh") {
      const posAttr = bokehGeo.getAttribute("position") as THREE.BufferAttribute
      for (let i = 0; i < bokehCount; i++) {
        let x = posAttr.getX(i) + Math.sin(elapsed * 0.55 + bokehPhases[i]) * delta * 0.06
        let y = posAttr.getY(i) + bokehSpeeds[i] * delta
        if (y > 2.8) y = 0.25
        if (x > 2.0) x = -2.0
        if (x < -2.0) x = 2.0
        posAttr.setXY(i, x, y)
      }
      posAttr.needsUpdate = true
    }
  }

  const dispose = () => {
    releaseSignTexture()
    for (const item of disposables) {
      item.dispose()
    }
  }

  return {
    object: root,
    setStudioSet: applyStudioVisibility,
    setLogoDataUrl,
    setShopName,
    update,
    dispose,
  }
}

/**
 * Draws the top-right corner shop logo watermark at subtle 80% opacity.
 */
export function drawCornerLogoWatermark(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement | null,
  canvasW: number,
  options?: { lowPower?: boolean }
): void {
  if (!logoImg) return
  const size = Math.round(canvasW * 0.095)
  const margin = Math.round(canvasW * 0.036)
  const x = canvasW - margin - size
  const y = margin
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size / 2

  ctx.save()
  ctx.globalAlpha = 0.8
  if (!options?.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)"
    ctx.shadowBlur = 12
  }
  ctx.fillStyle = "rgba(250, 248, 245, 0.92)"
  ctx.beginPath()
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(logoImg, x, y, size, size)
  ctx.restore()
}

export interface BroadcastLowerThirdOptions {
  presenterName: string
  shopName: string
  logoImg: HTMLImageElement | null
  lip: LipSyncWeights
  elapsed: number
  captionsOn: boolean
  lowPower?: boolean
}

/**
 * Draws a sleek TV-style glassmorphic/warm-charcoal lower-third nameplate above captions
 * with mini shop logo, presenter & shop name, and a compact 5-bar reactive audio equalizer.
 */
export function drawBroadcastLowerThird(
  ctx: CanvasRenderingContext2D,
  options: BroadcastLowerThirdOptions,
  canvasW: number,
  canvasH: number
): void {
  const cleanPresenter = options.presenterName.trim()
  const cleanShop = options.shopName.trim()
  if (!cleanPresenter && !cleanShop) return

  const marginX = Math.round(canvasW * 0.045)
  const cardW = canvasW - marginX * 2
  const cardH = Math.round(canvasW * 0.105)
  const bottomOffset = options.captionsOn ? canvasH * 0.18 : canvasH * 0.045
  const cardX = marginX
  const cardY = Math.round(canvasH - cardH - bottomOffset)
  const radius = Math.round(cardH * 0.24)

  ctx.save()
  // Glassmorphic warm-charcoal card
  if (!options.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.32)"
    ctx.shadowBlur = 18
  }
  ctx.fillStyle = "rgba(24, 24, 27, 0.84)"
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, radius)
  ctx.stroke()

  // Warm amber left accent strip
  const accentW = Math.max(4, Math.round(cardH * 0.07))
  ctx.fillStyle = "#f59e0b"
  ctx.beginPath()
  ctx.roundRect(cardX + 10, cardY + 12, accentW, cardH - 24, accentW / 2)
  ctx.fill()

  let textStartX = cardX + 24

  // Mini shop logo thumbnail
  if (options.logoImg) {
    const thumbSize = Math.round(cardH * 0.66)
    const thumbX = textStartX
    const thumbY = cardY + Math.round((cardH - thumbSize) / 2)
    ctx.save()
    ctx.fillStyle = "#faf8f5"
    ctx.beginPath()
    ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2 + 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(options.logoImg, thumbX, thumbY, thumbSize, thumbSize)
    ctx.restore()
    textStartX = thumbX + thumbSize + 14
  }

  // Compact 5-bar reactive audio equalizer on the right
  const eqBarCount = 5
  const eqBarW = Math.max(4, Math.round(cardH * 0.065))
  const eqGap = Math.max(3, Math.round(eqBarW * 0.7))
  const eqTotalW = eqBarCount * eqBarW + (eqBarCount - 1) * eqGap
  const eqX = cardX + cardW - 18 - eqTotalW
  const eqMaxH = cardH * 0.52
  const eqBaseY = cardY + cardH * 0.76
  const bands = [
    options.lip.aa,
    options.lip.oh,
    options.lip.energy,
    options.lip.ee,
    options.lip.ih,
  ]

  for (let i = 0; i < eqBarCount; i++) {
    const wave = 0.45 + 0.55 * Math.abs(Math.sin(options.elapsed * 8.5 + i * 1.15))
    const val = clamp01(0.18 + (bands[i] * 0.72 + options.lip.energy * 0.28) * wave)
    const barH = Math.max(eqBarW, eqMaxH * val)
    const bx = eqX + i * (eqBarW + eqGap)
    const by = eqBaseY - barH
    ctx.fillStyle = i === 2 ? "#fbbf24" : "#fde68a"
    ctx.beginPath()
    ctx.roundRect(bx, by, eqBarW, barH, eqBarW / 2)
    ctx.fill()
  }

  // Presenter Name + Shop Name badge
  const maxTextW = Math.max(60, eqX - textStartX - 14)
  const titleFontSize = Math.round(cardH * 0.31)
  const subFontSize = Math.round(cardH * 0.24)

  if (cleanPresenter && cleanShop) {
    ctx.fillStyle = "#faf8f5"
    ctx.font = `700 ${titleFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPresenter, textStartX, cardY + cardH * 0.36, maxTextW)

    ctx.fillStyle = "#fde68a"
    ctx.font = `600 ${subFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.fillText(cleanShop, textStartX, cardY + cardH * 0.69, maxTextW)
  } else {
    const single = cleanPresenter || cleanShop
    ctx.fillStyle = "#faf8f5"
    ctx.font = `700 ${titleFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(single, textStartX, cardY + cardH * 0.5, maxTextW)
  }

  ctx.restore()
}

export type PipCorner = "top_left" | "top_right" | "bottom_left" | "bottom_right"

export interface PipPhoneOverlayOptions {
  phoneImg: HTMLImageElement | null
  priceText: string
  promoTag: string
  corner: PipCorner
  lip: LipSyncWeights
  elapsed: number
  hasCornerLogo?: boolean
  hasLowerThird?: boolean
  captionsOn?: boolean
  lowPower?: boolean
}

/**
 * Draws a Picture-in-Picture (PiP) featured phone showcase card with optional
 * Promo/Installment Trust Badge and Price Pill in the chosen corner.
 */
export function drawPipPhoneOverlay(
  ctx: CanvasRenderingContext2D,
  options: PipPhoneOverlayOptions,
  canvasW: number,
  canvasH: number
): void {
  const cleanPrice = options.priceText.trim()
  const cleanPromo = options.promoTag.trim()
  if (!options.phoneImg && !cleanPrice && !cleanPromo) return

  const isVertical = canvasH > canvasW
  const cardW = Math.round(canvasW * (isVertical ? 0.31 : 0.25))
  const cardH = Math.round(cardW * (options.phoneImg ? 1.24 : 0.56))
  const marginX = Math.round(canvasW * 0.042)

  const topSafeY = isVertical ? Math.round(canvasH * 0.125) : Math.round(canvasH * 0.045)
  const logoClearanceY =
    options.corner === "top_right" && options.hasCornerLogo
      ? Math.max(topSafeY, Math.round(canvasW * 0.155))
      : topSafeY

  let bottomClearance = isVertical ? Math.round(canvasH * 0.23) : Math.round(canvasH * 0.05)
  if (options.captionsOn) {
    bottomClearance = Math.max(bottomClearance, Math.round(canvasH * (isVertical ? 0.32 : 0.2)))
  }
  if (options.hasLowerThird) {
    bottomClearance += Math.round(canvasW * 0.115)
  }

  const floatY = Math.sin(options.elapsed * 2.2) * 3.5
  const vocalPop = 1 + Math.min(0.035, options.lip.energy * 0.03)

  const x =
    options.corner === "top_left" || options.corner === "bottom_left"
      ? marginX
      : canvasW - marginX - cardW

  const y =
    options.corner === "top_left" || options.corner === "top_right"
      ? logoClearanceY + floatY
      : canvasH - bottomClearance - cardH + floatY

  const cx = x + cardW / 2
  const cy = y + cardH / 2
  const radius = Math.round(cardW * 0.11)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(vocalPop, vocalPop)
  ctx.translate(-cx, -cy)

  // Dark-glass showcase card container
  if (!options.lowPower) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.36)"
    ctx.shadowBlur = 20
    ctx.shadowOffsetY = 8
  }
  ctx.fillStyle = "rgba(20, 20, 24, 0.80)"
  ctx.beginPath()
  ctx.roundRect(x, y, cardW, cardH, radius)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = "rgba(255, 255, 255, 0.20)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x, y, cardW, cardH, radius)
  ctx.stroke()

  // Featured Phone Photo (contained cleanly inside card)
  if (options.phoneImg) {
    const imgPadX = cardW * 0.1
    const imgTop = cleanPromo ? cardH * 0.16 : cardH * 0.08
    const imgBottom = cleanPrice ? cardH * 0.2 : cardH * 0.08
    const availW = cardW - imgPadX * 2
    const availH = Math.max(24, cardH - imgTop - imgBottom)
    const scale = Math.min(availW / options.phoneImg.width, availH / options.phoneImg.height)
    const drawW = options.phoneImg.width * scale
    const drawH = options.phoneImg.height * scale
    const drawX = x + (cardW - drawW) / 2
    const drawY = y + imgTop + (availH - drawH) / 2

    ctx.save()
    if (!options.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)"
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 4
    }
    ctx.drawImage(options.phoneImg, drawX, drawY, drawW, drawH)
    ctx.restore()
  }

  // Promo / Installment / Trust Badge Pill (top)
  if (cleanPromo) {
    const promoFontSize = Math.max(11, Math.round(cardW * 0.072))
    ctx.font = `700 ${promoFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const pillH = Math.round(promoFontSize * 1.65)
    const textW = ctx.measureText(cleanPromo).width
    const pillW = Math.min(cardW * 0.94, Math.max(cardW * 0.56, textW + promoFontSize * 1.3))
    const pillX = x + (cardW - pillW) / 2
    const pillY = y - pillH * 0.35

    ctx.fillStyle = "#10B981"
    ctx.beginPath()
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPromo, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 10)
  }

  // Price Pill (bottom)
  if (cleanPrice) {
    const priceFontSize = Math.max(12, Math.round(cardW * 0.084))
    ctx.font = `800 ${priceFontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
    const pillH = Math.round(priceFontSize * 1.72)
    const textW = ctx.measureText(cleanPrice).width
    const pillW = Math.min(cardW * 0.96, Math.max(cardW * 0.68, textW + priceFontSize * 1.4))
    const pillX = x + (cardW - pillW) / 2
    const pillY = y + cardH - pillH * 0.72

    if (!options.lowPower) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.32)"
      ctx.shadowBlur = 10
    }
    ctx.fillStyle = "#FACC15"
    ctx.beginPath()
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = "#18181B"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cleanPrice, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 12)
  }

  ctx.restore()
}
