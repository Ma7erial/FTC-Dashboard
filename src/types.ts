export interface Team {
  id: number;
  name: string;
  number: string;
  accent_color?: string;
  primary_color?: string;
  text_color?: string;
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
  accent_color?: string;
  primary_color?: string;
  text_color?: string;
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
export interface CodeFile {
  id: number;
  team_id: number;
  file_name: string;
  file_path: string;
  language: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CodeCommit {
  id: number;
  team_id: number;
  file_id: number;
  branch: 'main' | 'drafts';
  author_id: number;
  author_name?: string;
  message: string;
  content: string;
  hash: string;
  created_at: string;
  file_name?: string;
}

export interface CodeContent {
  file: CodeFile;
  content: {
    drafts: string;
    main: string;
  };
  commits: CodeCommit[];
}