import { LoadData } from "./data.js";
import { player_state } from "./game_state.js";
import { render_all } from "./renderer.js";

async function start(){
    await LoadData();
    player_state.load_local_storage();
    render_all();
}



start();