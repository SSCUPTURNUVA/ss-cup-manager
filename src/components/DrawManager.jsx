import { useMemo, useState } from "react";
import { supabase } from "../supabase";
const MATCH_DAYS = [
  {
    day: "Pazartesi",
    dayOffset: 0,
  },
  {
    day: "Çarşamba",
    dayOffset: 2,
  },
  {
    day: "Cuma",
    dayOffset: 4,
  },
];

const MATCH_TIMES = [
  "20:00",
  "21:00",
  "22:00",
  "23:00",
];

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(date.getDate()).padStart(
    2,
    "0"
  );

  return `${year}-${month}-${day}`;
}

function addDays(dateText, numberOfDays) {
  const date = new Date(`${dateText}T12:00:00`);

  date.setDate(date.getDate() + numberOfDays);

  return formatDate(date);
}

function createRoundRobinRounds(orderedTeams) {
  const teams = [...orderedTeams];

  /*
    Takım sayısının çift olması gerekiyor.
    Böylece her takım aynı hafta bir maç oynar.
  */
  const fixedTeam = teams[0];
  let rotatingTeams = teams.slice(1);

  const rounds = [];
  const totalRounds = teams.length - 1;

  for (
    let roundIndex = 0;
    roundIndex < totalRounds;
    roundIndex++
  ) {
    const currentOrder = [
      fixedTeam,
      ...rotatingTeams,
    ];

    const roundMatches = [];
    const half = currentOrder.length / 2;

    for (
      let matchIndex = 0;
      matchIndex < half;
      matchIndex++
    ) {
      const firstTeam =
        currentOrder[matchIndex];

      const secondTeam =
        currentOrder[
          currentOrder.length -
            1 -
            matchIndex
        ];

      /*
        Ev/deplasman kavramı yok.
        Sadece görüntü ve kayıt için sırayla
        home-away alanlarında tutulur.
      */
      const reverse =
        (roundIndex + matchIndex) % 2 === 1;

      roundMatches.push({
        home: reverse
          ? secondTeam
          : firstTeam,
        away: reverse
          ? firstTeam
          : secondTeam,
      });
    }

    rounds.push(roundMatches);

    /*
      İlk takım sabit kalır.
      Diğer takımlar her tur döndürülür.
    */
    rotatingTeams = [
      rotatingTeams[
        rotatingTeams.length - 1
      ],
      ...rotatingTeams.slice(
        0,
        rotatingTeams.length - 1
      ),
    ];
  }

  return rounds;
}

export default function DrawManager({
  teams,
  drawOrder,
  setFixtures,
}) {
  const [matchCount, setMatchCount] =
    useState(4);

  const [startDate, setStartDate] =
    useState("");

  const drawCompleted = useMemo(() => {
    return (
      teams.length > 0 &&
      drawOrder.length === teams.length &&
      teams.every((team) =>
        drawOrder.includes(team)
      )
    );
  }, [teams, drawOrder]);

  function clearOldMatchData() {
    localStorage.setItem(
      "sscup-scores",
      JSON.stringify({})
    );

    localStorage.setItem(
      "sscup-match-goals",
      JSON.stringify({})
    );

    localStorage.setItem(
      "sscup-goals",
      JSON.stringify([])
    );

    window.dispatchEvent(
      new CustomEvent("sscup-goals-updated", {
        detail: [],
      })
    );
  }

  async function createFixture() {

    if (teams.length < 10) {
      alert(
        "Lig fikstürü için en az 10 takım gereklidir."
      );
      return;
    }

    if (!drawCompleted) {
      alert(
        "Önce Fanus Kura Töreni bölümünde bütün takımların sırasını tamamlayın."
      );
      return;
    }

    if (teams.length % 2 !== 0) {
      alert(
        "Her takımın her hafta bir maç oynayabilmesi için takım sayısı çift olmalıdır."
      );
      return;
    }

    if (!startDate) {
      alert(
        "İlk haftanın Pazartesi tarihini seçiniz."
      );
      return;
    }

    if (
      matchCount !== 4 &&
      matchCount !== 5
    ) {
      alert(
        "Maç sayısı 4 veya 5 olmalıdır."
      );
      return;
    }

    if (matchCount >= teams.length) {
      alert(
        "Takım başına maç sayısı, toplam takım sayısından küçük olmalıdır."
      );
      return;
    }

    const confirmed = window.confirm(
      "Yeni fikstür oluşturulursa mevcut skorlar ve golcü kayıtları temizlenecek.\n\nDevam edilsin mi?"
    );

    if (!confirmed) {
      return;
    }

    /*
      Fanus kura sırası kesinlikle
      değiştirilmez ve karıştırılmaz.
    */
    const orderedTeams = [...drawOrder];

    /*
      Standart lig turu oluşturulur.
      Her turda her takım yalnızca bir maç yapar.
    */
    const allRounds =
      createRoundRobinRounds(orderedTeams);

    const selectedRounds = allRounds.slice(
      0,
      matchCount
    );

    const matches = [];

    /*
      Bir haftada:
      3 akşam × 4 maç = 12 maç kapasitesi.
    */
    const weeklyCapacity =
      MATCH_DAYS.length *
      MATCH_TIMES.length;

    selectedRounds.forEach(
      (roundMatches, roundIndex) => {
        roundMatches.forEach(
          (match, roundMatchIndex) => {
            /*
              24 takıma kadar bir turun tamamı
              aynı takvim haftasına sığar.

              Daha fazla takım varsa kalan
              maçlar sonraki haftaya taşar.
            */
            const extraWeek = Math.floor(
              roundMatchIndex /
                weeklyCapacity
            );

            const slotInWeek =
              roundMatchIndex %
              weeklyCapacity;

            const calendarWeek =
              roundIndex + 1 + extraWeek;

            const dayIndex = Math.floor(
              slotInWeek /
                MATCH_TIMES.length
            );

            const timeIndex =
              slotInWeek %
              MATCH_TIMES.length;

            const selectedDay =
              MATCH_DAYS[dayIndex];

            const dateOffset =
              (calendarWeek - 1) * 7 +
              selectedDay.dayOffset;

            matches.push({
              id: `league-${
                roundIndex + 1
              }-${roundMatchIndex + 1}`,

              matchNo: matches.length + 1,

              home: match.home,
              away: match.away,

              homeScore: null,
              awayScore: null,
              played: false,

              /*
                Lig turu:
                Her takımın kaçıncı maçı olduğu.
              */
              round: roundIndex + 1,

              /*
                Gerçek takvim haftası.
              */
              week: calendarWeek,

              day: selectedDay.day,

              date: addDays(
                startDate,
                dateOffset
              ),

              time: MATCH_TIMES[timeIndex],

              field: "Saha 1",
            });
          }
        );
      }
    );

    /*
      Her takımın eşit sayıda maç yaptığını
      son kez kontrol eder.
    */
    const teamMatchTotals = {};

    orderedTeams.forEach((team) => {
      teamMatchTotals[team] = 0;
    });

    matches.forEach((match) => {
      teamMatchTotals[match.home] += 1;
      teamMatchTotals[match.away] += 1;
    });

    const incorrectTeams =
      orderedTeams.filter(
        (team) =>
          teamMatchTotals[team] !==
          matchCount
      );

    if (incorrectTeams.length > 0) {
      console.error(
        "Maç sayısı hatalı takımlar:",
        incorrectTeams,
        teamMatchTotals
      );

      alert(
        "Fikstür kontrolünde hata oluştu. Fikstür kaydedilmedi."
      );
      return;
    }

    const expectedMatchCount =
      (orderedTeams.length *
        matchCount) /
      2;

    if (
      matches.length !== expectedMatchCount
    ) {
      alert(
        `${expectedMatchCount} maç oluşturulması gerekirken ${matches.length} maç oluşturuldu.`
      );
      return;
    }

setFixtures(matches);

    // 1. Önce Supabase veritabanındaki eski lig maçlarını siliyoruz
    const { error: deleteError } = await supabase
      .from("fixtures")
      .delete()
      .eq("is_knockout", false);

    if (deleteError) {
      console.error("Eski fikstür silinirken hata oluştu:", deleteError);
    }

    // 2. Yeni oluşturulan maçları Supabase'e ekliyoruz
    const supabaseMatches = matches.map((match) => ({
      home: match.home,
      away: match.away,
      date: match.date,
      time: match.time,
      pitch: match.field || "Saha 1",
      week: match.week,
      played: false,
      home_score: null,
      away_score: null,
      is_knockout: false,
      stage: "league",
    }));

    const { data, error } = await supabase
      .from("fixtures")
      .insert(supabaseMatches);

    if (error) {
      console.log("FIXTURE KAYIT HATASI:", error);
      alert(error.message);
    }

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(matches)
    );
  
    clearOldMatchData();

    alert(
      `Lig fikstürü oluşturuldu.\n\n` +
        `Takım sayısı: ${orderedTeams.length}\n` +
        `Her takım: ${matchCount} maç\n` +
        `Toplam maç: ${matches.length}\n\n` +
        `Maç günleri: Pazartesi, Çarşamba, Cuma\n` +
        `Saatler: 20:00, 21:00, 22:00, 23:00\n\n` +
        "Fanus kura sırası korunmuştur."
    );
  }

  return (
    <div className="card">
      <h2>⚙️ Lig Fikstürü Ayarları</h2>

      {!drawCompleted ? (
        <div
          style={{
            padding: "15px",
            marginBottom: "20px",
            border: "1px solid #ddd",
            borderRadius: "10px",
          }}
        >
          <p>
            <b>
              ⚠️ Fanus kura sırası henüz
              tamamlanmadı.
            </b>
          </p>

          <p>
            Fikstür oluşturabilmek için
            bütün takımların fanus sırasına
            yerleştirilmesi gerekir.
          </p>
        </div>
      ) : (
        <div
          style={{
            padding: "15px",
            marginBottom: "20px",
            border: "2px solid green",
            borderRadius: "10px",
          }}
        >
          <p>
            <b>
              ✅ Fanus kura sırası
              tamamlandı.
            </b>
          </p>

          <ol>
            {drawOrder.map(
              (team, index) => (
                <li
                  key={`${team}-${index}`}
                  style={{
                    marginBottom: "5px",
                  }}
                >
                  {team}
                </li>
              )
            )}
          </ol>
        </div>
      )}

      <div
        style={{
          padding: "15px",
          marginBottom: "20px",
          border: "1px solid #ddd",
          borderRadius: "10px",
        }}
      >
        <h3>
          📅 İlk Haftanın Pazartesi Tarihi
        </h3>

        <input
          type="date"
          value={startDate}
          onChange={(event) =>
            setStartDate(event.target.value)
          }
        />

        <p>
          Maçlar otomatik olarak Pazartesi,
          Çarşamba ve Cuma günlerine
          dağıtılacaktır.
        </p>

        <p>
          Oluşturulduktan sonra her maçın
          tarihi, saati ve sahası Fikstür
          bölümünden değiştirilebilir.
        </p>
      </div>

      <div
        style={{
          padding: "15px",
          marginBottom: "20px",
          border: "1px solid #ddd",
          borderRadius: "10px",
        }}
      >
        <h3>
          Her Takım Kaç Maç Oynayacak?
        </h3>

        <label>
          <input
            type="radio"
            name="matchCount"
            checked={matchCount === 4}
            onChange={() =>
              setMatchCount(4)
            }
          />
          {" "}4 maç
        </label>

        <br />
        <br />

        <label>
          <input
            type="radio"
            name="matchCount"
            checked={matchCount === 5}
            onChange={() =>
              setMatchCount(5)
            }
          />
          {" "}5 maç
        </label>
      </div>

      <button
        type="button"
        onClick={createFixture}
        disabled={
          teams.length < 10 ||
          !drawCompleted
        }
      >
        📅 Lig Fikstürünü Oluştur
      </button>
    </div>
  );
}