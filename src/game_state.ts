

class GameState {
    task_completions: Record<string,boolean>; // This stores which tasks are completed. Uses the task_id to index
    task_data: Record<string,any>;            // This stores the state machine the user created for each task. Uses the task_id to index
    task_results: Record<string, (boolean | undefined)[]>; // This stores the latest test results for each task.
    private readonly STORAGE_KEY = 'player_game_state';

    constructor(){
        this.task_completions = {};
        this.task_data = {};
        this.task_results = {};
        window.addEventListener('beforeunload', () => this.save_local_storage());
        window.addEventListener('pagehide', () => this.save_local_storage());
        window.addEventListener('blur', () => this.save_local_storage());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.save_local_storage();
        });
    }

    get_task_completion(id: string) : boolean{
        return this.task_completions[id];
    }

    set_task_completion(id: string, value: boolean) {
        this.task_completions[id] = value;
        this.save_local_storage();
    }

    get_task_data(id: string) : any{
        return this.task_data[id];
    }

    set_task_data(id: string, value: any) {
        this.task_data[id] = value;
        this.save_local_storage();
    }

    get_task_results(id: string): (boolean | undefined)[] | undefined {
        return this.task_results[id];
    }

    set_task_results(id: string, value: (boolean | undefined)[] | undefined) {
        if (value === undefined) {
            delete this.task_results[id];
        } else {
            this.task_results[id] = value;
        }
        this.save_local_storage();
    }

    save_local_storage() {
        const dataToSave = {
            task_completions: this.task_completions,
            task_data: this.task_data
            ,task_results: this.task_results
         };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
    }

    load_local_storage() {
        const savedData = localStorage.getItem(this.STORAGE_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (parsedData.task_completions) {
                this.task_completions = parsedData.task_completions;
            }
            if (parsedData.task_data) {
                this.task_data = parsedData.task_data;
            }
            if (parsedData.task_results) {
                this.task_results = parsedData.task_results;
            }
        }
    }
}

export const player_state = new GameState();