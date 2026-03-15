import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-10">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            🎌 Anime DB
          </h1>
          <p className="text-zinc-400 mt-3">Sincronize, explore e jogue</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/sync"
            className="group rounded-2xl bg-zinc-900 border border-zinc-800 p-8
                       hover:border-blue-600 transition-all duration-300
                       hover:shadow-lg hover:shadow-blue-600/10"
          >
            <div className="text-4xl mb-4">🔄</div>
            <h2 className="text-xl font-bold mb-2 group-hover:text-blue-400 transition-colors">
              Sync Dashboard
            </h2>
            <p className="text-sm text-zinc-500">
              Sincronizar e monitorar o banco de dados de animes via AniList
            </p>
          </Link>

          <Link
            href="/game"
            className="group rounded-2xl bg-zinc-900 border border-zinc-800 p-8
                       hover:border-emerald-600 transition-all duration-300
                       hover:shadow-lg hover:shadow-emerald-600/10"
          >
            <div className="text-4xl mb-4">🎮</div>
            <h2 className="text-xl font-bold mb-2 group-hover:text-emerald-400 transition-colors">
              Anime Guesser
            </h2>
            <p className="text-sm text-zinc-500">
              Adivinhe o anime secreto com dicas de ano, estúdio, tags e mais
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}