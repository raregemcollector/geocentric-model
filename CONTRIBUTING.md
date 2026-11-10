# Contributing to the Geocentric Model

Thanks for helping. The goal is a model that is **accurate**: it should show the dome model as its proponents describe it, and the real sky as it actually is. Corrections are the most valuable contribution.

## Report a problem (no coding needed)

Open an [issue](../../issues/new/choose) and pick a template:

- **Model accuracy** — a distance, size, motion or claim that's wrong or misattributed
- **Bug** — something broken or displayed wrongly

Include the date, time and location you had set (the page's share link captures them), what you expected, and a source if you have one.

## Make a change yourself

1. **Fork** this repository (the **Fork** button, top right).
2. **Edit** your copy — on GitHub in the browser (open a file, press the pencil icon) or on your computer.
3. **Test** it: serve the folder with `python3 -m http.server 8765`, open http://localhost:8765, and check the views you touched on a phone-sized window too.
4. **Open a pull request** to this repository, saying what changed and why. Keep each pull request to one change.

The maintainer reviews every pull request before it's merged. Expect questions, especially about sources.

## Ground rules

- **Sources:** flat-earth figures and claims should cite published historical texts, not living individuals or their channels.
- **Real-sky numbers** should come from standard astronomy (and stay within the existing accuracy for 2025–2030).
- **Keep it simple:** plain JavaScript, no build step, no new dependencies, no tracking or third-party requests.
- **Be civil.** Disagree with arguments, not people.

By contributing you agree your work is released under the MIT license.
