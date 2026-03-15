import fs from "fs/promises";
import path from "path";

/**
 * Lê o token atual do arquivo local.
 */
async function readToken() {
  const tokenPath = path.join(process.cwd(), "data", "token.json");
  const tokenData = JSON.parse(await fs.readFile(tokenPath, "utf8"));
  return { tokenData, tokenPath };
}

/**
 * Atualiza o token usando o refresh_token existente.
 */
async function refreshToken(tokenPath: string) {
  console.log("Atualizando token MyAnimeList...");

  const { MAL_CLIENT_ID, MAL_CLIENT_SECRET } = process.env;
  if (!MAL_CLIENT_ID) throw new Error("MAL_CLIENT_ID não definido no .env");

  const { tokenData } = await readToken();

  const formData = new URLSearchParams({
    client_id: MAL_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: tokenData.refresh_token,
  });

  if (MAL_CLIENT_SECRET) formData.append("client_secret", MAL_CLIENT_SECRET);

  const res = await fetch("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!res.ok) throw new Error(`Erro ao atualizar token: ${res.status}`);
  const newTokens = await res.json();

  await fs.writeFile(tokenPath, JSON.stringify(newTokens, null, 2));
  console.log("Token atualizado com sucesso!");

  return newTokens;
}

/**
 * Função padronizada para fazer chamadas autenticadas à API do MyAnimeList.
 * Faz refresh automático do token se necessário. NAO PRECISA DAR .json NO RETORNO DESSA FUNC
 */
export async function malFetch(
  endpoint: string, // Ex: "/v2/users/@me/animelist?status=watching"
  options: RequestInit = {}
) {
  const { tokenData, tokenPath } = await readToken();

  console.log(`tentando rota https://api.myanimelist.net${endpoint}`)
//https://api.jikan.moe/v4/
  const res = await fetch(`https://api.myanimelist.net${endpoint}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  // Se o token expirou → tenta atualizar e refazer a requisição
  if (res.status === 401) {
    console.warn("Token expirado, tentando renovar...");
    const newToken = await refreshToken(tokenPath);

    const retryRes = await fetch(`https://api.myanimelist.net${endpoint}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${newToken.access_token}`,
      },
    });

    if (!retryRes.ok) {
      throw new Error(`Erro ao tentar refazer token: ${retryRes.status}`);
    }

    return retryRes.json();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro ${res.status}: ${text}`);
  }

  return res.json();
}