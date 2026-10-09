# WORLD.EXE — THE LAST RENDER

A 30-second procedural music video demo built entirely in pure code with **WebGL 2** and **Web Audio API**.

Every pixel and every audio sample is generated algorithmically: 3D geometry, GPU particles, dot-matrix typography, post-processing glitch chain, and offline procedural soundtrack synthesis. No external textures, 3D models, audio samples, or third-party libraries.

---

## 🌟 Features

* **Pure Procedural Audio**: Deterministic composition synthesized offline using Web Audio API (`Soundtrack.render()`).
* **Real-time WebGL 2**: GPU transform feedback particles (up to 32k particles), instanced AA line rendering, dynamic bloom, and custom shaders.
* **Audio-Reactive Visuals**: Dynamic FFT analysis driving camera shake, particle forces, and glitch effects in sync with the soundtrack.
* **Deterministic Offline Rendering Pipeline**: Built-in 1080p 60fps frame-by-frame renderer piping uncompressed frames to FFmpeg to produce Apple ProRes 422 HQ masters and high-bitrate H.264 deliverables with zero dropped frames.

---

## 🚀 Quick Start

### 1. Run in Browser
Simply open [`index.html`](index.html) in any modern browser (Chrome, Edge, Firefox, Safari 15+).

* **Space**: Pause / Resume
* **R**: Restart from 0s
* **F**: Fullscreen
* **G**: Toggle Glitch effects
* **A**: Toggle Audio reactivity
* **S**: Toggle HUD info overlay
* **1-9**: Jump to timeline sections

### 2. Offline Video Export (ProRes & H.264)
To export the animation into professional video formats without any frame drops:
1. Make sure [Node.js](https://nodejs.org/) and [FFmpeg](https://ffmpeg.org/) are installed.
2. Double-click `render.bat` (or run `node render.js`).
3. The script will automatically:
   * Render all 1800 frames offline at 1080p 60fps.
   * Pipe uncompressed RGBA frames and master audio into FFmpeg.
   * Output `world_exe_prores422hq.mov` (10-bit 4:2:2 master) and `world_exe_final_1080p60.mp4` (CRF 16 delivery).

---

## 📄 License

MIT License
