import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import Phaser from 'phaser'
import { ProjectionScene } from '@/lib/phaser/ProjectionScene'
import type { Scene } from '@/lib/scene'

export interface PhaserCanvasHandle {
  applyScene(scene: Scene): void
  selectObject(id: string | null): void
  getScene(): Scene
}

interface Props {
  editable?: boolean
  onPositionChange?: (id: string, x: number, y: number) => void
  onObjectSelect?: (id: string) => void
  className?: string
}

export const CANVAS_W = 1920
export const CANVAS_H = 1080

export const PhaserCanvas = forwardRef<PhaserCanvasHandle, Props>(
  ({ editable = false, onPositionChange, onObjectSelect, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<ProjectionScene | null>(null)
    const pendingRef = useRef<Scene | null>(null)
    const cbPositionRef = useRef(onPositionChange)
    const cbSelectRef = useRef(onObjectSelect)

    useEffect(() => { cbPositionRef.current = onPositionChange }, [onPositionChange])
    useEffect(() => { cbSelectRef.current = onObjectSelect }, [onObjectSelect])

    const applyScene = useCallback((scene: Scene) => {
      if (sceneRef.current) {
        sceneRef.current.applyScene(scene)
      } else {
        pendingRef.current = scene
      }
    }, [])

    const selectObject = useCallback((id: string | null) => {
      sceneRef.current?.selectObject(id)
    }, [])

    const getScene = useCallback((): Scene => {
      return sceneRef.current?.getScene() ?? { objects: [] }
    }, [])

    useImperativeHandle(ref, () => ({ applyScene, selectObject, getScene }), [applyScene, selectObject, getScene])

    useEffect(() => {
      if (!containerRef.current) return

      const scene = new ProjectionScene()
      scene.editable = editable
      scene.onPositionChange = (id, x, y) => cbPositionRef.current?.(id, x, y)
      scene.onObjectSelect = (id) => cbSelectRef.current?.(id)
      scene.onSceneReady = (s) => {
        sceneRef.current = s
        if (pendingRef.current) {
          s.applyScene(pendingRef.current)
          pendingRef.current = null
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        backgroundColor: '#000000',
        scene,
        parent: containerRef.current,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: CANVAS_W,
          height: CANVAS_H,
        },
        audio: { noAudio: true },
      })

      return () => {
        sceneRef.current = null
        game.destroy(true)
      }
    }, [editable])

    return <div ref={containerRef} className={className} style={{ lineHeight: 0, touchAction: 'none' }} />
  },
)
PhaserCanvas.displayName = 'PhaserCanvas'
