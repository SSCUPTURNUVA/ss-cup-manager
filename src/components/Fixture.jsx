import CompletedMatches from "./CompletedMatches";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../supabase";

const TURKISH_DAYS = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

export default function Fixture({
  fixtures = [],
  setFixtures,
}) {
  const [fixtureTab, setFixtureTab] = useState("upcoming");
  const [scores, setScores] = useState(() => {
    try {
      const saved =
        localStorage.getItem("sscup-scores");

      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [matchGoals, setMatchGoals] =
    useState(() => {
      try {
        const saved = localStorage.getItem(
          "sscup-match-goals"
        );

        return saved
          ? JSON.parse(saved)
          : {};
      } catch {
        return {};
      }
    });


  function getCurrentElapsed(match) {
    const savedSeconds = Number(
      match.elapsedSeconds
    ) || 0;

    if (
      match.timerRunning !== true ||
      !match.timerStartedAt
    ) {
      return savedSeconds;
    }

    const startedAt = Number(
      match.timerStartedAt
    );

    if (!Number.isFinite(startedAt)) {
      return savedSeconds;
    }

    return (
      savedSeconds +
      Math.max(
        0,
        Math.floor(
          (Date.now() - startedAt) / 1000
        )
      )
    );
  }

  function formatMatchTime(totalSeconds) {
    const safeSeconds = Math.max(
      0,
      Number(totalSeconds) || 0
    );

    const minutes = Math.floor(
      safeSeconds / 60
    );
    const seconds = safeSeconds % 60;

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  useEffect(() => {
  async function loadFixtures() {
    const { data, error } = await supabase
      .from("fixtures")
      .select("*")
      .order("id");

    if (error) {
      console.log("Fikstür çekme hatası:", error);
      return;
    }

    if (data) {
      const converted = data.map((item) => ({
        id: Number(item.id),
        home: item.home,
        away: item.away,
        date: item.date,
        time: item.time,
        field: item.pitch,
        week: item.week,
        played: item.played,
        homeScore: item.home_score,
        awayScore: item.away_score,
        live: item.live,
        timerRunning: item.timer_running,
        timerStartedAt: item.timer_started_at,
        elapsedSeconds: item.elapsed_seconds,
      }));

      const localSaved = JSON.parse(
        localStorage.getItem("sscup-fixtures") || "[]"
      );

      const mergedLeague = converted.map((item) => {
        const localMatch = localSaved.find(
          (saved) => String(saved.id) === String(item.id)
        );

        return localMatch
          ? {
              ...item,
              ...localMatch,
              played:
                localMatch.played === true
                  ? true
                  : item.played,
            }
          : item;
      });

      // Eleme maçları Supabase fixtures tablosunda değil app_state içinde tutulur.
      // Sayfa yenilenince yerel eleme maçlarını lig maçlarının sonuna yeniden ekle.
      const localKnockout = localSaved.filter((match) => match?.isKnockout === true);
      const merged = [...mergedLeague, ...localKnockout];

      setFixtures(merged);
      localStorage.setItem(
        "sscup-fixtures",
        JSON.stringify(merged)
      );
    }
  }

  loadFixtures();
}, [setFixtures]);

  useEffect(() => {
    if (fixtures.length !== 0) {
      return;
    }

    setScores({});
    setMatchGoals({});

    localStorage.removeItem(
      "sscup-scores"
    );

    localStorage.removeItem(
      "sscup-match-goals"
    );

    localStorage.removeItem(
      "sscup-goals"
    );

    window.dispatchEvent(
      new CustomEvent(
        "sscup-goals-updated",
        {
          detail: [],
        }
      )
    );
  }, [fixtures.length]);

  const groupedFixtures = useMemo(() => {
    const groups = {};

    fixtures.forEach((match, index) => {
      const week = Number(match.week) || 1;

      if (!groups[week]) {
        groups[week] = [];
      }

      groups[week].push({
        match,
        index,
      });
    });

    return Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)
      .map((week) => ({
        week,
        matches: groups[week],
      }));
  }, [fixtures]);

  function getSquads() {
    try {
      const saved =
        localStorage.getItem(
          "sscup-squads"
        );

      return saved
        ? JSON.parse(saved)
        : {};
    } catch {
      return {};
    }
  }

  function getTeamSquad(teamName) {
    const squads = getSquads();
    const squad = squads[teamName];

    return Array.isArray(squad)
      ? squad
      : [];
  }

  function getGoalCount(value) {
    if (
      value === "" ||
      value === undefined ||
      value === null
    ) {
      return 0;
    }

    const number = Number(value);

    if (
      !Number.isInteger(number) ||
      number < 0
    ) {
      return 0;
    }

    return number;
  }

  function resizeGoalList(
    currentList,
    count
  ) {
    const list = Array.isArray(
      currentList
    )
      ? [...currentList]
      : [];

    if (list.length > count) {
      return list.slice(0, count);
    }

    while (list.length < count) {
      list.push(null);
    }

    return list;
  }

  function getDayFromDate(dateValue) {
    if (!dateValue) {
      return "";
    }

    const date = new Date(
      `${dateValue}T12:00:00`
    );

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return TURKISH_DAYS[date.getDay()];
  }

  function formatVisibleDate(dateValue) {
    if (!dateValue) {
      return "Tarih seçilmedi";
    }

    const date = new Date(
      `${dateValue}T12:00:00`
    );

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleDateString(
      "tr-TR",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }
    );
  }

  function getCalendarWeekKey(dateValue) {
    if (!dateValue) return "";

    const date = new Date(`${dateValue}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";

    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);

    return [
      monday.getFullYear(),
      String(monday.getMonth() + 1).padStart(2, "0"),
      String(monday.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function hasSameTeamInCalendarWeek(match, matchIndex, dateValue) {
    const weekKey = getCalendarWeekKey(dateValue);
    if (!weekKey) return false;

    return fixtures.some((otherMatch, otherIndex) => {
      if (otherIndex === matchIndex || !otherMatch?.date) return false;
      if (getCalendarWeekKey(otherMatch.date) !== weekKey) return false;

      return (
        otherMatch.home === match.home ||
        otherMatch.away === match.home ||
        otherMatch.home === match.away ||
        otherMatch.away === match.away
      );
    });
  }

  async function updateMatchDetail(
    index,
    field,
    value
  ) {
    const currentMatch = fixtures[index];


    const updatedFixtures =
      fixtures.map(
        (fixture, fixtureIndex) => {
          if (fixtureIndex !== index) {
            return fixture;
          }

          if (field === "date") {
            return {
              ...fixture,
              date: value,
              day:
                getDayFromDate(value) ||
                fixture.day ||
                "",
            };
          }

          return {
            ...fixture,
            [field]: value,
          };
        }
      );

    setFixtures(updatedFixtures);

    // Manuel tarih/saat/saha değişikliği telefondaki canlı takipte de
    // anında sabit kalsın diye Supabase'e kaydedilir.
    const selectedMatch = updatedFixtures[index];
    const safeId = Number(selectedMatch?.id);

    if (Number.isFinite(safeId)) {
      const cloudField = field === "field" ? "pitch" : field;
      const cloudValue =
        (field === "date" || field === "time") && value === ""
          ? null
          : value;

      const { error } = await supabase
        .from("fixtures")
        .update({ [cloudField]: cloudValue })
        .eq("id", safeId);

      if (error) {
        console.error("Maç programı kaydedilemedi:", error);
        alert("Tarih/saat buluta kaydedilemedi: " + error.message);
      }
    }
  }

  async function updateScore(
    index,
    side,
    value
  ) {
    if (
      value !== "" &&
      Number(value) < 0
    ) {
      return;
    }

    const updatedScores = {
      ...scores,
      [index]: {
        ...scores[index],
        [side]: value,
      },
    };

    const homeIsEmpty =
      updatedScores[index]?.home === "" ||
      updatedScores[index]?.home ===
        undefined;

    const awayIsEmpty =
      updatedScores[index]?.away === "" ||
      updatedScores[index]?.away ===
        undefined;

    setScores(updatedScores);

    localStorage.setItem(
      "sscup-scores",
      JSON.stringify(updatedScores)
    );

    if (homeIsEmpty || awayIsEmpty) {
      const updatedFixtures =
        fixtures.map(
          (
            fixture,
            fixtureIndex
          ) =>
            fixtureIndex === index
              ? {
                  ...fixture,
                  homeScore: null,
                  awayScore: null,
                  played: false,
                }
              : fixture
        );

      const updatedGoals = {
        ...matchGoals,
        [index]: {
          home: [],
          away: [],
        },
      };

      setFixtures(updatedFixtures);
      setMatchGoals(updatedGoals);

      localStorage.setItem(
        "sscup-fixtures",
        JSON.stringify(
          updatedFixtures
        )
      );

      localStorage.setItem(
        "sscup-match-goals",
        JSON.stringify(updatedGoals)
      );

      rebuildGoalScorers(
        updatedGoals
      );

      return;
    }

    const homeGoalCount =
      getGoalCount(
        updatedScores[index]?.home
      );

    const awayGoalCount =
      getGoalCount(
        updatedScores[index]?.away
      );

    setMatchGoals((current) => {
      const updatedGoals = {
        ...current,
        [index]: {
          home: resizeGoalList(
            current[index]?.home,
            homeGoalCount
          ),
          away: resizeGoalList(
            current[index]?.away,
            awayGoalCount
          ),
        },
      };

      localStorage.setItem(
        "sscup-match-goals",
        JSON.stringify(
          updatedGoals
        )
      );

      return updatedGoals;
    });
  }

  function selectGoalScorer(
    matchIndex,
    side,
    goalIndex,
    playerId,
    teamName
  ) {
    const squad =
      getTeamSquad(teamName);

    const player = squad.find(
      (item) =>
        String(item.id) ===
        String(playerId)
    );

    const scorer = player
      ? {
          playerId: player.id,
          name: player.name,
          shirtNumber:
            player.shirtNumber,
          team: teamName,
        }
      : null;

    setMatchGoals((current) => {
      const currentMatch =
        current[matchIndex] || {
          home: [],
          away: [],
        };

      const updatedSide = [
        ...(currentMatch[side] || []),
      ];

      updatedSide[goalIndex] =
        scorer;

      const updatedGoals = {
        ...current,
        [matchIndex]: {
          ...currentMatch,
          [side]: updatedSide,
        },
      };

      localStorage.setItem(
        "sscup-match-goals",
        JSON.stringify(
          updatedGoals
        )
      );

      return updatedGoals;
    });
  }

  function allScorersSelected(
    list,
    goalCount
  ) {
    if (goalCount === 0) {
      return true;
    }

    if (
      !Array.isArray(list) ||
      list.length !== goalCount
    ) {
      return false;
    }

    return list.every(
      (scorer) =>
        scorer &&
        scorer.playerId &&
        scorer.name &&
        scorer.team
    );
  }

  function rebuildGoalScorers(
    allMatchGoals
  ) {
    const totals = {};

    Object.values(
      allMatchGoals
    ).forEach((match) => {
      const allScorers = [
        ...(match?.home || []),
        ...(match?.away || []),
      ];

      allScorers.forEach(
        (scorer) => {
          if (
            !scorer?.playerId ||
            !scorer?.team
          ) {
            return;
          }

          const key =
            `${scorer.team}-${scorer.playerId}`;

          if (!totals[key]) {
            totals[key] = {
              id: key,
              playerId:
                scorer.playerId,
              name: scorer.name,
              team: scorer.team,
              shirtNumber:
                scorer.shirtNumber,
              goals: 0,
            };
          }

          totals[key].goals += 1;
        }
      );
    });

    const goalScorers =
      Object.values(totals);

    localStorage.setItem(
      "sscup-goals",
      JSON.stringify(goalScorers)
    );

    window.dispatchEvent(
      new CustomEvent(
        "sscup-goals-updated",
        {
          detail: goalScorers,
        }
      )
    );
  }

  function toggleLiveMatch(index) {
    const selectedMatch = fixtures[index];

    if (selectedMatch.played === true) {
      alert(
        "Oynanmış bir maç canlı başlatılamaz."
      );

      return;
    }

    const shouldStart =
      selectedMatch.live !== true;

    const updatedFixtures = fixtures.map(
      (fixture, fixtureIndex) => {
        if (fixtureIndex === index) {
          if (shouldStart) {
            return {
              ...fixture,
              live: true,
              elapsedSeconds: 0,
              timerRunning: true,
              timerStartedAt: Date.now(),
            };
          }

          return {
            ...fixture,
            live: false,
            elapsedSeconds: 0,
            timerRunning: false,
            timerStartedAt: null,
          };
        }

        return {
          ...fixture,
          live: false,
          timerRunning: false,
          timerStartedAt: null,
        };
      }
    );

    setFixtures(updatedFixtures);

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(updatedFixtures)
    );
  }

  function toggleTimer(index) {
    const updatedFixtures = fixtures.map(
      (fixture, fixtureIndex) => {
        if (fixtureIndex !== index) {
          return fixture;
        }

        if (fixture.timerRunning === true) {
          return {
            ...fixture,
            elapsedSeconds:
              getCurrentElapsed(fixture),
            timerRunning: false,
            timerStartedAt: null,
          };
        }

        return {
          ...fixture,
          timerRunning: true,
          timerStartedAt: Date.now(),
        };
      }
    );

    setFixtures(updatedFixtures);

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(updatedFixtures)
    );
  }

  async function saveMatch(index, finishMatch = false) {
    const match = fixtures[index];
    const score = scores[index];

    if (
      score?.home === "" ||
      score?.home === undefined ||
      score?.away === "" ||
      score?.away === undefined
    ) {
      alert(
        "İki takımın da skorunu giriniz."
      );

      return;
    }

    const homeScore = Number(
      score.home
    );

    const awayScore = Number(
      score.away
    );

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      alert(
        "Skorlar 0 veya daha büyük tam sayı olmalıdır."
      );

      return;
    }

    const homeSquad =
      getTeamSquad(match.home);

    const awaySquad =
      getTeamSquad(match.away);

    if (
      homeScore > 0 &&
      homeSquad.length === 0
    ) {
      alert(
        `${match.home} takımının kadrosu bulunamadı. Önce Kadro Yönetimi bölümünden oyuncu ekleyin.`
      );

      return;
    }

    if (
      awayScore > 0 &&
      awaySquad.length === 0
    ) {
      alert(
        `${match.away} takımının kadrosu bulunamadı. Önce Kadro Yönetimi bölümünden oyuncu ekleyin.`
      );

      return;
    }

    const selectedGoals =
      matchGoals[index] || {
        home: [],
        away: [],
      };

    if (
      finishMatch &&
      !allScorersSelected(
        selectedGoals.home,
        homeScore
      )
    ) {
      alert(
        `${match.home} takımının ${homeScore} golü için bütün golcüleri seçiniz.`
      );

      return;
    }

    if (
      finishMatch &&
      !allScorersSelected(
        selectedGoals.away,
        awayScore
      )
    ) {
      alert(
        `${match.away} takımının ${awayScore} golü için bütün golcüleri seçiniz.`
      );

      return;
    }

    if (finishMatch) {
      const confirmed = window.confirm(
        `${match.home} - ${match.away} maçını bitirmek istiyor musunuz?`
      );

      if (!confirmed) {
        return;
      }
    }

    const currentElapsed = getCurrentElapsed(match);

    const updatedFixtures =
      fixtures.map(
        (
          fixture,
          fixtureIndex
        ) =>
          fixtureIndex === index
            ? {
                ...fixture,
                homeScore,
                awayScore,
                played: finishMatch
                  ? true
                  : fixture.played === true,
                live: finishMatch
                  ? false
                  : fixture.live === true,
                elapsedSeconds: finishMatch
                  ? currentElapsed
                  : fixture.elapsedSeconds,
                timerRunning: finishMatch
                  ? false
                  : fixture.timerRunning === true,
                timerStartedAt: finishMatch
                  ? null
                  : fixture.timerStartedAt,
              }
            : fixture
      );

    setFixtures(updatedFixtures);

    localStorage.setItem(
      "sscup-fixtures",
      JSON.stringify(
        updatedFixtures
      )
    );

    // Lig maçları fixtures tablosuna, eleme maçları app_state tablosuna kaydedilir.
    if (match.isKnockout === true) {
      const { data: stateRow, error: readError } = await supabase
        .from("app_state")
        .select("value")
        .eq("id", "knockout")
        .maybeSingle();

      if (readError) {
        console.error("Eleme verisi okunamadı:", readError);
        alert(readError.message);
        return;
      }

      const value = stateRow?.value && typeof stateRow.value === "object"
        ? { ...stateRow.value }
        : {};
      const cloudMatch = {
        ...match,
        homeScore,
        awayScore,
        played: finishMatch,
        live: finishMatch ? false : match.live === true,
      };
      const [stage, rawIndex] = String(match.knockoutKey || "").split("-");
      const knockoutIndex = Number(rawIndex || 0);

      if (stage === "quarter") {
        const quarter = Array.isArray(value.quarter) ? [...value.quarter] : [];
        quarter[knockoutIndex] = { ...(quarter[knockoutIndex] || {}), ...cloudMatch };
        value.quarter = quarter;
      } else if (stage === "semi") {
        const semi = Array.isArray(value.semi) ? [...value.semi] : [];
        semi[knockoutIndex] = { ...(semi[knockoutIndex] || {}), ...cloudMatch };
        value.semi = semi;
      } else if (match.knockoutKey === "final-0") {
        value.finalMatch = { ...(value.finalMatch || {}), ...cloudMatch };
      } else if (match.knockoutKey === "third-place-0") {
        value.thirdPlace = { ...(value.thirdPlace || {}), ...cloudMatch };
      }

      const { error } = await supabase
        .from("app_state")
        .upsert({ id: "knockout", value, updated_at: new Date().toISOString() });

      if (error) {
        console.error("Eleme verisi kaydedilemedi:", error);
        alert(error.message);
        return;
      }
    } else {
      const safeId = Number(match.id);
      if (!Number.isFinite(safeId)) {
        alert("Lig maçı kimliği geçersiz.");
        return;
      }

      const { error } = await supabase
        .from("fixtures")
        .update({
          home_score: homeScore,
          away_score: awayScore,
          played: finishMatch,
        })
        .eq("id", safeId);

      if (error) {
        console.error("SUPABASE HATA:", error);
        alert(error.message);
        return;
      }
    }

    const updatedMatchGoals = {
      ...matchGoals,
      [index]: {
        home: resizeGoalList(
          selectedGoals.home,
          homeScore
        ),
        away: resizeGoalList(
          selectedGoals.away,
          awayScore
        ),
      },
    };

    setMatchGoals(
      updatedMatchGoals
    );

    localStorage.setItem(
      "sscup-match-goals",
      JSON.stringify(
        updatedMatchGoals
      )
    );

    rebuildGoalScorers(
      updatedMatchGoals
    );

    alert(
      finishMatch
        ? "Maç tamamlandı. Sonuç, puan durumu ve gol krallığı güncellendi."
        : "Skor ve golcüler kaydedildi. Maç canlı olarak devam ediyor."
    );
  }

  function renderGoalSelectors(
    match,
    matchIndex,
    side
  ) {
    const teamName =
      side === "home"
        ? match.home
        : match.away;

    const scoreValue =
      side === "home"
        ? scores[matchIndex]?.home
        : scores[matchIndex]?.away;

    const goalCount =
      getGoalCount(scoreValue);

    if (goalCount === 0) {
      return null;
    }

    const squad =
      getTeamSquad(teamName);

    if (squad.length === 0) {
      return (
        <p>
          <b>
            ⚠️ {teamName} takımının
            kadrosu bulunamadı.
          </b>
        </p>
      );
    }

    const selectedScorers =
      matchGoals[matchIndex]?.[
        side
      ] || [];

    return (
      <div
        style={{
          marginTop: "15px",
          padding: "12px",
          border:
            "1px solid #ddd",
          borderRadius: "8px",
        }}
      >
        <b>
          ⚽ {teamName} Golcüleri
        </b>

        {Array.from({
          length: goalCount,
        }).map((_, goalIndex) => (
          <div
            key={goalIndex}
            style={{
              marginTop: "10px",
            }}
          >
            <label>
              Gol {goalIndex + 1}:{" "}
            </label>

            <select
              value={
                selectedScorers[
                  goalIndex
                ]?.playerId || ""
              }
              onChange={(event) =>
                selectGoalScorer(
                  matchIndex,
                  side,
                  goalIndex,
                  event.target.value,
                  teamName
                )
              }
            >
              <option value="">
                Gol atan oyuncuyu seçiniz
              </option>

              {squad.map(
                (player) => (
                  <option
                    key={player.id}
                    value={player.id}
                  >
                    #
                    {
                      player.shirtNumber
                    }{" "}
                    {player.name}
                  </option>
                )
              )}
            </select>
          </div>
        ))}
      </div>
    );
  }

  function renderMatch(
    match,
    index
  ) {
    const fieldValue =
      match.field ||
      match.venue ||
      "Saha 1";

    return (
      <li
        key={
          match.id ||
          `${match.home}-${match.away}-${index}`
        }
        style={{
          marginBottom: "20px",
          padding: "15px",
          border:
            "1px solid #ddd",
          borderRadius: "10px",
        }}
      >
        <strong>
          Maç {match.matchNo || index + 1}:{" "}
          {match.home} - {match.away}
        </strong>

        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            borderRadius: "8px",
            border:
              "1px solid #777",
          }}
        >
          <p
            style={{
              marginTop: 0,
              marginBottom: "12px",
            }}
          >
            📅{" "}
            <b>
              {formatVisibleDate(
                match.date
              )}
            </b>
            {" • "}
            {match.day ||
              getDayFromDate(
                match.date
              ) ||
              "Gün belirtilmedi"}
            {" • "}
            🕒{" "}
            {match.time ||
              "Saat belirtilmedi"}
            {" • "}
            📍 {fieldValue}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <label>
              Tarih
              <br />

              <input
                type="date"
                value={
                  match.date || ""
                }
                onChange={(event) =>
                  updateMatchDetail(
                    index,
                    "date",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Saat
              <br />

              <input
                type="time"
                value={
                  match.time || ""
                }
                onChange={(event) =>
                  updateMatchDetail(
                    index,
                    "time",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Saha
              <br />

              <input
                type="text"
                value={fieldValue}
                onChange={(event) =>
                  updateMatchDetail(
                    index,
                    "field",
                    event.target.value
                  )
                }
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          style={{
            marginTop: "15px",
            marginBottom: "5px",
          }}
          onClick={() =>
            toggleLiveMatch(index)
          }
        >
          {match.live === true
            ? "🔴 Canlıyı Bitir"
            : "🟢 Canlı Başlat"}
        </button>

        {match.live === true && (
          <div
            style={{
              marginTop: "10px",
              padding: "12px",
              border: "1px solid #777",
              borderRadius: "8px",
            }}
          >
            <p style={{ margin: 0 }}>
              <b>🔴 Bu maç şu anda canlı.</b>
            </p>

            <p
              style={{
                marginTop: "10px",
                marginBottom: "10px",
                fontSize: "24px",
                fontWeight: "bold",
              }}
            >
              ⏱ {formatMatchTime(
                match.elapsedSeconds
              )}
            </p>

            <button
              type="button"
              onClick={() => toggleTimer(index)}
            >
              {match.timerRunning === true
                ? "⏸️ Duraklat"
                : "▶️ Devam Et"}
            </button>
          </div>
        )}

        <div
          style={{
            marginTop: "15px",
          }}
        >
          <input
            type="number"
            min="0"
            step="1"
            placeholder={match.home}
            value={
              scores[index]?.home ??
              ""
            }
            onChange={(event) =>
              updateScore(
                index,
                "home",
                event.target.value
              )
            }
          />

          {" - "}

          <input
            type="number"
            min="0"
            step="1"
            placeholder={match.away}
            value={
              scores[index]?.away ??
              ""
            }
            onChange={(event) =>
              updateScore(
                index,
                "away",
                event.target.value
              )
            }
          />
        </div>

        {renderGoalSelectors(
          match,
          index,
          "home"
        )}

        {renderGoalSelectors(
          match,
          index,
          "away"
        )}

        {scores[index]?.home !== "" &&
          scores[index]?.home !==
            undefined &&
          scores[index]?.away !== "" &&
          scores[index]?.away !==
            undefined && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginTop: "15px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  console.log("GOLCÜLERİ KAYDET BUTONU BASILDI", index);
                  saveMatch(index, false);
                }}
              >
                💾 Golcüleri Kaydet
              </button>

              {match.live === true && (
                <button
                  type="button"
                  style={{
                    background: "#b91c1c",
                    color: "white",
                  }}
                  onClick={() =>
                    saveMatch(index, true)
                  }
                >
                  🏁 Maçı Bitir
                </button>
              )}
            </div>
          )}

        {match.played === true &&
          match.homeScore !==
            undefined &&
          match.homeScore !== null &&
          match.awayScore !==
            undefined &&
          match.awayScore !==
            null && (
            <p>
              <b>
                Kayıtlı sonuç:{" "}
                {match.home}{" "}
                {match.homeScore} -{" "}
                {match.awayScore}{" "}
                {match.away}
              </b>
            </p>
          )}
      </li>
    );
  }

  return (
    <div className="card">
      <h2>📅 Lig Fikstürü</h2>

      <p>
        Fikstür haftalara otomatik ayrılır ve aynı takım aynı fikstür haftasında
        yalnızca 1 maç oynar. Gün ve saatleri siz belirlersiniz. Maç ertelenirse
        tarihini değiştirebilirsiniz; fikstür haftası değişmez.
      </p>

      <p>
        Skoru girdikten sonra her gol
        için kadrodan gol atan oyuncuyu
        seçin. Gol Krallığı otomatik
        hesaplanacaktır.
      </p>

      <div className="fixture-tabs">
        <button
          type="button"
          className={fixtureTab === "upcoming" ? "active" : ""}
          onClick={() => setFixtureTab("upcoming")}
        >
          🟢 Oynanacak Maçlar ({fixtures.filter((match) => match.played !== true).length})
        </button>
        <button
          type="button"
          className={fixtureTab === "completed" ? "active" : ""}
          onClick={() => setFixtureTab("completed")}
        >
          🏁 Tamamlanan Maçlar ({fixtures.filter((match) => match.played === true).length})
        </button>
      </div>

      {fixtureTab === "completed" ? (
        <CompletedMatches fixtures={fixtures} setFixtures={setFixtures} />
      ) : fixtures.length === 0 ? (
        <p>
          Henüz fikstür
          oluşturulmadı.
        </p>
      ) : (
        <section style={{ marginBottom: "30px" }}>
          {groupedFixtures.map(({ week, matches }) => {
            const upcomingMatches = matches.filter(
              ({ match }) => match.played !== true
            );

            if (upcomingMatches.length === 0) return null;

            return (
              <div key={week} style={{ marginBottom: "34px" }}>
                <h3
                  style={{
                    borderBottom: "2px solid #777",
                    paddingBottom: "10px",
                  }}
                >
                  📅 {week}. Hafta • {upcomingMatches.length} Maç
                </h3>

                <ul
                  className="teamList"
                  style={{
                    padding: 0,
                    listStyle: "none",
                  }}
                >
                  {upcomingMatches.map(({ match, index }) =>
                    renderMatch(match, index)
                  )}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}