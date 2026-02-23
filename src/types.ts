export interface Team {
  id: number;
  name: string;
  number: string;
}

export interface Member {
  id: number;
  team_id: number | null;
  team_name?: string;
  name: string;
  role: string;
  email: string;
  is_board: number;
  scopes: string; // JSON string
}

export interface AttendanceRecord {
  id: number;
  member_id: number;
  date: string;
  status: 'present' | 'absent' | 'late';
}

export interface Task {
  id: number;
  team_id: number;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  assigned_to: number | null;
  due_date: string;
}

export interface BudgetItem {
  id: number;
  team_id: number;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
}

export interface OutreachEvent {
  id: number;
  title: string;
  description: string;
  date: string;
  hours: number;
  location: string;
}

export interface Communication {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  date: string;
  type: 'email' | 'announcement';
}
