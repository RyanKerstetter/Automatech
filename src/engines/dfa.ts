

export class DFANode {
    id: number = 0;
    transitions: Record<string, number> = {};

    constructor(data: {id: number, transitions: Record<string, number>}){
        this.id = data.id;
        this.transitions = data.transitions;
    }
}

export class DFA {
    input: string = "";
    nodes: Record<number, DFANode> = {};
    accepting_nodes: Set<number> = new Set();
    start_node_id: number = 0;

    set_start_node_id(node_id: number){
        this.start_node_id = node_id;
    }

    set_accepting_nodes(node_ids: number[]){
        this.accepting_nodes = new Set(node_ids);
    }

    add_accepting_node(node_id: number){
        this.accepting_nodes.add(node_id);
    }

    set_input(input: string){
        this.input = input;
    }

    add_node(node: DFANode){
        this.nodes[node.id] = node;
    }
}

export interface IterateResult{
    from_id: number,
    to_id: number,
}

export class DFAEngine {
    dfa: DFA = new DFA();
    current_node_id: number = 0;

    set_dfa(dfa: DFA){
        this.dfa = dfa;
        this.current_node_id = dfa.start_node_id;
    }

    set_current_node_id(node_id: number){
        this.current_node_id = node_id;
    }

    iterate(): IterateResult {
        if(this.dfa.input.length == 0)
            return {from_id : -1, to_id:-1};
        const current_node = this.dfa.nodes[this.current_node_id];
        if(!current_node){
            throw new Error(`Current node with id ${this.current_node_id} does not exist in the DFA.`);
        }
        const input_char = this.dfa.input.at(0) || "";
        // A caret transition is the fallback for any character without an exact transition.
        const next_node_id = current_node.transitions[input_char] ?? current_node.transitions["^"];
        if(next_node_id === undefined){
            throw new Error(`No transition defined for input '${input_char}' from node ${this.current_node_id}.`);
        }
        const result = { from_id: this.current_node_id,to_id:next_node_id};
        this.current_node_id = next_node_id;
        this.dfa.input = this.dfa.input.slice(1);
        return result;
    }

    is_accepting() : boolean {
        return (this.dfa.accepting_nodes.has(this.current_node_id))
    }

    run() : boolean {
        while(this.dfa.input.length > 0){
            this.iterate()
        }
        return (this.dfa.accepting_nodes.has(this.current_node_id))
    }
}