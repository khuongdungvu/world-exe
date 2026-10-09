/**
 * WORLD.EXE — Automated Offline Deterministic Rendering Pipeline
 * Pipeline: WebGL2 (1080p 60fps) → Raw Stream → FFmpeg ProRes 422 HQ → H.264 (CRF 16)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// 1. Locate FFmpeg & Browser
function findFFmpeg() {
  const candidates = [
    'E:\\TOOLS\\UVR5\\Ultimate Vocal Remover\\ffmpeg.exe',
    'E:\\AE AEPs\\AeTurbo\\ffmpeg.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const FFMPEG_PATH = findFFmpeg();
const BROWSER_PATH = findBrowser();
const PORT = 8765;

const PRORES_OUTPUT = path.join(__dirname, 'world_exe_prores422hq.mov');
const H264_OUTPUT = path.join(__dirname, 'world_exe_final_1080p60.mp4');
const WAV_OUTPUT = path.join(__dirname, 'soundtrack.wav');

console.log('====================================================');
console.log(' WORLD.EXE — 影视级离线逐帧渲染与压制流水线');
console.log('====================================================');
console.log(`[配置] FFmpeg:  ${FFMPEG_PATH}`);
console.log(`[配置] 浏览器:  ${BROWSER_PATH || '未找到默认路径'}`);
console.log(`[规格] 1920x1080 @ 60 FPS, 30.0s (总计 1800 帧)`);
console.log(`[母带] Apple ProRes 422 HQ (10-bit 4:2:2)`);
console.log(`[交付] H.264 (CRF 16 慢速超清 + 320k AAC)`);
console.log('----------------------------------------------------');

let ffmpegProres = null;
let chromeProcess = null;
let frameCount = 0;
const totalFrames = 1800;
let renderStartTime = 0;

const server = http.createServer((req, res) => {
  // CORS & Keep-Alive
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.url === '/' || req.url.startsWith('/index.html')) {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Error loading index.html'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/audio' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const audioBuffer = Buffer.concat(chunks);
      fs.writeFileSync(WAV_OUTPUT, audioBuffer);
      console.log(`[音频] 母带音频已提取: soundtrack.wav (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

      // 启动 Step 1: FFmpeg 接收原始管道流编码为 ProRes 422 HQ
      console.log('[视频] 启动 FFmpeg ProRes 422 HQ 管道流编码器...');
      renderStartTime = Date.now();
      ffmpegProres = cp.spawn(FFMPEG_PATH, [
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', '1920x1080',
        '-pix_fmt', 'rgba',
        '-r', '60',
        '-i', 'pipe:0',
        '-i', WAV_OUTPUT,
        '-vf', 'vflip',
        '-c:v', 'prores_ks',
        '-profile:v', '3',
        '-vendor', 'apl0',
        '-pix_fmt', 'yuv422p10le',
        '-c:a', 'pcm_s16le',
        PRORES_OUTPUT
      ]);

      ffmpegProres.stderr.on('data', () => {}); // 忽略 stderr 缓冲
      ffmpegProres.on('error', err => console.error('[FFmpeg Error]', err));

      res.writeHead(200);
      res.end('audio_ready');
    });
    return;
  }

  if (req.url === '/frame' && req.method === 'POST') {
    if (!ffmpegProres) {
      res.writeHead(500);
      return res.end('FFmpeg not ready');
    }

    req.pipe(ffmpegProres.stdin, { end: false });
    req.on('end', () => {
      frameCount++;
      if (frameCount % 60 === 0 || frameCount === totalFrames) {
        const pct = ((frameCount / totalFrames) * 100).toFixed(1);
        const elapsed = (Date.now() - renderStartTime) / 1000;
        const fps = (frameCount / elapsed).toFixed(1);
        const eta = ((totalFrames - frameCount) / Math.max(0.1, fps)).toFixed(0);
        process.stdout.write(`\r[渲染进度] 帧 ${frameCount} / ${totalFrames} (${pct}%) | ${fps} fps | 剩余约 ${eta}s `);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  if (req.url === '/done' && req.method === 'POST') {
    console.log('\n[视频] 所有 1800 帧已传输完成，正在完成 ProRes 封装...');
    res.writeHead(200);
    res.end('done');

    if (ffmpegProres) {
      ffmpegProres.stdin.end();
      ffmpegProres.on('close', code => {
        if (code !== 0) {
          console.error(`[FFmpeg] ProRes 生成异常，退出码: ${code}`);
          cleanup();
          return;
        }

        const stats = fs.statSync(PRORES_OUTPUT);
        console.log(`✅ [Step 1 完成] Apple ProRes 422 HQ 母带创建成功！`);
        console.log(`   文件: ${PRORES_OUTPUT}`);
        console.log(`   大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // 开始 Step 2: ProRes 转码为高质量交付版 H.264 MP4
        console.log('\n🔄 [Step 2] 正在转码为 H.264 超清交付版 (CRF 16 慢速无损级)...');
        const transcodeStart = Date.now();
        const ffmpegH264 = cp.spawn(FFMPEG_PATH, [
          '-y',
          '-i', PRORES_OUTPUT,
          '-c:v', 'libx264',
          '-preset', 'slow',
          '-crf', '16',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '320k',
          '-movflags', '+faststart',
          H264_OUTPUT
        ]);

        ffmpegH264.on('close', code2 => {
          if (code2 !== 0) {
            console.error(`[FFmpeg] H.264 转码异常，退出码: ${code2}`);
          } else {
            const h264Stats = fs.statSync(H264_OUTPUT);
            const dt = ((Date.now() - transcodeStart) / 1000).toFixed(1);
            console.log(`✅ [Step 2 完成] H.264 交付版转码成功！(耗时 ${dt}s)`);
            console.log(`   文件: ${H264_OUTPUT}`);
            console.log(`   大小: ${(h264Stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log('\n🎉 [全部完成] 你可以在该目录下直接播放或使用这两个视频文件！');
          }
          cleanup();
        });
      });
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

function cleanup() {
  if (chromeProcess) {
    try { chromeProcess.kill(); } catch (e) {}
  }
  server.close(() => {
    process.exit(0);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[服务] 本地渲染服务已在 http://127.0.0.1:${PORT} 启动`);
  if (!BROWSER_PATH) {
    console.log(`[提示] 请手动在 Chrome 或 Edge 浏览器中访问: http://127.0.0.1:${PORT}/index.html?export=1`);
    return;
  }

  console.log('[浏览器] 正在启动 Chrome 执行离线逐帧渲染...');
  chromeProcess = cp.spawn(BROWSER_PATH, [
    '--new-window',
    '--window-size=1280,720',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `http://127.0.0.1:${PORT}/index.html?export=1`
  ]);
});
