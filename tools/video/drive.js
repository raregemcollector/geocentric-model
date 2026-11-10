const { chromium } = require('playwright');
const fs = require('fs'); const { spawn } = require('child_process');
const mode = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  p.on('console', m => { if (m.type()==='error' && !/404/.test(m.text())) console.log('ERR', m.text()); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(process.env.SITE_URL || 'http://localhost:8765/index.html');
  await p.waitForFunction(() => window.FE && FE.app);
  await p.evaluate(() => { const a = FE.app; a.setClean(true,{captions:false,info:false}); document.getElementById('rec-toast')?.remove(); clearTimeout(a.recToastTimer); a.exporting = true; });
  await p.addScriptTag({ path: __dirname + '/director.js' });
  await p.evaluate(() => document.fonts.ready);
  const info = await p.evaluate(() => DIR.scenes); 
  if (mode === 'stills') {
    const times = process.argv[3].split(',').map(Number);
    for (const t of times) { await p.evaluate(t => DIR.render(t), t); await p.screenshot({ path: `st_${t}.jpg`, type: 'jpeg', quality: 85 }); }
  } else if (mode === 'render') {
    const idx = process.argv[3] ? process.argv[3].split(',').map(Number) : info.map((_, i) => i);
    fs.mkdirSync('scenes', { recursive: true });
    for (const i of idx) {
      const sc = info[i], n = Math.round(sc.dur * 30), tmp = `scenes/tmp_${i}.mp4`;
      const ff = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','30', tmp]);
      const t0 = Date.now();
      for (let f = 0; f < n; f++) {
        await p.evaluate(t => DIR.render(t), sc.start + f / 30);
        const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      }
      ff.stdin.end();
      const code = await new Promise(r => ff.on('close', r));
      if (code === 0) fs.renameSync(tmp, `scenes/s${i}.mp4`);
      console.log('scene', i, sc.name, n, 'frames', ((Date.now()-t0)/1000).toFixed(0)+'s', 'exit', code);
    }
  }
  console.log(JSON.stringify(info));
  await b.close();
})();
