// api/artist-dashboard.js
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Возвращаем "пустые" реальные-данные (не демо-числа)
  return res.status(200).json({
    artist: { name: process.env.ARTIST_NAME || "Казан Егетләре", description: process.env.ARTIST_DESC || "" },

    summary: {
      streams: null,
      views: null,
      audience: null,
      streamsSource: "Нет данных",
      viewsSource: "Нет данных",
      audienceSource: "Нет данных"
    },

    tracks: [],
    socials: {
      telegram: process.env.SOCIAL_TELEGRAM || "",
      vk: process.env.SOCIAL_VK || "",
      youtube: process.env.SOCIAL_YOUTUBE || ""
    },

    geo: [],
    monthly: [],
    platforms: [],
    sources: [{ name: "Backend", status: "ok", message: "Backend развернут, ключи не подключены" }]
  });
}
