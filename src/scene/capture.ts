import type { Camera, Scene, WebGLRenderer } from 'three'

/** The live renderer, so that interface buttons can export what the 3D view shows. */
export const captureTarget: { gl: WebGLRenderer | null; scene: Scene | null; camera: Camera | null } = { gl: null, scene: null, camera: null }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function saveScreenshot() {
  const { gl, scene, camera } = captureTarget
  if (!gl || !scene || !camera) return
  // Rendering right before reading ensures the canvas still holds the picture.
  gl.render(scene, camera)
  gl.domElement.toBlob((blob) => {
    if (blob) download(blob, 'corpus-view.png')
  }, 'image/png')
}

export const recordingSupported = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

/** Starts recording the 3D view and returns a function that stops it and saves the video. */
export function startRecording(): (() => void) | null {
  const { gl } = captureTarget
  if (!gl || !recordingSupported()) return null
  const type = ['video/webm;codecs=vp9', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate))
  if (!type) return null
  const recorder = new MediaRecorder(gl.domElement.captureStream(30), { mimeType: type })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => chunks.push(event.data)
  recorder.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), 'corpus-recording.webm')
  recorder.start()
  return () => recorder.stop()
}
