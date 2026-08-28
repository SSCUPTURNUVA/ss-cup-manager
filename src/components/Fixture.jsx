import CompletedMatches from "./CompletedMatches";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../supabase";
import { compareFixturesBySchedule, sortFixturesBySchedule } from "../utils/fixtureOrder";

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
      .map((week) => ({
        week,
        // Gerçek fixture index/ID değişmez; yalnızca ekrandaki görünüm kronolojiktir.
        matches: [...groups[week]].sort((a, b) => {
          const scheduleDiff = compareFixturesBySchedule(a.match, b.match);
          return scheduleDiff !== 0 ? scheduleDiff : a.index - b.index;
        }),
      }))
      // Hafta numarası yanlış/karışık gelse bile ekranda önce en erken tarih-saat görünür.
      .sort((a, b) => {
        const firstA = a.matches[0]?.match;
        const firstB = b.matches[0]?.match;
        const scheduleDiff = compareFixturesBySchedule(firstA, firstB);
        return scheduleDiff !== 0 ? scheduleDiff : a.week - b.week;
      });
  }, [fixtures]);

  const sortedUpcomingFixtures = useMemo(() => {
    const indexed = new Map(
      fixtures.map((match, index) => [String(match?.id ?? `idx-${index}`), index])
    );

    return sortFixturesBySchedule(
      fixtures.filter((match) => match.played !== true)
    ).map((match) => ({
      match,
      index: indexed.get(String(match?.id)) ?? fixtures.indexOf(match),
    }));
  }, [fixtures]);

  function getMatchWeekPlanKey(match, index) {
    return String(match?.id ?? match?.knockoutKey ?? `${match?.home || ""}-${match?.away || ""}-${index}`);
  }

  function findDisjointMatchIndexes(matches, targetCount, excludedTeam = "") {
    const chosen = [];
    const usedTeams = new Set();

    function search(startIndex) {
      if (chosen.length === targetCount) return true;
      if (matches.length - startIndex < targetCount - chosen.length) return false;

      for (let index = startIndex; index < matches.length; index += 1) {
        const item = matches[index];
        const home = String(item.match?.home || "");
        const away = String(item.match?.away || "");

        if (!home || !away) continue;
        if (excludedTeam && (home === excludedTeam || away === excludedTeam)) continue;
        if (usedTeams.has(home) || usedTeams.has(away)) continue;

        chosen.push(index);
        usedTeams.add(home);
        usedTeams.add(away);

        if (search(index + 1)) return true;

        chosen.pop();
        usedTeams.delete(home);
        usedTeams.delete(away);
      }

      return false;
    }

    return search(0) ? chosen.map((index) => matches[index]) : null;
  }

  async function arrangeEightMatchesPerWeek() {
    const leagueItems = fixtures
      .map((match, index) => ({ match, index, key: getMatchWeekPlanKey(match, index) }))
      .filter(({ match }) => match?.isKnockout !== true);

    if (leagueItems.length === 0) {
      alert("Düzenlenecek lig fikstürü bulunamadı.");
      return;
    }

    const bayTeam = "Bayramdere Gençlik";
    const teamNames = new Set();
    leagueItems.forEach(({ match }) => {
      if (match.home) teamNames.add(match.home);
      if (match.away) teamNames.add(match.away);
    });

    const useBayRule = teamNames.has(bayTeam);
    const remaining = [...leagueItems];
    const assignments = new Map();
    let week = 1;

    while (remaining.length > 0) {
      const target = Math.min(8, remaining.length);
      let selected = findDisjointMatchIndexes(
        remaining,
        target,
        week === 1 && useBayRule ? bayTeam : ""
      );

      if (!selected && target === 8) {
        // Son haftalarda 8 maçlık tam eşleşme kalmadıysa o haftanın mümkün
        // olan en büyük tek-maç-per-team grubunu bul. İlk iki hafta ise
        // kullanıcı isteği gereği mutlaka 8 maç olmalıdır.
        if (week <= 2) {
          alert(
            `${week}. hafta için aynı takımın iki kez oynamadığı 8 maçlık güvenli dağılım bulunamadı.\n\n` +
            "Hiçbir eşleşme değiştirilmedi. Fikstür korunuyor."
          );
          return;
        }

        for (let size = Math.min(7, target); size >= 1 && !selected; size -= 1) {
          selected = findDisjointMatchIndexes(remaining, size, "");
        }
      }

      if (!selected || selected.length === 0) {
        alert("Haftalık dağılım güvenli şekilde oluşturulamadı. Fikstüre dokunulmadı.");
        return;
      }

      selected.forEach((item) => assignments.set(item.key, week));
      const selectedKeys = new Set(selected.map((item) => item.key));
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (selectedKeys.has(remaining[index].key)) remaining.splice(index, 1);
      }
      week += 1;
    }

    const firstWeek = leagueItems.filter((item) => assignments.get(item.key) === 1);
    const secondWeek = leagueItems.filter((item) => assignments.get(item.key) === 2);
    if (firstWeek.length !== 8 || secondWeek.length !== 8) {
      alert("1. ve 2. hafta 8'er maç olacak güvenli plan oluşturulamadı. Fikstüre dokunulmadı.");
      return;
    }

    if (useBayRule && firstWeek.some(({ match }) => match.home === bayTeam || match.away === bayTeam)) {
      alert("Bayramdere Gençlik 1. hafta BAY kuralı sağlanamadı. Fikstüre dokunulmadı.");
      return;
    }

    const confirmed = window.confirm(
      `Mevcut eşleşmeler KESİNLİKLE değişmeden yalnız hafta numaraları düzenlenecek.\n\n` +
      `1. Hafta: 8 maç${useBayRule ? " • Bayramdere Gençlik BAY" : ""}\n` +
      `2. Hafta: 8 maç\n` +
      `Her takım bir haftada en fazla 1 maç oynayacak.\n\nDevam edilsin mi?`
    );
    if (!confirmed) return;

    const originalWeeks = new Map(leagueItems.map((item) => [item.key, item.match.week]));
    const changedCloudItems = [];

    try {
      for (const item of leagueItems) {
        const nextWeek = assignments.get(item.key);
        if (!Number.isFinite(Number(item.match.id)) || Number(item.match.week) === Number(nextWeek)) continue;

        const { error } = await supabase
          .from("fixtures")
          .update({ week: nextWeek })
          .eq("id", Number(item.match.id));

        if (error) throw error;
        changedCloudItems.push(item);
      }
    } catch (error) {
      console.error("Hafta dağılımı kaydetme hatası:", error);

      // Bulutta kısmi değişiklik olduysa eski hafta değerlerini geri yükle.
      for (const item of changedCloudItems) {
        try {
          await supabase
            .from("fixtures")
            .update({ week: originalWeeks.get(item.key) })
            .eq("id", Number(item.match.id));
        } catch (rollbackError) {
          console.error("Hafta geri alma hatası:", rollbackError);
        }
      }

      alert("Haftalık plan kaydedilemedi. Mevcut fikstür korunmaya çalışıldı; hiçbir eşleşme silinmedi.");
      return;
    }

    const updatedFixtures = fixtures.map((match, index) => {
      if (match?.isKnockout === true) return match;
      const nextWeek = assignments.get(getMatchWeekPlanKey(match, index));
      return nextWeek ? { ...match, week: nextWeek } : match;
    });

    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    alert(
      `✅ Haftalık dağılım tamamlandı.\n\n` +
      `1. hafta: 8 maç${useBayRule ? " • Bayramdere Gençlik BAY" : ""}\n` +
      `2. hafta: 8 maç\n` +
      `Eşleşmeler, maç kimlikleri, skorlar ve fikstür sırası korunmuştur.`
    );
  }

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

  function getMatchCenterKey(match, index = 0) {
    return String(match?.id ?? `${match?.home || ""}|${match?.away || ""}|${match?.week || ""}|${index}`);
  }

  async function toggleLiveMatch(index) {
    const selectedMatch = fixtures[index];

    if (selectedMatch.played === true) {
      alert("Oynanmış bir maç Maç Merkezi'ne alınamaz.");
      return;
    }

    const selectedKey = getMatchCenterKey(selectedMatch, index);
    const activeKey = localStorage.getItem("sscup-match-center-active") || "";
    const shouldSelect = activeKey !== selectedKey;

    const updatedFixtures = fixtures.map((fixture, fixtureIndex) => {
      const fixtureKey = getMatchCenterKey(fixture, fixtureIndex);

      if (fixtureIndex === index) {
        return {
          ...fixture,
          // Maç Merkezi'ne almak CANLI başlatmak değildir.
          // CANLI ancak 1. Devreyi Başlat ile açılır.
          live: shouldSelect ? false : fixture.live === true,
          matchPhase: fixture.matchPhase || "waiting",
          elapsedSeconds: shouldSelect ? 0 : fixture.elapsedSeconds ?? 0,
          timerRunning: shouldSelect ? false : fixture.timerRunning === true,
          timerStartedAt: shouldSelect ? null : fixture.timerStartedAt ?? null,
        };
      }

      // Başka bir maçı merkeze alırken gerçek başlamamış eski hazırlık maçlarını canlı bırakma.
      if (fixture.matchPhase === "waiting") {
        return {
          ...fixture,
          live: false,
          timerRunning: false,
          timerStartedAt: null,
        };
      }

      return fixture;
    });

    if (shouldSelect) {
      localStorage.setItem("sscup-match-center-active", selectedKey);
    } else {
      localStorage.removeItem("sscup-match-center-active");
    }

    setFixtures(updatedFixtures);
    localStorage.setItem("sscup-fixtures", JSON.stringify(updatedFixtures));

    // Maç Merkezi hazırlığı bulutta CANLI sayılmasın. Eski live=true kaydını da
    // seçildiği anda temizle ki telefon fikstüründe maç görünmeye devam etsin.
    const safeId = Number(selectedMatch?.id);
    if (Number.isFinite(safeId)) {
      const { error } = await supabase
        .from("fixtures")
        .update({
          live: false,
          timer_running: false,
          timer_started_at: null,
          elapsed_seconds: 0,
          match_phase: "waiting",
        })
        .eq("id", safeId);

      if (error) {
        console.error("Maç Merkezi hazırlık durumu buluta yazılamadı:", error);
      }
    }
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
          {match.week ? ` • ${match.week}. Hafta` : ""}
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
          {(localStorage.getItem("sscup-match-center-active") || "") === getMatchCenterKey(match, index)
            ? "❌ Maç Merkezinden Çıkar"
            : "🏟️ Maç Merkezine Al"}
        </button>

        {match.live === true && (match.matchPhase || "waiting") !== "waiting" && (
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

              {match.live === true && (match.matchPhase || "waiting") !== "waiting" && (
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

      {fixtures.some((match) => match?.isKnockout !== true) && (
        <div style={{ margin: "14px 0 18px", padding: "14px", border: "2px solid #d4af37", borderRadius: "12px" }}>
          <b>🔒 Mevcut fikstürü koruyan haftalık plan</b>
          <p style={{ margin: "8px 0 12px" }}>
            Eşleşmeler silinmez veya yeniden çekilmez. Yalnızca hafta numarası düzenlenir;
            her takım haftada en fazla 1 maç oynar. Haftalık dağılım mevcut fikstür korunarak yapılır.
          </p>
          <button type="button" onClick={arrangeEightMatchesPerWeek}>
            🗓️ 8 MAÇ / HAFTA DÜZENİNİ UYGULA
          </button>
        </div>
      )}

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
          <h3
            style={{
              borderBottom: "2px solid #777",
              paddingBottom: "10px",
            }}
          >
            📅 Oynanacak Maçlar • {sortedUpcomingFixtures.length} Maç
          </h3>

          <ul
            className="teamList"
            style={{
              padding: 0,
              listStyle: "none",
            }}
          >
            {sortedUpcomingFixtures.map(({ match, index }) =>
              renderMatch(match, index)
            )}
          </ul>
        </section>
      )}
    </div>
  );
}