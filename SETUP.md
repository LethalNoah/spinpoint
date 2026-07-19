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
