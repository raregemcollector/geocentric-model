# Geocentric Model

An interactive 3D model of the flat-earth dome, tested against the real sky. Pick a date, a time and a place and see where the dome model puts the Sun, Moon, stars and planets, next to what an observer actually sees.

**Try it:** https://raregemcollector.github.io/geocentric-model/

- Flat map: azimuthal equidistant projection, North Pole at the center, Antarctica as a ring of ice around the edge
- Sun and Moon circling under a dome; stars and planets on the dome, turning once a day around Polaris
- Real astronomy (Sun, Moon, planets, about 190 bright stars) for 2025–2030, accurate to a few arcminutes
- Sky view from any city, a globe view of the same moment, eclipses, seasons and guided demos
- Runs in any modern browser, phones included. No build step, no dependencies.

## Run it on your computer

Download the code (green **Code** button → **Download ZIP**, or `git clone`), then serve the folder:

```
python3 -m http.server 8765
```

and open http://localhost:8765. (Opening `index.html` directly from disk also mostly works, but some browsers block parts of it.)

## How the code is laid out

| Path | What it does |
|---|---|
| `js/app/model.js` | All settings, the coordinate systems and the map/dome geometry |
| `js/app/scene.js` | Draws the 3D dome view |
| `js/app/eye.js` | The observer's sky view |
| `js/app/demos.js` | Guided demos |
| `js/lib/astro.js` | Sun, Moon, planet and Earth-rotation formulas |
| `js/lib/stars.js` | Star catalog |
| `js/config.js` | Site name, version, repository link |
| `tools/video/` | Scripts that render the explainer videos from the model |

## Found something wrong? Want to improve it?

Contributions are welcome — corrections most of all. See [CONTRIBUTING.md](CONTRIBUTING.md).

- **Report a problem:** open an [issue](../../issues/new/choose)
- **Fix it yourself:** fork the repository, make your change, and open a pull request

## Sources

Flat-earth figures (Sun and Moon about 3,000 mi up and 32 mi wide, stars about 3,100 mi up) come from historical texts such as Samuel Rowbotham's *Zetetic Astronomy*. The curved light rays are drawn shapes joining the dome object to the observer; the dome model itself offers no physical law for them.

## License

MIT — free to use, study, change and share. See [LICENSE](LICENSE).
