import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  CheckSquare, 
  Wallet, 
  Globe, 
  Newspaper,
  Mail,
  Settings,
  Menu,
  X,
  ChevronRight,
  Plus,
  TrendingUp,
  Clock,
  Award,
  MessageSquare,
  Send,
  Bell,
  LogOut,
  Lock,
  UserPlus,
  Search,
  EyeOff,
  Eye,
  Edit2,
  Calendar,
  User,
  Zap,
  Trash2,
  Camera,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Markdown from 'react-markdown';
import { GoogleGenAI, Type } from "@google/genai";
import { format } from 'date-fns';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication } from './types';
import { fetchFTCNews, getAttendanceInsights, checkExcuse, getActivitySummary } from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Card = ({ children, className, title, subtitle, icon: Icon }: any) => (
  <div className={cn("glass rounded-2xl p-6 flex flex-col gap-4", className)}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-2">
        <div>
          {title && <h3 className="text-lg font-display font-bold text-white">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {Icon && <Icon className="w-5 h-5 text-accent" />}
      </div>
    )}
    {children}
  </div>
);

const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-accent text-primary hover:bg-accent-hover font-bold',
    secondary: 'bg-slate-800 text-white hover:bg-slate-700',
    outline: 'border border-accent/50 text-accent hover:bg-accent/10',
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5'
  };
  
  return (
    <button 
      className={cn(
        "px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50", 
        variants[variant as keyof typeof variants],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className, ...props }: any) => (
  <input 
    className={cn(
      "w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors",
      className
    )}
    {...props}
  />
);

const Select = ({ className, options, ...props }: any) => (
  <select 
    className={cn(
      "w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors",
      className
    )}
    {...props}
  >
    {options.map((opt: any) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [outreach, setOutreach] = useState<OutreachEvent[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [documentation, setDocumentation] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [news, setNews] = useState<string>("");
  const [insights, setInsights] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    fetch('/api/members').then(res => res.json()).then(setMembers);
    if (isLoggedIn) {
      fetchData();
      connectSocket();
    }
  }, [isLoggedIn]);

  const connectSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'chat') {
          setMessages(prev => [...prev, msg]);
        } else if (msg.type === 'notification') {
          if (currentUser && msg.notification.user_id === currentUser.id) {
            setNotifications(prev => [msg.notification, ...prev]);
          }
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, retrying in 3s...");
      setTimeout(connectSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };

    setSocket(ws);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const fetchJson = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Fetch failed for ${url}: ${res.status}`);
          return null;
        }
        try {
          return await res.json();
        } catch (e) {
          console.warn(`Failed to parse JSON for ${url}`);
          return null;
        }
      };

      const [t, m, a, tk, b, o, c, msgs, s, h, d] = await Promise.all([
        fetchJson('/api/teams'),
        fetchJson('/api/members'),
        fetchJson('/api/attendance'),
        fetchJson('/api/tasks'),
        fetchJson('/api/budget'),
        fetchJson('/api/outreach'),
        fetchJson('/api/communications'),
        fetchJson('/api/messages'),
        fetchJson('/api/settings'),
        fetchJson('/api/hidden-dates'),
        fetchJson('/api/documentation'),
      ]);

      if (Array.isArray(t)) setTeams(t);
      if (Array.isArray(m)) setMembers(m);
      if (Array.isArray(a)) setAttendance(a);
      if (Array.isArray(tk)) setTasks(tk);
      if (Array.isArray(b)) setBudget(b);
      if (Array.isArray(o)) setOutreach(o);
      if (Array.isArray(c)) setCommunications(c);
      if (Array.isArray(msgs)) setMessages(msgs);
      if (Array.isArray(h)) setHiddenDates(h);
      if (Array.isArray(d)) setDocumentation(d);
      if (s && Array.isArray(s)) {
        const settingsMap = s.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
        setSettings(settingsMap);
      }

      if (currentUser) {
        const notes = await fetchJson(`/api/notifications/${currentUser.id}`);
        if (Array.isArray(notes)) setNotifications(notes);
      }

      // Background updates
      fetchFTCNews().then(res => res && setNews(res));
      if (a && a.length > 0 && m) {
        getAttendanceInsights(a, m).then(res => res && setInsights(res));
      }
      if (currentUser) {
        getActivitySummary({ 
          tasks: tk, 
          messages: msgs, 
          budget: b,
          userScope: { role: currentUser.role, is_board: currentUser.is_board, scopes: currentUser.scopes }
        }).then(res => res && setSummary(res));
      }
    } catch (err) {
      console.error("Error in fetchData:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (members.length === 0) {
      // First user creation
      const adminData = { 
        name: 'Admin', 
        email: loginEmail, 
        role: 'President', 
        is_board: 1, 
        scopes: JSON.stringify(['attendance', 'budget', 'tasks', 'admin']) 
      };
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData)
      });
      if (res.ok) {
        setNeedsSetup(true);
        setCurrentUser(adminData as any);
        return;
      }
    }
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    });
    const data = await res.json();
    if (data.needsSetup) {
      setNeedsSetup(true);
      setCurrentUser(data.user);
    } else if (data.user) {
      setCurrentUser(data.user);
      setIsLoggedIn(true);
    } else {
      alert(data.error || "Login failed");
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser?.email, password: loginPassword })
    });
    const data = await res.json();
    if (data.user) {
      setCurrentUser(data.user);
      setIsLoggedIn(true);
      setNeedsSetup(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSocket(null);
  };

  const markNotificationsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds })
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const hasScope = (scope: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'President') return true;
    if (scope === 'admin' && currentUser.is_board) return true;
    try {
      const scopes = typeof currentUser.scopes === 'string' ? JSON.parse(currentUser.scopes) : currentUser.scopes;
      return scopes.includes(scope);
    } catch {
      return false;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'teams', label: 'Teams & Members', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck, scope: 'attendance' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'budget', label: 'Budget', icon: Wallet, scope: 'budget' },
    { id: 'outreach', label: 'Outreach', icon: Globe },
    { id: 'comm', label: 'Communication', icon: Mail },
    { id: 'chat', label: 'Messaging', icon: MessageSquare },
    { id: 'scout', label: 'AI Scout', icon: Newspaper },
    { id: 'settings', label: 'Admin Settings', icon: Settings, scope: 'admin' },
  ];

  const renderContent = () => {
    const viewProps = {
      teams, members, attendance, tasks, budget, outreach, communications, 
      messages, settings, hiddenDates, currentUser, onRefresh: fetchData, setLoading,
      insights, news, summary, socket
    };
    switch (activeTab) {
      case 'dashboard': return <DashboardView {...viewProps} data={{ attendance, tasks, budget, outreach, insights, news, summary }} />;
      case 'teams': return <TeamsView {...viewProps} />;
      case 'attendance': return <AttendanceView {...viewProps} />;
      case 'tasks': return <TasksView {...viewProps} />;
      case 'budget': return <BudgetView {...viewProps} />;
      case 'outreach': return <OutreachView {...viewProps} />;
      case 'comm': return <CommunicationView {...viewProps} />;
      case 'chat': return <ChatView {...viewProps} />;
      case 'scout': return <ScoutView {...viewProps} />;
      case 'settings': return <SettingsView {...viewProps} />;
      default: return null;
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="w-full max-w-md p-8">
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center gold-glow">
                <Award className="text-primary w-10 h-10" />
              </div>
              <h1 className="text-3xl font-display font-bold text-white">FTC Nexus</h1>
              <p className="text-slate-400 text-center">
                {needsSetup ? "Set your new password to continue" : "Sign in to manage your club"}
              </p>
            </div>

            <form onSubmit={needsSetup ? handleSetup : handleLogin} className="space-y-4">
              {!needsSetup && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Email</label>
                  <Input type="email" required value={loginEmail} onChange={(e: any) => setLoginEmail(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">Password</label>
                <Input type="password" required value={loginPassword} onChange={(e: any) => setLoginPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full py-3 mt-4">
                {needsSetup ? "Complete Setup" : "Sign In"}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-primary">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth <= 768 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 80,
          x: (window.innerWidth <= 768 && !isSidebarOpen) ? -280 : 0
        }}
        className={cn(
          "bg-secondary border-r border-white/5 flex flex-col z-40 transition-all duration-300",
          window.innerWidth <= 768 ? "fixed inset-y-0 left-0" : "relative"
        )}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center gold-glow">
            <Award className="text-primary w-6 h-6" />
          </div>
          {isSidebarOpen && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-display font-bold text-white whitespace-nowrap"
            >
              FTC Nexus
            </motion.h1>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const isLocked = item.scope && !hasScope(item.scope);
            return (
              <button
                key={item.id}
                onClick={() => !isLocked && setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all group relative",
                  activeTab === item.id ? "bg-accent text-primary font-bold" : "text-slate-400 hover:bg-white/5 hover:text-white",
                  isLocked && "opacity-30 cursor-not-allowed"
                )}
              >
                <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-primary" : "text-accent")} />
                {isSidebarOpen && <span>{item.label}</span>}
                {isLocked && isSidebarOpen && <span className="ml-auto text-[10px] uppercase font-bold opacity-50">Locked</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 p-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-primary font-bold text-xs">
              {currentUser?.name.charAt(0)}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentUser?.name}</p>
                <button onClick={handleLogout} className="text-[10px] text-rose-400 hover:underline">Logout</button>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center gap-3 p-3 text-slate-400 hover:text-white"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {isSidebarOpen && <span>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-primary custom-scrollbar relative">
        <header className="sticky top-0 z-20 glass px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-400 hover:text-white sm:hidden"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white capitalize">{activeTab.replace('-', ' ')}</h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) markNotificationsRead();
                }}
                className="relative p-2 text-slate-400 hover:text-white transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-primary" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-80 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-white/10 bg-white/5">
                      <h4 className="text-sm font-bold text-white">Notifications</h4>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length > 0 ? (
                        notifications.map(n => (
                          <div key={n.id} className={cn("p-4 border-b border-white/5 hover:bg-white/5 transition-colors", !n.is_read && "bg-accent/5")}>
                            <p className="text-xs text-white leading-relaxed">{n.content}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{format(new Date(n.timestamp), 'MMM d, h:mm a')}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center">
                          <p className="text-xs text-slate-500">No notifications yet</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {currentUser && (
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-primary font-bold text-xs">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-bold text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400">{currentUser.role}</p>
                </div>
                <button onClick={handleLogout} className="ml-2 p-1 text-slate-500 hover:text-rose-400 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-400 animate-pulse">Synchronizing club data...</p>
                </div>
              ) : renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// --- View Components ---

function DashboardView({ data, currentUser, onRefresh, settings, setLoading }: any) {
  const [showOut, setShowOut] = useState(false);
  const [outReason, setOutReason] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const myStatus = data.attendance.find((r: any) => r.member_id === currentUser.id && r.date === today);

  const handleImOut = async () => {
    setLoading(true);
    try {
      const excuseResult = await checkExcuse(outReason, settings.excuse_criteria);
      const isExcused = excuseResult.includes("EXCUSED");
      const status = isExcused ? 'E' : 'U';
      
      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(new Date(), 'yyyy-MM-dd'),
          records: [{ member_id: currentUser.id, status, reason: outReason }]
        })
      });
      if (res.ok) {
        setShowOut(false);
        onRefresh();
        alert(`Absence logged as ${isExcused ? 'EXCUSED' : 'UNEXCUSED'}. AI Note: ${excuseResult}`);
      }
    } finally {
      setLoading(false);
    }
  };
  const totalBudget = data.budget.reduce((acc: number, item: any) => 
    item.type === 'income' ? acc + item.amount : acc - item.amount, 0
  );

  const attendanceRate = data.attendance.length > 0 
    ? (data.attendance.filter((r: any) => r.status === 'P').length / data.attendance.length * 100).toFixed(1)
    : 0;

  const activeTasks = data.tasks.filter((t: any) => t.status !== 'done').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
      <Card title="Club Health" icon={TrendingUp} className="lg:col-span-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Attendance</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-accent">{attendanceRate}%</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Budget</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-emerald-400 truncate">${totalBudget.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Active Tasks</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-blue-400">{activeTasks}</p>
          </div>
        </div>
        
        <div className="mt-6 h-64 min-h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.attendance.slice(-10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #ffffff20', borderRadius: '12px' }}
                itemStyle={{ color: '#fbbf24' }}
              />
              <Line type="monotone" dataKey="id" stroke="#fbbf24" strokeWidth={3} dot={{ fill: '#fbbf24' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="AI Insights" icon={Clock} className="h-full">
        <div className="text-sm text-slate-300 leading-relaxed prose prose-invert h-[300px] lg:h-[400px] overflow-y-auto custom-scrollbar pr-2">
          <Markdown>{data.insights || "Analyzing club data for insights..."}</Markdown>
        </div>
      </Card>

      <Card title="Personal Status" icon={User} className="md:col-span-1">
        <div className="space-y-4">
          {myStatus ? (
            <div className={cn(
              "p-4 rounded-xl border flex flex-col gap-2",
              myStatus.status === 'P' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              myStatus.status === 'A' ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
              "bg-amber-500/10 border-amber-500/30 text-amber-400"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4" />
                  <span className="text-sm font-bold">Today: {
                    myStatus.status === 'P' ? 'Present' : 
                    myStatus.status === 'A' ? 'Absent' : 
                    myStatus.status === 'E' ? 'Excused' : 'Late'
                  }</span>
                </div>
                {myStatus.reason && <p className="text-[10px] opacity-70">Reason logged</p>}
              </div>
              {myStatus.reason && <p className="text-xs italic opacity-80">"{myStatus.reason}"</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">You haven't been marked for today yet.</p>
              <Button onClick={() => setShowOut(true)} variant="outline" className="w-full border-rose-500/50 text-rose-400 hover:bg-rose-500/10">
                <LogOut className="w-4 h-4" /> I'm Out Today
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Upcoming Tasks" className="md:col-span-1">
        <div className="space-y-3">
          {data.tasks.filter((t: any) => t.status !== 'done').slice(0, 5).map((task: any) => (
            <div key={task.id} className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{task.title}</p>
                <p className="text-[10px] text-slate-400">Due: {task.due_date}</p>
              </div>
              <div className={cn(
                "w-2 h-2 rounded-full",
                task.status === 'todo' ? 'bg-slate-500' : 'bg-blue-400'
              )} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="AI Activity Summary" icon={Zap} className="md:col-span-2">
        <div className="text-sm text-slate-300 leading-relaxed prose prose-invert max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          <Markdown>{data.summary || "Generating activity summary..."}</Markdown>
        </div>
      </Card>

      {showOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Absence" className="w-full max-w-md">
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Let the team know why you'll be missing today's session.</p>
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Reason for absence..."
                value={outReason}
                onChange={(e) => setOutReason(e.target.value)}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowOut(false)}>Cancel</Button>
                <Button onClick={handleImOut}>Submit</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function TeamsView({ teams, members, onRefresh, currentUser }: any) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [newTeam, setNewTeam] = useState({ name: '', number: '' });
  const [newMember, setNewMember] = useState({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });

  const isAdmin = currentUser?.role === 'President' || currentUser?.is_board;

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Reset password for ${email}? They will need to set it up again on next login.`)) return;
    await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    alert('Password reset successfully.');
  };

  const handleAddTeam = async () => {
    const url = editingTeam ? `/api/teams/${editingTeam.id}` : '/api/teams';
    const method = editingTeam ? 'PATCH' : 'POST';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTeam)
    });
    setShowAddTeam(false);
    setEditingTeam(null);
    setNewTeam({ name: '', number: '' });
    onRefresh();
  };

  const handleDeleteTeam = async (id: number) => {
    if (!confirm("Are you sure? This will delete the team.")) return;
    await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleDeleteMember = async (id: number) => {
    if (!confirm("Are you sure? This will delete the member.")) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleAddMember = async () => {
    await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMember)
    });
    setShowAddMember(false);
    onRefresh();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-white">Teams</h3>
        <Button onClick={() => setShowAddTeam(true)}><Plus className="w-4 h-4" /> Add Team</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team: any) => (
          <Card key={team.id} title={`${team.name} #${team.number}`} icon={Award}>
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-2 mb-4">
                <p className="text-xs text-slate-400 uppercase font-bold">Members</p>
                <div className="flex flex-wrap gap-2">
                  {members.filter((m: any) => m.team_id === team.id).map((m: any) => (
                    <div key={m.id} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white">
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2 pt-4 border-t border-white/5">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 h-8 text-[10px]"
                    onClick={() => {
                      setEditingTeam(team);
                      setNewTeam({ name: team.name, number: team.number });
                      setShowAddTeam(true);
                    }}
                  >
                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                    onClick={() => handleDeleteTeam(team.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mt-12">
        <h3 className="text-xl font-display font-bold text-white">All Members</h3>
        <Button onClick={() => setShowAddMember(true)}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Team</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Board</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Scopes</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {members.map((m: any) => (
              <tr key={m.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-white font-medium">{m.name}</td>
                <td className="px-6 py-4 text-sm text-slate-400">{m.team_name || 'N/A'}</td>
                <td className="px-6 py-4 text-sm text-slate-400">{m.role}</td>
                <td className="px-6 py-4">
                  {m.is_board ? (
                    <span className="px-2 py-1 bg-accent/20 text-accent text-[10px] font-bold rounded-md uppercase">Yes</span>
                  ) : (
                    <span className="px-2 py-1 bg-slate-800 text-slate-500 text-[10px] font-bold rounded-md uppercase">No</span>
                  )}
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {JSON.parse(m.scopes).join(', ') || 'None'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <button 
                        onClick={() => handleResetPassword(m.email)}
                        className="p-2 text-slate-500 hover:text-accent transition-colors"
                        title="Reset Password"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => handleDeleteMember(m.id)}
                        className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals (Simplified) */}
      {showAddTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingTeam ? "Edit Team" : "Add New Team"} className="w-full max-w-md">
            <div className="space-y-4">
              <Input placeholder="Team Name (e.g. CyberKnights)" value={newTeam.name} onChange={(e: any) => setNewTeam({...newTeam, name: e.target.value})} />
              <Input placeholder="Team Number (e.g. 12345)" value={newTeam.number} onChange={(e: any) => setNewTeam({...newTeam, number: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowAddTeam(false); setEditingTeam(null); setNewTeam({ name: '', number: '' }); }}>Cancel</Button>
                <Button onClick={handleAddTeam}>{editingTeam ? "Save Changes" : "Create Team"}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Add New Member" className="w-full max-w-md">
            <div className="space-y-4">
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newMember.team_id}
                onChange={(e: any) => setNewMember({...newMember, team_id: e.target.value})}
              />
              <Input placeholder="Full Name" value={newMember.name} onChange={(e: any) => setNewMember({...newMember, name: e.target.value})} />
              <Input placeholder="Role (e.g. Lead Programmer)" value={newMember.role} onChange={(e: any) => setNewMember({...newMember, role: e.target.value})} />
              <Input placeholder="Email" value={newMember.email} onChange={(e: any) => setNewMember({...newMember, email: e.target.value})} />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={newMember.is_board} onChange={(e) => setNewMember({...newMember, is_board: e.target.checked})} />
                Board Member (Admin)
              </label>
              {newMember.is_board && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-bold uppercase">Scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {['attendance', 'budget', 'tasks'].map(s => (
                      <button 
                        key={s}
                        onClick={() => {
                          const scopes = newMember.scopes.includes(s as never) 
                            ? newMember.scopes.filter(x => x !== s) 
                            : [...newMember.scopes, s];
                          setNewMember({...newMember, scopes: scopes as never[]});
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                          newMember.scopes.includes(s as never) ? "bg-accent border-accent text-primary" : "border-white/10 text-slate-400"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAddMember(false)}>Cancel</Button>
                <Button onClick={handleAddMember}>Add Member</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AttendanceView({ members, attendance, onRefresh, setLoading }: any) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const getStatus = (memberId: number) => {
    return attendance.find((r: any) => r.member_id === memberId && r.date === selectedDate)?.status || '-';
  };

  const setStatus = async (memberId: number, status: string) => {
    setLoading(true);
    try {
      await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: selectedDate, 
          records: [{ member_id: memberId, status: status === '-' ? null : status }] 
        })
      });
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const markAll = async (status: string) => {
    setLoading(true);
    try {
      const records = members.map((m: any) => ({ member_id: m.id, status }));
      await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, records })
      });
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between glass p-6 rounded-2xl border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-accent/20 rounded-xl text-accent">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-white">Daily Attendance</h3>
            <p className="text-xs text-slate-400">Mark who's here for the session</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            type="date" 
            className="w-48" 
            value={selectedDate} 
            onChange={(e: any) => setSelectedDate(e.target.value)} 
          />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => markAll('P')}>All Present</Button>
            <Button size="sm" variant="outline" onClick={() => markAll('A')} className="border-rose-500/50 text-rose-400">All Absent</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m: any) => {
          const status = getStatus(m.id);
          return (
            <Card key={m.id} className={cn(
              "transition-all",
              status === 'P' ? "border-emerald-500/30 bg-emerald-500/5" :
              status === 'A' ? "border-rose-500/30 bg-rose-500/5" :
              "border-white/5"
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{m.name}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{m.role}</p>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setStatus(m.id, 'P')}
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center transition-all",
                      status === 'P' ? "bg-emerald-500 text-primary" : "bg-white/5 text-slate-400 hover:bg-white/10"
                    )}
                  >
                    P
                  </button>
                  <button 
                    onClick={() => setStatus(m.id, 'A')}
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center transition-all",
                      status === 'A' ? "bg-rose-500 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                    )}
                  >
                    A
                  </button>
                  <button 
                    onClick={() => setStatus(m.id, 'L')}
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center transition-all",
                      status === 'L' ? "bg-amber-500 text-primary" : "bg-white/5 text-slate-400 hover:bg-white/10"
                    )}
                  >
                    L
                  </button>
                  <button 
                    onClick={() => setStatus(m.id, '-')}
                    className="w-8 h-8 rounded flex items-center justify-center bg-white/5 text-slate-400 hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TasksView({ tasks, teams, members, onRefresh, currentUser }: any) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isBoardTask, setIsBoardTask] = useState(false);
  const [newTask, setNewTask] = useState({ team_id: '', title: '', description: '', assigned_to: '', due_date: '' });
  const [filterTeam, setFilterTeam] = useState('all');

  const isAdmin = currentUser?.role === 'President' || currentUser?.is_board;

  const handleAddTask = async () => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTask, is_board: isBoardTask ? 1 : 0 })
    });
    setShowAddTask(false);
    onRefresh();
  };

  const filteredTasks = tasks.filter((t: any) => {
    const boardCheck = t.is_board ? isAdmin : true;
    const teamCheck = filterTeam === 'all' || t.team_id?.toString() === filterTeam;
    return boardCheck && teamCheck;
  });

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    onRefresh();
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  // Analytics Data
  const completionTrends = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map(date => ({
      date: format(new Date(date), 'MMM dd'),
      completed: tasks.filter((t: any) => t.status === 'done' && t.completed_at?.startsWith(date)).length
    }));
  }, [tasks]);

  const memberCapacity = useMemo(() => {
    return members.map((m: any) => {
      const memberTasks = tasks.filter((t: any) => t.assigned_to === m.id);
      return {
        name: m.name,
        total: memberTasks.length,
        todo: memberTasks.filter((t: any) => t.status === 'todo').length,
        inProgress: memberTasks.filter((t: any) => t.status === 'in-progress').length,
        done: memberTasks.filter((t: any) => t.status === 'done').length,
      };
    }).filter(m => m.total > 0);
  }, [tasks, members]);

  const avgCompletionTime = useMemo(() => {
    const completedTasks = tasks.filter((t: any) => t.status === 'done' && t.completed_at && t.created_at);
    if (completedTasks.length === 0) return 0;
    const totalTime = completedTasks.reduce((acc: number, t: any) => {
      const start = new Date(t.created_at).getTime();
      const end = new Date(t.completed_at).getTime();
      return acc + (end - start);
    }, 0);
    return (totalTime / completedTasks.length / (1000 * 60 * 60 * 24)).toFixed(1); // in days
  }, [tasks]);

  const columns = [
    { id: 'todo', label: 'To Do', color: 'bg-slate-500' },
    { id: 'in-progress', label: 'In Progress', color: 'bg-blue-400' },
    { id: 'done', label: 'Done', color: 'bg-emerald-400' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <Select 
            className="w-48"
            options={[
              { label: 'All Teams', value: 'all' },
              ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id.toString() }))
            ]}
            value={filterTeam} 
            onChange={(e: any) => setFilterTeam(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setShowAnalytics(!showAnalytics)}>
            <TrendingUp className="w-4 h-4 mr-2" />
            {showAnalytics ? "Board View" : "Analytics"}
          </Button>
        </div>
        <Button onClick={() => setShowAddTask(true)}><Plus className="w-4 h-4" /> New Task</Button>
      </div>

      {showAnalytics ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Completion Trend (Last 7 Days)" icon={TrendingUp}>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={completionTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Member Capacity" icon={Users}>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberCapacity} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="todo" stackId="a" fill="#64748b" />
                  <Bar dataKey="inProgress" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="done" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Avg. Completion Time</p>
                <p className="text-4xl font-display font-bold text-white">{avgCompletionTime} <span className="text-sm font-normal text-slate-500">days</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Active Tasks</p>
                <p className="text-4xl font-display font-bold text-blue-400">{tasks.filter(t => t.status !== 'done').length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Success Rate</p>
                <p className="text-4xl font-display font-bold text-emerald-400">
                  {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
        {columns.map(col => (
          <div key={col.id} className="bg-secondary/30 rounded-2xl p-4 flex flex-col gap-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full", col.color)} />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">{col.label}</h4>
              <span className="ml-auto text-xs text-slate-500">{tasks.filter((t: any) => t.status === col.id).length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {filteredTasks.filter((t: any) => t.status === col.id).map((task: any) => (
                <div key={task.id} className={cn(
                  "glass p-4 rounded-xl border group",
                  task.is_board ? "border-accent/30 bg-accent/5" : "border-white/10"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-sm font-bold text-white">{task.title}</h5>
                    <div className="flex items-center gap-2">
                      {task.is_board && <Lock className="w-3 h-3 text-accent" />}
                      {isAdmin && (
                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{task.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-primary">
                        {members.find((m: any) => m.id === task.assigned_to)?.name.charAt(0) || '?'}
                      </div>
                      <span className="text-[10px] text-slate-500">{task.due_date}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {col.id !== 'todo' && <button onClick={() => updateStatus(task.id, 'todo')} className="p-1 hover:text-accent"><ChevronRight className="w-4 h-4 rotate-180" /></button>}
                      {col.id !== 'done' && <button onClick={() => updateStatus(task.id, col.id === 'todo' ? 'in-progress' : 'done')} className="p-1 hover:text-accent"><ChevronRight className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="New Task" className="w-full max-w-md">
            <div className="space-y-4">
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newTask.team_id}
                onChange={(e: any) => setNewTask({...newTask, team_id: e.target.value})}
              />
              <Input placeholder="Task Title" value={newTask.title} onChange={(e: any) => setNewTask({...newTask, title: e.target.value})} />
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Description"
                value={newTask.description}
                onChange={(e: any) => setNewTask({...newTask, description: e.target.value})}
              />
              <Select 
                options={[
                  { label: 'Assign To', value: '' },
                  ...members.map(m => ({ label: m.name, value: m.id }))
                ]} 
                value={newTask.assigned_to}
                onChange={(e: any) => setNewTask({...newTask, assigned_to: e.target.value})}
              />
              <Input type="date" value={newTask.due_date} onChange={(e: any) => setNewTask({...newTask, due_date: e.target.value})} />
              
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={isBoardTask} onChange={(e) => setIsBoardTask(e.target.checked)} />
                  Private Board Task
                </label>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAddTask(false)}>Cancel</Button>
                <Button onClick={handleAddTask}>Create Task</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BudgetView({ budget, teams, onRefresh }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ team_id: '', type: 'expense', amount: '', category: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  const handleAdd = async () => {
    await fetch('/api/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...newItem, amount: parseFloat(newItem.amount)})
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    await fetch(`/api/budget/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const totalIncome = budget.filter((i: any) => i.type === 'income').reduce((acc: number, i: any) => acc + i.amount, 0);
  const totalExpense = budget.filter((i: any) => i.type === 'expense').reduce((acc: number, i: any) => acc + i.amount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <p className="text-xs text-emerald-400 uppercase font-bold">Total Income</p>
          <p className="text-3xl font-display font-bold text-white">${totalIncome.toLocaleString()}</p>
        </Card>
        <Card className="bg-rose-500/10 border-rose-500/20">
          <p className="text-xs text-rose-400 uppercase font-bold">Total Expenses</p>
          <p className="text-3xl font-display font-bold text-white">${totalExpense.toLocaleString()}</p>
        </Card>
        <Card className="bg-accent/10 border-accent/20">
          <p className="text-xs text-accent uppercase font-bold">Net Balance</p>
          <p className="text-3xl font-display font-bold text-white">${(totalIncome - totalExpense).toLocaleString()}</p>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-white">Transaction History</h3>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Log Transaction</Button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {budget.map((item: any) => (
              <tr key={item.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-400">{item.date}</td>
                <td className="px-6 py-4 text-sm text-white font-medium">{item.description}</td>
                <td className="px-6 py-4 text-sm text-slate-400">{item.category}</td>
                <td className={cn(
                  "px-6 py-4 text-sm font-bold",
                  item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleDelete(item.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Transaction" className="w-full max-w-md">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant={newItem.type === 'income' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewItem({...newItem, type: 'income'})}
                >Income</Button>
                <Button 
                  variant={newItem.type === 'expense' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewItem({...newItem, type: 'expense'})}
                >Expense</Button>
              </div>
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newItem.team_id}
                onChange={(e: any) => setNewItem({...newItem, team_id: e.target.value})}
              />
              <Input placeholder="Amount" type="number" value={newItem.amount} onChange={(e: any) => setNewItem({...newItem, amount: e.target.value})} />
              <Input placeholder="Category (e.g. Parts, Registration)" value={newItem.category} onChange={(e: any) => setNewItem({...newItem, category: e.target.value})} />
              <Input placeholder="Description" value={newItem.description} onChange={(e: any) => setNewItem({...newItem, description: e.target.value})} />
              <Input type="date" value={newItem.date} onChange={(e: any) => setNewItem({...newItem, date: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Log Entry</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function OutreachView({ outreach, onRefresh }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '', location: '' });

  const handleAdd = async () => {
    await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...newEvent, hours: parseInt(newEvent.hours)})
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await fetch(`/api/outreach/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-white">Outreach Log</h3>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Log Event</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(outreach || []).map((event: any) => (
          <Card key={event.id} title={event.title} icon={Globe}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-slate-400">{event.location} • {event.date}</p>
                <p className="text-sm text-slate-300 mt-2">{event.description}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <p className="text-2xl font-display font-bold text-accent">{event.hours}h</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Logged</p>
                <button onClick={() => handleDelete(event.id)} className="text-slate-600 hover:text-rose-400 transition-colors mt-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Outreach Event" className="w-full max-w-md">
            <div className="space-y-4">
              <Input placeholder="Event Title" value={newEvent.title} onChange={(e: any) => setNewEvent({...newEvent, title: e.target.value})} />
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Description"
                value={newEvent.description}
                onChange={(e: any) => setNewEvent({...newEvent, description: e.target.value})}
              />
              <Input placeholder="Location" value={newEvent.location} onChange={(e: any) => setNewEvent({...newEvent, location: e.target.value})} />
              <Input placeholder="Hours" type="number" value={newEvent.hours} onChange={(e: any) => setNewEvent({...newEvent, hours: e.target.value})} />
              <Input type="date" value={newEvent.date} onChange={(e: any) => setNewEvent({...newEvent, date: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Log Event</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScoutView({ news, onRefresh }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-white">AI Scout: FTC & REV News</h3>
        <Button onClick={onRefresh} variant="outline"><Clock className="w-4 h-4" /> Refresh News</Button>
      </div>

      <Card className="min-h-[500px]">
        <div className="prose prose-invert max-w-none">
          {news ? (
            <Markdown>{news}</Markdown>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400">Scouring the web for FTC updates...</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function CommunicationView({ communications, onRefresh }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newComm, setNewComm] = useState({ recipient: '', subject: '', body: '', type: 'email', date: format(new Date(), 'yyyy-MM-dd HH:mm') });

  const handleAdd = async () => {
    await fetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComm)
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this log?")) return;
    await fetch(`/api/communications/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-display font-bold text-white">Communication Log</h3>
        <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Log New Message</Button>
      </div>

      <div className="space-y-4">
        {communications.map((comm: any) => (
          <Card key={comm.id} className="relative overflow-hidden">
            <div className={cn(
              "absolute top-0 left-0 w-1 h-full",
              comm.type === 'email' ? 'bg-blue-500' : 'bg-accent'
            )} />
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    comm.type === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-accent/20 text-accent'
                  )}>{comm.type}</span>
                  <p className="text-xs text-slate-400">{comm.date}</p>
                </div>
                <h4 className="text-white font-bold text-lg">{comm.subject}</h4>
                <p className="text-sm text-slate-400 mb-3">To: {comm.recipient}</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{comm.body}</p>
              </div>
              <button onClick={() => handleDelete(comm.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Communication" className="w-full max-w-lg">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant={newComm.type === 'email' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewComm({...newComm, type: 'email'})}
                >Email</Button>
                <Button 
                  variant={newComm.type === 'announcement' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewComm({...newComm, type: 'announcement'})}
                >Announcement</Button>
              </div>
              <Input placeholder="Recipient (e.g. Team Parents, Sponsor Name)" value={newComm.recipient} onChange={(e: any) => setNewComm({...newComm, recipient: e.target.value})} />
              <Input placeholder="Subject" value={newComm.subject} onChange={(e: any) => setNewComm({...newComm, subject: e.target.value})} />
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-48"
                placeholder="Message Body"
                value={newComm.body}
                onChange={(e: any) => setNewComm({...newComm, body: e.target.value})}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Log Message</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChatView({ messages, members, currentUser, socket }: any) {
  const [content, setContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!content.trim() || !socket) return;
    
    // Convert mentions to searchable format
    let finalContent = content;
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex);
    if (matches) {
      matches.forEach(m => {
        const name = m.slice(1);
        const member = members.find((mem: any) => mem.name.toLowerCase() === name.toLowerCase());
        if (member) {
          finalContent = finalContent.replace(m, `@[${member.name}]`);
        }
      });
    }

    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent
    }));
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && showMentions && filteredMentions.length > 0) {
      e.preventDefault();
      const m = filteredMentions[0];
      const parts = content.split(' ');
      parts.pop();
      setContent([...parts, `@${m.name} `].join(' '));
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onContentChange = (e: any) => {
    const val = e.target.value;
    setContent(val);
    const lastWord = val.split(' ').pop();
    if (lastWord.startsWith('@')) {
      setMentionSearch(lastWord.slice(1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const filteredMentions = members.filter((m: any) => m.name.toLowerCase().includes(mentionSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] glass rounded-2xl overflow-hidden">
      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar">
        {messages.map((msg: any) => (
          <div key={msg.id} className={cn("flex flex-col", msg.sender_id === currentUser.id ? "items-end" : "items-start")}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-500">{msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name}</span>
              <span className="text-[10px] text-slate-600">{format(new Date(msg.timestamp), 'HH:mm')}</span>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-2xl max-w-[80%] text-sm",
              msg.sender_id === currentUser.id ? "bg-accent text-primary font-medium" : "bg-white/5 text-white border border-white/5"
            )}>
              {msg.content.split(/(@\[[^\]]+\])/).map((part: string, i: number) => {
                if (part.startsWith('@[') && part.endsWith(']')) {
                  const name = part.slice(2, -1);
                  return <span key={i} className="font-bold underline decoration-accent decoration-2 underline-offset-2">@{name}</span>;
                }
                return part;
              })}
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t border-white/5 bg-secondary/30 relative">
        {showMentions && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 glass rounded-xl border border-white/10 overflow-hidden w-48 shadow-2xl">
            {filteredMentions.slice(0, 5).map((m: any) => (
              <button 
                key={m.id}
                onClick={() => {
                  const parts = content.split(' ');
                  parts.pop();
                  setContent([...parts, `@${m.name} `].join(' '));
                  setShowMentions(false);
                }}
                className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-accent hover:text-primary transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea 
            className="flex-1 bg-primary border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors h-12 resize-none"
            placeholder="Type a message... use @ to mention"
            value={content}
            onChange={onContentChange}
            onKeyDown={handleKeyDown}
          />
          <Button onClick={handleSend} className="h-12 w-12 p-0"><Send className="w-5 h-5" /></Button>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ settings, members, onRefresh, currentUser }: any) {
  const [criteria, setCriteria] = useState(settings.excuse_criteria || '');
  const [showMemberEdit, setShowMemberEdit] = useState<any>(null);

  const isPresident = currentUser?.role === 'President';

  const handleSave = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'excuse_criteria', value: criteria })
    });
    onRefresh();
    alert('Settings saved');
  };

  const updateMember = async (id: number, data: any) => {
    await fetch(`/api/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    onRefresh();
    setShowMemberEdit(null);
  };

  return (
    <div className="max-w-4xl space-y-8">
      <Card title="AI Absence Evaluation" icon={Settings}>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Define the criteria Gemini should use to determine if an absence is excused.</p>
          <textarea 
            className="w-full bg-primary border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition-colors h-48 text-sm"
            placeholder="e.g. Excused if: sick with doctor note, family emergency, school event. Unexcused if: forgot, overslept, gaming..."
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <Button onClick={handleSave}>Save Criteria</Button>
        </div>
      </Card>

      {isPresident && (
        <Card title="Admin Delegation" icon={Users}>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Grant administrative scopes to board members.</p>
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Name</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Board</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Scopes</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {members.map((m: any) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-white">{m.name}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => updateMember(m.id, { ...m, is_board: m.is_board ? 0 : 1 })}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase",
                            m.is_board ? "bg-accent/20 text-accent" : "bg-slate-800 text-slate-500"
                          )}
                        >
                          {m.is_board ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {JSON.parse(m.scopes).join(', ') || 'None'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => setShowMemberEdit(m)}>Edit Scopes</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {showMemberEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={`Edit Scopes: ${showMemberEdit.name}`} className="w-full max-w-md">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['attendance', 'budget', 'tasks', 'admin'].map(s => {
                  const currentScopes = JSON.parse(showMemberEdit.scopes);
                  const active = currentScopes.includes(s);
                  return (
                    <button 
                      key={s}
                      onClick={() => {
                        const next = active ? currentScopes.filter((x: string) => x !== s) : [...currentScopes, s];
                        setShowMemberEdit({ ...showMemberEdit, scopes: JSON.stringify(next) });
                      }}
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                        active ? "bg-accent border-accent text-primary" : "border-white/10 text-slate-400"
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowMemberEdit(null)}>Cancel</Button>
                <Button onClick={() => updateMember(showMemberEdit.id, showMemberEdit)}>Save Changes</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
