import db from "./db";

interface Anime {
  node: {
    id: number;
    title: string;
    main_picture?: {
        medium: string,
        large: string,
        small?: string
    };
  };
  origem: string;
}

/**
 * Insere ou atualiza os animes no banco.
 * Se o anime já existir, concatena o novo nome de origem.
 */
export function saveAnimeList(animes: Anime[]) {
  const insert = db.prepare(`
    INSERT INTO animes_raw (id, title, origem, image)
    VALUES (@id, @title, @origem, @image)
    ON CONFLICT(id) DO UPDATE SET
      origem = CASE
        WHEN instr(origem, excluded.origem) = 0
        THEN origem || ',' || excluded.origem
        ELSE origem
      END;
  `);

  const transaction = db.transaction((items: Anime[]) => {
    for (const anime of items) {
        var main_picture_large = '';
        if (anime.node.main_picture)
            main_picture_large = anime.node.main_picture.large
        insert.run({
            id: anime.node.id,
            title: anime.node.title,
            image: main_picture_large,
            origem: anime.origem,
        });
    }
  });

  transaction(animes);
}