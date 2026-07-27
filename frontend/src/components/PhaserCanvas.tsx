import { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import Phaser from 'phaser'
import { ProjectionScene } from '@/lib/phaser/ProjectionScene'
import type { ProjectionSettings, Scene } from '@/lib/scene'

export interface PhaserCanvasHandle {
  applyScene(scene: Scene): void
  selectObject(id: string | null): void
  getScene(): Scene
  /** Update only the keystone warp — avoids re-dispatching every layer while calibrating. */
  setProjection(projection?: ProjectionSettings): void
}

interface Props {
  editable?: boolean
  onPositionChange?: (id: string, x: number, y: number) => void
  onDragMove?: (id: string, x: number, y: number) => void
  onObjectSelect?: (id: string) => void
  onWheelResize?: (id: string, factor: number) => void
  /** `false` previews the scene flat while keeping its corners. Projector never sets it. */
  warpEnabled?: boolean
  selectedCorner?: number | null
  onCornerDrag?: (index: number, x: number, y: number) => void
  onCornerDragEnd?: (index: number, x: number, y: number) => void
  onCornerSelect?: (index: number) => void
  className?: string
}

export const CANVAS_W = 1920
export const CANVAS_H = 1080

export const PhaserCanvas = forwardRef<PhaserCanvasHandle, Props>(
  (
    {
      editable = false,
      onPositionChange,
      onDragMove,
      onObjectSelect,
      onWheelResize,
      warpEnabled = true,
      selectedCorner = null,
      onCornerDrag,
      onCornerDragEnd,
      onCornerSelect,
      className,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<ProjectionScene | null>(null)
    const pendingRef = useRef<Scene | null>(null)
    const cbPositionRef = useRef(onPositionChange)
    const cbDragMoveRef = useRef(onDragMove)
    const cbSelectRef = useRef(onObjectSelect)
    const cbWheelRef = useRef(onWheelResize)
    const cbCornerDragRef = useRef(onCornerDrag)
    const cbCornerDragEndRef = useRef(onCornerDragEnd)
    const cbCornerSelectRef = useRef(onCornerSelect)

    useEffect(() => { cbPositionRef.current = onPositionChange }, [onPositionChange])
    useEffect(() => { cbDragMoveRef.current = onDragMove }, [onDragMove])
    useEffect(() => { cbSelectRef.current = onObjectSelect }, [onObjectSelect])
    useEffect(() => { cbWheelRef.current = onWheelResize }, [onWheelResize])
    useEffect(() => { cbCornerDragRef.current = onCornerDrag }, [onCornerDrag])
    useEffect(() => { cbCornerDragEndRef.current = onCornerDragEnd }, [onCornerDragEnd])
    useEffect(() => { cbCornerSelectRef.current = onCornerSelect }, [onCornerSelect])

    // Projection view state is pushed to the scene by the effects below. Mirrored
    // in refs so onSceneReady can replay whatever arrived before the game existed.
    const warpRef = useRef(warpEnabled)
    const selCornerRef = useRef(selectedCorner)

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

    const setProjection = useCallback((projection?: ProjectionSettings) => {
      sceneRef.current?.applyProjection(projection)
    }, [])

    useImperativeHandle(
      ref,
      () => ({ applyScene, selectObject, getScene, setProjection }),
      [applyScene, selectObject, getScene, setProjection],
    )

    useEffect(() => {
      warpRef.current = warpEnabled
      sceneRef.current?.setWarpEnabled(warpEnabled)
    }, [warpEnabled])

    useEffect(() => {
      selCornerRef.current = selectedCorner
      sceneRef.current?.setSelectedCorner(selectedCorner)
    }, [selectedCorner])

    useEffect(() => {
      if (!containerRef.current) return

      const scene = new ProjectionScene()
      scene.editable = editable
      scene.onPositionChange = (id, x, y) => cbPositionRef.current?.(id, x, y)
      scene.onDragMove = (id, x, y) => cbDragMoveRef.current?.(id, x, y)
      scene.onObjectSelect = (id) => cbSelectRef.current?.(id)
      scene.onWheelResize = (id, factor) => cbWheelRef.current?.(id, factor)
      scene.onCornerDrag = (i, x, y) => cbCornerDragRef.current?.(i, x, y)
      scene.onCornerDragEnd = (i, x, y) => cbCornerDragEndRef.current?.(i, x, y)
      scene.onCornerSelect = (i) => cbCornerSelectRef.current?.(i)
      scene.onSceneReady = (s) => {
        sceneRef.current = s
        s.setWarpEnabled(warpRef.current)
        s.setSelectedCorner(selCornerRef.current)
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
          // The scene centres the canvas itself (ProjectionScene._layoutCanvas).
          // autoCenter derives its margins from getBoundingClientRect, which the
          // keystone warp's CSS transform invalidates.
          autoCenter: Phaser.Scale.NO_CENTER,
          width: CANVAS_W,
          height: CANVAS_H,
        },
        // Only listen for input on the canvas itself, never on the window.
        // With window events on, Phaser hit-tests the canvas for any pointer
        // event that bubbles to the window — so a click on a modal/popover
        // stacked above the canvas would still select/switch the layer behind
        // it. Disabling them makes normal DOM stacking block those clicks.
        input: { windowEvents: false },
        audio: { noAudio: true },
      })

      return () => {
        sceneRef.current = null
        game.destroy(true)
      }
    }, [editable])

    // `overflow: hidden` clips a warped quad whose corners were pushed outside the
    // canvas box. Deliberately not positioned: a `position` here would lift the
    // canvas above the header popovers in paint order.
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ lineHeight: 0, touchAction: 'none', overflow: 'hidden' }}
      />
    )
  },
)
PhaserCanvas.displayName = 'PhaserCanvas'
