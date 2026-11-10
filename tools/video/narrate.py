import subprocess, sys
f = float(sys.argv[1]); name = sys.argv[2]
orig = [22,24,32,22,23,29,27,28]
sp = [float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f't{i}.wav'])) for i in range(8)]
lead, gap, hold = 0.3, 0.35, (1.0 if f > 1 else 1.5)
parts=[]; durs=[]
for i in range(8):
    pre = lead if i==0 else 0
    post = hold if i==7 else gap
    d = pre + sp[i]/f + post
    n = round(d*30); d = n/30; durs.append(d)
    # audio section, exactly d seconds
    subprocess.run(['ffmpeg','-v','error','-y','-i',f't{i}.wav','-af',f'atempo={f},adelay={int(pre*1000)}|{int(pre*1000)},apad,atrim=0:{d}','-ar','48000','-ac','2',f'a{name}_{i}.wav'],check=True)
    # video section retimed to d seconds
    k = d/orig[i]
    subprocess.run(['ffmpeg','-v','error','-y','-i',f'../scenes/s{i}.mp4','-vf',f'setpts={k}*PTS,fps=30,trim=end_frame={n},setpts=PTS-STARTPTS','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-an',f'v{name}_{i}.tmp.mp4'],check=True)
    subprocess.run(['mv',f'v{name}_{i}.tmp.mp4',f'v{name}_{i}.mp4'])
open(f'v{name}.txt','w').write(''.join(f"file 'v{name}_{i}.mp4'\n" for i in range(8)))
open(f'a{name}.txt','w').write(''.join(f"file 'a{name}_{i}.wav'\n" for i in range(8)))
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',f'v{name}.txt','-c','copy',f'v{name}.mp4'],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',f'a{name}.txt','-af','loudnorm=I=-14:TP=-1.5:LRA=11','-ar','48000',f'a{name}.wav'],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',f'v{name}.mp4','-i',f'a{name}.wav','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',f'../{name}.mp4'],check=True)
print(name, 'sections', [round(x,2) for x in durs], 'total', round(sum(durs),2))
