# SpinPoint 🌍

A mashup of GeoGuessr, Trivia Crack, and MapTap: spin a wheel for a trivia genre,
answer the question, then pinpoint the related city on an unlabeled satellite map
for a geo bonus.

**Play it:** https://lethalnoah.github.io/spinpoint/

## How to play

1. **Spin** the wheel — 6 genres (History, Science, Sports, Food & Drink, Arts & Music,
   Pop Culture), ~100 questions each with worldwide coverage. Genres draw from a
   shuffled bag, so all six appear before any repeats.
2. **Answer** — trivia is the main event. Difficulty ramps with the round: 1–3 easy
   (20s timer, banks 100 pts), 4–7 medium (15s, 150), 8–10 hard (12s, 200).
3. **Pinpoint** — NASA Blue Marble satellite imagery: real topography, lakes,
   coastlines — no borders, no labels. You have 20 seconds to pin the question's
   city. A close pin adds a **geo bonus worth up to +50%** of the base (full bonus
   within 300 km, fading to zero at 6,000 km). Helpful, never essential — and it's
   earned even on a wrong answer.
4. **Streak** — consecutive correct answers build a 🔥×N streak with a stacking
   bonus multiplier (+10% each, capped ×1.5).
5. **Challenge a friend** — the end screen gives a share link that replays your
   *exact* run (seeded PRNG) with a head-to-head verdict when they finish.
6. **Daily Challenge** — everyone worldwide gets the same seeded run each UTC day,
   with a global top-10 (Supabase).
7. **Leaderboards & Friends** — browsable from the home screen without playing:
   global daily top-10, your friends' daily scores (add them by explorer name),
   and this device's best runs.

## Running locally

Static files, no build step. Open `index.html` directly, or `npx serve .`

## Files

- `index.html` / `style.css` — UI (home, wheel, question, map, boards, results)
- `game.js` — wheel, timers, streaks, canvas satellite map with mipmapped pan/zoom,
  FX, haversine scoring, challenge links, daily mode, leaderboard client
- `questions.js` — question bank: 6 genres × ~100 questions tagged with difficulty,
  city, and coordinates; deliberately overweights Africa, SE Asia, Latin America,
  and other underrepresented regions
- `config.js` — Supabase URL + publishable key (public-safe; RLS enforces access)
- `world-topo.jpg` — NASA Blue Marble basemap (public domain)
- `land.js` — Natural Earth land polygons (instant vector fallback while the
  satellite image loads)
- `SETUP.md` — hosting + database setup recipe
