import { Data } from "./data.js";
import { DFAEngine } from "./engines/dfa.js";
import { player_state } from "./game_state.js";
import { clear_execution_visuals, create_dfa_engine, editor_node_name, initialize_editor, load_editor_solution, set_execution_input, set_execution_visuals } from "./editor.js";

let selected_task_id: string | undefined;
let test_results: (boolean | undefined)[] | undefined;
let test_errors: (string | undefined)[] | undefined;
let step_engine: DFAEngine | undefined;
let step_test_index = 0;
let last_handled_character = "";
let execution_error: string | undefined;

function get_tasks() {
    return Data.task_data["dfa"]?.groups.flatMap((group) => group.tasks) ?? [];
}

function get_selected_task() {
    return get_tasks().find((task) => task.task_id === selected_task_id);
}

function load_task_results(task_id: string): void {
    const saved_results = player_state.get_task_results(task_id);
    test_results = saved_results?.map((result) => result === null ? undefined : result);
    test_errors = undefined;
}

function save_task_results(): void {
    if (selected_task_id) player_state.set_task_results(selected_task_id, test_results);
}

function sync_task_completion(): void {
    const task = get_selected_task();
    if (!task || !test_results || test_results.length !== task.test_cases.length) return;
    const solved = task.test_cases.every((test_case, index) => {
        const result = test_results?.[index];
        return result !== undefined && result === (test_case.accept_type === "accept");
    });
    player_state.set_task_completion(task.task_id, solved);
    render_tasks();
}

function render_tasks(): void {
    const task_list = document.querySelector<HTMLElement>(".task-list");
    const groups = Data.task_data["dfa"]?.groups ?? [];
    const tasks = get_tasks();

    if (!task_list) {
        return;
    }

    if (!selected_task_id && tasks.length > 0) {
        selected_task_id = tasks[0].task_id;
    }

    task_list.replaceChildren();

    for (const group of groups) {
        const details = document.createElement("details");
        details.open = true;

        const summary = document.createElement("summary");
        summary.textContent = group.group_name;

        const progress = document.createElement("span");
        progress.className = "progress";
        const completed_count = group.tasks.filter((task) => player_state.get_task_completion(task.task_id)).length;
        progress.textContent = `${completed_count}/${group.tasks.length}`;
        summary.append(progress);

        const task_items = document.createElement("ul");
        for (const task of group.tasks) {
            const task_item = document.createElement("li");
            const task_name = document.createElement("span");
            task_name.textContent = task.task_name;
            task_item.append(task_name);
            if (player_state.get_task_completion(task.task_id)) {
                const checkmark = document.createElement("span");
                checkmark.className = "task-checkmark";
                checkmark.textContent = "✓";
                checkmark.title = "Solved";
                task_item.append(checkmark);
            }
            task_item.classList.toggle("active", task.task_id === selected_task_id);
            task_item.addEventListener("click", () => {
                selected_task_id = task.task_id;
                load_task_results(task.task_id);
                step_engine = undefined;
                clear_execution_visuals();
                render_tasks();
                render_test_cases();
                load_editor_solution(task.task_id);
            });
            task_items.append(task_item);
        }

        details.append(summary, task_items);
        task_list.append(details);
    }
}

function render_test_cases(): void {
    const selected_task = get_selected_task();
    const table = document.querySelector<HTMLTableElement>(".test-table");

    if (!selected_task || !table) {
        return;
    }

    const title = document.querySelector<HTMLElement>(".task-title");
    const description = document.querySelector<HTMLElement>(".task-description");
    if (title) {
        title.textContent = selected_task.task_name;
    }
    if (description) {
        description.textContent = selected_task.description;
    }

    const table_body = document.createElement("tbody");
    for (const test_case of selected_task.test_cases) {
        const row = document.createElement("tr");
        const expected_result = test_case.accept_type === "accept";
        const result_index = table_body.children.length;
        const actual_result = test_results?.[result_index];
        const actual_error = test_errors?.[result_index];
        row.className = expected_result ? "accept" : "deny";

        const input_cell = document.createElement("td");
        input_cell.textContent = test_case.input;

        const result_cell = document.createElement("td");
        result_cell.textContent = actual_error ? "Error" : actual_result === undefined ? "Not run" : actual_result ? "Accept" : "Deny";
        if (actual_result !== undefined) {
            result_cell.className = actual_result === expected_result ? "result-correct" : "result-incorrect";
        }

        const expected_cell = document.createElement("td");
        expected_cell.textContent = expected_result ? "Accept" : "Deny";

        row.append(input_cell, expected_cell, result_cell);
        table_body.append(row);
    }

    table.querySelector("tbody")?.remove();
    table.append(table_body);
}

function start_test_case(index: number): DFAEngine | undefined {
    const selected_task = get_selected_task();
    if (!selected_task?.test_cases[index]) return;
    const engine = create_dfa_engine(selected_task.test_cases[index].input);
    last_handled_character = "";
    set_execution_visuals(engine.current_node_id);
    update_execution_status(engine);
    return engine;
}

function update_execution_status(engine: DFAEngine): void {
    const remaining = engine.dfa.input;
    const next_character = remaining.at(0) ?? "done";
    const handled = last_handled_character || "none";
    set_execution_input(remaining, last_handled_character);
    const remaining_element = document.querySelector<HTMLElement>(".current-string");
    const next_element = document.querySelector<HTMLElement>(".next-character");
    const handled_element = document.querySelector<HTMLElement>(".handled-character");
    const node_element = document.querySelector<HTMLElement>(".current-node");
    if (remaining_element) remaining_element.textContent = remaining || "empty";
    if (next_element) next_element.textContent = next_character;
    if (handled_element) handled_element.textContent = handled;
    if (node_element) node_element.textContent = `${editor_node_name(engine.current_node_id)} (#${engine.current_node_id})`;
    const error_element = document.querySelector<HTMLElement>(".execution-error");
    if (error_element) error_element.textContent = execution_error ?? "";
}

function finish_step_case(): void {
    if (!step_engine || !test_results) return;
    test_results[step_test_index] = step_engine.is_accepting();
    save_task_results();
    sync_task_completion();
}

function step_test_case(): void {
    const selected_task = get_selected_task();
    if (!selected_task) return;
    execution_error = undefined;
    if (!test_results || test_results.length !== selected_task.test_cases.length) {
        test_results = new Array(selected_task.test_cases.length);
        test_errors = new Array(selected_task.test_cases.length);
        step_test_index = 0;
        step_engine = start_test_case(step_test_index);
    }
    if (!step_engine) return;
    if (step_engine.dfa.input.length === 0) {
        finish_step_case();
        step_test_index += 1;
        if (step_test_index >= selected_task.test_cases.length) {
            step_engine = undefined;
            render_test_cases();
            return;
        }
        step_engine = start_test_case(step_test_index);
        render_test_cases();
        return;
    }
    const engine = step_engine;
    if (!engine) return;
    try {
        const next_character = engine.dfa.input.at(0) ?? "";
        const transition = engine.iterate();
        last_handled_character = next_character;
        set_execution_visuals(engine.current_node_id, transition);
        update_execution_status(engine);
    } catch {
        execution_error = `No transition for '${engine.dfa.input.at(0) ?? ""}' at ${editor_node_name(engine.current_node_id)}`;
        test_results[step_test_index] = undefined;
        if (test_errors) test_errors[step_test_index] = execution_error;
        save_task_results();
        sync_task_completion();
        update_execution_status(engine);
        step_engine = undefined;
        render_test_cases();
        return;
    }
    if (engine.dfa.input.length === 0) finish_step_case();
    render_test_cases();
}

function finish_test_case(): void {
    const selected_task = get_selected_task();
    if (!selected_task) return;
    if (!test_results || test_results.length !== selected_task.test_cases.length) {
        test_results = new Array(selected_task.test_cases.length);
        test_errors = new Array(selected_task.test_cases.length);
        step_test_index = 0;
        step_engine = start_test_case(step_test_index);
    }
    if (!step_engine || !test_results) return;

    try {
        test_results[step_test_index] = step_engine.run();
        if (test_errors) test_errors[step_test_index] = undefined;
        save_task_results();
        set_execution_visuals(step_engine.current_node_id);
        update_execution_status(step_engine);
    } catch {
        execution_error = `No transition for '${step_engine.dfa.input.at(0) ?? ""}' at ${editor_node_name(step_engine.current_node_id)}`;
        test_results[step_test_index] = undefined;
        if (test_errors) test_errors[step_test_index] = execution_error;
        save_task_results();
        update_execution_status(step_engine);
    }
    sync_task_completion();
    step_test_index += 1;
    if (step_test_index >= selected_task.test_cases.length) {
        step_engine = undefined;
        render_test_cases();
        return;
    }

    step_engine = start_test_case(step_test_index);
    render_test_cases();
}

function run_test_cases(): void {
    const selected_task = get_selected_task();
    if (!selected_task) return;
    execution_error = undefined;
    test_results = new Array(selected_task.test_cases.length);
    test_errors = new Array(selected_task.test_cases.length);
    for (let index = 0; index < selected_task.test_cases.length; index += 1) {
        const engine = start_test_case(index);
        if (!engine) continue;
        try {
            while (engine.dfa.input.length > 0) {
                const next_character = engine.dfa.input.at(0) ?? "";
                const transition = engine.iterate();
                last_handled_character = next_character;
                set_execution_visuals(engine.current_node_id, transition);
                update_execution_status(engine);
            }
            test_results[index] = engine.is_accepting();
        } catch {
            execution_error = `No transition for '${engine.dfa.input.at(0) ?? ""}' at ${editor_node_name(engine.current_node_id)}`;
            test_results[index] = undefined;
            test_errors[index] = execution_error;
        }
    }
    save_task_results();
    sync_task_completion();
    step_engine = undefined;
    render_test_cases();
}

function reset_test_cases(): void {
    test_results = undefined;
    test_errors = undefined;
    save_task_results();
    execution_error = undefined;
    step_engine = undefined;
    step_test_index = 0;
    last_handled_character = "";
    clear_execution_visuals();
    const status = document.querySelector<HTMLElement>(".current-string");
    if (status) status.textContent = "Not run";
    render_test_cases();
}

export function render_all(): void {
    render_tasks();
    if (selected_task_id) load_task_results(selected_task_id);
    render_test_cases();
    initialize_editor(selected_task_id ?? "default");
    document.querySelector<HTMLButtonElement>(".btn-play")?.addEventListener("click", run_test_cases);
    document.querySelector<HTMLButtonElement>(".btn-step")?.addEventListener("click", step_test_case);
    document.querySelector<HTMLButtonElement>(".btn-finish")?.addEventListener("click", finish_test_case);
    document.querySelector<HTMLButtonElement>(".btn-reset")?.addEventListener("click", reset_test_cases);
}
