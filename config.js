// Global leaderboard backend (Supabase). Leave blank to run fully offline —
// the game works either way; daily scores just stay on this device.
//
// To enable the global daily leaderboard (free, ~5 minutes):
//   1. Create a project at https://supabase.com (free tier)
//   2. Run the SQL in SETUP.md in the project's SQL editor
//   3. Paste your project URL and "anon public" key below and redeploy
const BACKEND = {
  url: "",      // e.g. "https://abcdefgh.supabase.co"
  anonKey: "",  // Settings -> API -> anon public key
};
