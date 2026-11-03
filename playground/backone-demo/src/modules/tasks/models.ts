export interface Task {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  task_id: number | null;
  created_at: string;
}
