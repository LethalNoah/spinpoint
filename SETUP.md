# SpinPoint — Hosting & Global Leaderboard Setup

Two independent pieces. Hosting makes challenge links shareable; Supabase adds the
global daily leaderboard. The game works fine with either, both, or neither.

## 1. Hosting on GitHub Pages (free)

One-time, after `gh auth login`:

```
gh repo create spinpoint --public --source=. --push
gh api repos/{owner}/spinpoint/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

The game goes live at `https://<your-username>.github.io/spinpoint/` within a minute
or two. Challenge links copied in-game will point at that URL automatically
(they're built from `location.origin`).

To ship updates later:

```
git add -A && git commit -m "update" && git push
```

## 2. Global daily leaderboard (Supabase free tier, ~5 minutes)

1. Create an account + new project at https://supabase.com (any region).
2. In the dashboard, open **SQL Editor** and run:

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 16),
  score int not null check (score between 0 and 20000),
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

-- anyone may read the boards and post a score; nobody may edit or delete
create policy "public read" on public.scores for select using (true);
create policy "public insert" on public.scores for insert with check (true);

create index scores_day_score on public.scores (day, score desc);
```

For mutual friendships and the journey-map/stats features, also run:

```sql
create table public.friendships (
  id bigint generated always as identity primary key,
  a text not null check (char_length(a) between 1 and 16),
  b text not null check (char_length(b) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (a, b)
);
alter table public.friendships enable row level security;
create policy "public read friendships" on public.friendships for select using (true);
create policy "public insert friendships" on public.friendships for insert with check (true);
create policy "public delete friendships" on public.friendships for delete using (true);

create table public.pins (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 16),
  game_id text not null,
  genre text not null,
  city text not null,
  alat double precision not null,
  alon double precision not null,
  glat double precision not null,
  glon double precision not null,
  km int not null check (km between 0 and 21000),
  correct boolean not null,
  points int not null check (points between 0 and 1000),
  created_at timestamptz not null default now()
);
alter table public.pins enable row level security;
create policy "public read pins" on public.pins for select using (true);
create policy "public insert pins" on public.pins for insert with check (true);
create index pins_name_time on public.pins (name, created_at desc);
```

For XP/levels (badges visible to friends), also run:

```sql
create table public.players (
  name text primary key check (char_length(name) between 1 and 16),
  xp int not null default 0 check (xp between 0 and 100000000),
  updated_at timestamptz not null default now()
);
alter table public.players enable row level security;
create policy "public read players" on public.players for select using (true);
create policy "public insert players" on public.players for insert with check (true);
create policy "public update players" on public.players for update using (true) with check (true);
```

(Friendship rows are stored with `a` < `b` alphabetically; the unique constraint
prevents duplicates. Deletes are public so anyone can unfriend — acceptable for a
small friendly deployment, worth revisiting if the game grows.)

3. In **Settings → API**, copy the **Project URL** and the **anon public** key
   into `config.js`:

```js
const BACKEND = {
  url: "https://YOURPROJECT.supabase.co",
  anonKey: "eyJ...",
};
```

4. Commit and push. Done — daily runs now submit to a shared top-10.

Notes:
- The anon key is designed to be public; row-level security is what protects the data.
- Scores are client-reported, so treat the board as friendly competition, not
  anti-cheat-grade. A max-score sanity check is enforced in the table constraint.
- Each device submits one daily score per day (first finish counts; replays are
  flagged in the UI and not submitted).
