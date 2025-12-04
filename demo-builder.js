// Demo Scene Builder - Main Engine

class DemoBuilder {
    constructor() {
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Playback state
        this.currentTime = 0;
        this.duration = 10000; // 10 seconds default
        this.isPlaying = false;
        this.lastFrameTime = 0;

        // Tracks and Scenes
        this.tracks = []; // { id, name, zIndex, renderTarget, scenes: [] }
        this.selectedTrackId = null;
        this.selectedSceneId = null;
        this.nextTrackId = 1;
        this.nextSceneId = 1;
        
        // Offscreen canvases pool
        this.buffers = new Map();

        // Timeline scale (pixels per second)
        this.timelineScale = 50;

        // Drag state
        this.dragState = {
            isDragging: false,
            trackId: null,
            sceneId: null,
            startX: 0,
            startY: 0,
            originalStartTime: 0,
            originalEndTime: 0,
            originalTrackId: null,
            targetTrackId: null
        };

        // Ruler drag state
        this.rulerDragState = {
            isDragging: false
        };

        this.init();
    }

    // Utility function: Seeded random for deterministic randomness
    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    async init() {
        this.setupEventListeners();
        const isFirstLoad = await this.loadFromLocalStorage();
        console.log('isFirstLoad:', isFirstLoad);
        this.render();
        this.updateUI();

        // Start render loop
        this.renderLoop();

        // Auto-play on first load (after everything is initialized)
        if (isFirstLoad) {
            console.log('Auto-starting playback...');
            requestAnimationFrame(() => {
                this.togglePlayback();
                console.log('Playback toggled, isPlaying:', this.isPlaying);
            });
        }
    }
    
    setupEventListeners() {
        // Canvas resize
        document.getElementById('applyCanvas').addEventListener('click', () => {
            const width = parseInt(document.getElementById('canvasWidth').value);
            const height = parseInt(document.getElementById('canvasHeight').value);
            this.resizeCanvas(width, height);
        });
        
        // Playback controls
        document.getElementById('playPause').addEventListener('click', () => {
            this.togglePlayback();
        });
        
        document.getElementById('stepForward').addEventListener('click', () => {
            this.stepTime(1000);
        });
        
        document.getElementById('stepBackward').addEventListener('click', () => {
            this.stepTime(-1000);
        });
        
        // Add track
        document.getElementById('addTrack').addEventListener('click', () => {
            this.addTrack();
        });

        // Export state
        document.getElementById('exportState').addEventListener('click', () => {
            this.exportState();
        });
        
        // Timeline ruler drag to seek
        const ruler = document.getElementById('timelineRuler');

        ruler.addEventListener('mousedown', (e) => {
            this.rulerDragState.isDragging = true;
            const rect = ruler.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const time = (x / this.timelineScale) * 1000;
            this.seekTo(time);
        });

        // Global mouse handlers for dragging
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.handleMouseUp());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }

            switch (e.key) {
                case ' ': // Space: toggle play/pause
                    e.preventDefault();
                    this.togglePlayback();
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Jump to beginning of current or previous scene
                        this.jumpToSceneBoundary('start');
                    } else {
                        // Step backward 1s
                        this.stepTime(-1000);
                    }
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Jump to end of current or next scene
                        this.jumpToSceneBoundary('end');
                    } else {
                        // Step forward 1s
                        this.stepTime(1000);
                    }
                    break;
            }
        });
    }
    
    resizeCanvas(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.render();
    }
    
    togglePlayback() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('playPause');
        btn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
        
        if (this.isPlaying) {
            this.lastFrameTime = performance.now();
        }
    }
    
    stepTime(delta) {
        this.seekTo(this.currentTime + delta);
    }

    jumpToSceneBoundary(direction) {
        // Collect all scene boundaries from all tracks
        const boundaries = [];
        for (const track of this.tracks) {
            for (const scene of track.scenes) {
                if (scene.visible) {
                    boundaries.push({ time: scene.startTime, type: 'start', scene, track });
                    boundaries.push({ time: scene.endTime, type: 'end', scene, track });
                }
            }
        }

        // Sort by time
        boundaries.sort((a, b) => a.time - b.time);

        if (direction === 'start') {
            // Jump to beginning of current scene or previous scene
            // Find the closest start boundary at or before current time
            for (let i = boundaries.length - 1; i >= 0; i--) {
                if (boundaries[i].type === 'start' && boundaries[i].time <= this.currentTime) {
                    // If we're already at the start of this scene (within 100ms), go to previous
                    if (Math.abs(boundaries[i].time - this.currentTime) < 100 && i > 0) {
                        // Find previous start boundary
                        for (let j = i - 1; j >= 0; j--) {
                            if (boundaries[j].type === 'start') {
                                this.seekTo(boundaries[j].time);
                                return;
                            }
                        }
                    }
                    this.seekTo(boundaries[i].time);
                    return;
                }
            }
            // If no start found, go to the first start
            const firstStart = boundaries.find(b => b.type === 'start');
            if (firstStart) this.seekTo(firstStart.time);

        } else { // direction === 'end'
            // Jump to end of current scene or next scene
            // Find the closest end boundary at or after current time
            for (let i = 0; i < boundaries.length; i++) {
                if (boundaries[i].type === 'end' && boundaries[i].time >= this.currentTime) {
                    // If we're already at the end of this scene (within 100ms), go to next
                    if (Math.abs(boundaries[i].time - this.currentTime) < 100 && i < boundaries.length - 1) {
                        // Find next end boundary
                        for (let j = i + 1; j < boundaries.length; j++) {
                            if (boundaries[j].type === 'end') {
                                this.seekTo(boundaries[j].time);
                                return;
                            }
                        }
                    }
                    this.seekTo(boundaries[i].time);
                    return;
                }
            }
            // If no end found, go to the last end
            const lastEnd = boundaries.reverse().find(b => b.type === 'end');
            if (lastEnd) this.seekTo(lastEnd.time);
        }
    }
    
    seekTo(time) {
        this.currentTime = Math.max(0, Math.min(time, this.duration));
        this.render();
        this.updatePlayhead();
        this.updateTimeDisplay();
    }
    
    addTrack() {
        const track = {
            id: this.nextTrackId++,
            name: `Track ${this.nextTrackId - 1}`,
            zIndex: this.tracks.length, // Default to bottom layer
            renderTarget: 'main',
            scenes: [],
            enabled: true
        };

        this.tracks.push(track);
        this.selectedTrackId = track.id;
        this.selectedSceneId = null;
        this.saveToLocalStorage();
        this.updateUI();
        this.render();
    }

    addScene(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        // Find the last scene's end time
        let startTime = 0;
        if (track.scenes.length > 0) {
            const lastScene = track.scenes.reduce((max, scene) =>
                scene.endTime > max.endTime ? scene : max
            );
            startTime = lastScene.endTime;
        }

        const scene = {
            id: this.nextSceneId++,
            name: `Scene ${this.nextSceneId - 1}`,
            startTime: startTime,
            endTime: startTime + 5000,
            code: this.getDefaultSceneCode(),
            hasError: false,
            errorMessage: null,
            runtimeError: null,
            visible: true
        };

        track.scenes.push(scene);
        this.selectedSceneId = scene.id;
        this.saveToLocalStorage();
        this.updateUI();
        this.render();
    }
    
    deleteTrack(id) {
        this.tracks = this.tracks.filter(t => t.id !== id);
        if (this.selectedTrackId === id) {
            this.selectedTrackId = null;
            this.selectedSceneId = null;
        }
        this.saveToLocalStorage();
        this.updateUI();
        this.render();
    }

    deleteScene(trackId, sceneId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        track.scenes = track.scenes.filter(s => s.id !== sceneId);
        if (this.selectedSceneId === sceneId) {
            this.selectedSceneId = null;
        }
        this.saveToLocalStorage();
        this.updateUI();
        this.render();
    }
    
    updateTrack(id, updates) {
        const track = this.tracks.find(t => t.id === id);
        if (track) {
            Object.assign(track, updates);
            this.updateDuration();
            this.saveToLocalStorage();
            this.render();
        }
    }

    updateScene(trackId, sceneId, updates) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === sceneId);
        if (scene) {
            Object.assign(scene, updates);
            this.updateDuration();
            this.saveToLocalStorage();
            this.render();
        }
    }

    updateDuration() {
        // Auto-expand duration to fit all scenes with a 1 second buffer
        let maxEndTime = 0;
        for (const track of this.tracks) {
            for (const scene of track.scenes) {
                maxEndTime = Math.max(maxEndTime, scene.endTime);
            }
        }
        if (maxEndTime > 0) {
            this.duration = Math.max(this.duration, maxEndTime + 1000);
        }
    }

    checkSyntax(trackId, sceneId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        const codeEditor = document.getElementById('sceneCode');
        if (!codeEditor) return;

        try {
            // Try to create the function to check for syntax errors (include utility functions)
            new Function('ctx', 't', 'w', 'h', 'startTime', 'endTime', 'seededRandom', 'getBuffer', scene.code);

            // Store error state
            scene.hasError = false;
            scene.errorMessage = null;

        } catch (error) {
            // Store error state
            scene.hasError = true;
            scene.errorMessage = error.message;
        }

        // Update error styling (both syntax and runtime errors)
        if (scene.hasError || scene.runtimeError) {
            codeEditor.classList.add('code-error');
        } else {
            codeEditor.classList.remove('code-error');
        }

        // Update console output to show all errors
        this.updateConsoleOutput(trackId, sceneId);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleSceneMouseDown(e, trackId, sceneId) {
        e.stopPropagation();
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        this.dragState.isDragging = true;
        this.dragState.trackId = trackId;
        this.dragState.sceneId = sceneId;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;
        this.dragState.originalStartTime = scene.startTime;
        this.dragState.originalEndTime = scene.endTime;
        this.dragState.originalTrackId = trackId;
        this.dragState.targetTrackId = trackId;

        // Select the scene being dragged
        this.selectedTrackId = trackId;
        this.selectedSceneId = sceneId;
        this.updateUI();
    }

    handleMouseMove(e) {
        // Handle ruler dragging
        if (this.rulerDragState.isDragging) {
            const ruler = document.getElementById('timelineRuler');
            const rect = ruler.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const time = (x / this.timelineScale) * 1000;
            this.seekTo(time);
            return;
        }

        // Handle scene dragging
        if (!this.dragState.isDragging) return;

        document.body.style.cursor = 'grabbing';

        const deltaX = e.clientX - this.dragState.startX;
        const deltaTime = (deltaX / this.timelineScale) * 1000;

        // Detect which track the mouse is over
        const tracksContainer = document.getElementById('tracksContainer');
        const trackElements = tracksContainer.querySelectorAll('.track');

        let hoveredTrackId = this.dragState.originalTrackId;
        trackElements.forEach(trackEl => {
            const rect = trackEl.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                // Get track ID directly from element
                hoveredTrackId = parseInt(trackEl.dataset.trackId);
            }
        });

        this.dragState.targetTrackId = hoveredTrackId;

        // Get the current track (might have changed during drag)
        const track = this.tracks.find(t => t.id === this.dragState.trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === this.dragState.sceneId);
        if (!scene) return;

        // Calculate new times
        let newStartTime = this.dragState.originalStartTime + deltaTime;
        let newEndTime = this.dragState.originalEndTime + deltaTime;

        // Clamp to 0 minimum
        if (newStartTime < 0) {
            const offset = -newStartTime;
            newStartTime = 0;
            newEndTime = this.dragState.originalEndTime - this.dragState.originalStartTime;
        }

        // Update scene position
        scene.startTime = Math.max(0, Math.round(newStartTime / 100) * 100);
        scene.endTime = Math.max(scene.startTime + 100, Math.round(newEndTime / 100) * 100);

        this.updateDuration();
        this.updateTimeline();
        this.updateTracksList();
        this.updateTrackEditor(true); // Preserve cursor while dragging
        this.render();
    }

    handleMouseUp() {
        // Handle ruler drag end
        if (this.rulerDragState.isDragging) {
            this.rulerDragState.isDragging = false;
            return;
        }

        // Handle scene drag end
        if (this.dragState.isDragging) {
            // Check if scene was dragged to a different track
            if (this.dragState.targetTrackId !== this.dragState.originalTrackId) {
                this.moveSceneToTrack(
                    this.dragState.sceneId,
                    this.dragState.originalTrackId,
                    this.dragState.targetTrackId
                );
            }

            this.dragState.isDragging = false;
            this.dragState.trackId = null;
            this.dragState.sceneId = null;
            this.dragState.targetTrackId = null;
            this.dragState.originalTrackId = null;
            document.body.style.cursor = '';
            this.saveToLocalStorage();
            this.updateUI();
        }
    }

    moveSceneToTrack(sceneId, fromTrackId, toTrackId) {
        const fromTrack = this.tracks.find(t => t.id === fromTrackId);
        const toTrack = this.tracks.find(t => t.id === toTrackId);

        if (!fromTrack || !toTrack) return;

        const sceneIndex = fromTrack.scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return;

        // Remove scene from original track
        const [scene] = fromTrack.scenes.splice(sceneIndex, 1);

        // Add scene to new track
        toTrack.scenes.push(scene);

        // Update selected track
        this.selectedTrackId = toTrackId;
        this.dragState.trackId = toTrackId;
    }

    toggleSceneVisibility(trackId, sceneId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        scene.visible = !scene.visible;
        this.saveToLocalStorage();
        this.updateTimeline();
        this.updateTracksList();
        this.render();
    }
    
    getDefaultSceneCode() {
        return `// Available parameters:
// ctx: Canvas context
// t: Time in milliseconds (0 to duration)
// w: Canvas width
// h: Canvas height
// seededRandom(seed): Deterministic random function
// getBuffer(name): Get buffer canvas ('buffer1', 'buffer2')

// Example: Animated gradient
const progress = t / (endTime - startTime);
const hue = (progress * 360) % 360;

ctx.fillStyle = \`hsl(\${hue}, 70%, 50%)\`;
ctx.fillRect(0, 0, w, h);

// Draw some text
ctx.fillStyle = 'white';
ctx.font = 'bold 48px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('Hello Demo!', w/2, h/2);

// Example: Use a buffer
// const buffer1 = getBuffer('buffer1');
// if (buffer1) ctx.drawImage(buffer1, 0, 0);
`;
    }
    
    renderLoop() {
        if (this.isPlaying) {
            const now = performance.now();
            const delta = now - this.lastFrameTime;
            this.lastFrameTime = now;
            
            this.currentTime += delta;
            
            if (this.currentTime >= this.duration) {
                this.currentTime = this.duration;
                this.isPlaying = false;
                document.getElementById('playPause').textContent = '▶ Play';
            }
            
            this.render();
            this.updatePlayhead();
            this.updateTimeDisplay();
        }
        
        requestAnimationFrame(() => this.renderLoop());
    }
    
    render() {
        // Clear main canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Get tracks sorted by z-index (lower z-index renders first, appears behind)
        const sortedTracks = [...this.tracks]
            .filter(track => track.enabled)
            .sort((a, b) => a.zIndex - b.zIndex);

        // Render each track's active scene
        for (const track of sortedTracks) {
            // Find active scene in this track at current time (only visible scenes)
            const activeScene = track.scenes.find(scene =>
                scene.visible &&
                this.currentTime >= scene.startTime &&
                this.currentTime <= scene.endTime
            );

            if (activeScene) {
                this.renderScene(track, activeScene);
            }
        }
    }
    
    renderScene(track, scene) {
        const localTime = this.currentTime - scene.startTime;

        try {
            // Determine render target
            let targetCtx = this.ctx;
            let targetCanvas = this.canvas;

            if (track.renderTarget !== 'main') {
                // Get or create offscreen buffer
                if (!this.buffers.has(track.renderTarget)) {
                    const buffer = document.createElement('canvas');
                    buffer.width = this.canvas.width;
                    buffer.height = this.canvas.height;
                    this.buffers.set(track.renderTarget, buffer);
                }
                targetCanvas = this.buffers.get(track.renderTarget);
                targetCtx = targetCanvas.getContext('2d');

                // Clear buffer
                targetCtx.fillStyle = '#000';
                targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
            }

            // Get buffers for use in scene code
            const getBuffer = (bufferName) => {
                if (this.buffers.has(bufferName)) {
                    return this.buffers.get(bufferName);
                }
                return null;
            };

            // Execute scene code with utility functions available
            const renderFunc = new Function('ctx', 't', 'w', 'h', 'startTime', 'endTime', 'seededRandom', 'getBuffer', scene.code);
            renderFunc(
                targetCtx,
                localTime,
                targetCanvas.width,
                targetCanvas.height,
                scene.startTime,
                scene.endTime,
                this.seededRandom,
                getBuffer
            );

            // Buffer tracks don't composite automatically - they just render to their buffer
            // Main canvas tracks can access buffers via getBuffer() function

            // Clear runtime error if it was set
            if (scene.runtimeError) {
                scene.runtimeError = null;
                // Update console if this scene is selected
                if (this.selectedSceneId === scene.id) {
                    this.updateConsoleOutput(track.id, scene.id);
                }
            }

        } catch (error) {
            console.error(`Error rendering scene ${scene.name} in track ${track.name}:`, error);

            // Store runtime error
            scene.runtimeError = error.message;

            // Update console if this scene is selected
            if (this.selectedSceneId === scene.id) {
                this.updateConsoleOutput(track.id, scene.id);
            }

            // Display error on canvas
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = '14px monospace';
            this.ctx.fillText(`Error in ${track.name} / ${scene.name}: ${error.message}`, 10, 20);
        }
    }

    updateConsoleOutput(trackId, sceneId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const scene = track.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        const consoleContent = document.getElementById('consoleContent');
        if (!consoleContent) return;

        const errors = [];

        // Check for syntax errors
        if (scene.hasError && scene.errorMessage) {
            errors.push({
                type: 'Syntax Error',
                message: scene.errorMessage
            });
        }

        // Check for runtime errors
        if (scene.runtimeError) {
            errors.push({
                type: 'Runtime Error',
                message: scene.runtimeError
            });
        }

        if (errors.length === 0) {
            consoleContent.innerHTML = '<div style="color: #4a4; font-style: italic;">✓ No errors</div>';
        } else {
            const errorHtml = errors.map(err => `
                <div style="color: #ff6666; margin-bottom: 10px;">
                    <strong>${err.type}:</strong>
                </div>
                <div style="color: #ff9999; font-size: 11px; white-space: pre-wrap; word-break: break-word; margin-bottom: 15px;">
                    ${this.escapeHtml(err.message)}
                </div>
            `).join('');
            consoleContent.innerHTML = errorHtml;
        }
    }
    
    updateUI() {
        this.updateTracksList();
        this.updateTimeline();
        this.updateTrackEditor();
        this.updatePlayhead();
        this.updateTimeDisplay();
    }
    
    updateTracksList() {
        const container = document.getElementById('tracksList');
        container.innerHTML = '';

        // Sort tracks by z-index
        const sortedTracks = [...this.tracks].sort((a, b) => a.zIndex - b.zIndex);

        sortedTracks.forEach(track => {
            const isBufferTrack = track.renderTarget !== 'main';
            const targetLabel = track.renderTarget === 'main' ? '' : ` → ${track.renderTarget}`;

            // Track header
            const trackHeader = document.createElement('div');
            trackHeader.style.cssText = `
                padding: 8px 10px;
                background: #1a1a1a;
                font-size: 11px;
                font-weight: 600;
                color: ${isBufferTrack ? '#88f' : '#aaa'};
                border-bottom: 1px solid #333;
                margin-bottom: 2px;
                cursor: pointer;
            `;
            trackHeader.textContent = `${track.name}${targetLabel} (z:${track.zIndex})`;
            trackHeader.addEventListener('click', () => {
                this.selectedTrackId = track.id;
                this.selectedSceneId = null;
                this.updateUI();
            });
            container.appendChild(trackHeader);

            // Show scenes in this track
            if (track.scenes.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.cssText = 'padding: 8px 10px; color: #666; font-size: 11px; font-style: italic;';
                emptyMsg.textContent = 'No scenes';
                container.appendChild(emptyMsg);
            } else {
                track.scenes.forEach(scene => {
                    const item = document.createElement('div');
                    item.className = 'track-item';
                    if (scene.id === this.selectedSceneId && track.id === this.selectedTrackId) {
                        item.classList.add('selected');
                    }

                    const duration = ((scene.endTime - scene.startTime) / 1000).toFixed(1);
                    const hasError = scene.hasError || scene.runtimeError;
                    const isHidden = !scene.visible;

                    item.innerHTML = `
                        <div class="track-item-name" style="${hasError ? 'color: #ff6666;' : isHidden ? 'color: #888; text-decoration: line-through;' : ''}">
                            ${isHidden ? '● ' : ''}${scene.name}
                        </div>
                        <div class="track-item-info">${scene.startTime/1000}s - ${scene.endTime/1000}s (${duration}s)</div>
                    `;

                    item.addEventListener('click', () => {
                        this.selectedTrackId = track.id;
                        this.selectedSceneId = scene.id;
                        this.updateUI();
                    });

                    container.appendChild(item);
                });
            }
        });
    }
    
    updateTimeline() {
        const container = document.getElementById('tracksContainer');
        const ruler = document.getElementById('timelineRuler');

        // Update ruler width
        const rulerWidth = (this.duration / 1000) * this.timelineScale;
        ruler.style.width = rulerWidth + 'px';

        // Add time markers
        ruler.querySelectorAll('.time-marker').forEach(el => el.remove());
        for (let i = 0; i <= this.duration / 1000; i++) {
            const marker = document.createElement('div');
            marker.className = 'time-marker';
            marker.style.left = (i * this.timelineScale) + 'px';
            marker.textContent = i + 's';
            ruler.appendChild(marker);
        }

        // Update tracks (sorted by z-index)
        container.innerHTML = '';
        const sortedTracks = [...this.tracks].sort((a, b) => a.zIndex - b.zIndex);

        sortedTracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'track';
            trackEl.dataset.trackId = track.id; // Add track ID directly to element
            if (track.id === this.selectedTrackId) {
                trackEl.classList.add('selected');
            }

            // Highlight target track during drag
            if (this.dragState.isDragging &&
                this.dragState.targetTrackId === track.id &&
                this.dragState.targetTrackId !== this.dragState.originalTrackId) {
                trackEl.classList.add('drag-target');
            }

            const isBufferTrack = track.renderTarget !== 'main';
            const timelineWidth = (this.duration / 1000) * this.timelineScale;

            // Create scene segments HTML
            const scenesHTML = track.scenes.map(scene => {
                const startPos = (scene.startTime / 1000) * this.timelineScale;
                const width = ((scene.endTime - scene.startTime) / 1000) * this.timelineScale;
                const isSelected = this.selectedSceneId === scene.id;
                const hasError = scene.hasError || scene.runtimeError;
                const isHidden = !scene.visible;

                return `<div class="track-segment ${isSelected ? 'selected' : ''} ${hasError ? 'error' : ''} ${isHidden ? 'hidden' : ''}"
                        style="left: ${startPos}px; width: ${width}px; cursor: grab; position: absolute;"
                        data-track-id="${track.id}" data-scene-id="${scene.id}">
                        ${scene.name}
                        <span class="scene-eye" data-scene-id="${scene.id}" data-track-id="${track.id}"
                              style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
                                     cursor: pointer; opacity: 0; transition: opacity 0.2s; font-size: 14px;">
                            ${isHidden ? '●' : '○'}
                        </span>
                    </div>`;
            }).join('');

            trackEl.innerHTML = `
                <div class="track-header" style="${isBufferTrack ? 'color: #88f;' : ''}">${track.name} (z:${track.zIndex})</div>
                <div class="track-bar" style="width: ${timelineWidth}px; ${isBufferTrack ? 'background: rgba(136, 136, 255, 0.1);' : ''}">
                    ${scenesHTML}
                </div>
            `;

            // Add event listeners to scenes
            track.scenes.forEach(scene => {
                const segments = trackEl.querySelectorAll(`.track-segment[data-scene-id="${scene.id}"]`);
                segments.forEach(segment => {
                    segment.addEventListener('mousedown', (e) => {
                        // Don't start drag if clicking on eye icon
                        if (e.target.classList.contains('scene-eye')) {
                            return;
                        }
                        this.handleSceneMouseDown(e, track.id, scene.id);
                    });

                    segment.addEventListener('click', (e) => {
                        // Don't select if clicking on eye icon
                        if (e.target.classList.contains('scene-eye')) {
                            return;
                        }
                        e.stopPropagation();
                        this.selectedTrackId = track.id;
                        this.selectedSceneId = scene.id;
                        this.updateUI();
                    });

                    // Show eye icon on hover
                    segment.addEventListener('mouseenter', () => {
                        const eye = segment.querySelector('.scene-eye');
                        if (eye) eye.style.opacity = '1';
                    });

                    segment.addEventListener('mouseleave', () => {
                        const eye = segment.querySelector('.scene-eye');
                        if (eye) eye.style.opacity = '0';
                    });
                });

                // Add eye icon click handler
                const eyes = trackEl.querySelectorAll(`.scene-eye[data-scene-id="${scene.id}"]`);
                eyes.forEach(eye => {
                    eye.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.toggleSceneVisibility(track.id, scene.id);
                    });
                });
            });

            // Track click selects track (not scene)
            trackEl.addEventListener('click', () => {
                this.selectedTrackId = track.id;
                this.selectedSceneId = null;
                this.updateUI();
            });

            container.appendChild(trackEl);
        });
    }
    
    updateTrackEditor(preserveCursor = false) {
        const editor = document.getElementById('trackEditor');
        const track = this.tracks.find(t => t.id === this.selectedTrackId);

        if (!track) {
            editor.innerHTML = '<div class="no-selection">Select a track or scene to edit</div>';
            return;
        }

        const scene = this.selectedSceneId ? track.scenes.find(s => s.id === this.selectedSceneId) : null;

        // Save cursor position if preserving
        let cursorPos = null;
        if (preserveCursor) {
            const codeEditor = document.getElementById('sceneCode');
            if (codeEditor) {
                cursorPos = codeEditor.selectionStart;
            }
        }

        // If scene is selected, show scene editor
        if (scene) {
            this.renderSceneEditor(track, scene, cursorPos);
        } else {
            // Show track editor
            this.renderTrackEditor(track);
        }
    }

    renderTrackEditor(track) {
        const editor = document.getElementById('trackEditor');

        const scenesListHTML = track.scenes.map(scene => `
            <div class="scene-list-item ${this.selectedSceneId === scene.id ? 'selected' : ''}" data-scene-id="${scene.id}">
                <div class="scene-name">${scene.name}</div>
                <div class="scene-info">${scene.startTime/1000}s - ${scene.endTime/1000}s</div>
            </div>
        `).join('');

        editor.innerHTML = `
            <h3>Track: ${track.name}</h3>

            <div class="editor-field">
                <label>Track Name</label>
                <input type="text" id="trackName" value="${track.name}">
            </div>

            <div class="editor-field-inline">
                <div class="editor-field">
                    <label>Z-Index (Layer)</label>
                    <input type="number" id="trackZIndex" value="${track.zIndex}" step="1">
                </div>
                <div class="editor-field">
                    <label>Render Target</label>
                    <select id="trackTarget">
                        <option value="main" ${track.renderTarget === 'main' ? 'selected' : ''}>Main Canvas</option>
                        <option value="buffer1" ${track.renderTarget === 'buffer1' ? 'selected' : ''}>Buffer 1</option>
                        <option value="buffer2" ${track.renderTarget === 'buffer2' ? 'selected' : ''}>Buffer 2</option>
                    </select>
                    <div style="font-size: 10px; color: #888; margin-top: 5px;">Drag scenes between tracks to change render target</div>
                </div>
            </div>

            <div class="editor-field">
                <label>Scenes in this Track</label>
                <div class="scenes-list">
                    ${scenesListHTML || '<div style="color: #666; padding: 10px; font-style: italic;">No scenes in this track</div>'}
                </div>
                <button id="addScene" class="primary" style="margin-top: 10px;">+ Add Scene</button>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="deleteTrack" style="background: #cc0000; border-color: #cc0000;">Delete Track</button>
            </div>
        `;

        // Event listeners
        document.getElementById('trackName').addEventListener('input', (e) => {
            this.updateTrack(track.id, { name: e.target.value });
            this.updateTimeline();
            this.updateTracksList();
        });

        document.getElementById('trackZIndex').addEventListener('input', (e) => {
            this.updateTrack(track.id, { zIndex: parseInt(e.target.value) });
            this.updateTimeline();
            this.updateTracksList();
        });

        document.getElementById('trackTarget').addEventListener('change', (e) => {
            this.updateTrack(track.id, { renderTarget: e.target.value });
            this.updateTimeline();
            this.updateTracksList();
            this.render();
        });

        document.getElementById('addScene').addEventListener('click', () => {
            this.addScene(track.id);
        });

        document.getElementById('deleteTrack').addEventListener('click', () => {
            if (confirm(`Delete track "${track.name}" and all its scenes?`)) {
                this.deleteTrack(track.id);
            }
        });

        // Scene list item click handlers
        track.scenes.forEach(scene => {
            const item = editor.querySelector(`[data-scene-id="${scene.id}"]`);
            if (item) {
                item.addEventListener('click', () => {
                    this.selectedSceneId = scene.id;
                    this.updateUI();
                });
            }
        });
    }

    renderSceneEditor(track, scene, cursorPos) {
        const editor = document.getElementById('trackEditor');

        editor.innerHTML = `
            <h3>Scene: ${scene.name}</h3>
            <div style="color: #888; font-size: 12px; margin-bottom: 15px;">Track: ${track.name}</div>

            <div class="editor-field">
                <label>Scene Name</label>
                <input type="text" id="sceneName" value="${scene.name}">
            </div>

            <div class="editor-field-inline">
                <div class="editor-field">
                    <label>Start Time (ms)</label>
                    <input type="number" id="sceneStart" value="${scene.startTime}" min="0" step="100">
                </div>
                <div class="editor-field">
                    <label>End Time (ms)</label>
                    <input type="number" id="sceneEnd" value="${scene.endTime}" min="0" step="100">
                </div>
            </div>

            <div class="editor-field">
                <label>Scene Code</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <textarea class="code-editor" id="sceneCode">${scene.code}</textarea>
                    <div class="console-output" id="consoleOutput">
                        <div class="console-header">Console Output</div>
                        <div class="console-content" id="consoleContent">
                            <div style="color: #666; font-style: italic;">No errors</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button id="backToTrack">← Back to Track</button>
                <button id="deleteScene" style="background: #cc0000; border-color: #cc0000;">Delete Scene</button>
            </div>
        `;

        // Event listeners
        document.getElementById('sceneName').addEventListener('input', (e) => {
            this.updateScene(track.id, scene.id, { name: e.target.value });
            this.updateTimeline();
        });

        document.getElementById('backToTrack').addEventListener('click', () => {
            this.selectedSceneId = null;
            this.updateUI();
        });

        document.getElementById('deleteScene').addEventListener('click', () => {
            if (confirm(`Delete scene "${scene.name}"?`)) {
                this.deleteScene(track.id, scene.id);
            }
        });

        // Real-time updates for timing (debounced)
        let timingTimeout;
        const updateTiming = () => {
            clearTimeout(timingTimeout);
            timingTimeout = setTimeout(() => {
                this.updateScene(track.id, scene.id, {
                    startTime: parseInt(document.getElementById('sceneStart').value),
                    endTime: parseInt(document.getElementById('sceneEnd').value)
                });
                this.updateTimeline();
                this.updateTracksList();
                this.updateTrackEditor(true); // Preserve cursor
            }, 300);
        };

        document.getElementById('sceneStart').addEventListener('input', updateTiming);
        document.getElementById('sceneEnd').addEventListener('input', updateTiming);

        // Auto-save on code change (debounced)
        let codeTimeout;
        document.getElementById('sceneCode').addEventListener('input', (e) => {
            clearTimeout(codeTimeout);
            codeTimeout = setTimeout(() => {
                const cursorPosition = e.target.selectionStart;
                this.updateScene(track.id, scene.id, { code: e.target.value });
                this.checkSyntax(track.id, scene.id);
                requestAnimationFrame(() => {
                    const codeEditor = document.getElementById('sceneCode');
                    if (codeEditor) {
                        codeEditor.setSelectionRange(cursorPosition, cursorPosition);
                    }
                });
            }, 500);
        });

        // Restore cursor position if needed
        if (cursorPos !== null) {
            const codeEditor = document.getElementById('sceneCode');
            if (codeEditor) {
                codeEditor.setSelectionRange(cursorPos, cursorPos);
                codeEditor.focus();
            }
        }

        // Update error styling and console
        const codeEditor = document.getElementById('sceneCode');
        if (codeEditor) {
            if (scene.hasError || scene.runtimeError) {
                codeEditor.classList.add('code-error');
            } else {
                codeEditor.classList.remove('code-error');
            }
        }
        this.updateConsoleOutput(track.id, scene.id);
    }
    
    updatePlayhead() {
        const playhead = document.getElementById('playhead');
        const position = (this.currentTime / 1000) * this.timelineScale;
        playhead.style.left = position + 'px';
    }
    
    updateTimeDisplay() {
        const current = (this.currentTime / 1000).toFixed(2);
        const total = (this.duration / 1000).toFixed(2);
        document.getElementById('timeDisplay').textContent = `${current}s / ${total}s`;
    }
    
    saveToLocalStorage() {
        const state = {
            tracks: this.tracks,
            duration: this.duration,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };
        localStorage.setItem('demoBuilder', JSON.stringify(state));
    }

    exportState() {
        const state = {
            tracks: this.tracks,
            duration: this.duration,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };

        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `demo-builder-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    async loadFromLocalStorage() {
        let state = null;
        let isFirstLoad = false;

        // First try localStorage
        const saved = localStorage.getItem('demoBuilder');
        if (saved) {
            try {
                state = JSON.parse(saved);
                console.log('Loaded state from localStorage');
            } catch (error) {
                console.error('Error loading from localStorage:', error);
            }
        } else {
            // No localStorage, this is a first load
            isFirstLoad = true;
        }

        // If no localStorage, try to load default.json from current directory
        if (!state) {
            try {
                const response = await fetch('default.json');
                if (response.ok) {
                    state = await response.json();
                    console.log('Loaded state from default.json');
                }
            } catch (error) {
                // default.json doesn't exist, will create default track below
                console.log('No default.json found');
            }
        }

        // Load state if we have it
        if (state) {
            try {
                this.tracks = state.tracks || [];
                this.duration = state.duration || 10000;

                // Migrate old format to new format
                this.tracks = this.tracks.map(track => {
                    // Old format: track has code, startTime, endTime
                    // New format: track has scenes array
                    if (track.code !== undefined && !track.scenes) {
                        // Migrate old track to new format
                        return {
                            id: track.id,
                            name: track.name,
                            zIndex: track.zIndex || 0,
                            renderTarget: track.renderTarget || 'main',
                            enabled: track.enabled !== undefined ? track.enabled : true,
                            scenes: [{
                                id: this.nextSceneId++,
                                name: track.name + ' Scene',
                                startTime: track.startTime || 0,
                                endTime: track.endTime || 5000,
                                code: track.code,
                                hasError: false,
                                errorMessage: null,
                                runtimeError: null,
                                visible: true
                            }]
                        };
                    }
                    // Ensure all scenes have visible property (default to true)
                    if (track.scenes) {
                        track.scenes = track.scenes.map(scene => ({
                            ...scene,
                            visible: scene.visible !== undefined ? scene.visible : true
                        }));
                    }
                    return track;
                });

                if (state.canvasWidth && state.canvasHeight) {
                    this.canvas.width = state.canvasWidth;
                    this.canvas.height = state.canvasHeight;
                    document.getElementById('canvasWidth').value = state.canvasWidth;
                    document.getElementById('canvasHeight').value = state.canvasHeight;
                }

                // Update next IDs
                if (this.tracks.length > 0) {
                    this.nextTrackId = Math.max(...this.tracks.map(t => t.id)) + 1;
                    // Find max scene ID
                    for (const track of this.tracks) {
                        if (track.scenes && track.scenes.length > 0) {
                            const maxSceneId = Math.max(...track.scenes.map(s => s.id));
                            this.nextSceneId = Math.max(this.nextSceneId, maxSceneId + 1);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading state:', error);
            }
        }

        // Create default track with default scene if none exist
        if (this.tracks.length === 0) {
            this.addTrack();
            const track = this.tracks[0];
            this.addScene(track.id);
        }

        return isFirstLoad;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.demoBuilder = new DemoBuilder();
    });
} else {
    window.demoBuilder = new DemoBuilder();
}
