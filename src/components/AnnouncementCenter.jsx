import { sortFixturesBySchedule } from "../utils/fixtureOrder";
function formatScheduleMatch(match, index) {
  const date = match.date || "Tarih belli değil";
  const time = match.time || "Saat belli değil";
  const pitch = match.pitch || match.field || "Saha 1";

  return `${index + 1}. ${match.home} - ${match.away}\n📅 ${date} | ⏰ ${time} | 📍 ${pitch}`;
}

function copyText(text, successMessage) {
  if (!text.trim()) {
    alert("Kopyalanacak içerik bulunamadı.");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => alert(successMessage))
    .catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert(successMessage);
    });
}

export default function AnnouncementCenter({
  fixtures,
  standings,
  goalScorers,
  settings,
}) {
  const playedMatches = sortFixturesBySchedule(fixtures.filter((match) => match.played === true));
  const upcomingMatches = sortFixturesBySchedule(fixtures.filter((match) => match.played !== true));

  const fixtureText = `🏆 ${settings.tournamentName}\n\n📅 MAÇ PROGRAMI\n\n${
    upcomingMatches.length
      ? upcomingMatches.map(formatScheduleMatch).join("\n\n")
      : "Programlanmış maç bulunmuyor."
  }\n\n${settings.slogan}`;

  const standingsText = `🏆 ${settings.tournamentName}\n\n📊 PUAN DURUMU\n\n${
    standings.length
      ? standings
          .map(
            (team, index) =>
              `${index + 1}. ${team.team} — ${team.points} P | AV: ${
                team.goalDifference > 0 ? "+" : ""
              }${team.goalDifference}`
          )
          .join("\n")
      : "Puan durumu henüz oluşmadı."
  }\n\n${settings.slogan}`;

  const scorersText = `🏆 ${settings.tournamentName}\n\n⚽ GOL KRALLIĞI\n\n${
    goalScorers.length
      ? goalScorers
          .slice(0, 10)
          .map(
            (player, index) =>
              `${index + 1}. ${player.playerName || player.name || "Oyuncu"} — ${
                player.teamName || player.team || ""
              } — ${player.goals || 0} Gol`
          )
          .join("\n")
      : "Gol krallığı henüz oluşmadı."
  }\n\n${settings.slogan}`;

  const resultsText = `🏆 ${settings.tournamentName}\n\n✅ SONUÇLAR\n\n${
    playedMatches.length
      ? playedMatches
          .map(
            (match) =>
              `${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`
          )
          .join("\n")
      : "Oynanmış maç bulunmuyor."
  }\n\n${settings.slogan}`;

  const announcements = [
    {
      icon: "📅",
      title: "Maç Programı",
      description: "Oynanmamış maçları WhatsApp formatında kopyalar.",
      text: fixtureText,
    },
    {
      icon: "📊",
      title: "Puan Durumu",
      description: "Güncel sıralamayı tek tuşla kopyalar.",
      text: standingsText,
    },
    {
      icon: "⚽",
      title: "Gol Krallığı",
      description: "İlk 10 golcüyü gruba göndermeye hazırlar.",
      text: scorersText,
    },
    {
      icon: "✅",
      title: "Maç Sonuçları",
      description: "Oynanan maçların sonuçlarını kopyalar.",
      text: resultsText,
    },
  ];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">WHATSAPP İÇİN HAZIR</span>
          <h2>📢 Duyuru Merkezi</h2>
          <p>İstediğin duyuruyu tek tuşla kopyalayıp gruba gönderebilirsin.</p>
        </div>
      </section>

      <section className="announcement-grid">
        {announcements.map((item) => (
          <article key={item.title} className="announcement-card">
            <div className="announcement-icon">{item.icon}</div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => copyText(item.text, `${item.title} panoya kopyalandı.`)}
            >
              📋 Kopyala
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
