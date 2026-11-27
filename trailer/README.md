# Launch trailer

A 56-second trailer drawn entirely in code (`index.html`), in the Stonehold look, from the game's own art, cut to the bars of the music.

- **Preview:** serve the repo root (`npx serve .` or `python3 -m http.server`) and open `/trailer/index.html`; click to play. `?t=40` starts at 40 s.
- **Render:** `node trailer/render.js` from the repo root writes `trailer/out/talaran-trailer.mp4` (1920x1080, 30 fps, about 3.5 minutes). `--stills 3,20,45` writes single frames for checking.
- **Music:** "Celtic Impulse" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0. The credit is on the end card; put it in the video description too. `music-cut.mp3` is the track cut on its own bar lines (144 BPM, first downbeat 0.03 s): 0 to 31.68 s, then 76.67 to 89.99 s, then 143.31 s to the end, made with the ffmpeg line below.

```
ffmpeg -i celtic-impulse.mp3 -filter_complex "[0:a]atrim=0:31.68,asetpts=PTS-STARTPTS,afade=t=out:st=31.66:d=0.02[a];[0:a]atrim=76.67:89.99,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=13.30:d=0.02[b];[0:a]atrim=143.31:156,asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=8.2:d=2.5[c];[a][b][c]concat=n=3:v=0:a=1[o]" -map "[o]" -b:a 256k music-cut.mp3
```

Scenes are timed in bars (`bar(n)`), so moving a cut keeps it on the beat. The tear's shapes are silhouettes of existing creatures until the invaders are drawn: put their names in `TEAR_SHAPES`.

## Game screens

`shots/` holds real captures of the game in Stonehold, taken from a scratch copy:

1. Build a scratch database (CLAUDE.md §3, Fresh database) named `talaran_trailer`, run the server on it (`JWT_SECRET` anything) and the client (`vite`).
2. Register Pendragon, Wren, Odda, Bram, Tamsin, and Corwin (password `trailerpass1`), then `node trailer/setup-shots.js` with `DATABASE_URL` set: levels, gear, a pack, gold. It refuses any database not named for a scratch use.
3. `ALSO=Wren,Bram node trailer/shoot.js <name> Pendragon '<steps>'` logs in, puts the others in Players Here, runs the steps (click, wait, sql, shot), and saves `shots/<name>.png` (convert the ones the trailer uses to `.jpg`, which is what it loads). `SHOTS` in `index.html` names the crop of each.
