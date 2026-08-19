import { useMemo, useState } from "react";
import { supabase } from "../supabase";
function createRoundRobinRounds(orderedTeams) {
  // Tek takım sayısında sanal BAY eklenir. BAY gerçek maç olarak kaydedilmez.
  const teams = [...orderedTeams];
  if (teams.length % 2 !== 0) {
    teams.push(null);
  }

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

      // BAY eşleşmesi gerçek fikstüre eklenmez.
      if (firstTeam && secondTeam) {
        roundMatches.push({
          home: reverse
            ? secondTeam
            : firstTeam,
          away: reverse
            ? firstTeam
            : secondTeam,
        });
      }
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
  const [matchesPerNight, setMatchesPerNight] =
    useState(3);
  const [daysPerWeek, setDaysPerWeek] =
    useState(2);


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

    if (teams.length < 8) {
      alert(
        "Lig fikstürü için en az 8 takım gereklidir."
      );
      return;
    }

    if (!drawCompleted) {
      alert(
        "Önce Fanus Kura Töreni bölümünde bütün takımların sırasını tamamlayın."
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

    let selectedRounds;

    if (orderedTeams.length % 2 === 0) {
      selectedRounds = allRounds.slice(0, matchCount);
    } else {
      // Tek takım sayısında herkesin eşit maç yapabilmesi için
      // 4 maçlık dengeli bir halka fikstürü kurulur.
      // Ardından maçlar haftalara, aynı takım bir haftada
      // yalnızca 1 maç oynayacak şekilde dağıtılır.
      // (Tek sayıda takım + 5 maç matematiksel olarak mümkün değildir.)
      if (matchCount % 2 !== 0) {
        alert(
          "Tek sayıda takım varken her takıma 5 maç verilemez. 4 maç seçiniz."
        );
        return;
      }

      const pairMap = new Map();
      const teamCount = orderedTeams.length;
      const halfDegree = matchCount / 2;

      for (let i = 0; i < teamCount; i++) {
        for (let step = 1; step <= halfDegree; step++) {
          const j = (i + step) % teamCount;
          const a = orderedTeams[i];
          const b = orderedTeams[j];
          const key = [a, b].sort().join("|||");
          pairMap.set(key, { home: a, away: b });
        }
      }

      const balancedMatches = Array.from(pairMap.values());
      const weekCount = matchCount + 1; // Tek takım sayısında 4 maç = 5 hafta
      const weeks = Array.from({ length: weekCount }, () => []);
      const usedWeeksByTeam = new Map(
        orderedTeams.map((team) => [team, new Set()])
      );
      const assignedWeek = new Array(balancedMatches.length).fill(-1);

      function availableWeeks(match) {
        const homeWeeks = usedWeeksByTeam.get(match.home);
        const awayWeeks = usedWeeksByTeam.get(match.away);

        return Array.from({ length: weekCount }, (_, index) => index)
          .filter(
            (weekIndex) =>
              !homeWeeks.has(weekIndex) &&
              !awayWeeks.has(weekIndex)
          )
          .sort((a, b) => weeks[a].length - weeks[b].length);
      }

      function assignMatches(assignedCount = 0) {
        if (assignedCount === balancedMatches.length) {
          return true;
        }

        let bestMatchIndex = -1;
        let bestOptions = null;

        for (let index = 0; index < balancedMatches.length; index++) {
          if (assignedWeek[index] !== -1) continue;

          const options = availableWeeks(balancedMatches[index]);

          if (options.length === 0) {
            return false;
          }

          if (bestOptions === null || options.length < bestOptions.length) {
            bestMatchIndex = index;
            bestOptions = options;

            if (options.length === 1) break;
          }
        }

        const match = balancedMatches[bestMatchIndex];

        for (const weekIndex of bestOptions) {
          assignedWeek[bestMatchIndex] = weekIndex;
          weeks[weekIndex].push(match);
          usedWeeksByTeam.get(match.home).add(weekIndex);
          usedWeeksByTeam.get(match.away).add(weekIndex);

          if (assignMatches(assignedCount + 1)) {
            return true;
          }

          usedWeeksByTeam.get(match.home).delete(weekIndex);
          usedWeeksByTeam.get(match.away).delete(weekIndex);
          weeks[weekIndex].pop();
          assignedWeek[bestMatchIndex] = -1;
        }

        return false;
      }

      if (!assignMatches()) {
        alert(
          "Tek sayılı takım fikstürü haftalara dengeli dağıtılamadı. Lütfen tekrar deneyiniz."
        );
        return;
      }

      selectedRounds = weeks.filter((week) => week.length > 0);
    }

    // Kullanıcının seçtiği gün ve gece kapasitesi haftalık hedefi belirler.
    // Örn: 2 gün x 3 maç = 6 maç/hafta, 3 gün x 4 maç = 12 maç/hafta.
    // Aynı takım aynı haftada ikinci kez oynayamayacağı için bir turun
    // maçları bu kapasiteyi aşarsa güvenli şekilde parçalara bölünür.
    const weeklyTarget = matchesPerNight * daysPerWeek;
    const capacityAdjustedRounds = [];
    selectedRounds.forEach((roundMatches) => {
      for (let start = 0; start < roundMatches.length; start += weeklyTarget) {
        capacityAdjustedRounds.push(roundMatches.slice(start, start + weeklyTarget));
      }
    });
    selectedRounds = capacityAdjustedRounds;

    const matches = [];

    /*
      Fikstür motoru yalnızca eşleşmeleri üretir.
      Tarih, saat ve saha planı kullanıcı tarafından
      Fikstür ekranında maç maç girilir.
    */
    selectedRounds.forEach((roundMatches, roundIndex) => {
      roundMatches.forEach((match, roundMatchIndex) => {
        matches.push({
          id: `league-${roundIndex + 1}-${roundMatchIndex + 1}`,
          matchNo: matches.length + 1,
          home: match.home,
          away: match.away,
          homeScore: null,
          awayScore: null,
          played: false,
          round: roundIndex + 1,
          week: roundIndex + 1,
          day: "",
          date: "",
          time: "",
          field: "Saha 1",
        });
      });
    });

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

    // Önce eski lig fikstürünü temizle.
    const { error: deleteError } = await supabase
      .from("fixtures")
      .delete()
      .eq("is_knockout", false);

    if (deleteError) {
      console.error("Eski fikstür silinirken hata oluştu:", deleteError);
    }

    // Yeni fikstür tarih/saat verilmeden buluta kaydedilir.
    const supabaseMatches = matches.map((match) => ({
      home: match.home,
      away: match.away,
      date: null,
      time: null,
      pitch: match.field || "Saha 1",
      week: match.week,
      played: false,
      home_score: null,
      away_score: null,
      is_knockout: false,
      stage: "league",
    }));

    const { data: insertedRows, error } = await supabase
      .from("fixtures")
      .insert(supabaseMatches)
      .select("id,home,away,date,time,pitch,week,played,home_score,away_score");

    if (error) {
      console.log("FIXTURE KAYIT HATASI:", error);
      alert(error.message);
      return;
    }

    const rowByPair = new Map(
      (insertedRows || []).map((row) => [
        [row.home, row.away].sort().join("|||"),
        row,
      ])
    );

    const finalMatches = matches.map((match) => {
      const row = rowByPair.get([match.home, match.away].sort().join("|||"));
      return row
        ? { ...match, id: row.id }
        : match;
    });

    setFixtures(finalMatches);
    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(finalMatches)
    );

    clearOldMatchData();

    alert(
      `Lig fikstürü oluşturuldu.\n\n` +
        `Takım sayısı: ${orderedTeams.length}\n` +
        `Her takım: ${matchCount} maç\n` +
        `Toplam maç: ${matches.length}\n\n` +
        `Haftalar otomatik dağıtıldı; aynı takım aynı hafta yalnızca 1 maç oynar.\n` +
        `Tarih ve saatler boş bırakıldı; fikstür ekranından siz verin.\n\n` +
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
        <h3>📅 Haftalık Fikstür Planı</h3>
        <p>
          Sistem haftanın eşleşmelerini otomatik hazırlar. Tarih ve saatleri
          Fikstür ekranında siz girersiniz.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
          <b>Haftada kaç gün?</b>
          {[2, 3].map((count) => (
            <label key={count} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="daysPerWeek"
                checked={daysPerWeek === count}
                onChange={() => setDaysPerWeek(count)}
              />
              {" "}{count} gün
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <b>Bir gecede kaç maç?</b>
          {[2, 3, 4].map((count) => (
            <label key={count} style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="matchesPerNight"
                checked={matchesPerNight === count}
                onChange={() => setMatchesPerNight(count)}
              />
              {" "}{count} maç
            </label>
          ))}
        </div>
        <p style={{ marginBottom: 0 }}>
          Seçim: haftada <b>{daysPerWeek}</b> gün × gecede <b>{matchesPerNight}</b> maç → haftalık hedef <b>{matchesPerNight * daysPerWeek}</b> maç.
          Takım sayısı daha az maça izin veriyorsa sistem aynı takımı aynı haftada
          iki kez oynatmadan güvenli maksimumu kullanır.
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
          teams.length < 8 ||
          !drawCompleted
        }
      >
        📅 Lig Fikstürünü Oluştur
      </button>
    </div>
  );
}