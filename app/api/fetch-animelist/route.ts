import { NextResponse } from "next/server";
import { malFetch } from "@/lib/malClient";
import { saveAnimeList } from "@/lib/saveAnimeList";

// Busca todos os animes de um usuário, combinando múltiplos status.
export async function fetchAllByStatus(account: string) {
  const statuses = ["watching", "completed", "dropped", "on_hold"];   
  const allAnimesList: any[] = [];

  // Faz todas as requisições de status em paralelo
  await Promise.all(
    statuses.map(async (status) => {
      let countOcurr = 0;
      let url = `/v2/users/${account}/animelist?status=${status}&limit=100&nsfw=true`;

      while (url) {
        const res = await malFetch(url);

        allAnimesList.push(...(res.data || []));

        url = res.paging?.next
          ? new URL(res.paging.next).pathname + new URL(res.paging.next).search
          : '';

        countOcurr++;
        if (countOcurr > 10) {
          console.warn(
            `[${account}] Possível loop infinito ao buscar lista (${status}).`
          );
          break;
        }
      }
    })
  );

  return allAnimesList;
}

export async function GET() {
  try {
    const usernames = ["Rasen_BR", "uno0040", "Bongolas","matman01","MrDummkopf","Elparedon"]
    // Executa as requisições em paralelo
    const results = await Promise.all(
      usernames.map(async (user) => {
        const list = await fetchAllByStatus(user);

        // Adiciona o campo 'origem' em cada item
        return list.map((anime) => ({
          ...anime,
          origem: user,
        }));
      })
    );

    // Junta todos os arrays num só
    const combinedData = results.flat();

    saveAnimeList(combinedData);

    return NextResponse.json({
      total: combinedData.length,
      data: combinedData,
    });
  } catch (err: any) {
    console.error("Erro:", err);
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}