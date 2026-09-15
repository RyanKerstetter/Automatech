import { player_state } from "./game_state.js";
import { Data } from "./data.js";
import { DFA, DFAEngine, DFANode, IterateResult } from "./engines/dfa.js";

interface EditorNode {
    id: number;
    label: string;
    x: number;
    y: number;
    start: boolean;
    accepting: boolean;
}

interface EditorConnection {
    id: number;
    from: number;
    to: number;
    symbols: string;
}

interface EditorSolution {
    type: "dfa";
    version: 1;
    nodes: EditorNode[];
    connections: EditorConnection[];
}

type Selection = { kind: "node" | "connection", id: number } | undefined;
type EditorMode = "select" | "connect" | "pan";

const editor_nodes: EditorNode[] = [
    { id: 0, label: "q0", x: 170, y: 190, start: true, accepting: false },
];
const editor_connections: EditorConnection[] = [];
const default_editor_nodes: EditorNode[] = editor_nodes.map((node) => ({ ...node }));
const default_editor_connections: EditorConnection[] = editor_connections.map((edge) => ({ ...edge }));
let editor_selection: Selection;
let editor_task_id: string | undefined;
let editor_initialized = false;
let editor_mode: EditorMode = "select";
let next_connection_id = 1;
let view_x = 0;
let view_y = 0;
let view_scale = 1;
let drag_state: { kind: "node" | "pan", id?: number, x: number, y: number, node_x?: number, node_y?: number } | undefined;
let connection_drag: { source_id: number, x: number, y: number } | undefined;
let execution_node_id: number | undefined;
let execution_connection: IterateResult | undefined;

const SVG_NS = "http://www.w3.org/2000/svg";

function get_editor_elements() {
    return {
        svg: document.querySelector<SVGSVGElement>(".graph-canvas"),
        world: document.querySelector<SVGGElement>(".graph-world"),
        form: document.querySelector<HTMLFormElement>(".inspector-form"),
        empty: document.querySelector<HTMLElement>(".inspector-empty"),
        title: document.querySelector<HTMLElement>(".inspector-title"),
        delete_button: document.querySelector<HTMLButtonElement>(".delete-selection"),
        zoom: document.querySelector<HTMLElement>(".zoom-readout"),
        execution_display: document.querySelector<HTMLElement>(".execution-display"),
    };
}

function svg_element<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
    return document.createElementNS(SVG_NS, name);
}

function editor_node(id: number) {
    return editor_nodes.find((node) => node.id === id);
}

export function editor_node_name(id: number): string {
    return editor_node(id)?.label ?? `node ${id}`;
}

function connection(id: number) {
    return editor_connections.find((item) => item.id === id);
}

export function create_dfa_engine(input: string): DFAEngine {
    const dfa = new DFA();
    const start_node = editor_nodes.find((node) => node.start);
    dfa.set_start_node_id(start_node?.id ?? -1);
    dfa.set_accepting_nodes(editor_nodes.filter((node) => node.accepting).map((node) => node.id));
    for (const node of editor_nodes) {
        const transitions: Record<string, number> = {};
        for (const edge of editor_connections.filter((item) => item.from === node.id)) {
            for (const symbol of edge.symbols.split(",").filter((item) => item.length > 0)) {
                transitions[symbol] = edge.to;
            }
        }
        dfa.add_node(new DFANode({ id: node.id, transitions }));
    }
    dfa.set_input(input);
    const engine = new DFAEngine();
    engine.set_dfa(dfa);
    return engine;
}

export function set_execution_visuals(node_id?: number, connection?: IterateResult): void {
    execution_node_id = node_id;
    execution_connection = connection;
    render_editor(false);
}

export function clear_execution_visuals(): void {
    set_execution_visuals();
    const display = get_editor_elements().execution_display;
    if (display) {
        display.replaceChildren();
        display.hidden = true;
    }
}

export function set_execution_input(remaining: string, handled = ""): void {
    const display = get_editor_elements().execution_display;
    if (!display) return;
    display.hidden = false;
    display.replaceChildren();
    if (handled) {
        const handled_element = document.createElement("span");
        handled_element.className = "read-character";
        handled_element.textContent = handled;
        display.append(handled_element);
    }
    const remaining_element = document.createElement("span");
    remaining_element.className = "remaining-input";
    remaining_element.textContent = remaining;
    display.append(remaining_element);
}

function screen_to_world(svg: SVGSVGElement, client_x: number, client_y: number) {
    const bounds = svg.getBoundingClientRect();
    return {
        x: (client_x - bounds.left - view_x) / view_scale,
        y: (client_y - bounds.top - view_y) / view_scale,
    };
}

function create_editor_field(label: string, type: string, value: string, name: string): HTMLLabelElement {
    const field = document.createElement("label");
    field.className = "inspector-field";
    field.innerHTML = `<span>${label}</span><input name="${name}" type="${type}" value="${value}">`;
    return field;
}

function focus_inspector_field(name: string): void {
    const input = document.querySelector<HTMLInputElement>(`.inspector-form input[name='${name}']`);
    input?.focus();
    if (input) input.setSelectionRange(input.value.length, input.value.length);
}

function current_solution(): EditorSolution {
    return {
        type: "dfa",
        version: 1,
        nodes: editor_nodes.map((node) => ({ ...node })),
        connections: editor_connections.map((edge) => ({ ...edge })),
    };
}

function save_editor(): void {
    if (!editor_task_id) return;
    player_state.set_task_data(editor_task_id, current_solution());
}

function replace_editor_solution(solution: EditorSolution): void {
    editor_nodes.splice(0, editor_nodes.length, ...solution.nodes);
    editor_connections.splice(0, editor_connections.length, ...solution.connections);
    next_connection_id = editor_connections.reduce((highest, edge) => Math.max(highest, edge.id + 1), 0);
    editor_selection = undefined;
    connection_drag = undefined;
}

export function load_editor_solution(task_id: string): void {
    if (editor_task_id && editor_task_id !== task_id) save_editor();
    editor_task_id = task_id;
    const saved_solution = player_state.get_task_data(task_id);
    if (saved_solution) {
        try {
            replace_editor_solution(parse_solution(saved_solution));
        } catch {
            replace_editor_solution({ type: "dfa", version: 1, nodes: default_editor_nodes.map((node) => ({ ...node })), connections: default_editor_connections.map((edge) => ({ ...edge })) });
        }
    } else {
        replace_editor_solution({ type: "dfa", version: 1, nodes: default_editor_nodes.map((node) => ({ ...node })), connections: default_editor_connections.map((edge) => ({ ...edge })) });
    }
    if (editor_initialized) render_editor();
}

function render_inspector(): void {
    const elements = get_editor_elements();
    if (!elements.form || !elements.empty || !elements.title || !elements.delete_button) {
        return;
    }

    elements.form.replaceChildren();
    elements.form.hidden = !editor_selection;
    elements.empty.hidden = Boolean(editor_selection);
    elements.delete_button.disabled = !editor_selection;

    if (!editor_selection) {
        elements.title.textContent = "No selection";
        return;
    }

    if (editor_selection.kind === "node") {
        const node = editor_node(editor_selection.id);
        if (!node) return;
        elements.title.textContent = node.label;
        elements.form.append(
            create_editor_field("Label", "text", node.label, "label"),
        );
        const start_label = document.createElement("label");
        start_label.className = "check-field";
        start_label.innerHTML = `<input name="start" type="checkbox" ${node.start ? "checked" : ""}><span>Start node</span>`;
        const accepting_label = document.createElement("label");
        accepting_label.className = "check-field";
        accepting_label.innerHTML = `<input name="accepting" type="checkbox" ${node.accepting ? "checked" : ""}><span>Accepting node</span>`;
        elements.form.append(start_label, accepting_label);
    } else {
        const edge = connection(editor_selection.id);
        if (!edge) return;
        elements.title.textContent = "Connection";
        elements.form.append(
            create_editor_field("From", "text", editor_node(edge.from)?.label ?? "?", "from"),
            create_editor_field("To", "text", editor_node(edge.to)?.label ?? "?", "to"),
            create_editor_field("Symbols", "text", edge.symbols, "symbols"),
        );
        const hint = document.createElement("p");
        hint.className = "inspector-hint";
        hint.textContent = "Separate symbols with commas. Whitespace is a literal symbol; use ^ as the fallback.";
        elements.form.append(hint);
        const from_input = elements.form.elements.namedItem("from") as HTMLInputElement;
        const to_input = elements.form.elements.namedItem("to") as HTMLInputElement;
        from_input.readOnly = true;
        to_input.readOnly = true;
    }

    elements.form.oninput = () => {
        if (!editor_selection) return;
        if (editor_selection.kind === "node") {
            const node = editor_node(editor_selection.id);
            if (!node) return;
            const label = elements.form?.elements.namedItem("label") as HTMLInputElement;
            const start = elements.form?.elements.namedItem("start") as HTMLInputElement;
            const accepting = elements.form?.elements.namedItem("accepting") as HTMLInputElement;
            node.label = label.value;
            node.start = start.checked;
            node.accepting = accepting.checked;
            if (node.start) editor_nodes.forEach((item) => { if (item !== node) item.start = false; });
        } else {
            const edge = connection(editor_selection.id);
            const symbols = elements.form?.elements.namedItem("symbols") as HTMLInputElement;
            if (edge && symbols) edge.symbols = symbols.value;
        }
        save_editor();
        render_editor(false);
    };
    elements.form.onfocusout = save_editor;
}

function node_radius(node: EditorNode): number {
    return 31;
}

function connection_path(edge: EditorConnection): { path: string, label_x: number, label_y: number } | undefined {
    const from = editor_node(edge.from);
    const to = editor_node(edge.to);
    if (!from || !to) return;
    if (from.id === to.id) {
        return { path: `M ${from.x - 20} ${from.y - 24} C ${from.x - 72} ${from.y - 100}, ${from.x + 72} ${from.y - 100}, ${from.x + 20} ${from.y - 24}`, label_x: from.x, label_y: from.y - 92 };
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const ux = dx / length;
    const uy = dy / length;
    const start_x = from.x + ux * node_radius(from);
    const start_y = from.y + uy * node_radius(from);
    const end_x = to.x - ux * (node_radius(to) + 5);
    const end_y = to.y - uy * (node_radius(to) + 5);
    const bend = 36;
    const control_x = (start_x + end_x) / 2 - uy * bend;
    const control_y = (start_y + end_y) / 2 + ux * bend;
    return { path: `M ${start_x} ${start_y} Q ${control_x} ${control_y} ${end_x} ${end_y}`, label_x: control_x, label_y: control_y - 8 };
}

function render_editor(render_properties = true): void {
    const elements = get_editor_elements();
    if (!elements.svg || !elements.world) return;
    elements.world.setAttribute("transform", `translate(${view_x} ${view_y}) scale(${view_scale})`);
    elements.world.replaceChildren();

    for (const edge of editor_connections) {
        const geometry = connection_path(edge);
        if (!geometry) continue;
        const edge_group = svg_element("g");
        edge_group.classList.add("graph-connection");
        edge_group.classList.toggle("selected", editor_selection?.kind === "connection" && editor_selection.id === edge.id);
        edge_group.classList.toggle("executing", execution_connection?.from_id === edge.from && execution_connection?.to_id === edge.to);
        edge_group.dataset.connectionId = String(edge.id);
        const hit_path = svg_element("path");
        hit_path.setAttribute("d", geometry.path);
        hit_path.classList.add("connection-hitbox");
        const path = svg_element("path");
        path.setAttribute("d", geometry.path);
        path.classList.add("connection-line");
        path.setAttribute("marker-end", "url(#arrowhead)");
        const label = svg_element("text");
        label.textContent = edge.symbols || "ε";
        label.setAttribute("x", String(geometry.label_x));
        label.setAttribute("y", String(geometry.label_y));
        label.classList.add("connection-label");
        edge_group.append(hit_path, path, label);
        elements.world.append(edge_group);
    }

    if (connection_drag) {
        const source = editor_node(connection_drag.source_id);
        if (source) {
            const preview = svg_element("path");
            preview.setAttribute("d", `M ${source.x} ${source.y} L ${connection_drag.x} ${connection_drag.y}`);
            preview.classList.add("connection-preview");
            elements.world.append(preview);
        }
    }

    for (const node of editor_nodes) {
        const group = svg_element("g");
        group.classList.add("graph-node");
        group.classList.toggle("selected", editor_selection?.kind === "node" && editor_selection.id === node.id);
        group.classList.toggle("executing", execution_node_id === node.id);
        group.dataset.nodeId = String(node.id);
        group.setAttribute("transform", `translate(${node.x} ${node.y})`);
        const circle = svg_element("circle");
        circle.setAttribute("r", String(node_radius(node)));
        circle.classList.add("node-circle");
        const label = svg_element("text");
        label.textContent = node.label;
        label.classList.add("node-label");
        group.append(circle, label);
        if (node.accepting) {
            const inner = svg_element("circle");
            inner.setAttribute("r", "25");
            inner.classList.add("accepting-ring");
            group.insertBefore(inner, label);
        }
        if (node.start) {
            const start_marker = svg_element("path");
            start_marker.setAttribute("d", "M -57 0 L -38 -9 L -38 9 Z");
            start_marker.classList.add("start-marker");
            group.append(start_marker);
        }
        elements.world.append(group);
    }
    if (elements.zoom) elements.zoom.textContent = `${Math.round(view_scale * 100)}%`;
    if (render_properties) render_inspector();
}

function set_editor_mode(mode: EditorMode): void {
    editor_mode = mode;
    document.querySelectorAll<HTMLButtonElement>("[data-editor-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.editorMode === mode);
    });
}

function add_editor_node(x = 200, y = 160): void {
    const id = editor_nodes.length ? Math.max(...editor_nodes.map((node) => node.id)) + 1 : 0;
    const node = { id, label: `q${id}`, x, y, start: editor_nodes.length === 0, accepting: false };
    editor_nodes.push(node);
    editor_selection = { kind: "node", id };
    save_editor();
    render_editor();
}

function export_solution(): void {
    const solution = current_solution();
    const blob = new Blob([JSON.stringify(solution, null, 2)], { type: "application/json" });
    const download_url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = download_url;
    const task = Data.task_data["dfa"]?.groups
        .flatMap((group) => group.tasks)
        .find((item) => item.task_id === editor_task_id);
    const task_name = task?.task_name || "cycle-dfa-solution";
    const safe_task_name = task_name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
    link.download = `${safe_task_name || "cycle-dfa-solution"}.json`;
    link.click();
    URL.revokeObjectURL(download_url);
}

function parse_solution(value: unknown): EditorSolution {
    if (!value || typeof value !== "object") throw new Error("The file must contain a JSON object.");
    const candidate = value as Partial<EditorSolution>;
    if (candidate.type !== "dfa" || candidate.version !== 1 || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.connections)) {
        throw new Error("This is not a supported Cycle DFA solution.");
    }

    const nodes = candidate.nodes.map((node) => {
        if (!node || typeof node !== "object" || !Number.isInteger(node.id) || typeof node.label !== "string" ||
            !Number.isFinite(node.x) || !Number.isFinite(node.y) || typeof node.start !== "boolean" || typeof node.accepting !== "boolean") {
            throw new Error("The solution contains an invalid node.");
        }
        return { id: node.id, label: node.label, x: node.x, y: node.y, start: node.start, accepting: node.accepting };
    });
    const node_ids = new Set(nodes.map((node) => node.id));
    if (node_ids.size !== nodes.length || nodes.filter((node) => node.start).length > 1) {
        throw new Error("The solution contains duplicate node IDs or multiple start nodes.");
    }

    const connections = candidate.connections.map((edge) => {
        if (!edge || typeof edge !== "object" || !Number.isInteger(edge.id) || !Number.isInteger(edge.from) ||
            !Number.isInteger(edge.to) || typeof edge.symbols !== "string" || !node_ids.has(edge.from) || !node_ids.has(edge.to)) {
            throw new Error("The solution contains an invalid connection.");
        }
        return { id: edge.id, from: edge.from, to: edge.to, symbols: edge.symbols };
    });
    if (new Set(connections.map((edge) => edge.id)).size !== connections.length) {
        throw new Error("The solution contains duplicate connection IDs.");
    }
    return { type: "dfa", version: 1, nodes, connections };
}

async function import_solution(file: File): Promise<void> {
    try {
        const solution = parse_solution(JSON.parse(await file.text()));
        replace_editor_solution(solution);
        save_editor();
        render_editor();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to import solution.";
        window.alert(message);
    }
}

function delete_selection(): void {
    if (!editor_selection) return;
    if (editor_selection.kind === "node") {
        const id = editor_selection.id;
        const index = editor_nodes.findIndex((node) => node.id === id);
        if (index >= 0) editor_nodes.splice(index, 1);
        for (let i = editor_connections.length - 1; i >= 0; i -= 1) {
            if (editor_connections[i].from === id || editor_connections[i].to === id) editor_connections.splice(i, 1);
        }
    } else {
        const selection_id = editor_selection.id;
        const index = editor_connections.findIndex((edge) => edge.id === selection_id);
        if (index >= 0) editor_connections.splice(index, 1);
    }
    editor_selection = undefined;
    save_editor();
    render_editor();
}

function fit_editor(): void {
    const elements = get_editor_elements();
    if (!elements.svg || editor_nodes.length === 0) return;
    const bounds = elements.svg.getBoundingClientRect();
    const min_x = Math.min(...editor_nodes.map((node) => node.x)) - 90;
    const max_x = Math.max(...editor_nodes.map((node) => node.x)) + 90;
    const min_y = Math.min(...editor_nodes.map((node) => node.y)) - 90;
    const max_y = Math.max(...editor_nodes.map((node) => node.y)) + 90;
    view_scale = Math.min((bounds.width - 20) / (max_x - min_x), (bounds.height - 20) / (max_y - min_y), 1.5);
    view_scale = Math.max(view_scale, 0.45);
    view_x = (bounds.width - (min_x + max_x) * view_scale) / 2;
    view_y = (bounds.height - (min_y + max_y) * view_scale) / 2;
    render_editor();
}

export function initialize_editor(task_id: string): void {
    load_editor_solution(task_id);
    const elements = get_editor_elements();
    if (!elements.svg) return;
    if (editor_initialized) {
        render_editor();
        return;
    }
    editor_initialized = true;
    elements.svg.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const target = event.target as Element;
        const node_group = target.closest<SVGGElement>(".graph-node");
        const edge_group = target.closest<SVGGElement>(".graph-connection");
        const point = screen_to_world(elements.svg!, event.clientX, event.clientY);
        if (node_group) {
            const id = Number(node_group.dataset.nodeId);
            if (editor_mode === "connect" || (editor_mode === "select" && event.shiftKey)) {
                connection_drag = { source_id: id, x: point.x, y: point.y };
                render_editor();
                elements.svg!.setPointerCapture(event.pointerId);
                return;
            }
            if (editor_mode === "select") {
                editor_selection = { kind: "node", id };
                const node = editor_node(id);
                drag_state = node ? { kind: "node", id, x: point.x, y: point.y, node_x: node.x, node_y: node.y } : undefined;
                render_editor();
                focus_inspector_field("label");
                (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
                return;
            }
        }
        if (edge_group && editor_mode === "select") {
            editor_selection = { kind: "connection", id: Number(edge_group.dataset.connectionId) };
            render_editor();
            focus_inspector_field("symbols");
            return;
        }
        if (editor_mode === "pan" || event.button === 1 || event.shiftKey) {
            drag_state = { kind: "pan", x: event.clientX, y: event.clientY };
            elements.svg!.setPointerCapture(event.pointerId);
        } else if (editor_mode === "select") {
            editor_selection = undefined;
            render_editor();
        }
    });
    elements.svg.addEventListener("pointermove", (event) => {
        if (connection_drag) {
            const point = screen_to_world(elements.svg!, event.clientX, event.clientY);
            connection_drag.x = point.x;
            connection_drag.y = point.y;
            render_editor(false);
            return;
        }
        if (!drag_state) return;
        if (drag_state.kind === "pan") {
            view_x += event.clientX - drag_state.x;
            view_y += event.clientY - drag_state.y;
            drag_state.x = event.clientX;
            drag_state.y = event.clientY;
        } else {
            const node = editor_node(drag_state.id!);
            const point = screen_to_world(elements.svg!, event.clientX, event.clientY);
            if (node) {
                node.x = (drag_state.node_x ?? node.x) + point.x - drag_state.x;
                node.y = (drag_state.node_y ?? node.y) + point.y - drag_state.y;
                save_editor();
            }
        }
        render_editor();
    });
    elements.svg.addEventListener("pointerup", (event) => {
        if (connection_drag) {
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGGElement>(".graph-node");
            const target_id = target ? Number(target.dataset.nodeId) : undefined;
            let created_connection = false;
            if (target_id !== undefined) {
                const existing_connection = editor_connections.find((edge) =>
                    edge.from === connection_drag?.source_id && edge.to === target_id);
                if (existing_connection) {
                    editor_selection = { kind: "connection", id: existing_connection.id };
                } else {
                    const new_connection_id = next_connection_id++;
                    editor_connections.push({ id: new_connection_id, from: connection_drag.source_id, to: target_id, symbols: "" });
                    editor_selection = { kind: "connection", id: new_connection_id };
                    created_connection = true;
                    save_editor();
                }
            }
            connection_drag = undefined;
            render_editor();
            if (created_connection) {
                focus_inspector_field("symbols");
            }
        }
        drag_state = undefined;
    });
    elements.svg.addEventListener("pointercancel", () => {
        connection_drag = undefined;
        drag_state = undefined;
        render_editor();
    });
    elements.svg.addEventListener("dblclick", (event) => {
        if ((event.target as Element).closest(".graph-node, .graph-connection")) return;
        const point = screen_to_world(elements.svg!, event.clientX, event.clientY);
        add_editor_node(point.x, point.y);
    });
    elements.svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const before = screen_to_world(elements.svg!, event.clientX, event.clientY);
        const factor = event.deltaY < 0 ? 1.1 : 0.9;
        view_scale = Math.min(2.5, Math.max(0.35, view_scale * factor));
        const after = screen_to_world(elements.svg!, event.clientX, event.clientY);
        view_x += (after.x - before.x) * view_scale;
        view_y += (after.y - before.y) * view_scale;
        render_editor();
    }, { passive: false });
    elements.svg.addEventListener("keydown", (event) => {
        if (event.key === "Delete" || event.key === "Backspace") delete_selection();
    });
    document.querySelectorAll<HTMLButtonElement>("[data-editor-mode]").forEach((button) => {
        button.addEventListener("click", () => set_editor_mode(button.dataset.editorMode as EditorMode));
    });
    document.querySelector<HTMLButtonElement>("[data-editor-action='add-node']")?.addEventListener("click", () => add_editor_node());
    document.querySelector<HTMLButtonElement>("[data-editor-action='fit']")?.addEventListener("click", fit_editor);
    document.querySelector<HTMLButtonElement>("[data-editor-action='export']")?.addEventListener("click", export_solution);
    const file_input = document.querySelector<HTMLInputElement>(".solution-file-input");
    document.querySelector<HTMLButtonElement>("[data-editor-action='import']")?.addEventListener("click", () => file_input?.click());
    file_input?.addEventListener("change", () => {
        const file = file_input.files?.[0];
        if (file) void import_solution(file);
        file_input.value = "";
    });
    elements.delete_button?.addEventListener("click", delete_selection);
    render_editor();
}
