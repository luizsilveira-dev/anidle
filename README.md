This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This will link to a home page, where you can sync the sqlite database with anime-offline-database.jsonl and Anilist's API, and the actual game.

The process of syncing the entire Anilist database with the anime-offline-database is due to the code coalescing anime season into a single entry, linked to the earliest season of each anime. This can take anywhere from 20h to multiple days depending on the state of Anilist's API.

## Known bugs

The animes are not selected by their series_id, but by their own id, completely defeating the intended purpose of the sync.

Some animes are absent in Anilist's database, which 99% of the time is okay. For the purposes of this game, we won't really need to have as a game option an old obscure anime. HOWEVER, this applies to some cases where it would make sense, for example, at the time of writing (2026/03/14), JoJo Stone Ocean Part 3 isn't present in Anilist, as it seems to group it together with part 2, and it is an anime present in some of the players's MAL anime list.