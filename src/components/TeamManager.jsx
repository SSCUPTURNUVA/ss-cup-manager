import { useMemo, useState } from "react";
import { supabase } from "../supabase";

export default function TeamManager({
  teams,
  setTeams,
  drawOrder,
  setDrawOrder,
  setFixtures,
}) {
  const [teamName, setTeamName] = useState("");

  const drawCompleted = useMemo(() => {
    return (
      teams.length > 0 &&
      drawOrder.length === teams.length &&
      teams.every((team) => drawOrder.includes(team))
    );
  }, [teams, drawOrder]);


  async function clearCompetitionData() {
    try {
      await supabase.from("fixtures").delete().neq("id", 0);
      await supabase.from("goal_scorers").delete().neq("id", 0);
      await supabase.from("teams").delete().neq("id", 0);
    } catch (error) {
      console.error(
        "Turnuva temizleme hatası:",
        error
      );
    }

    setTeams([]);
    setFixtures([]);
    setDrawOrder([]);

    localStorage.removeItem("sscup-teams");
    localStorage.removeItem("sscup-fixtures");
    localStorage.removeItem("sscup-draw-order");
    localStorage.removeItem("sscup-scores");
    localStorage.removeItem("sscup-goals");

  }


  async function addTeam() {

    if (drawCompleted) {
      alert(
        "Kura tamamlandıktan sonra takım eklenemez."
      );
      return;
    }


    const name = teamName.trim();

    if (!name) {
      alert("Takım adı giriniz.");
      return;
    }


    const duplicate = teams.some(
      (team)=>
        team.toLocaleLowerCase("tr-TR") ===
        name.toLocaleLowerCase("tr-TR")
    );


    if (duplicate) {
      alert("Bu takım zaten var.");
      return;
    }


    if (teams.length >= 30) {
      alert("En fazla 30 takım olabilir.");
      return;
    }


    const { error } = await supabase
      .from("teams")
      .insert([
        {
          name:name
        }
      ]);


    if(error){
      console.error(
        "Takım ekleme hatası:",
        error
      );
      alert("Takım eklenemedi.");
      return;
    }


    setTeams([
      ...teams,
      name
    ]);

    setTeamName("");
  }



  async function deleteTeam(index){

    const team = teams[index];

    if(!team) return;


    const ok = window.confirm(
      `${team} silinsin mi?`
    );


    if(!ok) return;


    await supabase
      .from("teams")
      .delete()
      .eq("name",team);


    setTeams(
      teams.filter(
        (_,i)=>i!==index
      )
    );


    setFixtures([]);
    setDrawOrder([]);

    localStorage.removeItem(
      "sscup-fixtures"
    );

    localStorage.removeItem(
      "sscup-draw-order"
    );

  }


  function handleKeyDown(e){
    if(e.key==="Enter"){
      addTeam();
    }
  }



  return (
    <div className="card">

      <h2>
        👥 Takımlar ({teams.length}/30)
      </h2>


      <div className="addRow">

        <input
          placeholder="Takım adı"
          value={teamName}
          disabled={drawCompleted}
          onChange={
            e=>setTeamName(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />


        <button
          onClick={addTeam}
          disabled={drawCompleted}
        >
          Takım Ekle
        </button>

      </div>


      {
        teams.length===0 ? (
          <p>
            Henüz takım yok.
          </p>
        )
        :
        (
          <ul className="teamList">

          {
            teams.map(
              (team,index)=>(
                <li key={team}>

                  <span>
                    <b>{index+1}.</b> {team}
                  </span>


                  <button
                    className="deleteBtn"
                    disabled={drawCompleted}
                    onClick={()=>
                      deleteTeam(index)
                    }
                  >
                    Sil
                  </button>

                </li>
              )
            )
          }

          </ul>
        )
      }


    </div>
  );
}