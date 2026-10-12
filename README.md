# GLASOLOM — Heilitis Vox Sanatum

**GLASOLOM** is a free, client-side audio and video satire studio. Import a recording, choose a comical voice preset, adjust the effect, and export your modified media — no account or upload server required.

> **Status:** v2 prototype / experimental. Processing and export quality depend on your browser and input file. Do not use modified clips to mislead people about what someone said.

## Try it

Open `index.html` in desktop Chrome or Edge, or host the repository on GitHub Pages. Import your own audio/video or try `demo/glasolom_demo.wav`. Preview the effect and select **Export**; exports run in real time.

## Features

- Audio and video import (common browser-supported formats: MP3, WAV, MP4, WebM, etc.).
- 10 presets: Rubber Duck, Alien, Broken Robot, Helium, Darth Vader–style, Lord Voldemort–style, Baby Voice, Mini Boss, Swirl, Original.
- Live pitch, flanger, and robotic modulation controls.
- Serbian, English, Russian, and Spanish interface.
- **Cut / Trim:** set in/out points with sliders, second-precision inputs, or IN/OUT buttons; preview the selected segment.
- **Fast Export IN–OUT (experimental):** processes the selected segment offline rather than playing it in real time, using Mediabunny and WebCodecs. It may be significantly faster but depends on the file codec and device; video may still require substantial processing. Audio-only output is WAV. Large exports can use a direct Save As file picker on compatible desktop browsers.
- **Export IN–OUT (real-time):** records the chosen interval and saves at its OUT point. **Manual export** remains available with Stop and save.
- Video exports have **no burned-in text overlay**. Clearly disclose any audio alteration when sharing clips.
- Local browser processing: no analytics, accounts, or remote file upload.
- Optional Ko-fi support link. No advertising or tracking scripts included.

### About the themed presets

These are original, rough DSP-style approximations — **not** official character voices, actor voice clones, AI voice models, sampled clips or licensed film audio. The names are descriptive pop-culture references only; no franchise affiliation or endorsement is claimed. For a more conservative public release, consider renaming the presets “Dark Lord” and “Dark Sorcerer”.

## Add your Ko-fi profile

Open [`config.js`](config.js) and set:

```javascript
window.GLASOLOM_CONFIG = {
  koFiUrl: "https://ko-fi.com/YOUR_PUBLIC_USERNAME"
};
```

Replace the example with your **actual** profile address. When `koFiUrl` is blank, donation buttons do not appear. This is a public link, not a password or token.

## Publish with GitHub Pages

1. Create a **public** GitHub repository named `glasolom` (or another available name).
2. Upload the **contents of this folder** so `index.html` is in the repository root.
3. In repository **Settings → Pages → Build and deployment**, select **Deploy from a branch**, **main**, and **/(root)**. Save.
4. GitHub will show the published Pages URL after deployment. Share the **Pages link** on Reddit so people can use it without downloading code.

No build step, server, or API key is required. Use HTTPS (GitHub Pages serves it automatically).

## Privacy and limitations

All imported media is processed inside the user's browser. Manual and standard IN–OUT exports use `MediaRecorder` in real time. Fast export uses a separate experimental client-side processing pipeline. IN–OUT export stops automatically at the OUT marker, with a timed fallback. Duration and cut points may vary slightly with browser media timing; this is not frame-accurate lossless editing. The app does not transmit input files to a GLASOLOM server. Audio-only exports do **not** carry an audible parody announcement; label them clearly when sharing. Some browsers may not export MP4; WebM is the normal fallback. Depending on browser security rules, audio worklet pitch-shifting can fall back to native Web Audio nodes. The pitch effects may contain artifacts and **do not imitate actors or reproduce distinctive voices accurately**.

For the sake of honest context, the effects should modify audio characteristics rather than the words, while the person publishing remains responsible for editing or misrepresentation outside this tool.

## Responsible use

GLASOLOM is intended for humor, satire, parody and creative work, **not** for insulting, demeaning, harassing, discriminating against people, or falsely attributing statements. Only use media that you are entitled to process and distribute. Clearly disclose alterations. See the on-site disclaimer.

## License and name

The source code is publicly viewable but **no open-source license has been granted**. See [COPYRIGHT.md](COPYRIGHT.md). The **GLASOLOM** name and visual identity are addressed separately in [TRADEMARKS.md](TRADEMARKS.md). Publishing source code does not register a trademark; the owner may wish to investigate name availability and word-mark registration in relevant countries and classes.

## Development

No dependencies. Edit `index.html` for UI/audio logic, `cut.js` for trimming, `i18n.js` for translations, `config.js` for the Ko-fi link. Do not commit third-party copyrighted film samples, personal files or credentials. Bug reports and suggestions are welcome via issues. Contact the project owner before redistributing or reusing source code.

## Fast export dependency

The experimental fast exporter lazily imports Mediabunny 1.61.3 from the pinned jsDelivr package (`dist/bundles/mediabunny.min.mjs`). It requires internet connectivity to fetch that JavaScript module and browser support for the input/output codecs. Files remain local. Mediabunny is licensed under MPL-2.0; see https://github.com/Vanilagy/mediabunny. Fast-export DSP approximates the live voice effect and may sound different; compare before publishing. Chrome/Edge recommended.
