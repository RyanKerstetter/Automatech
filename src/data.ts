


interface TaskData {
    groups: Group[];
}

enum AcceptType {
    ACCEPT = "accept",
    DENY = "deny",
}

interface TestCase {
    input: string;
    accept_type: AcceptType;
}

interface Task {
    task_name: string;
    description: string;
    task_id: string;
    test_cases: TestCase[];
}

interface Group {
    group_name: string;
    tasks: Task[];
}

export const Data = {
    task_data: {} as Record<string,TaskData>,
}

export async function LoadData() : Promise<void>{
    const data = await fetch("data/json/dfa_tasks.json");
    const groups: Group[] = await data.json();
    const dfa_data: TaskData = { groups };
    Data.task_data["dfa"] = dfa_data;
}