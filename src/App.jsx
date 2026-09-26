import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. SUPABASE ISTEMCISI
// ==========================================
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'example-key';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// 2. YARDIMCI FONKSIYONLAR
// ==========================================

// Forma No + Oyuncu Adı Formatlayıcı
export const formatPlayerName = (player) => {
  if (!player) return 'Bilinmiyor';
  const number = player.number || player.jerseyNumber || player.formaNo || player.no;
  return number ? `#${number} ${player.name}` : player.name;
};

// ==========================================
// 3. ELEME TURU MANUEL KURA BİLEŞENİ
// ==========================================
function ManualKnockoutDraw({ teams = [], onSaveMatches }) {
  const [matches, setMatches] = useState([]);
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');

  const availableTeams = useMemo(() => {
    const assignedIds = new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]));
    return teams.filter((t) => !assignedIds.has(t.id));
  }, [teams, matches]);

  const handleAddMatch = () => {
    if (!teamAId || !teamBId) {
      alert('Lütfen iki takım da seçin.');
      return;
    }
    if (teamAId === teamBId) {
      alert('Aynı takımı birbiriyle eşleştiremezsiniz!');
      return;
    }

    const tA = teams.find((t) => t.id === teamAId);
    const tB = teams.find((t) => t.id === teamBId);

    setMatches((prev) => [
      ...prev,
      { id: 'match-' + Date.now(), teamA: tA, teamB: tB, teamAId, teamBId }
    ]);
    setTeamAId('');
    setTeamBId('');
  };

  const handleRemoveMatch = (id) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Manuel Eleme Turu Kurası</h3>
      <div style={styles.flexRow}>
        <select
          value={teamAId}
          onChange={(e) => setTeamAId(e.target.value)}
          style={styles.select}
        >
          <option value="">1. Takımı Seçin</option>
          {availableTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <span style={{ fontWeight: 'bold', color: '#ff4d4d' }}>VS</span>

        <select
          value={teamBId}
          onChange={(e) => setTeamBId(e.target.value)}
          style={styles.select}
        >
          <option value="">2. Takımı Seçin</option>
          {availableTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button onClick={handleAddMatch} style={styles.btnPrimary}>
          Eşleştir
        </button>
      </div>

      <div style={{ marginTop: '15px' }}>
        <h4>Eşleşme Listesi ({matches.length})</h4>
        {matches.length === 0 && <p style={{ color: '#888' }}>Henüz eşleşme eklenmedi.</p>}
        {matches.map((m, idx) => (
          <div key={m.id} style={styles.matchItem}>
            <span>
              <strong>Maç {idx + 1}:</strong> {m.teamA.name} - {m.teamB.name}
            </span>
            <button onClick={() => handleRemoveMatch(m.id)} style={styles.btnDanger}>
              Sil
            </button>
          </div>
        ))}
      </div>

      {matches.length > 0 && (
        <button
          onClick={() => onSaveMatches(matches)}
          style={{ ...styles.btnSuccess, width: '100%', marginTop: '15px' }}
        >
          Eleme Turunu Kaydet ve Başlat
        </button>
      )}
    </div>
  );
}

// ==========================================
// 4. ARKA PLANDA DEVAM EDEN ZAMAN SAYAÇLI MAÇ MERKEZİ
// ==========================================
function MatchCenter({ match, players = [], onBack, onUpdateMatchStatus }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  
  // ZAMAN YÖNETİMİ STATE'LERİ (Arka planda çalışması için)
  const [matchMinutes, setMatchMinutes] = useState(0);
  const [matchSeconds, setMatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Form State
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [eventType, setEventType] = useState('goal');
  const [manualMinute, setManualMinute] = useState('');

  // 1. Maç Yükleme ve Gerçek Zamanlı Süre Hesaplama (Telefon Kapansa Bile Çalışır)
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(() => {
      if (isMounted && match) {
        setEvents(match.events || []);
        
        // Eğer maç önceden başlatılmışsa kalan/geçen süreyi Gerçek Zamanlı Hesapla
        if (match.startTimestamp && match.isTimerRunning) {
          setIsTimerRunning(true);
        } else {
          setIsTimerRunning(false);
          setMatchMinutes(match.elapsedMinutes || 0);
          setMatchSeconds(match.elapsedSeconds || 0);
        }

        setLoading(false);
      }
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [match]);

  // 2. Kapanıp Açılsa Bile Doğru Süreyi Hesaplayan Döngü
  useEffect(() => {
    let interval = null;

    if (isTimerRunning && match?.startTimestamp) {
      interval = setInterval(() => {
        const now = Date.now();
        const start = match.startTimestamp;
        // Toplam geçen saniye = (Şu Anki Zaman - Başlangıç Zamanı) / 1000 + Önceden Duran Süre
        const totalElapsedSeconds = Math.floor((now - start) / 1000) + (match.savedSeconds || 0);

        const mins = Math.floor(totalElapsedSeconds / 60);
        const secs = totalElapsedSeconds % 60;

        setMatchMinutes(mins);
        setMatchSeconds(secs);
      }, 1000);
    } else {
      clearInterval(interval);
    }

    return () => clearInterval(interval);
  }, [isTimerRunning, match?.startTimestamp, match?.savedSeconds]);

  // Maçı Başlat / Duraklat
  const toggleTimer = () => {
    if (!isTimerRunning) {
      // Başlatılıyor: Başlama zamanını kaydet
      const now = Date.now();
      const updatedMatch = {
        ...match,
        startTimestamp: now,
        savedSeconds: matchMinutes * 60 + matchSeconds,
        isTimerRunning: true
      };
      setIsTimerRunning(true);
      onUpdateMatchStatus(updatedMatch);
    } else {
      // Durduruluyor
      const updatedMatch = {
        ...match,
        startTimestamp: null,
        savedSeconds: matchMinutes * 60 + matchSeconds,
        elapsedMinutes: matchMinutes,
        elapsedSeconds: matchSeconds,
        isTimerRunning: false
      };
      setIsTimerRunning(false);
      onUpdateMatchStatus(updatedMatch);
    }
  };

  const matchPlayers = useMemo(() => {
    if (!match) return [];
    return players.filter(
      (p) => p.teamId === match.teamAId || p.teamId === match.teamBId
    );
  }, [match, players]);

  // Olay Ekleme
  const handleAddEvent = (e) => {
    e.preventDefault();

    if (!selectedPlayerId) {
      alert('Lütfen bir oyuncu seçin!');
      return;
    }

    const playerObj = matchPlayers.find((p) => p.id === selectedPlayerId);
    const assistantObj = matchPlayers.find((p) => p.id === selectedAssistantId);

    // Otomatik o anki maç dakikasını kullan veya manuel yazılanı al
    const eventMinute = manualMinute || (matchMinutes + 1).toString();

    const newEvent = {
      id: 'event-' + Date.now(),
      matchId: match.id,
      player: playerObj,
      assistant: assistantObj || null,
      type: eventType,
      minute: eventMinute,
      createdAt: new Date().toISOString()
    };

    setEvents((prev) => [...prev, newEvent]);

    // Formu Sıfırla
    setSelectedPlayerId('');
    setSelectedAssistantId('');
    setManualMinute('');
    alert('Maç olayı kaydedildi!');
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h3>Maç Merkezi Yükleniyor...</h3>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <button onClick={onBack} style={{ ...styles.btnDanger, marginBottom: '10px' }}>
        ← Geri Dön
      </button>

      <h2>
        {match.teamA.name} VS {match.teamB.name}
      </h2>

      {/* MAÇ SÜRESİ VE BAŞLAT/DURDUR KONTROLÜ */}
      <div style={{ ...styles.card, backgroundColor: '#222', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', margin: '10px 0', color: '#00ffcc' }}>
          {String(matchMinutes).padStart(2, '0')}:{String(matchSeconds).padStart(2, '0')}
        </h1>
        <button
          onClick={toggleTimer}
          style={isTimerRunning ? styles.btnDanger : styles.btnSuccess}
        >
          {isTimerRunning ? 'Maçı Duraklat' : 'Maçı Başlat / Devam Et'}
        </button>
        <p style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>
          * Telefonda uygulamadan çıksanız bile süre arka planda akmaya devam eder.
        </p>
      </div>

      {/* OLAY EKLEME FORMU */}
      <form onSubmit={handleAddEvent} style={{ ...styles.card, backgroundColor: '#2a2a2a' }}>
        <h4>Yeni Maç Olayı Ekle</h4>
        <div style={styles.flexRow}>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            style={styles.select}
          >
            <option value="">Oyuncu Seçin *</option>
            {matchPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {formatPlayerName(p)} ({p.teamName || 'Takım'})
              </option>
            ))}
          </select>

          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            style={styles.select}
          >
            <option value="goal">⚽ Gol</option>
            <option value="yellow_card">🟨 Sarı Kart</option>
            <option value="red_card">🟥 Kırmızı Kart</option>
          </select>

          {eventType === 'goal' && (
            <select
              value={selectedAssistantId}
              onChange={(e) => setSelectedAssistantId(e.target.value)}
              style={styles.select}
            >
              <option value="">Asist (Opsiyonel)</option>
              {matchPlayers
                .filter((p) => p.id !== selectedPlayerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatPlayerName(p)}
                  </option>
                ))}
            </select>
          )}

          <input
            type="number"
            placeholder={`Dk (Varsayılan: ${matchMinutes + 1}')`}
            value={manualMinute}
            onChange={(e) => setManualMinute(e.target.value)}
            style={{ ...styles.select, width: '130px' }}
          />

          <button type="submit" style={styles.btnSuccess}>
            Ekle
          </button>
        </div>
      </form>

      {/* CANLI OLAY AKIŞI */}
      <div>
        <h4>Maç Olayları</h4>
        {events.length === 0 && <p style={{ color: '#888' }}>Henüz kaydedilmiş olay yok.</p>}
        {events.map((ev) => (
          <div key={ev.id} style={styles.eventRow}>
            <span><strong>{ev.minute}'</strong></span>
            <span>
              {ev.type === 'goal' && '⚽ GOL:'}
              {ev.type === 'yellow_card' && '🟨 Sarı Kart:'}
              {ev.type === 'red_card' && '🟥 Kırmızı Kart:'}
            </span>
            <span style={{ fontWeight: 'bold' }}>{formatPlayerName(ev.player)}</span>
            {ev.assistant && (
              <span style={{ color: '#aaa', fontSize: '12px' }}>
                (Asist: {formatPlayerName(ev.assistant)})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 5. ANA UYGULAMA (APP)
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('draw');
  const [selectedMatch, setSelectedMatch] = useState(null);

  const [teams] = useState([
    { id: 't1', name: 'Karadeniz FC' },
    { id: 't2', name: 'Anadolu Gücü' },
    { id: 't3', name: 'Boğaziçi SK' },
    { id: 't4', name: 'Ege Yıldızları' }
  ]);

  const [players] = useState([
    { id: 'p1', teamId: 't1', number: 10, name: 'Ahmet Yılmaz', teamName: 'Karadeniz FC' },
    { id: 'p2', teamId: 't1', number: 7, name: 'Mehmet Demir', teamName: 'Karadeniz FC' },
    { id: 'p3', teamId: 't2', number: 9, name: 'Caner Erkin', teamName: 'Anadolu Gücü' },
    { id: 'p4', teamId: 't2', number: 1, name: 'Volkan Babacan', teamName: 'Anadolu Gücü' }
  ]);

  const [knockoutMatches, setKnockoutMatches] = useState([]);

  const handleSaveMatches = (matches) => {
    setKnockoutMatches(matches);
    alert('Manuel Eleme Kurası Başarıyla Kaydedildi!');
  };

  const handleOpenMatchCenter = (match) => {
    setSelectedMatch(match);
    setActiveTab('match_center');
  };

  const handleUpdateMatchStatus = (updatedMatch) => {
    setSelectedMatch(updatedMatch);
    setKnockoutMatches((prev) =>
      prev.map((m) => (m.id === updatedMatch.id ? updatedMatch : m))
    );
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2>SS CUP V1 - Turnuva Yönetim Paneli</h2>
        <div style={styles.flexRow}>
          <button
            onClick={() => setActiveTab('draw')}
            style={activeTab === 'draw' ? styles.btnPrimary : styles.btnSecondary}
          >
            Kura & Fikstür
          </button>
        </div>
      </header>

      {activeTab === 'draw' && (
        <div>
          <ManualKnockoutDraw teams={teams} onSaveMatches={handleSaveMatches} />

          {knockoutMatches.length > 0 && (
            <div style={{ ...styles.card, marginTop: '20px' }}>
              <h3>Oluşturulan Eleme Maçları</h3>
              {knockoutMatches.map((m) => (
                <div key={m.id} style={styles.matchItem}>
                  <span>
                    {m.teamA.name} VS {m.teamB.name}
                  </span>
                  <button
                    onClick={() => handleOpenMatchCenter(m)}
                    style={styles.btnPrimary}
                  >
                    Maç Merkezine Git →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'match_center' && selectedMatch && (
        <MatchCenter
          match={selectedMatch}
          players={players}
          onBack={() => setActiveTab('draw')}
          onUpdateMatchStatus={handleUpdateMatchStatus}
        />
      )}
    </div>
  );
}

// ==========================================
// 6. DAHİLİ STİLLER
// ==========================================
const styles = {
  container: {
    backgroundColor: '#121212',
    color: '#ffffff',
    minHeight: '100vh',
    padding: '20px',
    fontFamily: 'sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid #333',
    paddingBottom: '10px'
  },
  card: {
    backgroundColor: '#1e1e1e',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '15px'
  },
  flexRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  select: {
    backgroundColor: '#333',
    color: '#fff',
    border: '1px solid #444',
    padding: '8px 12px',
    borderRadius: '4px',
    outline: 'none'
  },
  btnPrimary: {
    backgroundColor: '#0066cc',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  btnSecondary: {
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  btnSuccess: {
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  btnDanger: {
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  matchItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '8px'
  },
  eventRow: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '8px',
    borderBottom: '1px solid #333'
  }
};