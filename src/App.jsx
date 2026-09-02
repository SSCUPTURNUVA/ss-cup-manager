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

function appPhaseRank(phase) {
  const ranks = { waiting: 0, first_half: 1, halftime: 2, second_half: 3, penalty: 4, completed: 5 };
  return ranks[phase || "waiting"] ?? 0;
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

  const [goalScorers, setGoalScorers] = useState(() =>
    readStorage("sscup-goals", [])
  );

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
    // Halka açık Canlı Takip TAMAMEN salt-okunurdur.
    // Public sayfa aynı origin/localStorage içinde eski bir pending kayıt görse bile
    // Supabase'e ASLA maç yazmaz. Bulut yazma/temizleme yalnız yönetimde yapılır.
    if (isPublicRoute) return undefined;

    async function loadFixturesFromSupabase() {
      // ÖNCE cihazda bekleyen son maç işlemini buluta göndermeyi dene.
      // Böylece Ctrl+C / tarayıcı kapanması sonrası eski bulut verisi, daha yeni
      // yerel canlı/bitmiş maç kaydını açılışta ezemez.
      await flushPendingFixtureSync();

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

          if (activeIds.length > 0) {
            const activeIdSet = new Set(activeIds);
            data = data.filter((row) => activeIdSet.has(String(row?.id)));
          }
        }

        // fixtures yazısı gecikse bile maçın son runtime durumunu ayrı bulut aynasından geri yükle.
        const { data: runtimeRow, error: runtimeError } = await supabase.from("app_state").select("value").eq("id", "fixture_runtime").maybeSingle();
        if (!runtimeError && runtimeRow?.value && typeof runtimeRow.value === "object" && !Array.isArray(runtimeRow.value)) {
          const runtimeMap = runtimeRow.value;
          data = data.map((row) => {
            const runtime = runtimeMap[String(row?.id)];
            if (!runtime || String(runtime?.id ?? "") !== String(row?.id ?? "")) return row;
            const rowPhase = row?.match_phase || (row?.played === true ? "completed" : "waiting");
            const runtimePhase = runtime?.matchPhase || "waiting";
            const rowEvents = Array.isArray(row?.events) ? row.events : [];
            const runtimeEvents = Array.isArray(runtime?.events) ? runtime.events : [];
            if (appPhaseRank(runtimePhase) < appPhaseRank(rowPhase)) return row;
            if (appPhaseRank(runtimePhase) === appPhaseRank(rowPhase) && rowEvents.length > runtimeEvents.length) return row;
            const completed = row?.played === true || rowPhase === "completed" || runtime?.played === true || runtimePhase === "completed";
            return { ...row, home_score: Number(runtime.homeScore ?? row.home_score ?? 0), away_score: Number(runtime.awayScore ?? row.away_score ?? 0), played: completed, live: !completed && runtime.live === true, timer_running: !completed && runtime.timerRunning === true, timer_started_at: completed ? null : (runtime.timerStartedAt ?? null), elapsed_seconds: Number(runtime.elapsedSeconds ?? row.elapsed_seconds ?? 0), match_phase: completed ? "completed" : runtimePhase, events: runtimeEvents.length >= rowEvents.length ? runtimeEvents : rowEvents };
          });
        }

        // İnternet kesildiği anda kapanmışsa flush başarısız olabilir. Bu durumda
        // kuyruktaki veri, aynı fixture ID'si için buluttan DAHA YENİ olan gerçek
        // saha kaydıdır. Yalnız pending kuyruğunu uygularız; genel localStorage
        // skorlarını asla merge etmeyiz (eski test skorlarının geri dönmesini engeller).
        const pendingFixtureSync = readPendingFixtureSync();
        if (pendingFixtureSync && Object.keys(pendingFixtureSync).length > 0) {
          data = data.map((row) => {
            const pending = pendingFixtureSync[String(row?.id)];
            const payload = pending?.payload;
            if (!payload) return row;
            return {
              ...row,
              home_score: payload.home_score ?? row.home_score ?? 0,
              away_score: payload.away_score ?? row.away_score ?? 0,
              played: payload.played === true,
              live: payload.live === true,
              timer_running: payload.timer_running === true,
              timer_started_at: payload.timer_started_at ?? null,
              elapsed_seconds: Number(payload.elapsed_seconds ?? 0),
              match_phase: payload.match_phase || "waiting",
              events: Array.isArray(payload.events) ? payload.events : [],
            };
          });
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

        // Eski sürümden bulutta CANLI kalmış hazırlık/test maçlarını temizle.
        // waiting/null zaten canlı değildir. Ayrıca tarihi henüz gelmemiş bir maçın
        // first_half vb. durumda kalması da eski test kaydıdır; gerçek maç olamaz.
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const staleWaitingRows = (Array.isArray(data) ? data : []).filter((item) => {
          const phase = item?.match_phase || "waiting";
          if (item?.played === true || phase !== "waiting") return false;
          const events = Array.isArray(item?.events) ? item.events : [];
          return (
            Number(item?.home_score || 0) !== 0 ||
            Number(item?.away_score || 0) !== 0 ||
            item?.live === true ||
            item?.timer_running === true ||
            item?.timer_started_at != null ||
            Number(item?.elapsed_seconds || 0) !== 0 ||
            events.length > 0
          );
        });

        if (staleWaitingRows.length > 0) {
          await Promise.all(
            staleWaitingRows.map((item) =>
              supabase
                .from("fixtures")
                .update({
                  home_score: 0,
                  away_score: 0,
                  played: false,
                  live: false,
                  timer_running: false,
                  timer_started_at: null,
                  elapsed_seconds: 0,
                  match_phase: "waiting",
                  events: [],
                })
                .eq("id", item.id)
            )
          );

          data = data.map((item) =>
            staleWaitingRows.some((stale) => stale.id === item.id)
              ? {
                  ...item,
                  home_score: 0,
                  away_score: 0,
                  played: false,
                  live: false,
                  timer_running: false,
                  timer_started_at: null,
                  elapsed_seconds: 0,
                  match_phase: "waiting",
                  events: [],
                }
              : item
          );
        }

        const supabaseFixtures = data.map((item) => ({
          id: item.id,
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
          matchPhase: item.match_phase || "waiting",
          isKnockout: item.is_knockout === true,
          knockoutKey: item.knockout_key || "",
          stageLabel: item.stage || "",
          events: Array.isArray(item.events) ? item.events : [],
        }));

        // Supabase lig fikstürü tek doğru kaynaktır. Eski localStorage skor/
        // oynandı bilgisi yeni turnuvaya taşınmasın. Eleme tarafı kendi
        // app_state kaydından yönetildiği için burada yerel eleme de eklenmez.
        const sortedSupabaseFixtures = sortFixturesBySchedule(supabaseFixtures);

        // Maç Merkezi'ne alınmış ama BAŞLATILMADAN geri çekilmiş eski seçimi tamamen unut.
        // Gerçekten devam eden bir maç varsa anahtarı koruruz; yoksa Maç Merkezi her açılışta
        // fikstürün tarih+saat sırasındaki ilk oynanmamış maçından başlar.
        const actuallyRunningMatch = sortedSupabaseFixtures.find((match) => {
          const phase = match?.matchPhase || "waiting";
          return (
            match?.played !== true &&
            match?.live === true &&
            ["first_half", "halftime", "second_half", "penalty"].includes(phase)
          );
        });

        if (!actuallyRunningMatch) {
          localStorage.removeItem("sscup-match-center-active");
        } else {
          localStorage.setItem("sscup-match-center-active", String(actuallyRunningMatch.id));
        }

        setFixtures(sortedSupabaseFixtures);
        localStorage.setItem("sscup-fixtures", JSON.stringify(sortedSupabaseFixtures));
      }
    }

    loadFixturesFromSupabase();
    return undefined;
  }, [isPublicRoute]);

  // İlk fixture yüklemesi tamamlandıktan sonra bekleyen yazıları düzenli tekrar dene.
  // Açılışta cloud-load ile yarışmaması için bu ayrı döngü gecikmeli başlar.
  useEffect(() => {
    // İzleyici cihazı hiçbir koşulda pending maç yazısı göndermez.
    if (isPublicRoute) return undefined;
    const flush = () => { flushPendingFixtureSync(); };
    const first = window.setTimeout(flush, 2500);
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, 10000);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, [isPublicRoute]);

  useEffect(() => {
    const refreshGoalScorers = () => {
      setGoalScorers(readStorage("sscup-goals", []));
    };

    window.addEventListener("storage", refreshGoalScorers);
    const interval = window.setInterval(refreshGoalScorers, 1000);

    return () => {
      window.removeEventListener("storage", refreshGoalScorers);
      window.clearInterval(interval);
    };
  }, []);

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