# Demo Scene Builder - Developer Documentation

## What Is This?

A web-based tool for creating animated visual demos (demoscene-style) using layered tracks and scenes. Think of it as a timeline-based animation editor where tracks control layering (z-index) and each scene contains JavaScript code that draws to a canvas. All rendering is deterministic and time-based, allowing you to scrub through the timeline and see live previews while editing.

---

## Core Concepts

### **Tracks**
- Control the **z-index** (rendering order/layering)
- Control the **render target** (main canvas, buffer1, buffer2)
- Can contain **multiple scenes**
- Only one scene per track is active at any given time

### **Scenes**
- Contain the actual rendering **code**
- Have independent **start/end times**
- Execute when the playhead is within their time range
- Automatically positioned after the previous scene when added

### **Buffers**
- Offscreen canvases (buffer1, buffer2) for post-processing
- Buffer tracks render "invisibly" - shown in **blue** in timeline
- Access buffers from main canvas scenes using `getBuffer(name)`

---

## Core Features

### 1. **Layered Track System with Z-Index**
- Tracks render in z-index order (lower = behind, higher = in front)
- Each track can render to the main canvas or offscreen buffers
- Drag tracks to different z-index positions
- Visual distinction for buffer tracks (blue color)

### 2. **Scene-Based Timeline**
- Each track contains multiple scenes
- Only one scene per track is active at any time
- Scenes automatically positioned after the previous one
- Drag scenes to adjust timing
- Selected scenes highlighted in timeline

### 3. **Live Code Editing with Error Detection**
- Edit scene code in real-time
- **Syntax checking** with live error display
- **Runtime error** detection and reporting
- Console output panel showing errors
- Red border on code editor when errors present
- Cursor position preserved during auto-save
- Changes visible immediately when paused

### 4. **Timeline & Playback**
- Visual timeline showing all tracks and their scenes
- Scrubbing: Click anywhere on timeline to jump to that time
- Play/Pause: Standard playback controls
- Step Controls: Jump forward/backward by 1 second
- Red playhead shows current position
- Auto-expanding duration based on scenes

### 5. **Configurable Canvas**
- Adjust canvas dimensions dynamically
- Settings persist in localStorage
- Default: 800×600

### 6. **Render Targets**
- **Main**: Render directly to visible canvas
- **Buffer 1/2**: Render to offscreen canvas (invisible, shown in blue)
- Buffers accessible via `getBuffer('buffer1')` in scene code
- Use buffers for post-processing, compositing, and effects

---

## How It's Built

### Architecture Overview

```
DemoBuilder (main class)
├── Playback System (time tracking, play/pause)
├── Track Management (CRUD, z-index ordering)
├── Scene Management (CRUD within tracks)
├── Rendering Engine (z-indexed, buffer-aware pipeline)
├── UI Management (timeline, editor, track/scene lists)
├── Error Detection (syntax & runtime checking)
└── Persistence (localStorage auto-save with migration)
```

### Key Technical Decisions

**1. Track/Scene Separation**
```javascript
Track {
    id, name, zIndex, renderTarget,
    scenes: [
        { id, name, startTime, endTime, code, errors... }
    ]
}
```
- Tracks control layering and output destination
- Scenes control timing and rendering logic
- One active scene per track at any time

**2. Time-Based Deterministic Rendering**
- All effects are pure functions of time: `render(ctx, time, ...)`
- No accumulated state between frames
- This allows seeking to ANY point without playing from start
- Example: `x = Math.sin(t / 1000) * 100` (not `x += velocity`)

**3. Function Constructor Pattern with Utilities**
```javascript
const renderFunc = new Function(
    'ctx', 't', 'w', 'h', 'startTime', 'endTime',
    'seededRandom', 'getBuffer',
    scene.code
);
renderFunc(ctx, localTime, width, height, scene.startTime, scene.endTime, seededRandom, getBuffer);
```
- Allows execution of user code strings
- Built-in utilities injected into scope
- Errors caught and displayed in console panel

**4. Z-Index Rendering Pipeline**
```
1. Sort tracks by z-index (ascending)
2. For each track:
    a. Find active scene at currentTime
    b. Calculate localTime = currentTime - scene.startTime
    c. Get/create render target (main or buffer)
    d. Execute scene code with parameters
    e. Catch and display any errors
3. Buffer tracks render invisibly
4. Main tracks can access buffers via getBuffer()
```

**5. Buffer System**
- Buffer tracks (renderTarget !== 'main') render to offscreen canvas
- They do NOT automatically composite to main canvas
- Main canvas scenes access buffers using `getBuffer('buffer1')`
- Enables post-processing, layering effects, and compositing

**6. Auto-Save Strategy**
- Saves entire state to localStorage on every change
- Code editor uses debounced save (500ms delay)
- Cursor position preserved during auto-save
- State includes: tracks array (with scenes), duration, canvas dimensions
- Loads automatically on page load with migration from old format

**7. Error Detection**
- **Syntax errors**: Detected on code change (500ms debounce)
- **Runtime errors**: Caught during rendering
- Both displayed in console output panel
- Red border on code editor when errors present
- Error state shown in timeline (red scene segments)

---

## How to Create Tracks & Scenes

### Track Workflow

1. **Create Track**: Click "+ Add Track"
2. **Set Z-Index**: Lower numbers render behind, higher in front
3. **Choose Render Target**:
   - Main (visible)
   - Buffer 1/2 (invisible, for post-processing)
4. **Add Scenes**: Click "+ Add Scene" in track editor

### Scene Workflow

1. **Add Scene**: Automatically starts after previous scene
2. **Write Code**: Use the code editor with live error checking
3. **Adjust Timing**: Drag in timeline or edit start/end times
4. **Live Preview**: Pause at any time, edit, see results immediately
5. **Iterate**: Changes auto-save, scrub timeline to test

### Available Parameters in Scene Code

Every scene receives these parameters in scope:

```javascript
// ctx: CanvasRenderingContext2D - Canvas context to draw on
// t: number - Time in milliseconds since scene started (0 to scene duration)
// w: number - Canvas width
// h: number - Canvas height
// startTime: number - Scene's global start time (ms)
// endTime: number - Scene's global end time (ms)
// seededRandom(seed): function - Deterministic random number generator
// getBuffer(name): function - Get buffer canvas ('buffer1', 'buffer2')
```

---

## Examples

### Example 1: Simple Color Fade

```javascript
// Calculate progress (0 to 1)
const progress = t / (endTime - startTime);

// Animate hue over time
const hue = progress * 360;

ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
ctx.fillRect(0, 0, w, h);
```

### Example 2: Bouncing Circle

```javascript
// Use sine wave for bounce (deterministic)
const y = h/2 + Math.sin(t / 500) * 100;
const x = (t / 10) % w; // Move across screen

ctx.fillStyle = '#00ff00';
ctx.beginPath();
ctx.arc(x, y, 30, 0, Math.PI * 2);
ctx.fill();
```

### Example 3: Text with Effects

```javascript
const progress = t / (endTime - startTime);

// Fade in
const alpha = Math.min(1, progress * 2);

// Scale effect
const scale = 0.5 + progress * 0.5;

ctx.save();
ctx.globalAlpha = alpha;
ctx.translate(w/2, h/2);
ctx.scale(scale, scale);

ctx.fillStyle = 'white';
ctx.font = 'bold 64px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('DEMO SCENE', 0, 0);

ctx.restore();
```

### Example 4: Particle System with seededRandom

```javascript
const particleCount = 50;

for (let i = 0; i < particleCount; i++) {
    // Deterministic positions based on time and index
    const seed = i * 1000;
    const x = seededRandom(seed) * w;
    const speed = seededRandom(seed + 1) * 0.2 + 0.1;
    const y = (t * speed + seededRandom(seed + 2) * h) % h;
    const size = seededRandom(seed + 3) * 3 + 1;

    ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + seededRandom(seed + 4) * 0.5})`;
    ctx.fillRect(x, y, size, size);
}
```

### Example 5: Using Buffers for Post-Processing

**Track 1** (z-index: 0, renders to **buffer1**):
```javascript
// Draw complex background pattern to buffer1
for (let i = 0; i < 20; i++) {
    const x = (i * 40 + t / 10) % w;
    ctx.strokeStyle = `hsl(${i * 18}, 70%, 50%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
}
```

**Track 2** (z-index: 1, renders to **main**):
```javascript
// Get buffer1 and apply effects
const buffer1 = getBuffer('buffer1');

if (buffer1) {
    const angle = (t / 1000) * Math.PI * 2;
    const scale = 0.8 + Math.sin(t / 500) * 0.2;

    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.translate(-w/2, -h/2);

    // Draw rotated/scaled buffer
    ctx.globalAlpha = 0.8;
    ctx.drawImage(buffer1, 0, 0);

    ctx.restore();
}

// Add foreground elements
ctx.fillStyle = 'white';
ctx.font = 'bold 48px Arial';
ctx.textAlign = 'center';
ctx.fillText('Buffered!', w/2, h/2);
```

### Example 6: Multi-Layer Composition

**Track 1** (z-index: 0, **buffer1**): Background pattern
```javascript
// Stars
for (let i = 0; i < 100; i++) {
    const x = seededRandom(i) * w;
    const y = seededRandom(i + 100) * h;
    const size = seededRandom(i + 200) * 2;
    const twinkle = Math.sin(t / 200 + i) * 0.5 + 0.5;

    ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
    ctx.fillRect(x, y, size, size);
}
```

**Track 2** (z-index: 5, **main**): Main content with buffer composite
```javascript
// Use buffer as background
const bg = getBuffer('buffer1');
if (bg) {
    ctx.globalAlpha = 0.7;
    ctx.drawImage(bg, 0, 0);
    ctx.globalAlpha = 1.0;
}

// Main animated element
const y = h/2 + Math.sin(t / 800) * 50;
ctx.fillStyle = '#00ff00';
ctx.beginPath();
ctx.arc(w/2, y, 40, 0, Math.PI * 2);
ctx.fill();
```

**Track 3** (z-index: 10, **main**): Overlay effects
```javascript
// Vignette effect
const gradient = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
gradient.addColorStop(0, 'rgba(0,0,0,0)');
gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, w, h);
```

---

## Important Principles

### DO:
- Use time-based calculations: `Math.sin(t / 1000)`
- Use `seededRandom(seed)` for reproducible randomness
- Calculate values from `t`, don't accumulate state
- Use `ctx.save()` and `ctx.restore()` for transformations
- Handle edge cases (division by zero, null buffers, etc.)
- Check if buffer exists: `if (getBuffer('buffer1')) { ... }`
- Use lower z-index for background layers, higher for foreground

### DON'T:
- Accumulate state: `x += velocity` (won't work when seeking)
- Forget to clear/reset context state
- Use external variables that change over time
- Rely on previous frame state
- Assume buffers auto-composite (they don't!)

---

## File Structure

```
demo-builder.html    # UI structure and styling
demo-builder.js      # Main DemoBuilder class and engine
README.md           # This file
```

**Key Classes/Objects:**
- `DemoBuilder` - Main application class
- `tracks[]` - Array of track objects
- `buffers` - Map of offscreen canvases

**Track Object Schema:**
```javascript
{
    id: number,              // Unique identifier
    name: string,            // Display name
    zIndex: number,          // Rendering order (lower = behind)
    renderTarget: string,    // 'main', 'buffer1', 'buffer2'
    enabled: boolean,        // Is track active?
    scenes: [                // Array of scenes in this track
        {
            id: number,
            name: string,
            startTime: number,
            endTime: number,
            code: string,
            hasError: boolean,
            errorMessage: string,
            runtimeError: string
        }
    ]
}
```

---

## UI Overview

### Timeline
- **Tracks** shown as rows (sorted by z-index)
- **Scenes** shown as segments within tracks
- **Buffer tracks** shown in blue
- **Selected scenes** highlighted brighter
- **Error scenes** shown in red
- **Drag scenes** to adjust timing
- **Click scenes** to edit

### Track/Scene Editor
- **Track mode**: Edit track properties, manage scenes
- **Scene mode**: Edit scene code with live error checking
- **Console output**: Shows syntax and runtime errors
- **Real-time updates**: All changes auto-save

### Tracks List
- Shows all tracks with z-index
- Buffer tracks labeled and colored blue
- Click to select track
- Scene count displayed

---

## Built-in Utilities

### `seededRandom(seed)`
Deterministic random number generator (0 to 1):
```javascript
const x = seededRandom(42);        // Always returns same value
const y = seededRandom(t + 100);   // Changes over time, but deterministically
```

### `getBuffer(name)`
Access offscreen buffer canvases:
```javascript
const buffer1 = getBuffer('buffer1');
if (buffer1) {
    ctx.drawImage(buffer1, 0, 0);
    // Or apply effects:
    ctx.globalAlpha = 0.5;
    ctx.filter = 'blur(5px)';
    ctx.drawImage(buffer1, 0, 0);
}
```

---

## Extending the System

### Add More Buffers
Extend the render target system to support buffer3, buffer4, etc. Update the UI selects and rendering logic.

### Add Easing Functions
Create a library of easing functions to inject into scene scope:
```javascript
const easeInOut = (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
```

### Add Effect Templates
Pre-populate scene code with common patterns (starfield, tunnel, plasma, etc.)

### Add Audio Sync
Integrate Web Audio API to sync animations with music.

---

## Troubleshooting

**Scene not visible?**
- Check start/end times vs current playhead position
- Verify track is enabled
- Check z-index ordering (might be behind other tracks)
- If track renders to buffer, it won't be visible directly

**Code errors?**
- Errors display in console output panel
- Red border appears on code editor
- Check browser console for detailed stack traces
- Verify all parameters are used correctly

**Seeking doesn't work?**
- Make sure code is time-based, not state-based
- Use `t` parameter, not accumulated counters
- Check that seededRandom uses consistent seeds

**Buffer not showing?**
- Buffer tracks are invisible - they only populate buffers
- Use `getBuffer('buffer1')` in a main canvas scene to display
- Check that buffer track has an active scene at current time

**Performance issues?**
- Reduce particle counts or complexity
- Optimize draw calls (use fewer paths/fills)
- Consider pre-rendering complex effects to buffers
- Use buffers to avoid re-computing expensive effects

---

## Workflow Tips

1. **Start with background layers** (low z-index, maybe buffer tracks)
2. **Add main content** (medium z-index)
3. **Add overlays/effects** (high z-index)
4. **Use buffers** for complex effects you want to reuse or transform
5. **Test frequently** by scrubbing the timeline
6. **Keep scenes short** and focused on one effect
7. **Name things clearly** so you can find them later

---

## Future Enhancement Ideas

- Syntax highlighting in code editor
- Scene duplication/templates
- Export to video or standalone HTML
- Easing function library built-in
- Post-processing effect chains
- Track groups/folders
- Keyframe system for parameters
- WebGL support for advanced effects
- Audio waveform visualization
- Scene presets library
- Collaborative editing

---

**Built with:** Vanilla JavaScript, Canvas 2D API, localStorage
**Architecture:** Track/Scene separation, z-indexed rendering, buffer system, deterministic time-based animation
**License:** Open for modification and extension
