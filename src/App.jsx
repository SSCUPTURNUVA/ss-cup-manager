import { supabase } from "./supabase";
import PublicTournament from "./components/PublicTournament";
import DailySchedule from "./components/DailySchedule";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import MatchCenter from "./components/MatchCenter";
import TeamManager from "./components/TeamManager";
import SquadManager from "./components/SquadManager";
import DrawCeremony from "./components/DrawCeremony";
import DrawManager from "./components/DrawManager";
import Fixture from "./components/Fixture";
import Standings from "./components/Standings";
import Knockout from "./components/Knockout";
import GoalScorers from "./components/GoalScorers";
import TournamentFormat from "./components/TournamentFormat";
import GroupFixture from "./components/GroupFixture";
import GroupStandings from "./components/GroupStandings";
import TournamentSettings from "./components/TournamentSettings";
import HomeDashboard from "./components/HomeDashboard";
import AnnouncementCenter from "./components/AnnouncementCenter";
import Statistics from "./components/Statistics";
import TeamContacts from "./components/TeamContacts";
import DisciplineBoard from "./components/DisciplineBoard";
import BackupManager from "./components/BackupManager";
import { sortFixturesBySchedule } from "./utils/fixtureOrder";
import { flushPendingFixtureSync, readPendingFixtureSync } from "./utils/pendingFixtureSync";
import { flushPendingAppStateSync } from "./utils/pendingAppStateSync";

const mobileMenuItems = [
  { id: "home", icon: "🏠", label: "Ana Sayfa" },
  { id: "matchcenter", icon: "📺", label: "Maç" },
  { id: "fixture", icon: "📅", label: "Fikstür" },
  { id: "dailyschedule", icon: "📋", label: "Program" },
  { id: "standings", icon: "📊", label: "Puan" },
];

const menuItems = [
  { id: "home", icon: "🏠", label: "Ana Sayfa" },
  { id: "matchcenter", icon: "📺", label: "Maç Merkezi" },
  { id: "fixture", icon: "📅", label: "Lig Fikstürü", format: "league" },
  { id: "group-fixture", icon: "🗓️", label: "Grup Fikstürü", format: "groups" },
  { id: "standings", icon: "📊", label: "Puan Durumu", format: "league" },
  { id: "group-standings", icon: "📊", label: "Grup Puan Durumu", format: "groups" },
  { id: "knockout", icon: "🏆", label: "Eleme Turu" },
  { id: "teams", icon: "👥", label: "Takımlar" },
  { id: "teamcontacts", icon: "📲", label: "Takım Bilgileri" },
  { id: "draw", icon: "🎲", label: "Lig Kurası", format: "league" },
  { id: "dailyschedule", icon: "🖼️", label: "Gecenin Maçları Görseli" },
  { id: "scorers", icon: "⚽", label: "Gol Krallığı" },
  { id: "discipline", icon: "🟨", label: "Disiplin Kurulu" },
  { id: "announcements", icon: "📢", label: "Duyuru Merkezi" },
  { id: "statistics", icon: "📈", label: "İstatistikler" },
  { id: "format", icon: "🏆", label: "Turnuva Formatı" },
  { id: "settings", icon: "⚙️", label: "Turnuva Ayarları" },
  { id: "backup", icon: "💾", label: "Turnuvayı Yedekle" },
  { id: "public", icon: "🌐", label: "Canlı Durum" },
];

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function calculateStandings(teams, fixtures) {
  const table = {};

  teams.forEach((team) => {
    const teamName =
      typeof team === "string"
        ? team
        : team?.name || team?.teamName || "";

    if (teamName) {
      table[teamName] = {
        team: teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }
  });

  fixtures.forEach((match) => {
    if (match?.isKnockout === true) return;

    const home = match.home;
    const away = match.away;

    if (!home || !away) return;

    if (!table[home]) {
      table[home] = {
        team: home,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }

    if (!table[away]) {
      table[away] = {
        team: away,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }

    if (match.played !== true) return;

    const homeScore = Number(match.homeScore);
    const awayScore = Number(match.awayScore);

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore)
    ) {
      return;
    }

    table[home].played += 1;
    table[away].played += 1;

    table[home].goalsFor += homeScore;
    table[home].goalsAgainst += awayScore;
    table[away].goalsFor += awayScore;
    table[away].goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      table[home].won += 1;
      table[home].points += 3;
      table[away].lost += 1;
    } else if (awayScore > homeScore) {
      table[away].won += 1;
      table[away].points += 3;
      table[home].lost += 1;
    } else {
      table[home].drawn += 1;
      table[away].drawn += 1;
      table[home].points += 1;
      table[away].points += 1;
    }
  });

  return Object.values(table)
    .map((team) => ({
      ...team,
      goalDifference:
        team.goalsFor - team.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      if (
        b.goalDifference !== a.goalDifference
      ) {
        return (
          b.goalDifference - a.goalDifference
        );
      }

      if (b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }

      return a.team.localeCompare(b.team, "tr");
    });
}


const GOAL_EVENT_TYPES = new Set(["goal", "penalty_goal", "penalty_shootout_goal", "scorer_record"]);

function getFixtureEvents(match) {
  const events = Array.isArray(match?.events) ? match.events : [];
  const goals = Array.isArray(match?.goals) ? match.goals : [];
  const eventIds = new Set(events.map((event) => event?.id).filter(Boolean));
  const legacyGoals = goals
    .filter((goal) => !eventIds.has(goal?.id))
    .map((goal) => ({ ...goal, type: goal?.type || "goal" }));
  return [...events, ...legacyGoals];
}

function runtimeStrength(match) {
  if (!match) return -1;
  const events = getFixtureEvents(match);
  const phase = match?.matchPhase || match?.match_phase || "waiting";
  const homeScore = Number(match?.homeScore ?? match?.home_score ?? 0) || 0;
  const awayScore = Number(match?.awayScore ?? match?.away_score ?? 0) || 0;
  const elapsed = Number(match?.elapsedSeconds ?? match?.elapsed_seconds ?? 0) || 0;
  let score = events.length * 1000;
  if (match?.played === true || phase === "completed") score += 500;
  if (match?.live === true || ["first_half", "halftime", "second_half", "penalty"].includes(phase)) score += 200;
  score += Math.max(0, homeScore + awayScore) * 10;
  if (elapsed > 0) score += 1;
  return score;
}

function sameFixtureIdentity(a, b) {
  if (!a || !b) return false;
  if (a.id !== undefined && a.id !== null && b.id !== undefined && b.id !== null) {
    if (String(a.id) !== String(b.id)) return false;
  }
  return String(a.home || "") === String(b.home || "") && String(a.away || "") === String(b.away || "");
}

function mergeRuntimeSafely(cloudMatch, candidate) {
  if (!sameFixtureIdentity(cloudMatch, candidate)) return cloudMatch;
  if (runtimeStrength(candidate) <= runtimeStrength(cloudMatch)) return cloudMatch;
  return {
    ...cloudMatch,
    homeScore: Number(candidate.homeScore ?? candidate.home_score ?? cloudMatch.homeScore ?? 0),
    awayScore: Number(candidate.awayScore ?? candidate.away_score ?? cloudMatch.awayScore ?? 0),
    played: candidate.played === true || candidate.matchPhase === "completed" || candidate.match_phase === "completed",
    live: candidate.live === true,
    timerRunning: candidate.timerRunning === true || candidate.timer_running === true,
    timerStartedAt: candidate.timerStartedAt ?? candidate.timer_started_at ?? null,
    elapsedSeconds: Number(candidate.elapsedSeconds ?? candidate.elapsed_seconds ?? 0),
    matchPhase: candidate.matchPhase || candidate.match_phase || cloudMatch.matchPhase || "waiting",
    events: getFixtureEvents(candidate),
  };
}

function deriveGoalScorers(fixtures) {
  const totals = {};
  (fixtures || []).forEach((match) => {
    const phase = match?.matchPhase || "waiting";
    const counts = match?.played === true || (match?.live === true && ["first_half", "halftime", "second_half", "penalty"].includes(phase));
    if (!counts) return;
    getFixtureEvents(match)
      .filter((event) => GOAL_EVENT_TYPES.has(event?.type || "goal"))
      .forEach((event) => {
        const playerId = event?.playerId || event?.id || event?.playerName || event?.name || event?.player;
        const name = event?.playerName || event?.name || event?.player || "Oyuncu";
        const team = event?.team || event?.teamName || "";
        if (!playerId || !team) return;
        const key = `${team}-${playerId}`;
        if (!totals[key]) {
          totals[key] = {
            id: key,
            playerId,
            name,
            playerName: name,
            team,
            teamName: team,
            shirtNumber: event?.shirtNumber || event?.number || "",
            goals: 0,
          };
        }
        totals[key].goals += 1;
      });
  });
  return Object.values(totals).sort((a, b) => b.goals - a.goals || String(a.name).localeCompare(String(b.name), "tr"));
}

const MOBILE_ADMIN_ACCESS_TOKEN = "SSCUP-YONETIM-2026-7pQ4mN9xK2vR8sT5";
const ADMIN_PIN = "2026";

function AdminPinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (pin === ADMIN_PIN) {
      setError("");
      onUnlock();
      return;
    }
    setPin("");
    setError("PIN yanlış. Tekrar deneyin.");
  }

  return (
    <div className="admin-pin-page">
      <form className="admin-pin-card" onSubmit={submit}>
        <div className="admin-pin-logo"><span>S&amp;S</span><small>CUP</small></div>
        <span className="admin-pin-kicker">YÖNETİM GÜVENLİĞİ</span>
        <h1>4 Haneli PIN</h1>
        <p>Yönetim paneline girmek için PIN kodunu girin.</p>
        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          type="password"
          maxLength={4}
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
            setError("");
          }}
          placeholder="••••"
          aria-label="4 haneli yönetim PIN kodu"
        />
        {error && <div className="admin-pin-error">{error}</div>}
        <button type="submit" disabled={pin.length !== 4}>YÖNETİME GİR</button>
        <small>EXE ve telefon yönetimi korumalıdır • Canlı Takip halka açıktır</small>
      </form>
    </div>
  );
}

export default function App() {
  // Saha kenarında internet kısa süre kesilirse yerel maç kaydı kaybolmaz.
  // Bekleyen Supabase yazıları uygulama açık kaldığı sürece ve bağlantı geri geldiğinde tamamlanır.
  useEffect(() => {
    const flush = () => { flushPendingFixtureSync(); };
    flush();
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, 10000);
    return () => {
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, []);

  // MASAÜSTÜ EXE her zaman yönetim modudur.
  // Web/PWA varsayılan olarak salt-okunur canlı takiptir; yalnızca organizatörün
  // özel yönetim bağlantısı bu cihazı yönetici olarak yetkilendirir.
  const isDesktopManager = useMemo(() => {
    try {
      const ua = navigator?.userAgent || "";
      const isElectron = /Electron/i.test(ua);
      const isFileProtocol = window?.location?.protocol === "file:";
      return isElectron || isFileProtocol;
    } catch {
      return false;
    }
  }, []);

  const isMobileAdmin = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pageParam = params.get("page");
      const accessParam = params.get("access");
      const wantsAdmin = pageParam === "yonetim" || pageParam === "admin";

      // Mobil/web yonetim YALNIZCA mevcut URL'de dogru yeni anahtar varsa acilir.
      // localStorage ile kalici yetki YOK: paylasilan Canli Takip cihazlari asla
      // sonradan yonetime donemez.
      return wantsAdmin && accessParam === MOBILE_ADMIN_ACCESS_TOKEN;
    } catch {
      return false;
    }
  }, []);

  const isPublicRoute = useMemo(() => {
    try {
      // Masaustu EXE her zaman yonetimdir. Yeni ozel anahtarli mobil link de yonetimdir.
      if (isDesktopManager || isMobileAdmin) return false;

      // Bunlarin disindaki BUTUN web/PWA girisleri salt-okunur Canli Takiptir.
      return true;
    } catch {
      return !(isDesktopManager || isMobileAdmin);
    }
  }, [isDesktopManager, isMobileAdmin]);

  const [activePage, setActivePage] = useState(() => {
    if (isPublicRoute) return "public";
    return "home";
  });

  const [settings, setSettings] = useState(() =>
    readStorage("sscup-settings", {
      tournamentName: "S&S CUP",
      slogan: "Kazanan Sahada Belli Olur",
      season: "2026",
      organizer: "",
      mainSponsor: "",
      subSponsors: [],
      primaryColor: "#d4af37",
    })
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const [tournamentFormat, setTournamentFormat] = useState(() =>
    readStorage("sscup-format", "league")
  );

  const [teams, setTeams] = useState(() => readStorage("sscup-teams", []));

  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .order("id");

      if (error) {
        console.error("Takım çekme hatası:", error);
        return;
      }

      if (!cancelled && Array.isArray(data)) {
        const cloudTeams = data.map((team) => team.name).filter(Boolean);

        if (cloudTeams.length > 0) {
          setTeams(cloudTeams);
          localStorage.setItem("sscup-teams", JSON.stringify(cloudTeams));
          return;
        }

        // KORUMALI İLK EŞİTLEME:
        // Bulut boşsa PC'deki dolu takım listesini boş veriyle EZME.
        // Yerel kayıt varsa onu Supabase'e taşı ve telefonun da görmesini sağla.
        const localTeams = readStorage("sscup-teams", []);
        const localNames = Array.isArray(localTeams)
          ? localTeams
              .map((team) => typeof team === "string" ? team : team?.name || team?.teamName || "")
              .filter(Boolean)
          : [];

        if (localNames.length > 0) {
          const { error: seedError } = await supabase
            .from("teams")
            .insert(localNames.map((name) => ({ name })));

          if (seedError) {
            console.error("Yerel takımları buluta taşıma hatası:", seedError);
          } else {
            setTeams(localNames);
          }
        } else {
          setTeams([]);
        }
      }
    }

    // İlk açılışta çek.
    loadTeams();

    // Realtime herhangi bir cihazda takım ekleme/silme/düzenleme olduğunda
    // açık olan diğer cihazın listesini anında yeniler.
    const channel = supabase
      .channel(`sscup-app-teams-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams" },
        () => loadTeams()
      )
      .subscribe();

    // Realtime bağlantısı bir cihazda kaçarsa güvenli yedek.
    const poll = window.setInterval(loadTeams, 1500);

    // Telefon uygulamaya geri dönünce / PC penceresi odaklanınca da yenile.
    const onFocus = () => loadTeams();
    const onVisible = () => {
      if (document.visibilityState === "visible") loadTeams();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const [drawOrder, setDrawOrder] = useState(() =>
    readStorage("sscup-draw-order", [])
  );

  const [fixtures, setFixtures] = useState(() =>
    sortFixturesBySchedule(readStorage("sscup-fixtures", []))
  );

  const [goalScorers, setGoalScorers] = useState([]);

  useEffect(() => {
    localStorage.setItem("sscup-format", JSON.stringify(tournamentFormat));
  }, [tournamentFormat]);

  useEffect(() => {
    localStorage.setItem("sscup-teams", JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem("sscup-draw-order", JSON.stringify(drawOrder));
  }, [drawOrder]);

  useEffect(() => {
    localStorage.setItem("sscup-fixtures", JSON.stringify(fixtures));
  }, [fixtures]);

  useEffect(() => {
    async function loadFixturesFromSupabase() {
      // Açılışın EN BAŞINDA yerel sağlam kopyayı al. Bulut birkaç saniye gerideyse
      // başarısız kalan pending kayıtları eski bulut verisinin ezmesine izin vermeyeceğiz.
      const localBeforeCloud = readStorage("sscup-fixtures", []);

      // Önce saha kenarında yerelde bekleyen son işlemleri buluta gönder.
      await Promise.all([flushPendingFixtureSync(), flushPendingAppStateSync()]);

      let { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("id");

      if (error) {
        console.error("Fikstür yükleme hatası:", error);
        return;
      }

      if (data) {
        // SADECE GÜNCEL TURNUVA FİKSTÜRÜ:
        // DrawManager yeni fikstürü oluştururken gerçek maç ID'lerini app_state/active_fixture_ids'e yazar.
        // Supabase'de DELETE/RLS yüzünden kalmış eski test satırları yönetim ekranına karışmasın.
        const { data: activeFixtureRow, error: activeFixtureError } = await supabase
          .from("app_state")
          .select("value")
          .eq("id", "active_fixture_ids")
          .maybeSingle();

        if (activeFixtureError) {
          console.warn("Aktif fikstür ID'leri okunamadı; tüm satırlar kullanılacak:", activeFixtureError);
        } else {
          const activeIds = Array.isArray(activeFixtureRow?.value?.ids)
            ? activeFixtureRow.value.ids.map((id) => String(id))
            : [];

          // Otomatik runtime temizliği KALDIRILDI.
          // Uygulama açılışında hiçbir maç/skor/event verisi otomatik silinmez.

          if (activeIds.length > 0) {
            const activeIdSet = new Set(activeIds);
            data = data.filter((row) => activeIdSet.has(String(row?.id)));
          }
        }

        // Bulut boşsa yerel dolu fikstürü silmek yerine önce buluta taşı.
        if (Array.isArray(data) && data.length === 0) {
          const localFixtures = readStorage("sscup-fixtures", []);

          if (Array.isArray(localFixtures) && localFixtures.length > 0) {
            const rows = localFixtures
              .filter((match) => match?.home && match?.away && match?.isKnockout !== true)
              .map((match) => ({
                home: match.home,
                away: match.away,
                date: match.date || null,
                time: match.time || null,
                pitch: match.field || match.pitch || null,
                week: match.week ?? null,
                played: match.played === true,
                home_score: Number(match.homeScore ?? match.home_score ?? 0),
                away_score: Number(match.awayScore ?? match.away_score ?? 0),
                live: match.live === true && ["first_half", "halftime", "second_half", "penalty"].includes(match.matchPhase),
                timer_running: match.timerRunning === true,
                timer_started_at: match.timerStartedAt || null,
                elapsed_seconds: Number(match.elapsedSeconds ?? 0),
                match_phase: match.matchPhase || "waiting",
                events: Array.isArray(match.events) ? match.events : [],
              }));

            if (rows.length > 0) {
              const { data: seededRows, error: seedError } = await supabase
                .from("fixtures")
                .insert(rows)
                .select("*");

              if (seedError) {
                console.error("Yerel fikstürü buluta taşıma hatası:", seedError);
                // Bulut yazılamasa bile PC'deki sağlam yerel fikstürü koru.
                const sortedLocalFixtures = sortFixturesBySchedule(localFixtures);
                setFixtures(sortedLocalFixtures);
                localStorage.setItem("sscup-fixtures", JSON.stringify(sortedLocalFixtures));
                return;
              }

              data = Array.isArray(seededRows) ? seededRows : [];
            }
          }
        }

        // AÇILIŞTA OTOMATİK VERİ DEĞİŞİKLİĞİ YOK.
        // Skor, gol, kart, timer, maç durumu ve eventler bulutta nasılsa aynen okunur.

        const supabaseFixtures = data.map((item) => ({
          id: item.id,
          home: item.home,
          away: item.away,
          date: item.date,
          time: item.time,
          field: item.pitch,
          week: item.week,
          played: item.played === true,
          homeScore: Number(item.home_score ?? 0),
          awayScore: Number(item.away_score ?? 0),
          live: item.live === true,
          timerRunning: item.timer_running === true,
          timerStartedAt: item.timer_started_at ?? null,
          elapsedSeconds: Number(item.elapsed_seconds ?? 0),
          matchPhase: item.match_phase || "waiting",
          isKnockout: item.is_knockout === true,
          knockoutKey: item.knockout_key || "",
          stageLabel: item.stage || "",
          events: Array.isArray(item.events) ? item.events : [],
          cloudUpdatedAt: item.updated_at || "",
        }));

        // TEK KAYNAK + KORUMALI AÇILIŞ:
        // App.jsx bulutu okur; aynı güncel fikstür ID'sine ait yerel/snapshot kopya
        // daha doluysa gerçek saha verisini eski 0-0 bulut satırıyla ezmez.
        const { data: snapshotRow } = await supabase
          .from("app_state")
          .select("value")
          .eq("id", "fixtures_snapshot")
          .maybeSingle();
        const snapshotFixtures = Array.isArray(snapshotRow?.value?.fixtures)
          ? snapshotRow.value.fixtures
          : [];
        const snapshotById = new Map(snapshotFixtures.map((m) => [String(m?.id ?? ""), m]));
        const localById = new Map(
          (Array.isArray(localBeforeCloud) ? localBeforeCloud : [])
            .filter((m) => m?.id !== undefined && m?.id !== null)
            .map((m) => [String(m.id), m])
        );

        const recoveredFixtures = supabaseFixtures.map((cloudMatch) => {
          const key = String(cloudMatch?.id ?? "");
          let best = cloudMatch;
          best = mergeRuntimeSafely(best, snapshotById.get(key));
          best = mergeRuntimeSafely(best, localById.get(key));
          return best;
        });

        const sortedSupabaseFixtures = sortFixturesBySchedule(recoveredFixtures);

        // Eğer yerel/snapshot kopya buluttan daha dolu çıktıysa onu yeniden buluta yaz.
        // Bu işlem veri silmez; yalnız kurtarılan gerçek maç runtime'ını kalıcı hale getirir.
        recoveredFixtures.forEach((match, index) => {
          const cloudMatch = supabaseFixtures[index];
          if (runtimeStrength(match) > runtimeStrength(cloudMatch) && match?.isKnockout !== true) {
            syncLeagueFixtureWithRetry(match);
          }
        });

        // Maç Merkezi seçimi de aç/kapat sonrası korunur. Sadece artık var olmayan
        // veya bitmiş bir maça işaret ediyorsa temizlenir.
        const savedActiveKey = localStorage.getItem("sscup-match-center-active") || "";
        if (savedActiveKey) {
          const savedMatch = sortedSupabaseFixtures.find((m) => String(m?.id ?? "") === String(savedActiveKey));
          if (!savedMatch || savedMatch.played === true) localStorage.removeItem("sscup-match-center-active");
        }

        setFixtures(sortedSupabaseFixtures);
        localStorage.setItem("sscup-fixtures", JSON.stringify(sortedSupabaseFixtures));
      }
    }

    loadFixturesFromSupabase();
  }, [isPublicRoute]);

  // Uygulama hangi sayfada olursa olsun internet geri geldiğinde bekleyen
  // maç ve app_state kayıtlarını tamamla. Yönetim ekranının açık kalmasına bağlı değildir.
  useEffect(() => {
    const flushAll = () => {
      flushPendingFixtureSync();
      flushPendingAppStateSync();
    };
    window.addEventListener("online", flushAll);
    const retryTimer = window.setInterval(flushAll, 10000);
    return () => {
      window.removeEventListener("online", flushAll);
      window.clearInterval(retryTimer);
    };
  }, []);

  useEffect(() => {
    // Gol krallığı ayrı ve bağımsız bir "hayalet" kayıt değildir.
    // Her zaman maç eventlerinden yeniden hesaplanır; skor/event silinmeden bu liste de kaybolmaz.
    const derived = deriveGoalScorers(fixtures);
    setGoalScorers(derived);
    localStorage.setItem("sscup-goals", JSON.stringify(derived));
    localStorage.setItem("sscup-goal-scorers", JSON.stringify(derived));
  }, [fixtures]);

  useEffect(() => {
    const refreshSettings = () => {
      setSettings(
        readStorage("sscup-settings", {
          tournamentName: "S&S CUP",
          slogan: "Kazanan Sahada Belli Olur",
          season: "2026",
          organizer: "",
          mainSponsor: "",
          subSponsors: [],
          primaryColor: "#d4af37",
        })
      );
    };

    window.addEventListener("storage", refreshSettings);
    window.addEventListener("sscup-settings-updated", refreshSettings);

    return () => {
      window.removeEventListener("storage", refreshSettings);
      window.removeEventListener("sscup-settings-updated", refreshSettings);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--primary-color",
      settings.primaryColor || "#d4af37"
    );
  }, [settings.primaryColor]);

  const standings = useMemo(
    () => calculateStandings(teams, fixtures),
    [teams, fixtures]
  );

  function changePage(pageId) {
    setActivePage(pageId);
    setMobileMenuOpen(false);

    setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const mainContent = document.querySelector('.main-content');
      const contentArea = document.querySelector('.content-area');
      
      if (mainContent) mainContent.scrollTop = 0;
      if (contentArea) contentArea.scrollTop = 0;
    }, 50);
  }

  // 🔒 YALNIZCA SPORCULAR / CANLI TAKİP MODU
  if (isPublicRoute) {
    return (
      <PublicTournament
        teams={teams}
        fixtures={fixtures}
        standings={standings}
        goalScorers={goalScorers}
        settings={settings}
      />
    );
  }

  // Yönetim tarafı her uygulama/sayfa açılışında yeniden PIN ister.
  // Yetki localStorage'a yazılmaz; kapat-aç veya yenilemede kilit geri gelir.
  if (!adminUnlocked) {
    return <AdminPinGate onUnlock={() => setAdminUnlocked(true)} />;
  }

  function renderPage() {
    switch (activePage) {
      case "settings":
        return <TournamentSettings />;

      case "format":
        return (
          <TournamentFormat
            tournamentFormat={tournamentFormat}
            setTournamentFormat={setTournamentFormat}
            teams={teams}
          />
        );

      case "teams":
        return (
          <div className="page-stack">
            <TeamManager
              teams={teams}
              setTeams={setTeams}
              drawOrder={drawOrder}
              setDrawOrder={setDrawOrder}
              fixtures={fixtures}
              setFixtures={setFixtures}
            />
            <SquadManager teams={teams} />
          </div>
        );

      case "teamcontacts":
        return (
          <TeamContacts
            teams={teams}
            fixtures={fixtures}
            standings={standings}
            goalScorers={goalScorers}
            settings={settings}
          />
        );

      case "draw":
        return (
          <div className="page-stack">
            <DrawCeremony
              teams={teams}
              drawOrder={drawOrder}
              setDrawOrder={setDrawOrder}
            />
            <DrawManager
              teams={teams}
              drawOrder={drawOrder}
              setFixtures={setFixtures}
            />
          </div>
        );

      case "fixture":
        return <Fixture fixtures={fixtures} setFixtures={setFixtures} />;

      case "dailyschedule":
        return <DailySchedule fixtures={fixtures} settings={settings} />;

      case "group-fixture":
        return <GroupFixture />;

      case "group-standings":
        return <GroupStandings />;

      case "matchcenter":
        return (
          <MatchCenter
            fixtures={fixtures}
            standings={standings}
            goalScorers={goalScorers}
            setFixtures={setFixtures}
          />
        );

      case "standings":
        return <Standings teams={teams} fixtures={fixtures} />;

      case "scorers":
        return <GoalScorers />;

      case "knockout":
        return (
          <Knockout
            teams={teams}
            fixtures={fixtures}
            setFixtures={setFixtures}
            onOpenMatchCenter={() => changePage("matchcenter")}
          />
        );

      case "announcements":
        return (
          <AnnouncementCenter
            fixtures={fixtures}
            standings={standings}
            goalScorers={goalScorers}
            settings={settings}
          />
        );

      case "discipline":
        return <DisciplineBoard teams={teams} fixtures={fixtures} />;

      case "statistics":
        return <Statistics fixtures={fixtures} standings={standings} />;

      case "backup":
        return <BackupManager />;

      case "public":
        return (
          <PublicTournament
            teams={teams}
            fixtures={fixtures}
            standings={standings}
            goalScorers={goalScorers}
            settings={settings}
          />
        );

      case "home":
      default:
        return (
          <HomeDashboard
            teams={teams}
            fixtures={fixtures}
            standings={standings}
            goalScorers={goalScorers}
            setTeams={setTeams}
            setFixtures={setFixtures}
            setDrawOrder={setDrawOrder}
            setGoalScorers={setGoalScorers}
            setSettings={setSettings}
            settings={settings}
            onNavigate={changePage}
          />
        );
    }
  }

  const visibleMenuItems = menuItems.filter((item) => !item.format || item.format === tournamentFormat);
  const activeMenuItem = menuItems.find((item) => item.id === activePage);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand brand-pro">
          <div className="brand-logo ss-logo-mark" aria-label="S&S CUP logosu"><span>S&S</span><small>CUP</small></div>
          <div className="brand-copy">
            <span className="brand-product">S&S CUP MANAGER PRO</span>
            <h1>{settings.tournamentName}</h1>
            <p>{settings.slogan || "Kazanan Sahada Belli Olur"}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => changePage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer sidebar-footer-pro">
          <span>🏆</span>
          <div>
            <strong>S&S CUP MANAGER PRO</strong>
            <small>Profesyonel Turnuva Yönetim Sistemi • {settings.season}</small>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Menüyü kapat"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMobileMenuOpen((current) => !current)}
            aria-label="Menüyü aç"
          >
            ☰
          </button>

          <div>
            <span className="topbar-label">S&S CUP MANAGER PRO</span>
            <h2>
              {activeMenuItem?.icon} {activeMenuItem?.label}
            </h2>
          </div>

          <div className="topbar-badge">{teams.length} Takım</div>
        </header>

        <div className="content-area">{renderPage()}</div>

        <nav
          className="mobile-bottom-nav"
          aria-label="Hızlı menü"
          style={{
            position: "fixed",
            bottom: "0px",
            left: "0px",
            right: "0px",
            top: "auto",
            transform: "none",
            zIndex: 999999,
            backgroundColor: "#121212",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {mobileMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activePage === item.id ? "active" : ""}
              onClick={() => changePage(item.id)}
              aria-label={item.label}
            >
              <span>{item.icon}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}