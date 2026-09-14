

class NFANode {
    id: number = 0;
    transitions: Record<string, number[]> = {};

    constructor(data: {id: number, transitions: Record<string, number[]>}){
        this.id = data.id;
        this.transitions = data.transitions;
    }
}

class NFA {
    input: string = "";
    nodes: Record<number, NFANode> = {};
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

    add_node(node: NFANode){
        this.nodes[node.id] = node;
    }
}

class NFAEngine {
    nfa: NFA = new NFA();
    current_nodes_id: Set<number> = new Set();

    set_nfa(nfa: NFA){
        this.nfa = nfa;
        this.current_nodes_id = new Set();
        this.current_nodes_id.add(nfa.start_node_id);
        this.handle_epsilon_translations();
    }

    set_current_nodes_id(node_id: Set<number>){
        this.current_nodes_id = node_id;
    }

    handle_epsilon_translations() {
        var changed: boolean = true;
        const computed: Set<number> = new Set();
        while(changed){
            changed = false;
            for(const node_id of this.current_nodes_id){
                if(computed.has(node_id))
                    continue;
                computed.add(node_id)
                const current_node = this.nfa.nodes[node_id];
                if(!current_node){
                    throw new Error(`Current node with id ${node_id} does not exist in the NFA.`);
                }
                const next_nodes_id = current_node.transitions["epsilon"] || [];
                for(const node of next_nodes_id){
                    this.current_nodes_id.add(node);
                    changed = true;
                }
            }
        }
    }

    iterate(){
        if(this.nfa.input.length == 0)
            return false;
        
        const new_nodes: Set<number> = new Set();
        for(const node_id of this.current_nodes_id){
            const current_node = this.nfa.nodes[node_id];
            if(!current_node){
                throw new Error(`Current node with id ${node_id} does not exist in the NFA.`);
            }
            const input_char = this.nfa.input.at(0) || "";
            const next_nodes_id = current_node.transitions[input_char] || [];
            for(const node of next_nodes_id){
                new_nodes.add(node);
            }
        }
        this.nfa.input = this.nfa.input.slice(1);
        this.current_nodes_id = new_nodes;

        this.handle_epsilon_translations();
    }

    run() : boolean {
        while(this.nfa.input.length > 0){
            this.iterate();
        }

        for(const node of this.current_nodes_id){
            if(this.nfa.accepting_nodes.has(node)){
                return true;
            }
        }
        return false;
    }
}