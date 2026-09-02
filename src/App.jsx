import { supabase } from "./supabase";
import PublicTournament from "./components/PublicTournament";
import DailySchedule from "./components/DailySchedule";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { flushPendingFixtureSync, syncLeagueFixtureWithRetry } from "./utils/pendingFixtureSync";
import { flushPendingAppStateSync, queueAppStateSync, readPendingAppStateSync, syncAppStateWithRetry } from "./utils/pendingAppStateSync";

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
  // Açılış senkronizasyonu tamamlanmadan hiçbir eski bekleyen kayıt buluta gönderilmez.
  // Bu bayrak, eski localStorage/pending verisinin gerçek turnuvaya geri yazılmasını engeller.
  const [fixtureBootstrapReady, setFixtureBootstrapReady] = useState(false);

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
  const sharedStateReadyRef = useRef(false);
  const applyingSharedCloudRef = useRef(false);

  const FIXTURE_CACHE_KEY = "sscup-fixtures-v3";
  // Public cihaz eski localStorage maçlarını bir an bile göstermesin.
  // Canlı takip verisini yalnız buluttan alır; yerel cache sadece yönetim içindir.
  const [fixtures, setFixtures] = useState(() =>
    isPublicRoute ? [] : sortFixturesBySchedule(readStorage(FIXTURE_CACHE_KEY, []))
  );

  const [goalScorers, setGoalScorers] = useState([]);

  useEffect(() => {
    localStorage.setItem("sscup-format", JSON.stringify(tournamentFormat));
    if (!isPublicRoute && sharedStateReadyRef.current && !applyingSharedCloudRef.current) {
      syncAppStateWithRetry("tournament_format", tournamentFormat);
    }
  }, [tournamentFormat, isPublicRoute]);

  useEffect(() => {
    localStorage.setItem("sscup-teams", JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem("sscup-draw-order", JSON.stringify(drawOrder));
    if (!isPublicRoute && sharedStateReadyRef.current && !applyingSharedCloudRef.current) {
      syncAppStateWithRetry("draw_order", drawOrder);
    }
  }, [drawOrder, isPublicRoute]);

  useEffect(() => {
    localStorage.setItem(FIXTURE_CACHE_KEY, JSON.stringify(fixtures));
  }, [fixtures]);

  // ORTAK YÖNETİM DURUMU: ayar/format/kura gibi maç dışı müdahaleler de
  // telefon <-> EXE arasında aynı bulut kaynağından canlı eşitlenir.
  useEffect(() => {
    if (isPublicRoute) return undefined;
    let cancelled = false;
    let inFlight = false;

    const applyRows = (rows = []) => {
      if (cancelled) return;
      applyingSharedCloudRef.current = true;
      for (const row of rows) {
        if (row?.id === "settings" && row.value && typeof row.value === "object" && !Array.isArray(row.value)) {
          setSettings((current) => ({ ...current, ...row.value }));
          localStorage.setItem("sscup-settings", JSON.stringify(row.value));
          window.dispatchEvent(new CustomEvent("sscup-settings-updated", { detail: row.value }));
        } else if (row?.id === "tournament_format" && typeof row.value === "string") {
          setTournamentFormat(row.value);
          localStorage.setItem("sscup-format", JSON.stringify(row.value));
        } else if (row?.id === "draw_order" && Array.isArray(row.value)) {
          setDrawOrder(row.value);
          localStorage.setItem("sscup-draw-order", JSON.stringify(row.value));
        }
      }
      window.setTimeout(() => {
        applyingSharedCloudRef.current = false;
        sharedStateReadyRef.current = true;
      }, 0);
    };

    const refreshShared = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const { data, error } = await supabase.from("app_state")
          .select("id,value,updated_at")
          .in("id", ["settings", "tournament_format", "draw_order"]);
        if (error) throw error;
        applyRows(data || []);
        const ids = new Set((data || []).map((row) => row.id));
        sharedStateReadyRef.current = true;
        // Bulutta henüz bu satırlar yoksa mevcut güvenli yerel değeri ilk kez taşı.
        if (!ids.has("tournament_format")) syncAppStateWithRetry("tournament_format", tournamentFormat);
        if (!ids.has("draw_order")) syncAppStateWithRetry("draw_order", drawOrder);
      } catch (error) {
        console.warn("Ortak yönetim verisi eşitleme beklemede:", error);
        sharedStateReadyRef.current = true;
      } finally {
        inFlight = false;
      }
    };

    refreshShared();
    const timer = window.setInterval(refreshShared, 1500);
    const channel = supabase.channel(`shared-admin-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state" }, (payload) => {
        if (["settings", "tournament_format", "draw_order"].includes(payload?.new?.id)) refreshShared();
      }).subscribe();
    const onFocus = () => refreshShared();
    const onVisible = () => { if (document.visibilityState === "visible") refreshShared(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible); supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicRoute]);

  // MERKEZİ KALICILIK KATMANI:
  // Uygulamanın hangi ekranı setFixtures çağırırsa çağırsın, daha ekran değişmeden
  // bütün maç durumu write-ahead kuyruğuna alınır. Böylece Tamamlanan Maçlar,
  // Maç Merkezi, Fikstür, Ana Sayfa veya başka bir yönetim ekranı ayrı ayrı
  // snapshot yazmayı unutsa bile veri çıkışta kaybolmaz.
  useLayoutEffect(() => {
    if (isPublicRoute || !fixtureBootstrapReady) return;
    queueAppStateSync("fixtures_snapshot", fixtures);
  }, [fixtures, fixtureBootstrapReady, isPublicRoute]);

  const lastCentralPersistRef = useRef("");
  const lastCorePersistRef = useRef(new Map());
  useEffect(() => {
    if (isPublicRoute || !fixtureBootstrapReady) return undefined;

    const signature = JSON.stringify(fixtures);
    if (signature === lastCentralPersistRef.current) return undefined;
    lastCentralPersistRef.current = signature;

    // Snapshot tüm event/kart/gol/değişiklik/timer/kadro-runtime bilgisinin
    // tek kalıcı kaynağıdır. İnternet kesilirse sync fonksiyonu kuyruğu korur.
    syncAppStateWithRetry("fixtures_snapshot", fixtures);

    // Skor/oynandı gibi fixtures tablosundaki çekirdek alanları da merkezi olarak
    // eşitle. İlk bulut yüklemesini geri yazma; sonrasında yalnız gerçekten değişen
    // maç satırını gönder.
    const nextCore = new Map();
    fixtures.forEach((match) => {
      if (!match || match.isKnockout === true || match.id == null) return;
      const key = String(match.id);
      const coreSignature = JSON.stringify({
        homeScore: Number(match.homeScore ?? 0),
        awayScore: Number(match.awayScore ?? 0),
        played: match.played === true,
      });
      nextCore.set(key, coreSignature);
      const previous = lastCorePersistRef.current.get(key);
      if (lastCorePersistRef.current.size > 0 && previous !== coreSignature) {
        syncLeagueFixtureWithRetry(match);
      }
    });
    lastCorePersistRef.current = nextCore;

    return undefined;
  }, [fixtures, fixtureBootstrapReady, isPublicRoute]);

  useEffect(() => {
    let cancelled = false;

    async function loadFixturesFromSupabase() {
      // FINAL SAHA SÜRÜMÜ: AÇILIŞTA HİÇBİR MAÇ VERİSİ SİLİNMEZ.
      // Önceki tek-seferlik test temizliği kaldırıldı; gerçek turnuva verisine
      // program açılışı/çıkışı asla dokunamaz.

      let { data, error } = await supabase.from("fixtures").select("*").order("id");
      if (error) {
        console.error("Fikstür yükleme hatası:", error);
        // İnternet yoksa yalnızca bu sürümün kendi güvenli cache'ini kullan. Eski key'lere dönme.
        if (!cancelled) setFixtures(sortFixturesBySchedule(readStorage(FIXTURE_CACHE_KEY, [])));
        return;
      }
      if (!data) return;

      const { data: activeFixtureRow, error: activeFixtureError } = await supabase
        .from("app_state").select("value").eq("id", "active_fixture_ids").maybeSingle();
      if (!activeFixtureError) {
        const activeIds = Array.isArray(activeFixtureRow?.value?.ids)
          ? activeFixtureRow.value.ids.map((id) => String(id)) : [];
        if (activeIds.length > 0) {
          const activeSet = new Set(activeIds);
          const filtered = data.filter((row) => activeSet.has(String(row?.id)));
          // Yanlış/stale active_fixture_ids tüm fikstürü saklamasın. Eşleşme varsa kullan.
          if (filtered.length > 0) data = filtered;
        }
      }

      let cloudFixtures = data.map((item) => ({
        id: item.id, home: item.home, away: item.away, date: item.date, time: item.time,
        field: item.pitch, week: item.week, played: item.played === true,
        homeScore: Number(item.home_score ?? 0), awayScore: Number(item.away_score ?? 0),
        live: false, timerRunning: false,
        timerStartedAt: null, elapsedSeconds: 0,
        matchPhase: item.played === true ? "completed" : "waiting", isKnockout: item.is_knockout === true,
        knockoutKey: item.knockout_key || "", stageLabel: item.stage || "",
        events: [], goals: [], cloudUpdatedAt: item.updated_at || "",
      }));
      const { data: snapshotRow, error: snapshotError } = await supabase
        .from("app_state").select("value,updated_at").eq("id", "fixtures_snapshot").maybeSingle();

      // Uygulama tam kayıt anında kapanmışsa write-ahead kuyruğundaki snapshot
      // buluttan daha yenidir. Açılışta bunu kullan; veri ekrandan da kaybolmasın.
      const pendingSnapshot = readPendingAppStateSync()?.fixtures_snapshot;
      const cloudSnapshotTime = Date.parse(snapshotRow?.updated_at || "") || 0;
      const pendingSnapshotTime = Date.parse(pendingSnapshot?.savedAt || "") || 0;
      const snapshotValue = pendingSnapshotTime > cloudSnapshotTime && Array.isArray(pendingSnapshot?.value)
        ? pendingSnapshot.value
        : (!snapshotError && Array.isArray(snapshotRow?.value) ? snapshotRow.value : []);
      const snapshotUpdatedAt = pendingSnapshotTime > cloudSnapshotTime
        ? pendingSnapshot?.savedAt
        : snapshotRow?.updated_at;

      if (Array.isArray(snapshotValue) && snapshotValue.length > 0) {
        const runtimeById = new Map(snapshotValue.map((m) => [String(m?.id), m]));
        cloudFixtures = cloudFixtures.map((base) => {
          const runtime = runtimeById.get(String(base.id));
          if (!runtime) return base;
          return {
            ...base,
            live: base.played !== true && runtime.live === true,
            timerRunning: base.played !== true && runtime.timerRunning === true,
            timerStartedAt: base.played !== true ? (runtime.timerStartedAt ?? null) : null,
            elapsedSeconds: Number(runtime.elapsedSeconds ?? 0),
            matchPhase: base.played === true ? "completed" : (runtime.matchPhase || "waiting"),
            events: Array.isArray(runtime.events) ? runtime.events : [],
            goals: Array.isArray(runtime.goals) ? runtime.goals : [],
            homePen: runtime.homePen ?? runtime.homePenalties ?? base.homePen ?? 0,
            awayPen: runtime.awayPen ?? runtime.awayPenalties ?? base.awayPen ?? 0,
            homePenalties: runtime.homePenalties ?? runtime.homePen ?? base.homePenalties ?? "",
            awayPenalties: runtime.awayPenalties ?? runtime.awayPen ?? base.awayPenalties ?? "",
            cloudUpdatedAt: snapshotUpdatedAt || base.cloudUpdatedAt || "",
          };
        });
      }
      const sorted = sortFixturesBySchedule(cloudFixtures);
      if (!cancelled) {
        setFixtures(sorted);
        localStorage.setItem(FIXTURE_CACHE_KEY, JSON.stringify(sorted));
      }
    }

    loadFixturesFromSupabase()
      .catch((error) => console.error("Fikstür açılış yükleme hatası:", error))
      .finally(() => { if (!cancelled) setFixtureBootstrapReady(true); });

    return () => { cancelled = true; };
  }, [isPublicRoute]);

  // Uygulama hangi sayfada olursa olsun internet geri geldiğinde bekleyen
  // maç ve app_state kayıtlarını tamamla. Yönetim ekranının açık kalmasına bağlı değildir.
  useEffect(() => {
    // KRİTİK: Canlı takip salt-okunurdur. Telefonda kalmış eski pending kuyruğu
    // hiçbir zaman turnuva verisini buluta geri yazamaz.
    if (isPublicRoute || !fixtureBootstrapReady) return undefined;
    const flushAll = () => {
      flushPendingFixtureSync();
      flushPendingAppStateSync();
    };
    flushAll();
    window.addEventListener("online", flushAll);
    const retryTimer = window.setInterval(flushAll, 10000);
    return () => {
      window.removeEventListener("online", flushAll);
      window.clearInterval(retryTimer);
    };
  }, [fixtureBootstrapReady, isPublicRoute]);

  // YÖNETİM CİHAZLARI ARASI CANLI EŞİTLEME:
  // Telefonda girilen gol/kart/değişiklik PC EXE'de; PC'de girilen de telefonda
  // ekran yenilemeden görünür. Yerelde buluta gitmeyi bekleyen daha yeni kayıt varsa
  // buluttaki eski snapshot onu ezemez.
  useEffect(() => {
    if (isPublicRoute || !fixtureBootstrapReady) return undefined;

    let disposed = false;
    let inFlight = false;
    let queued = false;

    const refreshManagementFixtures = async () => {
      if (disposed) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try {
        const [fixtureResult, snapshotResult] = await Promise.all([
          supabase.from("fixtures").select("*").order("id"),
          supabase.from("app_state").select("value,updated_at").eq("id", "fixtures_snapshot").maybeSingle(),
        ]);

        if (fixtureResult.error) throw fixtureResult.error;
        if (snapshotResult.error) throw snapshotResult.error;

        const pendingSnapshot = readPendingAppStateSync()?.fixtures_snapshot;
        const pendingTime = Date.parse(pendingSnapshot?.savedAt || "") || 0;
        const cloudTime = Date.parse(snapshotResult.data?.updated_at || "") || 0;
        // Bu cihazda henüz buluta çıkmamış daha yeni işlem varsa buluttaki eski veri
        // ekrandan SİLEMEZ. Refresh'i tamamen iptal etmek yerine aşağıda pending
        // snapshot maç bazında öncelikli kaynak olarak kullanılır.

        const rows = Array.isArray(fixtureResult.data) ? fixtureResult.data : [];
        const cloudSnapshot = Array.isArray(snapshotResult.data?.value) ? snapshotResult.data.value : [];
        const snapshot = pendingTime > cloudTime && Array.isArray(pendingSnapshot?.value)
          ? pendingSnapshot.value
          : cloudSnapshot;
        const rowById = new Map(rows.map((row) => [String(row?.id), row]));
        const snapById = new Map(snapshot.map((match) => [String(match?.id), match]));

        setFixtures((current) => {
          const base = current.length > 0 ? current : rows.map((item) => ({
            id: item.id, home: item.home, away: item.away, date: item.date, time: item.time,
            field: item.pitch, week: item.week, isKnockout: item.is_knockout === true,
            knockoutKey: item.knockout_key || "", stageLabel: item.stage || "",
          }));

          const merged = sortFixturesBySchedule(base.map((match) => {
            const row = rowById.get(String(match?.id));
            const runtime = snapById.get(String(match?.id));
            if (!row && !runtime) return match;
            const played = row ? row.played === true : match.played === true;
            return {
              ...match,
              ...(runtime || {}),
              ...(row ? {
                home: row.home ?? match.home,
                away: row.away ?? match.away,
                date: row.date ?? match.date,
                time: row.time ?? match.time,
                field: row.pitch ?? match.field,
                week: row.week ?? match.week,
                homeScore: Number(row.home_score ?? runtime?.homeScore ?? match.homeScore ?? 0),
                awayScore: Number(row.away_score ?? runtime?.awayScore ?? match.awayScore ?? 0),
                played,
              } : {}),
              live: played ? false : runtime?.live === true,
              timerRunning: played ? false : runtime?.timerRunning === true,
              timerStartedAt: played ? null : (runtime?.timerStartedAt ?? null),
              matchPhase: played ? "completed" : (runtime?.matchPhase || match.matchPhase || "waiting"),
              events: Array.isArray(runtime?.events) ? runtime.events : (Array.isArray(match.events) ? match.events : []),
              goals: Array.isArray(runtime?.goals) ? runtime.goals : (Array.isArray(match.goals) ? match.goals : []),
              runtimeUpdatedAt: runtime?.runtimeUpdatedAt || match.runtimeUpdatedAt || "",
              cloudUpdatedAt: snapshotResult.data?.updated_at || match.cloudUpdatedAt || "",
            };
          }));

          if (JSON.stringify(merged) === JSON.stringify(current)) return current;
          localStorage.setItem(FIXTURE_CACHE_KEY, JSON.stringify(merged));
          return merged;
        });
      } catch (error) {
        console.warn("Yönetim canlı eşitleme beklemede:", error);
      } finally {
        inFlight = false;
        if (queued && !disposed) { queued = false; window.setTimeout(refreshManagementFixtures, 0); }
      }
    };

    refreshManagementFixtures();
    const timer = window.setInterval(refreshManagementFixtures, 1200);
    const channel = supabase
      .channel(`management-fixtures-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixtures" }, refreshManagementFixtures)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: "id=eq.fixtures_snapshot" }, refreshManagementFixtures)
      .subscribe();

    const onFocus = () => refreshManagementFixtures();
    const onVisible = () => { if (document.visibilityState === "visible") refreshManagementFixtures(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [fixtureBootstrapReady, isPublicRoute]);

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
        return <GoalScorers goalScorers={goalScorers} />;

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