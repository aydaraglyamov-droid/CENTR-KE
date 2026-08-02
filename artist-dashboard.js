export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Возвращаем «пустые» реальные-данные (не демо)
  return res.status(200).json({
    artist: { name: process.env.ARTIST_NAME || "Казан Егетләре", description: process.env.ARTIST_DESC || "" },
    summary: { streams: null, views: null, audience: null, streamsSource: "Нет данных", viewsSource: "Нет данных", audienceSource: "Нет данных" },
    tracks: [],
    socials: {
      telegram: process.env.SOCIAL_TELEGRAM || "",
      vk: process.env.SOCIAL_VK || "",
      youtube: process.env.SOCIAL_YOUTUBE || "",
      instagram: process.env.SOCIAL_INSTAGRAM || ""
    },
    geo: [],
    monthly: [],
    platforms: [],
    sources: [{ name: "Backend", status: "ok", message: "Backend работает, ключи не подключены" }]
  });
}
