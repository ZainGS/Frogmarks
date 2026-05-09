file = r'src/app/illustrate/components/illustration/illustration.component.ts'
with open(file, 'rb') as f:
    data = f.read()

replacements = [
    (
        b'  private _scene3dViewportSub: any = null;\r\n  private _scene3dResizeObserver: ResizeObserver | null = null;',
        b'  private _scene3dViewportSub: any = null;\r\n  private _scene3dResizeObserver: ResizeObserver | null = null;\r\n  private _scene3dFrameSub: any = null;'
    ),
    (
        b'      const sm = this.shapeManager as any;\r\n      sm.attachKeyframesToTimeline3D?.()\r\n        ?? sm.scene3d?.attachKeyframesToTimeline?.(); // fallback for older Salsa builds',
        b'      const sm = this.shapeManager as any;\r\n      sm.attachKeyframesToTimeline3D?.();\r\n      sm.scene3d?.attachKeyframesToTimeline?.();\r\n\r\n      // Belt-and-suspenders: subscribe to currentFrame$ so scrub AND Play both\r\n      // drive applyAllKeyframesAtFrame regardless of Salsa event bus plumbing.\r\n      this._scene3dFrameSub?.unsubscribe();\r\n      this._scene3dFrameSub = this.animationService.currentFrame$.subscribe((frame) => {\r\n        sm.scene3d?.applyAllKeyframesAtFrame?.(frame - 1);\r\n      });\r\n\r\n      // Force cursor tool when 3D viewport is active.\r\n      this.selectCursor(\'cursor\');'
    ),
    (
        b'    } else {\r\n      this._scene3dViewportSub?.unsubscribe?.();\r\n      this._scene3dViewportSub = null;\r\n      this._scene3dResizeObserver?.disconnect();\r\n      this._scene3dResizeObserver = null;\r\n    }',
        b'    } else {\r\n      this._scene3dViewportSub?.unsubscribe?.();\r\n      this._scene3dViewportSub = null;\r\n      this._scene3dResizeObserver?.disconnect();\r\n      this._scene3dResizeObserver = null;\r\n      this._scene3dFrameSub?.unsubscribe();\r\n      this._scene3dFrameSub = null;\r\n    }'
    ),
]

for old, new in replacements:
    if old in data:
        data = data.replace(old, new)
        print('OK:', old[:70])
    else:
        print('NOT FOUND:', old[:70])

with open(file, 'wb') as f:
    f.write(data)
print('done')
