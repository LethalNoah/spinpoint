# SpinPoint 🌍

A mashup of GeoGuessr, Trivia Crack, and MapTap: spin a wheel for a trivia genre,
answer the question, then pinpoint the related city on an unlabeled world map for
a distance-based score multiplier.

## How to play

1. **Spin** the wheel — lands on one of 6 genres (History, Science, Sports, Food & Drink,
   Arts & Music, Pop Culture). Genres draw from a shuffled bag, so all six appear before
   any genre repeats.
2. **Answer** a multiple-choice question. Difficulty ramps with the round — rounds 1–3 easy
   (20s timer, 100 pts staked), 4–7 medium (15s, 150 pts), 8–10 hard (12s, 200 pts).
3. **Pinpoint** — NASA Blue Marble satellite imagery: real topography, lakes, and coastlines,
   but no borders or labels. You have **20 seconds** to pin the question's city. Within
   300 km you keep the full **×3** multiplier (BULLSEYE! + confetti); it slides down to ×1
   at 6,000 km. Got the trivia wrong? A close pin still rescues up to 50 pts.
4. **Streak** — consecutive correct answers build a 🔥×N streak with a stacking bonus
   multiplier (+10% each, capped ×1.5).
5. **Challenge a friend** — the end screen gives you a share link that replays your *exact*
   run (same genres, same questions, seeded PRNG) and shows a head-to-head verdict when
   they finish. No server needed.

10 rounds. Time pressure everywhere. Confetti when you earn it. Local top-10 leaderboard
per device (name + score persist in localStorage).

## Running it

Static files, no build step. Open `index.html` directly, or serve the folder:

```
npx serve .
```

## Files

- `index.html` / `style.css` — UI (start, wheel, question, map, results screens)
- `game.js` — wheel animation, timers, streak system, canvas satellite map with
  mipmapped pan/zoom, confetti/splash FX, haversine scoring
- `questions.js` — question bank: 6 genres × 12 questions (4 easy / 4 medium / 4 hard),
  each tagged with a city + coordinates
- `world-topo.jpg` — NASA Blue Marble basemap (public domain; topography + bathymetry)
- `land.js` — Natural Earth land polygons, used as an instant vector fallback while
  the satellite image loads
