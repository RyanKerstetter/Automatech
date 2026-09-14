

export class CycleEngine {
    rules: Record<string,string> = {};
    halt_codes: string[] = [];
    current_str: string = "";
    finished = false;

    set_rules(new_rules: Record<string,string>, halt_codes: string[]){
        this.rules = new_rules;
        this.halt_codes = halt_codes;
    }

    set_str(new_str: string = ""){
        this.current_str = new_str;
        this.finished = false;
    }

    iterate(){
        if(this.finished || this.current_str.length == 0)
            return;
        const start: string = this.current_str.at(0) || "";
        if(this.halt_codes.find((code) => code == start)){
            this.finished = true;
            return;
        }
        const append = this.rules[start] || "";
        this.current_str = this.current_str.slice(1) + append;
    }
}