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

const mobileMenuItems = [
  { id: "home", icon: "🏠", label: "Ana Sayfa" },
  { id: "matchcenter", icon: "📺", label: "Maç" },
  { id: "fixture", icon: "📅", label: "Fikstür" },
  { id: "dailyschedule", icon: "📋", label: "Program" },
  { id: "standings", icon: "📊", label: "Puan" },
];

const menuItems = [
  { id: "home", icon: "🏠", label: "Ana Sayfa" },
  { id: "settings", icon: "⚙️", label: "Turnuva Ayarları" },
  { id: "format", icon: "🏆", label: "Turnuva Formatı" },
  { id: "teams", icon: "👥", label: "Takımlar" },
  { id: "teamcontacts", icon: "📲", label: "Takım Bilgileri" },
  { id: "draw", icon: "🎲", label: "Lig Kurası" },
  { id: "fixture", icon: "📅", label: "Lig Fikstürü" },
  { id: "dailyschedule", icon: "📋", label: "Günlük Program (WhatsApp)" },
  { id: "group-fixture", icon: "🗓️", label: "Grup Fikstürü" },
  { id: "group-standings", icon: "📊", label: "Grup Puan Durumu" },
  { id: "matchcenter", icon: "📺", label: "Maç Merkezi" },
  { id: "standings", icon: "📊", label: "Puan Durumu" },
  { id: "scorers", icon: "⚽", label: "Gol Krallığı" },
  { id: "knockout", icon: "🏆", label: "Eleme Turu" },
  { id: "announcements", icon: "📢", label: "Duyuru Merkezi" },
  { id: "discipline", icon: "🟨", label: "Disiplin Kurulu" },
  { id: "statistics", icon: "📈", label: "İstatistikler" },
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

export default function App() {
  const isPublicRoute = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pageParam = params.get("page");
      return pageParam === "takip" || pageParam === "public";
    } catch {
      return false;
    }
  }, []);

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

  const [tournamentFormat, setTournamentFormat] = useState(() =>
    readStorage("sscup-format", "league")
  );

  const [teams, setTeams] = useState([]);

  useEffect(() => {
    async function loadTeams() {
      const { data, error } = await supabase
        .from("teams")
        .select("name")
        .order("id");

      if (error) {
        console.error("Takım çekme hatası:", error);
        return;
      }

      if (data) {
        setTeams(data.map((team) => team.name));
      }
    }

    loadTeams();
  }, []);

  const [drawOrder, setDrawOrder] = useState(() =>
    readStorage("sscup-draw-order", [])
  );

  const [fixtures, setFixtures] = useState(() =>
    readStorage("sscup-fixtures", [])
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
    async function loadFixturesFromSupabase() {
      const { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("id");

      if (error) {
        console.error("Fikstür yükleme hatası:", error);
        return;
      }

      if (data) {
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
          isKnockout: item.is_knockout === true,
          knockoutKey: item.knockout_key || "",
          stageLabel: item.stage || "",
          events: Array.isArray(item.events) ? item.events : [],
        }));

        const localFixtures = readStorage("sscup-fixtures", []);

        const mergedLeagueFixtures = supabaseFixtures.map((match) => {
          const localMatch = localFixtures.find(
            (item) => String(item.id) === String(match.id)
          );

          if (!localMatch) return match;

          return {
            ...match,
            ...localMatch,
            played: localMatch.played === true ? true : match.played,
          };
        });

        const localKnockoutFixtures = localFixtures.filter(
          (match) => match?.isKnockout === true
        );
        const mergedFixtures = [
          ...mergedLeagueFixtures.filter((match) => match?.isKnockout !== true),
          ...localKnockoutFixtures,
        ];

        setFixtures(mergedFixtures);
        localStorage.setItem("sscup-fixtures", JSON.stringify(mergedFixtures));
      }
    }

    loadFixturesFromSupabase();
  }, []);

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

  const activeMenuItem = menuItems.find((item) => item.id === activePage);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand brand-pro">
          <div className="brand-logo">🏆</div>
          <div className="brand-copy">
            <span className="brand-product">S&S CUP MANAGER PRO</span>
            <h1>{settings.tournamentName}</h1>
            <p>{settings.slogan || "Kazanan Sahada Belli Olur"}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
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