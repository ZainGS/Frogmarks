import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

export interface DocTopic {
  id: string;
  label: string;
  items?: string[];
  paras?: string[];
}

export interface DocSection {
  id: string;
  tag: string;
  theme: string;
  topics: DocTopic[];
}

@Component({
  selector: 'app-docs',
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss'],
})
export class DocsComponent {
  @Input() embedded = false;
  @Output() closed = new EventEmitter<void>();

  activeSectionId = 'boards';
  selectedTopicId = 'boards-gs';

  readonly sections: DocSection[] = [
    {
      id: 'boards', tag: 'Boards', theme: 'purple',
      topics: [
        { id: 'boards-gs', label: 'Getting Started', items: [
          'From the dashboard, click <strong>+ New Board</strong> to open the board editor',
          'Boards are an infinite, unbounded canvas — no fixed size or pixel layers',
          'The scene auto-saves to the server every second after a change',
          'Right-click anywhere on the canvas for board options (new, duplicate, set thumbnail)',
        ]},
        { id: 'boards-drawing', label: 'Drawing Tools', items: [
          '<strong>Pen <kbd>P</kbd></strong> — freehand strokes with parametric pressure/velocity curves',
          '<strong>Highlighter <kbd>I</kbd></strong> — semi-transparent overlay strokes',
          '<strong>Eraser <kbd>E</kbd></strong> — vector eraser; removes strokes it crosses',
          '<strong>Pattern</strong> — washi-tape style tiling strokes; 8 presets (checker, flowers, leaves, plaid, polka, caution, plants)',
          'Choose stroke color from the 8-color palette or the custom color picker in the toolbar',
          'Two stroke-width presets (thin / thick) in the toolbar',
        ]},
        { id: 'boards-shapes', label: 'Shape Tools', items: [
          '<strong>Rectangle, Circle, Triangle, Polygon</strong> — click and drag to place',
          'Double-click a shape tool to instantly spawn one at the cursor',
          '<strong>Polygon</strong> supports a configurable side count and a freeform click-to-place vertex mode',
          '<strong>Connector <kbd>L</kbd></strong> — draw lines with configurable arrowheads (none / triangle / closed circle / open circle) on each end',
          'Shape fill color is set independently from stroke color in the toolbar',
        ]},
        { id: 'boards-text', label: 'Text & SDF Text', items: [
          '<strong>Text <kbd>T</kbd></strong> — place plain editable text anywhere on the canvas',
          '<strong>SDF Text <kbd>Shift+T</kbd></strong> — GPU-rendered signed-distance-field text; stays sharp at any zoom level',
          'SDF Text supports independent fill color, outline color, and outline width',
          'Choose from 13 font families; size presets from 8–72 px',
          'Edge threshold and smoothing controls let you dial in crispness vs. softness',
        ]},
        { id: 'boards-objects', label: 'Stamps, Sticky Notes & Sections', items: [
          '<strong>Stamp <kbd>M</kbd></strong> — place image stamps: star, heart, check, arrow, circle, ✗, thumbs up; selecting the ice cream stamp randomises from 8 flavours',
          '<strong>Sticky Note</strong> — self-contained note card with editable text, author attribution, and a custom background color',
          '<strong>Section <kbd>S</kbd></strong> — draw a named frame to group and label regions of the board',
          'Sections and sticky notes appear in the layer tree; sticky note children are collapsed by default',
        ]},
        { id: 'boards-layers', label: 'Layers & Organisation', items: [
          'Every object on the board is a node in the layer tree (left panel)',
          'Click a layer to select it; <kbd>Ctrl+click</kbd> for multi-select',
          'Drag layers to reorder; click the <strong>eye</strong> icon to hide/show',
          'Click the <strong>lock</strong> icon to prevent a layer from being edited',
          'Double-click a layer name to rename it inline',
          'Use the search box at the top of the layer panel to filter by name',
        ]},
        { id: 'boards-shortcuts', label: 'Keyboard Shortcuts', items: [
          '<kbd>V</kbd> / <kbd>Esc</kbd> Cursor (select) &nbsp;&nbsp; <kbd>H</kbd> Pan hand',
          '<kbd>P</kbd> Pen &nbsp;&nbsp; <kbd>I</kbd> Highlighter &nbsp;&nbsp; <kbd>E</kbd> Eraser',
          '<kbd>L</kbd> Connector &nbsp;&nbsp; <kbd>T</kbd> Text &nbsp;&nbsp; <kbd>Shift+T</kbd> SDF Text',
          '<kbd>S</kbd> Section &nbsp;&nbsp; <kbd>M</kbd> Stamp',
          '<kbd>Delete</kbd> Delete selected &nbsp;&nbsp; <kbd>+</kbd> / <kbd>-</kbd> Zoom in/out',
          '<kbd>F</kbd> Toggle fullscreen &nbsp;&nbsp; <kbd>X</kbd> Toggle UI chrome',
        ]},
      ],
    },
    {
      id: 'illustrations', tag: 'Illustrations', theme: 'green',
      topics: [
        { id: 'ill-gs', label: 'Getting Started', items: [
          'Click <strong>+ Add</strong> → <strong>New Illustration</strong> from the dashboard',
          'Choose canvas size and background color',
          'The illustration editor opens with the layer panel on the right',
          'Add layer types from the <strong>+</strong> menu in the layers panel',
        ]},
        { id: 'ill-layers', label: 'Layer Types', items: [
          '<strong>Raster</strong> — GPU-accelerated paint layer; supports blend mode and opacity',
          '<strong>3D Scene</strong> — full WebGPU 3D workspace composited as a layer',
          '<strong>Folder</strong> — group layers together; blend mode and opacity apply to the whole group',
          '<strong>Reference</strong> — import an image as a non-destructive tracing reference (does not export)',
          'Layers are composited in order; drag to reorder',
        ]},
        { id: 'ill-livetext', label: 'Live Text', items: [
          'Click any text node to enter edit mode',
          'Font, size, alignment, and line height are editable in the inspector',
          'Five GPU shader effects per text node: <strong>Chromatic Aberration, Glow, Wave, Glitch, Outline</strong>',
          'Quick-start with presets: <em>Impact, Energy, Ghost, Horror, Glitch, Clean, Neon, Boom</em>',
          'Effects render in real time — text never flattens and stays editable',
        ]},
        { id: 'ill-balloons', label: 'Speech Balloons', items: [
          'Add via toolbar → <strong>Speech Balloon</strong>',
          'Five styles: <strong>Rounded, Ellipse, Cloud, Burst, Thought</strong>',
          'Drag the tail anchor to point at any character',
          'Text inside is editable live text',
        ]},
        { id: 'ill-html', label: 'HTML Texture', items: [
          'Embed a real DOM node (video, iframe, div) as a layer',
          'The HTML renders on an OffscreenCanvas and composites as a texture',
          'Useful for embedding live data, web components, or iframes',
          'Set resolution (Low / Medium / High) in the 3D panel inspector',
        ]},
        { id: 'ill-effects', label: 'Canvas Effects', items: [
          'Paper texture overlays apply over the entire canvas as a post-process',
          'Six textures: <strong>Cold Press, Hot Press, Canvas Linen, Rough, Watercolor, Newsprint</strong>',
          'Set the canvas background to a solid color or leave it transparent',
        ]},
      ],
    },
    {
      id: '3d', tag: '3D & Animation', theme: 'blue',
      topics: [
        { id: '3d-setup', label: 'Setup', items: [
          'In any illustration, click <strong>+ Add Layer</strong> → <strong>3D Scene</strong>',
          'Click the 3D Scene layer entry to open the 3D panel',
          'The 3D viewport renders over the illustration canvas',
          'Add primitives via <strong>+ Add Mesh ▼</strong> or import a GLB/OBJ file',
        ]},
        { id: '3d-gizmos', label: 'Transform Gizmos', items: [
          'Select <strong>Move</strong>, <strong>Rotate</strong>, or <strong>Scale</strong> from the 3D toolbar to activate a gizmo',
          'Click the active tool button again to deselect the gizmo',
          '<strong>W / L</strong> toolbar button toggles World / Local orientation',
          'Gizmo handles are drawn by WebGPU — click directly on the axis handles to drag',
        ]},
        { id: '3d-array', label: 'Array Tool (Repeat)', items: [
          'Select the <strong>⊞ Repeat</strong> button in the toolbar',
          'Hover a mesh to see face-arrow handles; click one to create an array',
          '<strong>Line</strong> — instances along a single axis',
          '<strong>Grid</strong> — N×M instances across two axes',
          '<strong>Radial</strong> — N instances in a ring; supports World/Local axis',
          'Edit the source mesh live — all instances update instantly',
          '<strong>Bake</strong> to convert to independent meshes',
        ]},
        { id: '3d-materials', label: 'Materials & Render Styles', items: [
          '<strong>Default</strong> — Gouraud shading (PS1-style)',
          '<strong>Cel</strong> — stepped diffuse + hard specular (toon/anime)',
          '<strong>Sketch</strong> — procedural crosshatch overlay',
          '<strong>Ink</strong> — two-tone + rim darkening (manga look)',
          'Upload a diffuse texture or normal map per mesh',
          'Multi-material submesh slots for imported GLBs',
        ]},
        { id: '3d-cloth', label: 'Cloth Simulation', items: [
          'Click <strong>+ Add Mesh ▼</strong> → <strong>Cloth</strong>',
          'Set grid size (cols × rows) and cell size in the Cloth Builder',
          'Simulation modes: Off, Hang (pinned top row), Drape (over proxy)',
          'Editor modes: Draw pins, Paint stiffness, Stitch connections',
          'Enable live physics for real-time simulation',
          'Add wind animation via Frame Link Animation (type: wind)',
        ]},
        { id: '3d-keyframes', label: 'Keyframe Animation', items: [
          'Open the <strong>Animation Timeline</strong> at the bottom',
          'Select a mesh, set the playhead to a frame, then click <strong>Record Keyframe</strong>',
          'Transform keyframes: position, rotation, scale',
          'Playback syncs with the illustration timeline (or runs independently)',
          'Undo/redo: <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>',
        ]},
        { id: '3d-ps1', label: 'PS1 Effects', items: [
          '<strong>Vertex Jitter</strong> — clip-space grid snap (wobble effect)',
          '<strong>Snap Grid</strong> — virtual resolution (e.g. 160 = PS1 resolution)',
          '<strong>Affine Warp</strong> — 0 = perspective correct, 1 = full PS1 affine',
          '<strong>Color Depth</strong> — Gouraud quantization levels (32 ≈ PS1)',
        ]},
        { id: '3d-editmesh', label: 'Edit Mesh Basics', items: [
          'Select a mesh and press <kbd>Tab</kbd> to enter Edit Mesh mode',
          'Choose Vertex, Face, or Edge selection mode in the Edit Mesh panel',
          'Face ops: Extrude, Inset, Delete — operate on selected faces',
          'Edge ops: Loop Cut, Bevel, Dissolve, Knife Cut, Bridge Loops',
          'Vertex ops: Weld two vertices by index',
          'Press <kbd>Tab</kbd> again or click ← Exit to leave edit mode',
        ]},
        { id: '3d-editmesh-p2', label: 'Edit Mesh — Advanced', items: [
          '<strong>Flip Normals</strong> — reverses face winding on selected faces; fixes inside-out imported geometry',
          '<strong>Subdivide Face</strong> — inserts a center vertex and edge midpoints, splitting one n-gon into n quads',
          '<strong>Separate Faces</strong> — extracts selected faces into a new Mesh3D node at the same position',
          '<strong>Fill Hole</strong> — caps an open boundary loop with a single n-gon face',
          '<strong>Merge by Distance</strong> — welds vertices within a threshold; returns count removed (0.001 = mm precision)',
          'Multi-select: Extrude, Inset, Delete, and Flip Normals all operate on the full face selection at once',
        ]},
        { id: '3d-proportional', label: 'Proportional Editing', items: [
          'Toggle <strong>Proportional Edit</strong> in the Edit Mesh panel to enable soft-selection',
          'Set <strong>Radius</strong> (world units) — all vertices within this sphere follow the moved vertex with falloff',
          '<strong>Smooth</strong> — quadratic ease-out (default); <strong>Linear</strong> — linear ramp; <strong>Sharp</strong> — step falloff',
          'Settings survive project save/load',
        ]},
      ],
    },
    {
      id: 'armature', tag: 'Armatures', theme: 'orange',
      topics: [
        {
          id: 'arm-overview', label: 'Overview',
          paras: ['The armature system lets you build rigs from scratch, bind meshes, paint vertex weights, author animation clips, and retarget animations — without any external tool.'],
          items: [
            '<strong>Skeleton</strong> — the rig container; holds a flat array of joints in topological order',
            '<strong>Joint (Bone)</strong> — a named transform; has a head (position), a tail direction, and an optional parent',
            '<strong>Bone Overlay</strong> — diamond sticks with sphere handles drawn in the viewport; always visible even through the mesh',
            '<strong>SkinnedMesh3D</strong> — a mesh bound to a skeleton; deforms as joints rotate',
            '<strong>Inverse Bind Matrix</strong> — baked from joint world positions at bind time; defines the rest pose',
            '<strong>Clip</strong> — a named animation with per-joint keyframe tracks (translation / rotation / scale)',
          ],
        },
        { id: 'arm-create', label: 'Create Skeleton', items: [
          'Click <strong>Armature</strong> in the 3D panel sidebar to open the panel',
          'Type a name and click <strong>+ New</strong> — the bone overlay activates immediately and a click-to-place banner appears',
          'Click in the viewport to place the first joint on the mesh surface (or click into empty space for a default position)',
          'The T/R/S gizmo and mesh click-to-select are suppressed automatically while the overlay is active — closing the panel restores normal interaction and the camera view',
          'Select a different skeleton in the list to switch the active overlay',
          'Use the <strong>background dropdown</strong> in the panel header to change the focus-mode background: <em>Wavy</em> (animated), <em>Gradient</em>, <em>Dim</em> (overlay over scene), <em>Solid</em>, or <em>None</em>',
          'Click <strong>Focus</strong> in the Bind Mesh section to center the camera on the bound mesh at any time (<code>sm.centerCameraOnMesh3D(meshId)</code>)',
        ]},
        { id: 'arm-bones', label: 'Add & Edit Bones', items: [
          '<strong>+ Add Bone</strong> — enters click-to-place mode; the click defines the bone\'s tail, the head auto-snaps to the selected joint\'s tail (or origin for a root)',
          '<strong>Extrude</strong> — creates a child at the parent\'s tail continuing the same direction, then enters click-to-place so you can reposition the tip',
          'Click a joint row to select it; <strong>Head XYZ</strong> inputs fill automatically — edit and click <strong>Set</strong>; joints can also be dragged by their sphere in the viewport',
          '<strong>Leaf joints</strong> show a <em>Tail XYZ</em> row and a draggable gray sphere at the bone tip — drag or set numerically to control bone length and direction; tail is visual only and does not affect skinning',
          'Click <strong>✎</strong> to rename inline, <strong>✕</strong> to delete — deletion removes the joint <em>and all its descendants</em> and re-numbers all remaining indices',
          '<em>Use "Add at coordinates" (collapsed section)</em> to place a bone numerically by specifying parent index and XYZ position directly',
        ]},
        { id: 'arm-bind', label: 'Bind Mesh', items: [
          'Select a mesh and a skeleton in the Bind section of the Armature panel',
          'Click <strong>Bind</strong> — auto-weights every vertex to the nearest 4 joints by inverse-distance²',
          'The mesh is upgraded to a <strong>SkinnedMesh3D</strong> (same ID, same position)',
          'Tip: pose the skeleton into the desired bind/rest pose <em>before</em> binding — inverse bind matrices are baked from the current joint world positions',
          'Re-bind after calling <code>moveBone3D</code> to update the rest pose',
        ]},
        {
          id: 'arm-weights', label: 'Weight Painting',
          paras: ['Weight paint shows per-vertex joint influence as a heatmap: blue = 0, green = 0.5, red = full influence.'],
          items: [
            'Select a joint from the dropdown, then click <strong>Enter Weight Paint</strong>',
            'The mesh must already be bound (<code>bindMeshToSkeleton3D</code>) and editable (<code>makeEditable3D</code>)',
            'Paint with <code>sm.paintWeightDab3D(meshId, jointIdx, vertexIndices, targetWeight, brushStrength)</code>',
            'Weights are automatically normalized to sum 1 after each dab',
            'Click <strong>Normalize</strong> to manually force normalization',
            'Click <strong>Exit Weight Paint</strong> to restore original vertex colors',
          ],
        },
        { id: 'arm-clips', label: 'Animation Clips', items: [
          'Click <strong>New Clip</strong> — set name, FPS, and end frame',
          '<strong>Record Pose at Frame</strong> — snapshots the current skeleton pose for all joints at the given frame',
          'Use <strong>Set Keyframe</strong> for individual joint/channel/frame overrides (translation / rotation / scale)',
          '<strong>Play</strong> previews the clip live; <strong>Stop</strong> returns to the rest pose',
          'Clips are stored in <code>skeleton.data.clips[]</code> and saved with the project automatically',
          'GLTF-imported clips and authored clips both play via <code>sm.playSkeletonClip3D(skelId, clip)</code>',
        ]},
        { id: 'arm-retarget', label: 'Retargeting', items: [
          'Pick a source clip and a target skeleton, then click <strong>Retarget</strong>',
          'Tracks are copied by matching joint names (case-insensitive); unmatched joints are skipped',
          'The new clip is named <em>originalName (retargeted)</em> and appears in the target skeleton\'s clip list',
          'Both skeletons must use the same joint naming convention for best results',
          'After retargeting, review the clip and adjust any mismatched keyframes',
        ]},
      ],
    },
    {
      id: 'grease-pencil', tag: 'Grease Pencil', theme: 'red',
      topics: [
        {
          id: 'gp-overview', label: 'Overview',
          paras: ['Grease Pencil lets you draw 2D strokes directly in 3D world space — on or around characters. Strokes can follow a skeleton joint, be keyframe-animated, and optionally filled with flat color.'],
          items: [
            '<strong>GP Object</strong> — the top-level container; holds one or more layers',
            '<strong>GP Layer</strong> — organises strokes within a GP object; rendered bottom-to-top',
            '<strong>GP Stroke</strong> — a single polyline of 3D world-space points with color, width, and optional fill',
            '<strong>Bone parenting</strong> — a stroke follows a skeleton joint (<code>parentJoint</code> = joint name); zero CPU cost (vertex shader)',
            '<strong>Keyframe</strong> — a frame-specific snapshot of a layer\'s strokes; frames without one fall back to the base strokes',
          ],
        },
        { id: 'gp-drawing', label: 'Drawing Strokes', items: [
          'Call <code>sm.beginGpStroke3D(gpId, layerId, color, baseWidth, opts?)</code> on <em>pointerdown</em> — returns a <code>strokeId</code>',
          'Call <code>sm.addGpPoint3D(worldX, worldY, worldZ, pressure, opacity)</code> on each <em>pointermove</em>',
          'Call <code>sm.endGpStroke3D()</code> on <em>pointerup</em> — strokes with fewer than 2 points are auto-discarded',
          'Project pointer events to 3D using NDC → clip space → world via the camera\'s inverse view-projection matrix',
          'Optional: pass <code>{ parentJoint, fillColor, closed }</code> in the options object to <code>beginGpStroke3D</code>',
        ]},
        { id: 'gp-erase', label: 'Erase Tool', items: [
          'On <em>pointermove</em> while the eraser is active, call <code>sm.eraseGpStrokes3D(gpId, layerId, [worldX, worldY, worldZ], radius)</code>',
          'Radius is in world units — tune to match the visual eraser cursor size',
          'Pass an optional <code>frame</code> argument to erase only within a specific keyframe\'s strokes',
        ]},
        { id: 'gp-keyframes', label: 'Keyframe Animation', items: [
          'Save a snapshot: <code>sm.setGpKeyframe3D(gpId, layerId, frame)</code>',
          'Remove a snapshot: <code>sm.clearGpKeyframe3D(gpId, layerId, frame)</code>',
          'Frames without a keyframe fall back to the layer\'s base strokes',
          'Keyframe snapshots are stored as deep copies of the points array — memory scales with keyframe count × average stroke count',
        ]},
        { id: 'gp-fill', label: 'Closed & Filled Strokes', items: [
          'Enable <strong>Closed</strong> before drawing — the last point auto-connects back to the first',
          'Enable <strong>Filled</strong> and pick a fill color — fill renders behind the outline stroke',
          'Pass <code>{ fillColor: { r, g, b, a }, closed: true }</code> in the options to <code>beginGpStroke3D</code>',
          'Useful for cartoon shadow flats, color fills, and graphic shapes',
        ]},
        { id: 'gp-parenting', label: 'Bone Parenting', items: [
          'Get joint names from the character skeleton: <code>sm.getSkeleton3D(charData.skeletonId)?.data.joints.map(j => j.name)</code>',
          'Populate a dropdown with the joint list and a "none" option',
          'Pass the selected joint name as <code>parentJoint</code> in <code>beginGpStroke3D</code>',
          'The stroke follows the joint with zero CPU cost — all transform math runs in the vertex shader',
        ]},
        { id: 'gp-layers', label: 'Layer Management', items: [
          'Create a GP object: <code>sm.createGpObject3D(name, skeletonId?)</code> — returns <code>gpId</code>',
          'Add a layer: <code>sm.addGpLayer3D(gpId, name)</code> — returns <code>layerId</code>',
          'Remove a layer: <code>sm.removeGpLayer3D(gpId, layerId)</code>',
          'Remove the whole object: <code>sm.removeGpObject3D(gpId)</code>',
          'Toggle visibility or opacity by mutating <code>gpObj.getLayer(layerId).visible</code> / <code>.opacity</code>, then calling <code>sm.scheduleRender3D()</code>',
          'GP objects are included in <code>packProject()</code> / <code>unpackProject()</code> — no extra save wiring needed',
        ]},
        { id: 'gp-api', label: 'API Reference', items: [
          '<code>createGpObject3D(name, skeletonId?)</code> → gpId',
          '<code>addGpLayer3D(gpId, name)</code> → layerId',
          '<code>removeGpLayer3D(gpId, layerId)</code>',
          '<code>removeGpObject3D(gpId)</code>',
          '<code>beginGpStroke3D(gpId, layerId, color, baseWidth, opts?)</code> → strokeId',
          '<code>addGpPoint3D(x, y, z, pressure, opacity)</code>',
          '<code>endGpStroke3D()</code>',
          '<code>eraseGpStrokes3D(gpId, layerId, center, radius, frame?)</code>',
          '<code>setGpKeyframe3D(gpId, layerId, frame)</code>',
          '<code>clearGpKeyframe3D(gpId, layerId, frame)</code>',
          '<code>setGpRenderOrder3D(gpId, order)</code> — controls draw order within the GP group',
        ]},
      ],
    },
    {
      id: 'inference', tag: 'Local Inference', theme: 'gold',
      topics: [
        { id: 'li-what', label: 'What is Local Inference?', paras: [
          'Frogmarks can connect to a locally-running language model and use it to manipulate your 3D scene via natural language. The model runs entirely on your machine — nothing is sent to the cloud.',
          'You can say things like <em>"add 6 fence posts in a circle"</em> or <em>"make all the cubes blue and give them the cel render style"</em> and the model will call the right Salsa tools automatically.',
        ]},
        { id: 'li-install', label: 'Step 1 — Install Ollama', items: [
          'Download Ollama from <strong>ollama.com</strong>',
          'Install and start it — it runs as a background service',
          'Pull a model: <code>ollama pull llama3.2</code>',
          'Ollama listens on <code>http://localhost:11434</code> by default',
        ]},
        {
          id: 'li-cors', label: 'Step 2 — Fix CORS',
          paras: ['Browsers block cross-origin requests to localhost by default. Set the <code>OLLAMA_ORIGINS</code> environment variable before starting Ollama:'],
          items: [
            '<strong>macOS / Linux:</strong> <code>OLLAMA_ORIGINS=* ollama serve</code>',
            '<strong>Windows:</strong> Set <code>OLLAMA_ORIGINS=*</code> in System Environment Variables, then restart Ollama',
            'Frogmarks will show a CORS error message if this step is skipped',
          ],
        },
        { id: 'li-connect', label: 'Step 3 — Connect', items: [
          'On the dashboard, click <strong>Connect</strong> in the Local Inference sidebar widget',
          'Enter your server URL (default: <code>http://localhost:11434</code>)',
          'Click <strong>Connect</strong> — available models will populate',
          'Select a model from the dropdown',
          'Connection settings are saved to localStorage',
        ]},
        {
          id: 'li-models', label: 'Supported Models',
          paras: ['Models must support tool/function calling for scene manipulation:'],
          items: [
            '<strong>Llama 3.2</strong> (3B / 11B) — fast, good tool use',
            '<strong>Llama 3.1</strong> (8B / 70B) — high quality reasoning',
            '<strong>Mistral 7B</strong> — fast, reliable',
            '<strong>Qwen 2.5</strong> (7B / 14B) — excellent for structured output',
            '<strong>Phi-3</strong> (3.8B / 14B) — lightweight, good for weaker hardware',
            'For vision (seeing the canvas): <strong>LLaVA</strong>, <strong>moondream2</strong>, or <strong>Llama 3.2 Vision</strong>',
          ],
        },
        { id: 'li-tools', label: 'Available Scene Tools', items: [
          '<code>get_scene_graph</code> — read the full hierarchy',
          '<code>create_primitive</code> — add box, sphere, cylinder, plane, torus',
          '<code>select_mesh</code> — select a node by ID',
          '<code>set_transform</code> — move, rotate, or scale a mesh',
          '<code>set_material</code> — change color and render style',
          '<code>delete_mesh</code> — remove a node',
          '<code>create_linear_array</code> — stamp N instances along an axis',
          '<code>create_radial_array</code> — stamp N instances in a ring',
          '<code>get_viewport_screenshot</code> — let the model see the scene',
        ]},
        { id: 'li-servers', label: 'LM Studio & Others', items: [
          'Any OpenAI-compatible server works — just change the base URL',
          '<strong>LM Studio</strong> default: <code>http://localhost:1234</code>',
          '<strong>Jan.ai</strong> default: <code>http://localhost:1337</code>',
          '<strong>llama.cpp server</strong>: typically <code>http://localhost:8080</code>',
          'CORS setup is required for all browser-based connections',
        ]},
        { id: 'li-tips', label: 'Tips', items: [
          'Start with <em>"what\'s in my scene?"</em> to let the model orient itself',
          'Give spatial context: <em>"along the X axis"</em>, <em>"in a circle around the origin"</em>',
          'Larger models (70B) produce more reliable tool calls but are slower',
          'For speed: 3B–7B model locally; for quality: Llama 3.1 70B via a local server',
          'Use a vision model with <code>get_viewport_screenshot</code> for spatially-aware edits',
        ]},
      ],
    },
    {
      id: 'frogcarts', tag: 'FrogCarts', theme: 'pink',
      topics: [
        { id: 'fc-what', label: 'What are FrogCarts?', paras: [
          'A <strong>.frogcart</strong> is a self-contained, read-only snapshot of a Frogmarks project. Think of it like a game cartridge — it contains everything needed to view the content, with no editing access.',
          'Your editable source is a <strong>.frogmarks</strong> file. You export a <strong>.frogcart</strong> to share it.',
        ]},
        { id: 'fc-ecosystem', label: 'The Ecosystem', items: [
          '<strong>.frogmarks</strong> — editable project (lives in OPFS)',
          '<strong>.frogcart</strong> — distributable cart (ZIP with a manifest.json)',
          '<strong>FrogPlayer</strong> — loads and plays .frogcart files',
          'No algorithmic feed. No follower count. Just carts you choose to load.',
        ]},
        { id: 'fc-types', label: 'Cart Types', items: [
          '<strong>illustration</strong> — static or animated illustration',
          '<strong>board</strong> — a drawing board snapshot',
          '<strong>animation</strong> — looping or interactive animation',
          'Type is declared in the cart\'s <code>manifest.json</code>',
        ]},
        {
          id: 'fc-format', label: '.frogcart Format',
          paras: ['A .frogcart is a ZIP archive containing:'],
          items: [
            '<code>manifest.json</code> — metadata (title, author, type, version)',
            '<code>payload/</code> — project data (illustration JSON, raster blobs, 3D mesh buffers)',
            '<code>preview.png</code> — thumbnail shown in FrogPlayer',
            '<code>assets/</code> — embedded fonts, textures, and audio (optional)',
          ],
        },
        { id: 'fc-player', label: 'FrogPlayer', items: [
          'Access FrogPlayer from the dashboard sidebar',
          'Drop a .frogcart file to load it',
          'Your collection of loaded carts appears in the strip at the bottom',
          'FrogPlayer is read-only — the original .frogmarks is never modified',
        ]},
        {
          id: 'fc-streetpass', label: 'StreetPass (Future)',
          paras: ['StreetPass will allow passive, proximity-based cart exchange between devices via BLE or Nearby APIs — like the Nintendo 3DS StreetPass feature.'],
          items: [
            'Walk near another Frogmarks user → auto-exchange featured carts',
            'No internet required; fully peer-to-peer',
            'Opt-in per cart; privacy-first design',
          ],
        },
      ],
    },
    {
      id: 'reference', tag: 'Reference', theme: 'teal',
      topics: [
        { id: 'ref-board', label: 'Board Editor', items: [
          '<kbd>V</kbd> / <kbd>Esc</kbd> Cursor &nbsp;&nbsp; <kbd>H</kbd> Pan hand',
          '<kbd>P</kbd> Pen &nbsp;&nbsp; <kbd>I</kbd> Highlighter &nbsp;&nbsp; <kbd>E</kbd> Eraser',
          '<kbd>L</kbd> Connector &nbsp;&nbsp; <kbd>T</kbd> Text &nbsp;&nbsp; <kbd>Shift+T</kbd> SDF Text',
          '<kbd>S</kbd> Section &nbsp;&nbsp; <kbd>M</kbd> Stamp',
          '<kbd>Delete</kbd> Delete selected &nbsp;&nbsp; <kbd>+</kbd> / <kbd>-</kbd> Zoom',
          '<kbd>F</kbd> Fullscreen &nbsp;&nbsp; <kbd>X</kbd> Toggle UI chrome',
        ]},
        { id: 'ref-ill', label: 'Illustration Editor', items: [
          '<kbd>Ctrl+Z</kbd> Undo &nbsp;&nbsp; <kbd>Ctrl+Y</kbd> / <kbd>Ctrl+Shift+Z</kbd> Redo',
          '<kbd>Ctrl+S</kbd> Save (auto-save runs continuously)',
          '<kbd>Space + drag</kbd> Pan',
          '<kbd>Ctrl + scroll</kbd> Zoom in/out',
          '<kbd>0</kbd> Reset zoom to 100%',
        ]},
        { id: 'ref-3d-panel', label: '3D Panel', items: [
          '<kbd>Tab</kbd> Enter / exit Edit Mesh mode',
          '<kbd>Delete</kbd> Delete selected mesh',
          '<kbd>Ctrl+D</kbd> Duplicate mesh',
          '<kbd>Ctrl+Z</kbd> Undo 3D &nbsp;&nbsp; <kbd>Ctrl+Y</kbd> Redo 3D',
        ]},
        { id: 'ref-3d-cam', label: '3D Camera', items: [
          'Enable <strong>Orbit</strong> mode in the toolbar to orbit-drag',
          'Scroll to dolly in/out',
          'Middle-click drag to pan the 3D camera',
          '<strong>Frame All</strong> button centers all meshes in view',
        ]},
        {
          id: 'ref-salsa', label: 'Salsa ShapeManager API',
          paras: ['Key 3D methods on <code>shapeManager</code>:'],
          items: [
            '<code>scene3d.createBox(x, y, z)</code> — add a box primitive',
            '<code>scene3d.setPosition(id, x, y, z)</code>',
            '<code>scene3d.setRotation(id, rx, ry, rz)</code> — radians',
            '<code>scene3d.setScale(id, sx, sy, sz)</code>',
            '<code>scene3d.setDiffuseColor(id, r, g, b)</code>',
            '<code>setRenderStyle3D(id, style)</code> — \'default\'|\'cel\'|\'sketch\'|\'ink\'',
            '<code>createLinearArray3D(sourceId, count?, spacing?)</code>',
            '<code>createRadialArray3D(sourceId, count?, radius?, axis?, arcDeg?)</code>',
            '<code>bakeArray3D(groupId)</code>',
            '<code>getScene3DHierarchy()</code> — full node tree',
          ],
        },
        {
          id: 'ref-li-api', label: 'Local Inference API',
          paras: ['Frogmarks exports <code>LocalInferenceService</code>:'],
          items: [
            '<code>testConnection()</code> — connects and fetches model list',
            '<code>setBaseUrl(url)</code> — update server URL',
            '<code>setSelectedModel(name)</code>',
            '<code>chat(messages, tools?)</code> — single completion',
            '<code>runAgentLoop(system, prompt, tools, executor)</code> — full agentic loop',
            '<code>connectionStatus$</code> — Observable: \'disconnected\'|\'connecting\'|\'connected\'|\'error\'',
            '<code>availableModels$</code> — Observable: OllamaModel[]',
          ],
        },
      ],
    },
  ];

  constructor(private router: Router) {}

  toggleSection(id: string): void {
    if (this.activeSectionId === id) return;
    this.activeSectionId = id;
    const section = this.sections.find(s => s.id === id);
    if (section?.topics.length) {
      this.selectedTopicId = section.topics[0].id;
    }
  }

  selectTopic(topicId: string): void {
    this.selectedTopicId = topicId;
  }

  getSelectedTopic(): DocTopic | undefined {
    for (const s of this.sections) {
      const t = s.topics.find(t => t.id === this.selectedTopicId);
      if (t) return t;
    }
    return undefined;
  }

  getSelectedSection(): DocSection | undefined {
    return this.sections.find(s => s.topics.some(t => t.id === this.selectedTopicId));
  }

  goBack(): void {
    if (this.embedded) {
      this.closed.emit();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
