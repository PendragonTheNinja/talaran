# Launch trailer

A 76-second trailer drawn entirely in code (`index.html`), in the Stonehold look, from the game's own art, cut to the bars of the music.

- **Preview:** serve the repo root (`npx serve .` or `python3 -m http.server`) and open `/trailer/index.html`; click to play. `?t=40` starts at 40 s.
- **Render:** `node trailer/render.js` from the repo root writes `trailer/out/talaran-trailer.mp4` (1920x1080, 30 fps, about 3.5 minutes). `--stills 3,20,45` writes single frames for checking.
- **Music:** "Celtic Impulse" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0. The credit is on the end card; put it in the video description too. `music-cut.mp3` is the track cut on its own bar lines (144 BPM, first downbeat 0.03 s): 0 to 31.68 s, then 71.67 to 103.32 s, then 143.31 s to the end, made with the ffmpeg line below.

```
ffmpeg -i celtic-impulse.mp3 -filter_complex "[0:a]atrim=0:31.68,asetpts=PTS-STARTPTS,afade=t=out:st=31.66:d=0.02[a];[0:a]atrim=71.67:103.32,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=31.63:d=0.02[b];[0:a]atrim=143.31:156,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=10.2:d=2.4[c];[a][b][c]concat=n=3:v=0:a=1[o]" -map "[o]" -b:a 256k music-cut.mp3
```

Scenes are timed in bars (`bar(n)`), so moving a cut keeps it on the beat. The tear's invaders are silhouettes of existing creatures until their art exists.
