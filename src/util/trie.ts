

export class Node {
    map: Record<string, Node> = {};

    contains(char: string): boolean {
        return this.map[char] !== undefined;
    }

    get(char: string): Node | undefined {
        return this.map[char];
    }

    is_leaf(): boolean {
        return Object.keys(this.map).length === 0;
    }
}

export class Trie {
    root: Node = new Node();

    insert(str: string){
        let current_node = this.root;
        for(const char of str){
            if(!current_node.map[char]){
                current_node.map[char] = new Node();
            }
            current_node = current_node.map[char];
        }
    }

    search(str: string): boolean {
        let current_node = this.root;
        for(const char of str){
            if(!current_node.map[char]){
                return false;
            }
            current_node = current_node.map[char];
        }
        return true;
    }

    reset(){
        this.root = new Node();
    }
}

