import { NextResponse } from "next/server";
import { malFetch } from "@/lib/malClient";

export async function fetchAllByStatus(id: number) {
    
    // let url = `/v2/anime/${id}?fields=id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime,related_manga,recommendations,studios,statistics`;
    let url = `/v4/anime/${id}/full`;

// fields=id,title,main_picture,alternative_titles,start_date,synopsis,mean,rank,popularity,created_at,updated_at,media_type,status,genres,my_list_status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,pictures,background,related_anime,related_manga,recommendations,studios,statistics
    const res = await malFetch(url);

    return res;
}

export async function GET() {
  try {
    const anime_data = await fetchAllByStatus(1);

    return NextResponse.json({
      data: anime_data,
    });
  } catch (err: any) {
    console.error("Erro:", err);
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}