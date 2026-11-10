# Video tools

Render the vertical explainer video straight from the model, frame by frame.

- `director.js` — the storyboard: camera, date/time and model settings per scene, plus the motion-graphics overlay
- `drive.js` — opens the model in headless Chrome (Playwright), steps through the timeline and encodes each scene with ffmpeg
- `narrate.py` — fits each scene to a narration clip and mixes the audio
- `sheet.py` — contact sheets of test stills

Requires Node with `playwright`, Python 3, and ffmpeg.

```
# from the repository root
python3 -m http.server 8765 &
cd tools/video
node drive.js stills 2,30,60        # test frames at these seconds
node drive.js render                # all scenes into scenes/s0.mp4 …
```
