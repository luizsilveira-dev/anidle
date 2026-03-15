import { NextResponse } from 'next/server';
import db, { initDb } from '@/lib/db';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST() {
  initDb();

  // Busca apenas animes que ainda não tiveram suas relações processadas
  const pendingAnimes = db.prepare(`
    SELECT mal_id, name FROM animes_raw 
    WHERE mal_id NOT IN (SELECT mal_id FROM anime_relations_raw)
  `).all();

  if (pendingAnimes.length === 0) {
    return NextResponse.json({ message: 'Todos os animes já foram buscados!' });
  }

  const insertRelation = db.prepare(
    'INSERT INTO anime_relations_raw (mal_id, relations_json) VALUES (?, ?)'
  );

  const query = `
    query ($idMal: Int) {
      Media (idMal: $idMal, type: ANIME) {
        relations {
          edges {
            relationType
            node {
              idMal
              title { romaji }
            }
          }
        }
      }
    }
  `;

  let processedCount = 0;

  for (const anime of pendingAnimes) {
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query, variables: { idMal: anime.mal_id } })
      });

      const data = await response.json();
      
      // Salva o resultado bruto como JSON
      if (data && data.data && data.data.Media) {
        insertRelation.run(anime.mal_id, JSON.stringify(data.data.Media.relations.edges));
        processedCount++;
      }

      // Evita o Rate Limit da API do AniList (90 requests por minuto)
      // 700ms de intervalo garante segurança
      await sleep(700); 

    } catch (error) {
      console.error(`Erro ao buscar mal_id ${anime.mal_id}:`, error);
      // Opcional: interromper ou continuar
    }
  }

  return NextResponse.json({ message: `${processedCount} animes processados na API.` });
}