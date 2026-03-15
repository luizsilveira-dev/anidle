import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST() {
  try {
    // Caminho do arquivo de token
    const tokenPath = path.join(process.cwd(), "data", "token.json");

    // Lê o arquivo atual
    const tokenData = JSON.parse(await fs.readFile(tokenPath, "utf8"));

    // Faz o refresh com base no refresh_token existente
    const formData = new URLSearchParams({
      client_id: process.env.MAL_CLIENT_ID!, // coloque no .env
      grant_type: "refresh_token",
      refresh_token: tokenData.refresh_token,
    });

    // Se tiver client_secret (ex: tipo Web App)
    if (process.env.MAL_CLIENT_SECRET) {
      formData.append("client_secret", process.env.MAL_CLIENT_SECRET);
    }

    const res = await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    const newTokens = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: newTokens }, { status: res.status });
    }

    // Salva o novo token no arquivo local
    await fs.writeFile(tokenPath, JSON.stringify(newTokens, null, 2));

    return NextResponse.json({ message: "Token atualizado", newTokens });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao atualizar token" }, { status: 500 });
  }
}