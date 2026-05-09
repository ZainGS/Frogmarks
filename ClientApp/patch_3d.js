const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/app/illustrate/components/illustration/illustration.component.ts');
let data = fs.readFileSync(file, 'utf8');

const CRLF = '\r\n';

function patch(label, oldStr, newStr) {
  if (data.includes(oldStr)) {
    data = data.split(oldStr).join(newStr);
    fs.appendFileSync('patch_3d.log', label + ': OK\n');
  } else {
    fs.appendFileSync('patch_3d.log', label + ': NOT FOUND\n');
  }
}

// 1. Add _scene3dFrameSub field
patch('p1',
  '  private _scene3dViewportSub: any = null;' + CRLF + '  private _scene3dResizeObserver: ResizeObserver | null = null;',
  '  private _scene3dViewportSub: any = null;' + CRLF + '  private _scene3dResizeObserver: ResizeObserver | null = null;' + CRLF + '  private _scene3dFrameSub: any = null;'
);

// 2. Replace old timeline-attach expression with proper calls + frame sub + cursor force
patch('p2',
  '      const sm = this.shapeManager as any;' + CRLF +
  '      sm.attachKeyframesToTimeline3D?.()' + CRLF +
  "        ?? sm.scene3d?.attachKeyframesToTimeline?.(); // fallback for older Salsa builds",
  '      const sm = this.shapeManager as any;' + CRLF +
  '      sm.attachKeyframesToTimeline3D?.();' + CRLF +
  '      sm.scene3d?.attachKeyframesToTimeline?.();' + CRLF + CRLF +
  '      // Subscribe to currentFrame$ so scrub AND Play both drive applyAllKeyframesAtFrame.' + CRLF +
  '      this._scene3dFrameSub?.unsubscribe();' + CRLF +
  '      this._scene3dFrameSub = this.animationService.currentFrame$.subscribe((frame) => {' + CRLF +
  '        sm.scene3d?.applyAllKeyframesAtFrame?.(frame - 1);' + CRLF +
  '      });' + CRLF + CRLF +
  "      // Force cursor tool when 3D viewport is active." + CRLF +
  "      this.selectCursor('cursor');"
);

// 3. Unsubscribe on deselect
patch('p3',
  '    } else {' + CRLF +
  '      this._scene3dViewportSub?.unsubscribe?.();' + CRLF +
  '      this._scene3dViewportSub = null;' + CRLF +
  '      this._scene3dResizeObserver?.disconnect();' + CRLF +
  '      this._scene3dResizeObserver = null;' + CRLF +
  '    }',
  '    } else {' + CRLF +
  '      this._scene3dViewportSub?.unsubscribe?.();' + CRLF +
  '      this._scene3dViewportSub = null;' + CRLF +
  '      this._scene3dResizeObserver?.disconnect();' + CRLF +
  '      this._scene3dResizeObserver = null;' + CRLF +
  '      this._scene3dFrameSub?.unsubscribe();' + CRLF +
  '      this._scene3dFrameSub = null;' + CRLF +
  '    }'
);

fs.writeFileSync(file, data, 'utf8');
fs.appendFileSync('patch_3d.log', 'WRITE DONE\n');
