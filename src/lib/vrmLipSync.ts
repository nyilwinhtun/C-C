import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm"

export interface LipSyncWeights {
  /** Low-mid vocal openness (300–1000 Hz) */
  aa: number
  /** Rounded vowel openness derived from low-mid */
  oh: number
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
    const targetEe = clamp01(highMid * 0.95)
    const targetIh = clamp01(highMid * 0.65)
    const targetEnergy = clamp01(Math.max(targetAa, targetEe * 0.85))

    // Frame-rate independent smoothing
    const attackAlpha = 1 - Math.exp(-22 * delta)
    const releaseAlpha = 1 - Math.exp(-14 * delta)

    state.aa = lerp(state.aa, targetAa, targetAa > state.aa ? attackAlpha : releaseAlpha)
    state.oh = lerp(state.oh, targetOh, targetOh > state.oh ? attackAlpha : releaseAlpha)
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

export interface AvatarController {
  object: THREE.Object3D
  kind: "preset" | "vrm" | "glb"
  update: (delta: number, elapsed: number, lip: LipSyncWeights) => void
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

    // 1. Lip-sync expressions
    const em = vrm.expressionManager
    if (em) {
      em.setValue("aa", lip.aa)
      em.setValue("oh", lip.oh)
      em.setValue("ee", lip.ee)
      em.setValue("ih", lip.ih)

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
    applyMorph(["viseme_E", "ee", "mouthSmile", "Fcl_MTH_E"], lip.ee)
    applyMorph(["viseme_I", "ih", "Fcl_MTH_I"], lip.ih)
    applyMorph(["eyeBlinkLeft", "eyeBlinkRight", "blink", "Fcl_EYE_Close"], blinkWeight)

    const isSpeaking = lip.aa > 0.15
    const vocalBoost = isSpeaking ? (lip.aa - 0.15) * 0.1 : 0
    const targetPitch = Math.sin(elapsed * 5.0) * vocalBoost
    const targetYaw = Math.sin(elapsed * 1.3) * (isSpeaking ? 0.05 : 0.02)

    const alpha = 1 - Math.exp(-8 * dt)
    smoothPitch = lerp(smoothPitch, targetPitch, alpha)
    smoothYaw = lerp(smoothYaw, targetYaw, alpha)

    root.rotation.x = smoothPitch
    root.rotation.y = smoothYaw
    root.position.y = baseY + Math.sin(elapsed * 1.6) * 0.005
  }

  const dispose = () => {
    disposeObject3D(root)
  }

  return {
    object: root,
    kind: "glb",
    update,
    dispose,
  }
}

export type BuiltinPresenterId = "female_nilar" | "male_kokhant"

/**
 * Builds a clean, expressive stylized 3D presenter mesh (Female Nilar or Male Ko Khant/Thiha)
 * with articulated jaw/lips, blinking eyelids, expressive brows, chest breathing, and vocal head nod.
 * Works 100% offline with zero external network dependencies.
 */
export function createBuiltinPresenterController(
  preset: BuiltinPresenterId
): AvatarController {
  const isFemale = preset === "female_nilar"
  const root = new THREE.Group()
  root.name = `preset_${preset}`

  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  // Materials matching warm studio aesthetic
  const skinMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0xf3cbb1 : 0xe4b898,
      roughness: 0.62,
      metalness: 0.03,
    })
  )
  const hairMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0x1e1b18 : 0x18181b,
      roughness: 0.52,
      metalness: 0.08,
    })
  )
  const outfitMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0x9f3a3a : 0x27272a,
      roughness: 0.7,
      metalness: 0.05,
    })
  )
  const innerShirtMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0xfaf8f5 : 0xf4f4f5,
      roughness: 0.65,
      metalness: 0.02,
    })
  )
  const accentMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0xd97706 : 0x52525b,
      roughness: 0.35,
      metalness: 0.4,
    })
  )
  const eyeWhiteMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
    })
  )
  const irisMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x291d16,
      roughness: 0.15,
    })
  )
  const lipMat = track(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0xc05258 : 0xa5665d,
      roughness: 0.45,
    })
  )
  const mouthCavityMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b1216,
      roughness: 0.9,
    })
  )

  // Chest / Torso group (positioned so upper-body & close-up framing match VRM ~1.45m eye height)
  const torsoGroup = new THREE.Group()
  torsoGroup.position.set(0, 1.05, 0)
  root.add(torsoGroup)

  const torsoGeo = track(
    new THREE.CylinderGeometry(isFemale ? 0.145 : 0.175, isFemale ? 0.13 : 0.155, 0.38, 28)
  )
  const torsoMesh = new THREE.Mesh(torsoGeo, outfitMat)
  torsoMesh.position.set(0, 0.03, 0)
  torsoMesh.scale.set(1.22, 1, 0.72)
  torsoGroup.add(torsoMesh)

  // Inner shirt V-neck / collar
  const collarGeo = track(new THREE.CylinderGeometry(0.085, 0.06, 0.12, 20))
  const collarMesh = new THREE.Mesh(collarGeo, innerShirtMat)
  collarMesh.position.set(0, 0.18, 0.03)
  collarMesh.scale.set(1.05, 1, 0.75)
  torsoGroup.add(collarMesh)

  // Shoulders
  const shoulderGeo = track(new THREE.SphereGeometry(isFemale ? 0.075 : 0.088, 20, 16))
  const leftShoulder = new THREE.Mesh(shoulderGeo, outfitMat)
  leftShoulder.position.set(isFemale ? -0.19 : -0.225, 0.16, 0)
  torsoGroup.add(leftShoulder)

  const rightShoulder = new THREE.Mesh(shoulderGeo, outfitMat)
  rightShoulder.position.set(isFemale ? 0.19 : 0.225, 0.16, 0)
  torsoGroup.add(rightShoulder)

  // Upper arms
  const armGeo = track(new THREE.CylinderGeometry(0.048, 0.042, 0.28, 16))
  const leftArm = new THREE.Mesh(armGeo, outfitMat)
  leftArm.position.set(isFemale ? -0.215 : -0.25, 0.02, 0)
  leftArm.rotation.z = 0.08
  torsoGroup.add(leftArm)

  const rightArm = new THREE.Mesh(armGeo, outfitMat)
  rightArm.position.set(isFemale ? 0.215 : 0.25, 0.02, 0)
  rightArm.rotation.z = -0.08
  torsoGroup.add(rightArm)

  // Lapel / Studio Mic Clip accent
  const micClipGeo = track(new THREE.BoxGeometry(0.018, 0.032, 0.015))
  const micClip = new THREE.Mesh(micClipGeo, accentMat)
  micClip.position.set(0.065, 0.14, 0.115)
  torsoGroup.add(micClip)

  // Neck
  const neckGeo = track(new THREE.CylinderGeometry(0.048, 0.056, 0.11, 20))
  const neckMesh = new THREE.Mesh(neckGeo, skinMat)
  neckMesh.position.set(0, 0.25, 0)
  torsoGroup.add(neckMesh)

  // Head pivot
  const headGroup = new THREE.Group()
  headGroup.position.set(0, 0.34, 0.01)
  torsoGroup.add(headGroup)

  // Cranium / Face
  const headGeo = track(new THREE.SphereGeometry(0.135, 32, 28))
  const headMesh = new THREE.Mesh(headGeo, skinMat)
  headMesh.position.set(0, 0.07, 0)
  headMesh.scale.set(0.92, 1.08, 0.96)
  headGroup.add(headMesh)

  // Ears
  const earGeo = track(new THREE.SphereGeometry(0.026, 14, 12))
  const leftEar = new THREE.Mesh(earGeo, skinMat)
  leftEar.position.set(-0.122, 0.065, -0.005)
  leftEar.scale.set(0.55, 1, 0.7)
  headGroup.add(leftEar)

  const rightEar = new THREE.Mesh(earGeo, skinMat)
  rightEar.position.set(0.122, 0.065, -0.005)
  rightEar.scale.set(0.55, 1, 0.7)
  headGroup.add(rightEar)

  if (isFemale) {
    const earringGeo = track(new THREE.SphereGeometry(0.01, 12, 10))
    const leftEarring = new THREE.Mesh(earringGeo, accentMat)
    leftEarring.position.set(-0.126, 0.035, 0.002)
    headGroup.add(leftEarring)

    const rightEarring = new THREE.Mesh(earringGeo, accentMat)
    rightEarring.position.set(0.126, 0.035, 0.002)
    headGroup.add(rightEarring)
  }

  // Stylized Hair
  const hairCapGeo = track(new THREE.SphereGeometry(0.143, 28, 24))
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat)
  hairCap.position.set(0, 0.095, -0.018)
  hairCap.scale.set(0.96, 1.04, 1.0)
  headGroup.add(hairCap)

  if (isFemale) {
    // Soft bob / side hair locks
    const sideHairGeo = track(new THREE.CapsuleGeometry(0.038, 0.14, 8, 14))
    const leftHair = new THREE.Mesh(sideHairGeo, hairMat)
    leftHair.position.set(-0.105, 0.02, -0.015)
    leftHair.rotation.z = -0.08
    headGroup.add(leftHair)

    const rightHair = new THREE.Mesh(sideHairGeo, hairMat)
    rightHair.position.set(0.105, 0.02, -0.015)
    rightHair.rotation.z = 0.08
    headGroup.add(rightHair)

    const backHairGeo = track(new THREE.CylinderGeometry(0.12, 0.135, 0.18, 20))
    const backHair = new THREE.Mesh(backHairGeo, hairMat)
    backHair.position.set(0, 0.01, -0.06)
    headGroup.add(backHair)
  } else {
    // Clean swept top hair
    const topHairGeo = track(new THREE.BoxGeometry(0.18, 0.055, 0.16))
    const topHair = new THREE.Mesh(topHairGeo, hairMat)
    topHair.position.set(0, 0.195, 0.015)
    topHair.rotation.x = -0.18
    headGroup.add(topHair)
  }

  // Nose
  const noseGeo = track(new THREE.ConeGeometry(0.014, 0.035, 12))
  const noseMesh = new THREE.Mesh(noseGeo, skinMat)
  noseMesh.position.set(0, 0.055, 0.128)
  noseMesh.rotation.x = 0.35
  headGroup.add(noseMesh)

  // Eyes + Eyelids (for blinking)
  const eyeGeo = track(new THREE.SphereGeometry(0.021, 18, 14))
  const irisGeo = track(new THREE.SphereGeometry(0.012, 14, 12))
  const eyelidGeo = track(new THREE.SphereGeometry(0.023, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55))

  const createEye = (xPos: number) => {
    const eyeGroup = new THREE.Group()
    eyeGroup.position.set(xPos, 0.082, 0.112)

    const white = new THREE.Mesh(eyeGeo, eyeWhiteMat)
    white.scale.set(1, 0.88, 0.65)
    eyeGroup.add(white)

    const iris = new THREE.Mesh(irisGeo, irisMat)
    iris.position.set(0, 0, 0.011)
    iris.scale.set(1, 1, 0.6)
    eyeGroup.add(iris)

    const lid = new THREE.Mesh(eyelidGeo, skinMat)
    lid.position.set(0, 0.002, 0.002)
    lid.rotation.x = -0.6 // open position
    eyeGroup.add(lid)

    headGroup.add(eyeGroup)
    return lid
  }

  const leftEyelid = createEye(-0.044)
  const rightEyelid = createEye(0.044)

  // Eyebrows
  const browGeo = track(new THREE.BoxGeometry(0.038, 0.007, 0.012))
  const leftBrow = new THREE.Mesh(browGeo, hairMat)
  leftBrow.position.set(-0.044, 0.114, 0.115)
  leftBrow.rotation.z = 0.06
  headGroup.add(leftBrow)

  const rightBrow = new THREE.Mesh(browGeo, hairMat)
  rightBrow.position.set(0.044, 0.114, 0.115)
  rightBrow.rotation.z = -0.06
  headGroup.add(rightBrow)

  // Articulated Mouth (cavity + upper lip + lower lip)
  const mouthGroup = new THREE.Group()
  mouthGroup.position.set(0, 0.014, 0.118)
  headGroup.add(mouthGroup)

  const cavityGeo = track(new THREE.SphereGeometry(0.024, 16, 12))
  const mouthCavity = new THREE.Mesh(cavityGeo, mouthCavityMat)
  mouthCavity.scale.set(1.1, 0.15, 0.4)
  mouthCavity.position.set(0, 0, -0.004)
  mouthGroup.add(mouthCavity)

  const lipGeo = track(new THREE.CapsuleGeometry(0.0055, 0.032, 6, 12))
  const upperLip = new THREE.Mesh(lipGeo, lipMat)
  upperLip.rotation.z = Math.PI / 2
  upperLip.position.set(0, 0.005, 0.004)
  mouthGroup.add(upperLip)

  const lowerLip = new THREE.Mesh(lipGeo, lipMat)
  lowerLip.rotation.z = Math.PI / 2
  lowerLip.position.set(0, -0.005, 0.004)
  mouthGroup.add(lowerLip)

  const blink = createBlinkState(0)
  let smoothPitch = 0
  let smoothYaw = 0
  let smoothRoll = 0

  const update = (delta: number, elapsed: number, lip: LipSyncWeights) => {
    const dt = Math.min(delta, 0.05)

    // 1. Lip-sync mouth articulation
    const openness = clamp01(lip.aa * 0.95 + lip.oh * 0.4)
    const spread = clamp01(1 + lip.ee * 0.45 + lip.ih * 0.25 - lip.oh * 0.25)

    mouthCavity.scale.set(1.05 * spread, 0.12 + openness * 0.95, 0.45)
    upperLip.position.y = 0.004 + openness * 0.006
    lowerLip.position.y = -0.004 - openness * 0.022
    upperLip.scale.set(1, spread, 1)
    lowerLip.scale.set(1, spread, 1)

    // Subtle brow lift with vocal energy
    const browLift = lip.energy * 0.006
    leftBrow.position.y = 0.114 + browLift
    rightBrow.position.y = 0.114 + browLift

    // 2. Automatic eye blinking every 3–5 seconds
    const blinkWeight = sampleBlinkValue(blink, elapsed)
    const lidRot = -0.6 + blinkWeight * 1.45
    leftEyelid.rotation.x = lidRot
    rightEyelid.rotation.x = lidRot

    // 3. Subtle head nod/sway proportional to active vocal energy (aa > 0.15)
    const isSpeaking = lip.aa > 0.15
    const vocalBoost = isSpeaking ? (lip.aa - 0.15) * 0.14 : 0
    const targetPitch = Math.sin(elapsed * 5.2) * vocalBoost + Math.sin(elapsed * 0.9) * 0.015
    const targetYaw =
      Math.sin(elapsed * 1.4) * (isSpeaking ? 0.06 : 0.025) +
      Math.cos(elapsed * 2.3) * vocalBoost * 0.35
    const targetRoll = Math.cos(elapsed * 1.1) * (isSpeaking ? 0.035 : 0.012)

    const headAlpha = 1 - Math.exp(-8 * dt)
    smoothPitch = lerp(smoothPitch, targetPitch, headAlpha)
    smoothYaw = lerp(smoothYaw, targetYaw, headAlpha)
    smoothRoll = lerp(smoothRoll, targetRoll, headAlpha)

    headGroup.rotation.x = smoothPitch
    headGroup.rotation.y = smoothYaw
    headGroup.rotation.z = smoothRoll

    // 4. Gentle idle chest breathing motion
    const breath = Math.sin(elapsed * 1.6)
    torsoGroup.position.y = 1.05 + breath * 0.004
    torsoGroup.rotation.x = breath * 0.014
  }

  const dispose = () => {
    for (const d of disposables) {
      d.dispose()
    }
  }

  return {
    object: root,
    kind: "preset",
    update,
    dispose,
  }
}

/**
 * Loads a local .vrm or .glb File/Blob URL and returns a unified AvatarController.
 */
export async function loadCustomAvatarFromFile(file: File): Promise<AvatarController> {
  const objectUrl = URL.createObjectURL(file)
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))

  try {
    const gltf = await loader.loadAsync(objectUrl)
    const vrm = gltf.userData?.vrm as VRM | undefined
    if (vrm) {
      return createVrmAvatarController(vrm)
    }
    return createGlbAvatarController(gltf.scene)
  } finally {
    URL.revokeObjectURL(objectUrl)
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
            ;(value as THREE.Texture).dispose()
          }
        }
        mat.dispose()
      }
    }
  })
}

/* ------------------------------------------------------------------ */
/* Talking Photo (2.5D) — pure Canvas2D renderer, 0 external API cost  */
/* ------------------------------------------------------------------ */

export interface TalkingPhotoParams {
  /** Mouth centre, 0–1 in image space */
  mouthX: number
  mouthY: number
  /** Mouth width as a fraction of the image width */
  mouthWidth: number
  /** Jaw openness multiplier (0.2–2) */
  jawOpenness: number
}

/** Contain-fit rect of the photo inside the canvas, in 0–1 canvas fractions. */
export function getTalkingPhotoRect(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(canvasW / imgW, canvasH / imgH)
  const w = (imgW * scale) / canvasW
  const h = (imgH * scale) / canvasH
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

export function drawTalkingPhotoFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  params: TalkingPhotoParams,
  lip: LipSyncWeights,
  elapsed: number
): void {
  const rect = getTalkingPhotoRect(canvasW, canvasH, img.width, img.height)
  const dw = rect.w * canvasW
  const dh = rect.h * canvasH
  const dx = rect.x * canvasW
  const dy = rect.y * canvasH

  const energy = Math.min(1, Math.max(0, lip.energy))
  const open = Math.min(1, Math.max(lip.aa, lip.oh * 0.85, lip.ee * 0.55, energy * 0.7))

  // Head motion: breathing + vocal nod, pivoting around bottom-centre of the photo
  const breathe = Math.sin(elapsed * 1.6) * 0.5 + 0.5
  const bobY = (breathe * 0.004 + energy * 0.006) * dh
  const rot =
    (Math.sin(elapsed * 0.9) * 0.006 + Math.sin(elapsed * 2.3) * energy * 0.012) // radians
  const sc = 1 + breathe * 0.004 + energy * 0.006

  ctx.save()
  ctx.translate(dx + dw / 2, dy + dh)
  ctx.rotate(rot)
  ctx.scale(sc, sc)
  ctx.translate(-(dx + dw / 2), -(dy + dh) + bobY)

  ctx.drawImage(img, dx, dy, dw, dh)

  const mx = dx + params.mouthX * dw
  const my = dy + params.mouthY * dh
  const mw = Math.max(8, params.mouthWidth * dw)
  const jaw = Math.min(2, Math.max(0.1, params.jawOpenness))
  const drop = mw * 0.55 * jaw * open

  if (drop > 0.8) {
    // 1. Lower-jaw warp: re-draw the lower-face patch shifted down
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, my, canvasW, canvasH) // only below the mouth line
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(mx, my + mw * 0.55, mw * 1.05, mw * 0.95, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, dx, dy + drop * 0.85, dw, dh)
    ctx.restore()

    // 2. Shaded organic mouth cavity covering the gap
    const wScale = 1 + lip.ee * 0.18 - lip.oh * 0.22
    const rx = (mw / 2) * Math.max(0.6, wScale)
    const ry = drop * 0.62 + 1
    const cy = my + drop * 0.45
    const grad = ctx.createRadialGradient(mx, cy, 1, mx, cy, Math.max(rx, ry))
    grad.addColorStop(0, "#2a0c10")
    grad.addColorStop(0.7, "#4a1519")
    grad.addColorStop(1, "#6b2a2a")
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(mx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()

    // Upper teeth hint
    if (open > 0.25) {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(mx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = "rgba(250,246,240,0.9)"
      ctx.fillRect(mx - rx * 0.7, cy - ry, rx * 1.4, ry * 0.32)
      // Tongue
      ctx.fillStyle = "rgba(196,92,96,0.9)"
      ctx.beginPath()
      ctx.ellipse(mx, cy + ry * 0.7, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Soft lip outline
    ctx.strokeStyle = "rgba(90,30,36,0.55)"
    ctx.lineWidth = Math.max(1.5, mw * 0.03)
    ctx.beginPath()
    ctx.ellipse(mx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawCaptionBar(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number
): void {
  const clean = text.trim()
  if (!clean) return
  const fontSize = Math.round(canvasW * 0.045)
  ctx.save()
  ctx.font = `600 ${fontSize}px "Padauk", "Noto Sans Myanmar", system-ui, sans-serif`
  const maxW = canvasW * 0.86
  const lines: string[] = []
  let line = ""
  const tokens = clean.includes(" ") ? clean.split(/(\s+)/) : Array.from(clean)
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
