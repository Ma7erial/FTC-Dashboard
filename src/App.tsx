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
  UserCircle,
  Zap,
  Trash2,
  FileUp,
  FileText,
  Bolt,
  Code2,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Markdown from 'react-markdown';
import { format } from 'date-fns';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication } from './types';
import { fetchFTCNews, streamFTCNews, getAttendanceInsights, streamAttendanceInsights, checkExcuse, streamCheckExcuse, getActivitySummary, streamActivitySummary } from './services/aiService';
import { CodeView } from './components/CodeView';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to get CSS variable values
function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
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
  const accentColor = getCSSVariable('--color-accent');
  const primaryColor = getCSSVariable('--color-primary');
  
  const variants: any = {
    primary: {
      className: 'text-primary font-bold hover:brightness-90',
      style: { backgroundColor: accentColor || '#fbbf24', color: primaryColor || '#0f172a' }
    },
    secondary: 'bg-slate-800 text-white hover:bg-slate-700',
    outline: {
      className: 'text-accent hover:opacity-80 border border-current font-bold',
    },
    ghost: 'text-slate-400 hover:text-white hover:bg-white/5'
  };
  
  const variantConfig = variants[variant as keyof typeof variants];
  const isObject = typeof variantConfig === 'object' && !Array.isArray(variantConfig);
  
  return (
    <button 
      className={cn(
        "px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50", 
        isObject ? variantConfig.className : variantConfig,
        className
      )}
      style={isObject ? variantConfig.style : undefined}
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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingTarget, setAiLoadingTarget] = useState<string | null>(null);
  const [colorVersion, setColorVersion] = useState(0);

  // --- Components ---

  const ThinkingIndicator = () => {
    const text = "Thinking...";
    return (
      <div className="flex gap-1 items-center">
        {text.split('').map((char, i) => (
          <motion.span
            key={i}
            animate={{ 
              opacity: [0.3, 1, 0.3],
              scale: [0.95, 1.05, 0.95]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut"
            }}
            className="text-accent font-bold"
          >
            {char}
          </motion.span>
        ))}
      </div>
    );
  };

  // helper that uses our service; can force a refresh bypassing the 24h cache
  // this implementation streams the response so the UI updates as tokens arrive
  const updateNews = async (force: boolean = false) => {
    const CACHE_KEY = 'ftcNewsCache';
    const TS_KEY = 'ftcNewsTimestamp';

    // check local cache first
    if (!force && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(TS_KEY);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (age < 24 * 60 * 60 * 1000) {
          setNews(cached);
          return;
        }
      }
    }

    setIsAiLoading(true);
    setAiLoadingTarget('news');
    setNews(""); // Clear old news to show "Thinking..."
    try {
      let aggregate = '';
      let receivedFirstChunk = false;
      await streamFTCNews(force, (chunk) => {
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
        }
        aggregate += chunk;
        setNews(aggregate);
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, aggregate);
        localStorage.setItem(TS_KEY, Date.now().toString());
      }
    } catch (err) {
      console.error('Error updating news:', err);
      setNews('Failed to fetch latest news. Please check your connection.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  // WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Apply custom colors
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      const myTeam = teams.find(t => t.id === currentUser.team_id);
      
      const accent = currentUser.accent_color || myTeam?.accent_color || '#fbbf24';
      const primary = currentUser.primary_color || myTeam?.primary_color || '#0f172a';
      const text = currentUser.text_color || myTeam?.text_color || '#f1f5f9'; // slate-100 default

      const root = document.documentElement;
      root.style.setProperty('--color-accent', accent);
      root.style.setProperty('--color-primary', primary);
      root.style.setProperty('--color-text-base', text);
      
      // Secondary color is usually a slightly lighter version of primary
      // For simplicity, we can just use the same or a slightly transparent version
      root.style.setProperty('--color-secondary', primary + 'CC'); // Adding transparency
    } else {
      // Reset to defaults
      const root = document.documentElement;
      root.style.setProperty('--color-accent', '#fbbf24');
      root.style.setProperty('--color-primary', '#0f172a');
      root.style.setProperty('--color-text-base', '#f1f5f9');
      root.style.setProperty('--color-secondary', '#1e293b');
    }
  }, [currentUser, teams, isLoggedIn]);

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
        } else if (msg.type === 'message_deleted') {
          setMessages(prev => 
            prev.map(m => m.id === msg.id ? { ...m, deleted_at: msg.deleted_at } : m)
          );
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

  const updateInsights = async () => {
    if (attendance.length === 0 || members.length === 0) return;
    setIsAiLoading(true);
    setAiLoadingTarget('insights');
    setInsights("");
    let aggInsights = '';
    try {
      await streamAttendanceInsights(attendance, members, (chunk) => {
        aggInsights += chunk;
        setInsights(aggInsights);
      });
    } catch (err) {
      console.error('Error updating insights:', err);
      setInsights('Failed to generate insights.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  const updateSummary = async (force: boolean = false) => {
    const CACHE_KEY = 'ftcSummaryCache';
    const TS_KEY = 'ftcSummaryTimestamp';
    const COUNT_KEY = 'ftcSummaryItemCount';

    const currentItemCount = (tasks?.length || 0) + (messages?.length || 0) + (budget?.length || 0);

    if (!force && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(TS_KEY);
      const prevCount = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10);
      
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        const newItemCount = currentItemCount - prevCount;
        
        // Cache for 10 minutes unless 3+ new items arrived
        if (age < 10 * 60 * 1000 && newItemCount < 3) {
          setSummary(cached);
          return;
        }
      }
    }

    if (!currentUser) return;

    setIsAiLoading(true);
    setAiLoadingTarget('summary');
    setSummary("");
    try {
      let aggSummary = '';
      await streamActivitySummary({ 
        tasks, 
        messages, 
        budget,
        userScope: { role: currentUser.role, is_board: currentUser.is_board, scopes: currentUser.scopes }
      }, (chunk) => {
        aggSummary += chunk;
        setSummary(aggSummary);
      });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, aggSummary);
        localStorage.setItem(TS_KEY, Date.now().toString());
        localStorage.setItem(COUNT_KEY, currentItemCount.toString());
      }
    } catch (err) {
      console.error('Error updating summary:', err);
      setSummary('Failed to generate summary.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { cache: 'no-store' });
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
      if (Array.isArray(m)) {
        console.log(`[Data Fetch] Received ${m.length} members`);
        setMembers(m);
        if (currentUser) {
          const updatedUser = m.find((member: any) => member.id === currentUser.id);
          console.log(`[Data Fetch] Updating currentUser:`, updatedUser);
          if (updatedUser) setCurrentUser(updatedUser);
        }
      }
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
      updateNews();
      // Insights and Summary are now manual or context-specific
      if (currentUser) {
        updateSummary();
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
        scopes: ['attendance', 'budget', 'tasks', 'admin']
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
      let scopes = currentUser.scopes;
      // Handle double-stringification if it somehow happened in the DB
      while (typeof scopes === 'string') {
        const parsed = JSON.parse(scopes);
        if (typeof parsed === 'string') scopes = parsed;
        else { scopes = parsed; break; }
      }
      return Array.isArray(scopes) ? scopes.includes(scope) : false;
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
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'comm', label: 'Communication', icon: Mail },
    { id: 'chat', label: 'Messaging', icon: MessageSquare },
    { id: 'scout', label: 'AI Scout', icon: Newspaper },
    { id: 'profile', label: 'My Profile', icon: UserCircle },
    { id: 'settings', label: 'Admin Settings', icon: Settings, scope: 'admin' },
  ];

  const renderContent = () => {
    const viewProps = {
      teams, members, attendance, tasks, budget, outreach, communications, 
      messages, settings, hiddenDates, currentUser, onRefresh: fetchData, setLoading,
      insights, news, summary, socket, hasScope,
      isAiLoading, setIsAiLoading, ThinkingIndicator, aiLoadingTarget,
      colorVersion, setColorVersion,
      // give child views a way to explicitly refresh the AI news cache
      refreshNews: () => updateNews(true),
      updateInsights,
      updateSummary: () => updateSummary(true)
    };
    switch (activeTab) {
      case 'dashboard': return <DashboardView {...viewProps} data={{ attendance, tasks, budget, outreach, insights, news, summary, members }} />;
      case 'teams': return <TeamsView {...viewProps} />;
      case 'attendance': return <AttendanceView {...viewProps} />;
      case 'tasks': return <TasksView {...viewProps} />;
      case 'budget': return <BudgetView {...viewProps} />;
      case 'outreach': return <OutreachView {...viewProps} />;
      case 'code': return <CodeView {...viewProps} />;
      case 'comm': return <CommunicationView {...viewProps} />;
      case 'chat': return <ChatView {...viewProps} />;
      case 'scout': return <ScoutView {...viewProps} />;
      case 'profile': return <ProfileView {...viewProps} />;
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
                <Bolt className="text-primary w-10 h-10" />
              </div>
              <h1 className="text-3xl font-display font-bold text-white">FTC Dashboard</h1>
              <p className="text-slate-400 text-center">
                {needsSetup ? "Set your new password to continue" : "Sign in to access club data."}
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
          width: isSidebarOpen ? 280 : 80
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "bg-secondary border-r border-white/5 flex flex-col z-40",
          window.innerWidth <= 768 ? "fixed inset-y-0 left-0 shadow-xl" : "relative"
        )}
        style={{
          transform: window.innerWidth <= 768 && !isSidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.3s ease-in-out'
        }}
      >
        <div className="p-4 sm:p-6 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center gold-glow flex-shrink-0">
            <Bolt className="text-primary w-6 h-6" />
          </div>
          {isSidebarOpen && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-lg sm:text-xl font-display font-bold text-white whitespace-nowrap"
            >
              FTC Dashboard
            </motion.h1>
          )}
        </div>

        <nav className="flex-1 px-3 sm:px-4 space-y-1 sm:space-y-2 mt-4 overflow-y-auto custom-scrollbar">
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

        <div className="p-3 sm:p-4 border-t border-white/5 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-3 p-2 sm:p-3">
            <button 
              onClick={() => setActiveTab('profile')}
              className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-primary font-bold text-xs hover:ring-2 hover:ring-accent-hover transition-all flex-shrink-0"
            >
              {currentUser?.name.charAt(0)}
            </button>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentUser?.name}</p>
                <button onClick={handleLogout} className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 transition-colors">
                  <LogOut className="w-3 h-3" /> Sign Out
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center gap-3 p-2 sm:p-3 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isSidebarOpen ? <X className="w-5 h-5 flex-shrink-0" /> : <Menu className="w-5 h-5 flex-shrink-0" />}
            {isSidebarOpen && <span className="text-sm">Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-primary custom-scrollbar relative h-screen">
        <header className="sticky top-0 z-20 glass px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-400 hover:text-white md:hidden flex-shrink-0"
              title="Toggle sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-white capitalize truncate">{activeTab.replace('-', ' ')}</h2>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
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

        <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 min-h-0"
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

function DashboardView({ data, currentUser, onRefresh, settings, setLoading, insights, updateInsights, isAiLoading, setIsAiLoading, ThinkingIndicator, updateSummary, colorVersion }: any) {
  const [showOut, setShowOut] = useState(false);
  const [outReason, setOutReason] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const myStatus = data.attendance?.find((r: any) => r.member_id === currentUser?.id && r.date === today);

  const handleSelfReport = async (status: string, reason?: string) => {
    setLoading(true);
    try {
      let finalStatus = status;
      let aiNote = '';
      
      if (status === 'O' && reason) {
        setIsAiLoading(true);
        await streamCheckExcuse(reason, settings.excuse_criteria, (chunk) => {
          aiNote += chunk;
        });
        setIsAiLoading(false);
        const isExcused = aiNote.toUpperCase().includes("EXCUSED") && !aiNote.toUpperCase().includes("UNEXCUSED");
        finalStatus = isExcused ? 'E' : 'U';
      }

      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          records: [{ member_id: currentUser.id, status: finalStatus, reason }]
        })
      });
      if (res.ok) {
        setShowOut(false);
        onRefresh();
        if (aiNote) alert(`Absence logged. AI Note: ${aiNote}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const totalBudget = data.budget?.reduce((acc: number, item: any) => 
    item.type === 'income' ? acc + item.amount : acc - item.amount, 0
  ) || 0;

  const todayAttendance = data.attendance?.filter((r: any) => r.date === today) || [];
  const attendanceRate = todayAttendance.length > 0
    ? (todayAttendance.filter((r: any) => r.status === 'P' || r.status === 'L').length / (data.members?.length || 1) * 100).toFixed(0)
    : (data.attendance?.filter((r: any) => r.status === 'P').length / Math.max(1, data.attendance?.length || 0) * 100).toFixed(0);

  const activeTasks = data.tasks?.filter((t: any) => t.status !== 'done').length || 0;

  const chartData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return format(d, 'yyyy-MM-dd');
    });

    return last14Days.map(date => ({
      date: format(new Date(date), 'MMM dd'),
      count: data.attendance?.filter((r: any) => r.date === date && (r.status === 'P' || r.status === 'L')).length || 0
    }));
  }, [data.attendance, colorVersion]);

  // Get dynamic colors for charts
  const accentColor = getCSSVariable('--color-accent') || '#fbbf24';
  const secondaryColor = getCSSVariable('--color-secondary') || '#1e293b';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 pb-8 sm:pb-20">
      <Card title="Club Health" icon={TrendingUp} className="lg:col-span-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Attendance {todayAttendance.length > 0 ? '(Today)' : '(Avg)'}</p>
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
        
        <div className="mt-6 h-64 min-h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: secondaryColor, border: '1px solid #ffffff20', borderRadius: '12px' }}
                itemStyle={{ color: accentColor }}
              />
              <Line type="monotone" dataKey="count" stroke={accentColor} strokeWidth={3} dot={{ fill: accentColor, strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-8 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Attendance Insights</h4>
            </div>
            <Button variant="outline" size="sm" onClick={() => updateInsights()} disabled={isAiLoading}>
              <Zap className="w-3 h-3 mr-1" /> {insights ? "Refresh Insights" : "Generate Insights"}
            </Button>
          </div>
          <div className="text-sm text-slate-300 leading-relaxed prose prose-invert max-w-none">
            {isAiLoading && !insights ? (
              <ThinkingIndicator />
            ) : insights ? (
              <Markdown>{insights}</Markdown>
            ) : (
              <p className="text-xs text-slate-500 italic">Click generate to analyze attendance patterns and club health.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Personal Status" icon={User} className="md:col-span-1">
        <div className="space-y-4">
          {myStatus ? (
            <div className={cn(
              "p-4 rounded-xl border flex flex-col gap-2 transition-all",
              myStatus.status === 'P' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              myStatus.status === 'A' ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
              myStatus.status === 'L' ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
              "bg-blue-500/10 border-blue-500/30 text-blue-400"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4" />
                  <span className="text-sm font-bold">Today: {
                    myStatus.status === 'P' ? 'Present' : 
                    myStatus.status === 'A' ? 'Absent' : 
                    myStatus.status === 'E' ? 'Excused' : 
                    myStatus.status === 'L' ? 'Late' : 'Other'
                  }</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleSelfReport('-')} className="p-1 h-auto text-[10px] opacity-50 hover:opacity-100">Reset</Button>
              </div>
              {myStatus.reason && <p className="text-xs italic opacity-80">"{myStatus.reason}"</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Mark your status for today's session:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => handleSelfReport('P')} variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" disabled={isAiLoading}>
                  <CheckSquare className="w-4 h-4" /> I'm Here
                </Button>
                <Button onClick={() => handleSelfReport('L')} variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" disabled={isAiLoading}>
                  <Clock className="w-4 h-4" /> I'm Late
                </Button>
              </div>
              <Button onClick={() => setShowOut(true)} variant="secondary" className="w-full" disabled={isAiLoading}>
                <LogOut className="w-4 h-4" /> Log Absence
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
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Recent Activity</p>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-accent px-2" onClick={updateSummary} disabled={isAiLoading}>
            <Clock className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
        <div className="text-sm text-slate-300 leading-relaxed prose prose-invert max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          {isAiLoading && !data.summary ? (
            <ThinkingIndicator />
          ) : (
            <Markdown>{data.summary || "No summary available."}</Markdown>
          )}
        </div>
      </Card>

      {showOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Absence" className="w-full max-w-md">
            <div className="space-y-4">
              <p className="text-sm text-slate-400">Let the team know why you'll be missing today's session.</p>
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24 disabled:opacity-50"
                placeholder="Reason for absence..."
                value={outReason}
                onChange={(e) => setOutReason(e.target.value)}
                disabled={isAiLoading}
              />
              {isAiLoading && <div className="flex justify-center"><ThinkingIndicator /></div>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowOut(false)} disabled={isAiLoading}>Cancel</Button>
                <Button onClick={() => handleSelfReport('O', outReason)} disabled={isAiLoading || !outReason}>Submit</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function TeamsView({ teams, members, onRefresh, currentUser, hasScope }: any) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [newTeam, setNewTeam] = useState<any>({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
  const [newMember, setNewMember] = useState({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });

  const isAdmin = hasScope('admin');

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
    setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
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
    const url = editingMember ? `/api/members/${editingMember.id}` : '/api/members';
    const method = editingMember ? 'PATCH' : 'POST';
    
    // Robust scope handling
    let scopes = newMember.scopes;
    if (typeof scopes === 'string') {
      try {
        scopes = JSON.parse(scopes);
      } catch {
        scopes = [];
      }
    }

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newMember, scopes })
    });
    setShowAddMember(false);
    setEditingMember(null);
    setNewMember({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });
    onRefresh();
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Teams</h3>
        <Button onClick={() => {
          setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
          setShowAddTeam(true);
        }}><Plus className="w-4 h-4" /> Add Team</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
                {(team.accent_color || team.primary_color) && (
                  <div className="pt-2">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Team Branding</p>
                    <div className="flex gap-2">
                      {team.accent_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.accent_color }} title="Accent" />}
                      {team.primary_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.primary_color }} title="Primary" />}
                      {team.text_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.text_color }} title="Text" />}
                    </div>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2 pt-4 border-t border-white/5">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 h-8 text-[10px]"
                    onClick={() => {
                      setEditingTeam(team);
                      setNewTeam({ 
                        name: team.name, 
                        number: team.number,
                        accent_color: team.accent_color || '',
                        primary_color: team.primary_color || '',
                        text_color: team.text_color || ''
                      });
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

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between mt-12">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">All Members</h3>
        <Button onClick={() => setShowAddMember(true)}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
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
                  {(() => {
                    try {
                      const scopes = typeof m.scopes === 'string' ? JSON.parse(m.scopes) : m.scopes;
                      return Array.isArray(scopes) ? scopes.join(', ') : 'None';
                    } catch {
                      return 'None';
                    }
                  })()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <button 
                        onClick={() => {
                          setEditingMember(m);
                          let scopes = m.scopes;
                          try {
                            if (typeof scopes === 'string') scopes = JSON.parse(scopes);
                          } catch {
                            scopes = [];
                          }
                          setNewMember({ 
                            team_id: m.team_id || '', 
                            name: m.name, 
                            role: m.role, 
                            email: m.email, 
                            is_board: m.is_board === 1, 
                            scopes: Array.isArray(scopes) ? scopes : []
                          });
                          setShowAddMember(true);
                        }}
                        className="p-2 text-slate-500 hover:text-accent transition-colors"
                        title="Edit Member"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
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
              
              <div className="pt-2">
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">Team Branding (Default for members)</p>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.accent_color || '#fbbf24'} onChange={(e) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                    <Input placeholder="Accent Color (Yellow)" value={newTeam.accent_color} onChange={(e: any) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.primary_color || '#0f172a'} onChange={(e) => setNewTeam({...newTeam, primary_color: e.target.value})} />
                    <Input placeholder="Interface Color (Navy)" value={newTeam.primary_color} onChange={(e: any) => setNewTeam({...newTeam, primary_color: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.text_color || '#f1f5f9'} onChange={(e) => setNewTeam({...newTeam, text_color: e.target.value})} />
                    <Input placeholder="Text Color" value={newTeam.text_color} onChange={(e: any) => setNewTeam({...newTeam, text_color: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowAddTeam(false); setEditingTeam(null); setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' }); }}>Cancel</Button>
                <Button onClick={handleAddTeam}>{editingTeam ? "Save Changes" : "Create Team"}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingMember ? "Edit Member" : "Add New Member"} className="w-full max-w-md">
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
                    {['attendance', 'budget', 'tasks', 'admin'].map(s => (
                      <button 
                        key={s}
                        type="button"
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
                <Button variant="secondary" onClick={() => { setShowAddMember(false); setEditingMember(null); setNewMember({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] }); }}>Cancel</Button>
                <Button onClick={handleAddMember}>{editingMember ? "Save Changes" : "Add Member"}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AttendanceView({ members, attendance, onRefresh, setLoading, hasScope, insights, updateInsights, isAiLoading, ThinkingIndicator }: any) {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'history' | 'summary'>('grid');
  const [sessions, setSessions] = useState<string[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [calendarStart, setCalendarStart] = useState(0); // weeks from today
  const [showHideMenu, setShowHideMenu] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pendingChanges, setPendingChanges] = useState<Map<number, { date: string; status: string }>>(new Map());

  const isAdmin = hasScope('attendance');

  useEffect(() => {
    const fetchExtraData = async () => {
      const [sess, summ, hidden] = await Promise.all([
        fetch('/api/attendance/sessions').then(r => r.json()),
        fetch('/api/attendance/summary').then(r => r.json()),
        fetch('/api/hidden-dates').then(r => r.json())
      ]);
      if (Array.isArray(sess)) setSessions(sess);
      if (Array.isArray(summ)) setSummary(summ);
      if (Array.isArray(hidden)) setHiddenDates(hidden);
    };
    fetchExtraData();
  }, [attendance]);

  // Generate dates: 2-week chunks starting from today
  const visibleDates = useMemo(() => {
    const dates: string[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + calendarStart * 14);
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!hiddenDates.includes(dateStr)) {
        dates.push(dateStr);
      }
    }
    return dates;
  }, [calendarStart, hiddenDates]);

  // Check if there are more dates to load
  const hasMoreDates = useMemo(() => {
    const nextStartDate = new Date();
    nextStartDate.setDate(nextStartDate.getDate() + (calendarStart + 1) * 14);
    return nextStartDate < new Date(new Date().getFullYear() + 1, 0, 1); // Can load up to next year
  }, [calendarStart]);

  const getStatus = (memberId: number, date: string) => {
    const changeKey = memberId;
    if (pendingChanges.has(changeKey) && pendingChanges.get(changeKey)!.date === date) {
      return pendingChanges.get(changeKey)!.status;
    }
    return attendance.find((r: any) => r.member_id === memberId && r.date === date)?.status || '-';
  };

  const toggleStatus = async (memberId: number, date: string) => {
    if (!isAdmin) return;
    
    const current = getStatus(memberId, date);
    const statuses = ['-', 'P', 'L', 'E', 'U', 'S'];
    const nextIndex = (statuses.indexOf(current) + 1) % statuses.length;
    const nextStatus = statuses[nextIndex];

    // Optimistic update
    const changeKey = memberId;
    const newChanges = new Map(pendingChanges);
    newChanges.set(changeKey, { date, status: nextStatus });
    setPendingChanges(newChanges);
    setSavingStatus('saving');

    try {
      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date, 
          records: [{ member_id: memberId, status: nextStatus === '-' ? null : nextStatus }] 
        })
      });
      if (res.ok) {
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
        // Keep optimistic update, refresh data in background
        onRefresh();
      } else {
        setSavingStatus('idle');
        alert('Failed to save attendance');
      }
    } catch (error) {
      setSavingStatus('idle');
      alert('Error saving attendance');
    }
  };

  const hideDate = async (dateStr: string) => {
    setHiddenDates([...hiddenDates, dateStr]);
    try {
      await fetch('/api/hidden-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr })
      });
    } catch (error) {
      console.error('Error hiding date:', error);
      setHiddenDates(hiddenDates.filter(d => d !== dateStr));
    }
  };

  const unhideDate = async (dateStr: string) => {
    setHiddenDates(hiddenDates.filter(d => d !== dateStr));
    try {
      await fetch(`/api/hidden-dates/${dateStr}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error unhiding date:', error);
      setHiddenDates([...hiddenDates, dateStr]);
    }
  };

  const hideByDayOfWeek = async (dayIndex: number) => {
    // dayIndex: 0=Sunday, 1=Monday, ..., 6=Saturday
    const newHidden = [...hiddenDates];
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365); // Check past year too for cleanup
    
    for (let i = 0; i < 730; i++) { // Check ~2 years
      checkDate.setDate(checkDate.getDate() + 1);
      if (checkDate.getDay() === dayIndex) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        if (!newHidden.includes(dateStr)) {
          newHidden.push(dateStr);
        }
      }
    }
    
    setHiddenDates(newHidden);
    // Save all hidden dates
    for (const date of newHidden) {
      if (!hiddenDates.includes(date)) {
        await fetch('/api/hidden-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        }).catch(console.error);
      }
    }
  };

  const unhideByDayOfWeek = async (dayIndex: number) => {
    const newHidden = hiddenDates.filter(dateStr => {
      return new Date(dateStr).getDay() !== dayIndex;
    });
    
    setHiddenDates(newHidden);
    // Delete all removed dates
    for (const date of hiddenDates) {
      if (!newHidden.includes(date)) {
        await fetch(`/api/hidden-dates/${date}`, { method: 'DELETE' }).catch(console.error);
      }
    }
  };

  const hideAll = async () => {
    const allDates = new Set<string>();
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365);
    
    for (let i = 0; i < 730; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      allDates.add(format(checkDate, 'yyyy-MM-dd'));
    }
    
    const newHidden = Array.from(allDates);
    setHiddenDates(newHidden);
    for (const date of newHidden) {
      if (!hiddenDates.includes(date)) {
        await fetch('/api/hidden-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        }).catch(console.error);
      }
    }
  };

  const unhideAll = async () => {
    setHiddenDates([]);
    for (const date of hiddenDates) {
      await fetch(`/api/hidden-dates/${date}`, { method: 'DELETE' }).catch(console.error);
    }
  };

  const statusColors: any = {
    'P': 'bg-emerald-500 text-emerald-950',
    'L': 'bg-amber-500 text-amber-950',
    'E': 'bg-blue-500 text-blue-950',
    'U': 'bg-rose-500 text-rose-950',
    'S': 'bg-purple-500 text-purple-950',
    '-': 'bg-white/5 text-slate-500'
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderGrid = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gaps-2 sm:gap-3 items-center">
          <button 
            onClick={() => setCalendarStart(Math.max(0, calendarStart - 1))}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-slate-300"
            disabled={calendarStart === 0}
          >
            ← Previous
          </button>
          <span className="text-xs text-slate-400">
            {format(new Date(new Date().getTime() + calendarStart * 14 * 24 * 60 * 60 * 1000), 'MMM dd')} - {format(new Date(new Date().getTime() + (calendarStart * 14 + 13) * 24 * 60 * 60 * 1000), 'MMM dd')}
          </span>
          {hasMoreDates && (
            <button 
              onClick={() => setCalendarStart(calendarStart + 1)}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-slate-300"
            >
              Next →
            </button>
          )}
        </div>
        
        <div className="flex gap-2 items-center">
          {savingStatus !== 'idle' && (
            <div className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-white/5">
              {savingStatus === 'saving' && <Clock className="w-3 h-3 text-amber-400 animate-spin" />}
              {savingStatus === 'saved' && <Check className="w-3 h-3 text-emerald-400" />}
              <span className="text-slate-300">{savingStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
            </div>
          )}
          <button 
            onClick={() => setShowHideMenu(!showHideMenu)}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-slate-300 flex items-center gap-2"
            title="Show/hide dates"
          >
            {showHideMenu ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">Manage Dates</span>
          </button>
        </div>
      </div>

      {showHideMenu && (
        <div className="glass rounded-2xl p-4 border border-white/10 space-y-4">
          <h4 className="text-sm font-bold text-white">Hide/Show Meeting Dates</h4>
          
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 font-bold mb-2">By Day of Week</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {dayNames.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const isHidden = hiddenDates.some(d => new Date(d).getDay() === idx);
                      if (isHidden) {
                        unhideByDayOfWeek(idx);
                      } else {
                        hideByDayOfWeek(idx);
                      }
                    }}
                    className={cn(
                      "py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      hiddenDates.some(d => new Date(d).getDay() === idx)
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={hideAll}
                className="text-xs"
              >
                Hide All
              </Button>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={unhideAll}
                className="text-xs"
              >
                Show All
              </Button>
            </div>

            <div className="text-[10px] text-slate-500">
              {hiddenDates.length} dates hidden • Showing {visibleDates.length} dates
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase sticky left-0 bg-[#0f172a] z-10 min-w-[150px]">Member</th>
                {visibleDates.map(date => (
                  <th key={date} className="px-2 py-3 text-[10px] font-bold text-slate-400 uppercase text-center min-w-[40px] group relative">
                    <div className="text-center">
                      {format(new Date(date), 'MMM dd')}
                      <div className="text-[8px] text-slate-600">{format(new Date(date), 'EEE')}</div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => hideDate(date)}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-rose-500/20 text-rose-400 px-2 py-1 rounded whitespace-nowrap"
                        title="Hide this date"
                      >
                        Hide
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.map((m: any) => (
                <tr key={m.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-medium sticky left-0 bg-[#0f172a]/90 backdrop-blur-md z-10 border-r border-white/5">
                    {m.name}
                  </td>
                  {visibleDates.map(date => {
                    const status = getStatus(m.id, date);
                    return (
                      <td key={date} className="px-1 py-1 text-center">
                        <button
                          onClick={() => toggleStatus(m.id, date)}
                          disabled={!isAdmin}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all active:scale-90",
                            statusColors[status] || statusColors['-'],
                            !isAdmin && "cursor-default"
                          )}
                        >
                          {status}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="p-4 bg-white/5 border-t border-white/10 flex flex-wrap gap-4 text-[10px] font-bold uppercase rounded-b-2xl">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /> Present (P)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-500" /> Late (L)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /> Excused (E)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-rose-500" /> Unexcused (U)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-500" /> School Event (S)</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex gap-1 sm:gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        <button 
          onClick={() => setActiveSubTab('grid')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'grid' ? "bg-accent text-primary shadow-lg" : "text-slate-400 hover:text-white")}
        >
          Attendance Grid
        </button>
        <button 
          onClick={() => setActiveSubTab('history')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'history' ? "bg-accent text-primary shadow-lg" : "text-slate-400 hover:text-white")}
        >
          History
        </button>
        <button 
          onClick={() => setActiveSubTab('summary')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'summary' ? "bg-accent text-primary shadow-lg" : "text-slate-400 hover:text-white")}
        >
          Insights
        </button>
      </div>

      {activeSubTab === 'grid' && renderGrid()}
      
      {activeSubTab === 'history' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {sessions.length === 0 ? (
            <div className="col-span-full py-20 text-center glass rounded-2xl border border-white/5">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No attendance history found yet.</p>
            </div>
          ) : (
            sessions.map(date => {
              const records = attendance.filter((r: any) => r.date === date);
              const presentCount = records.filter((r: any) => r.status === 'P').length;
              return (
                <button 
                  key={date}
                  onClick={() => {
                    // Navigate to grid or just view info
                  }}
                  className="glass p-4 rounded-2xl border border-white/10 text-left hover:border-accent/50 transition-all group cursor-default"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-white/5 rounded-lg text-accent group-hover:bg-accent group-hover:text-primary transition-colors">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{format(new Date(date), 'EEE')}</span>
                  </div>
                  <p className="font-bold text-white mb-1">{format(new Date(date), 'MMM dd, yyyy')}</p>
                  <p className="text-xs text-slate-400">{presentCount} members present</p>
                </button>
              );
            })
          )}
        </div>
      )}

      {activeSubTab === 'summary' && (
        <div className="space-y-6">
          <Card title="Attendance Analysis" icon={Zap}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">Leverage AI to identify trends, missing members, and engagement levels.</p>
              <Button onClick={() => updateInsights()} disabled={isAiLoading}>
                <Zap className="w-4 h-4" /> {insights ? "Refresh Analysis" : "Generate Analysis"}
              </Button>
            </div>
            {(isAiLoading || insights) && (
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 prose prose-invert max-w-none">
                {isAiLoading && !insights ? <ThinkingIndicator /> : <Markdown>{insights}</Markdown>}
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Rate</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">P / A / L / E</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">History (Last 5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.map((m: any) => {
                  const rate = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
                  const last5 = attendance
                    .filter((r: any) => r.member_id === m.member_id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .reverse();

                  return (
                    <tr key={m.member_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{m.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase">{members.find((mem: any) => mem.id === m.member_id)?.role}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-sm font-bold text-white">{rate}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <span className="text-xs font-bold text-emerald-400" title="Present">{m.present}P</span>
                          <span className="text-xs font-bold text-rose-400" title="Absent">{m.absent}A</span>
                          <span className="text-xs font-bold text-amber-400" title="Late">{m.late}L</span>
                          <span className="text-xs font-bold text-blue-400" title="Excused">{m.excused}E</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {last5.map((r, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-2 h-2 rounded-full",
                                statusColors[r.status] || 'bg-slate-700'
                              )}
                              title={`${r.date}: ${r.status}`}
                            />
                          ))}
                          {last5.length === 0 && <span className="text-[10px] text-slate-600">No data</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      )}
    </div>
  );
}

function TasksView({ tasks, teams, members, onRefresh, currentUser, hasScope }: any) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isBoardTask, setIsBoardTask] = useState(false);
  const [newTask, setNewTask] = useState({ team_id: '', title: '', description: '', assigned_to: '', due_date: '' });
  const [filterTeam, setFilterTeam] = useState('all');

  const isAdmin = hasScope('admin');

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

  // Get dynamic colors for charts
  const secondaryColor = getCSSVariable('--color-secondary') || '#1e293b';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <Select 
            className="w-full sm:w-48"
            options={[
              { label: 'All Teams', value: 'all' },
              ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id.toString() }))
            ]}
            value={filterTeam} 
            onChange={(e: any) => setFilterTeam(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setShowAnalytics(!showAnalytics)} className="w-full sm:w-auto">
            <TrendingUp className="w-4 h-4 mr-2" />
            {showAnalytics ? "Board View" : "Analytics"}
          </Button>
        </div>
        <Button onClick={() => setShowAddTask(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> New Task</Button>
      </div>

      {showAnalytics ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Completion Trend (Last 7 Days)" icon={TrendingUp}>
            <div className="h-64 min-h-[250px] w-full mt-4">
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
            <div className="h-64 min-h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberCapacity} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: secondaryColor, border: 'none', borderRadius: '8px', color: '#fff' }}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 h-auto min-h-[600px] md:h-[calc(100vh-250px)]">
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

function BudgetView({ budget, teams, onRefresh, hasScope }: any) {
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

  const isAdmin = hasScope('budget');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
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

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Transaction History</h3>
        {isAdmin && <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Transaction</Button>}
      </div>

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
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
                  {isAdmin && (
                    <button onClick={() => handleDelete(item.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Outreach Log</h3>
        <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Event</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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

function ScoutView({ news, refreshNews, isAiLoading, ThinkingIndicator }: any) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">AI Scout: FTC & REV News</h3>
        <Button onClick={refreshNews} variant="outline" disabled={isAiLoading} className="w-full sm:w-auto"><Clock className="w-4 h-4 mr-1" /> Refresh News</Button>
      </div>

      <Card className="min-h-[500px]">
        <div className="prose prose-invert max-w-none">
          {isAiLoading && !news ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <ThinkingIndicator />
              <p className="text-slate-400">Scouring the web for FTC updates...</p>
            </div>
          ) : news ? (
            <Markdown>{news}</Markdown>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-slate-400">No news available. Click refresh to scout for updates.</p>
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Communication Log</h3>
        <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log New Message</Button>
      </div>

      <div className="space-y-3 sm:space-y-4">
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
  const [uploading, setUploading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sender_id', currentUser.id.toString());
    formData.append('sender_name', currentUser.name);
    formData.append('content', content);

    try {
      const response = await fetch('/api/messages/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setContent('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    try {
      await fetch(`/api/messages/${msgId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Delete error:', error);
    }
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

  const isImageFile = (filepath: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filepath);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] sm:h-[calc(100vh-180px)] glass rounded-2xl overflow-hidden">
      <div ref={scrollRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 custom-scrollbar">
        {messages.map((msg: any) => (
          <div key={msg.id} className={cn("flex flex-col group", msg.sender_id === currentUser.id ? "items-end" : "items-start")}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-500">{msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name}</span>
              <span className="text-[10px] text-slate-600">{format(new Date(msg.timestamp), 'HH:mm')}</span>
              {msg.sender_id === currentUser.id && !msg.deleted_at && (
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  className="text-[10px] text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete message"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            {msg.deleted_at ? (
              <div className={cn(
                "px-4 py-2 rounded-2xl max-w-[80%] text-sm italic",
                "bg-white/5 text-slate-400 border border-white/5"
              )}>
                {msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name} unsent a message
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-[80%]">
                {msg.file_path && isImageFile(msg.file_path) && (
                  <img 
                    src={msg.file_path} 
                    alt="uploaded" 
                    className="rounded-lg max-w-xs max-h-64 object-cover"
                  />
                )}
                {msg.file_path && !isImageFile(msg.file_path) && (
                  <a 
                    href={msg.file_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-accent/20 border border-accent/30 hover:bg-accent/30 transition-colors text-sm text-accent"
                  >
                    <FileText className="w-4 h-4" />
                    Download
                  </a>
                )}
                {msg.content && (
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm",
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
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="p-3 sm:p-4 border-t border-white/5 bg-secondary/30 relative">
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
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-10 sm:h-12 w-10 sm:w-12 p-0 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 bg-slate-800 text-white hover:bg-slate-700 flex-shrink-0"
            title="Attach file"
          >
            <FileUp className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
          <textarea 
            className="flex-1 bg-primary border border-white/10 rounded-xl px-3 sm:px-4 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors h-10 sm:h-12 resize-none"
            placeholder="Type a message... use @ to mention"
            value={content}
            onChange={onContentChange}
            onKeyDown={handleKeyDown}
            disabled={uploading}
          />
          <Button onClick={handleSend} disabled={uploading} className="h-10 sm:h-12 w-10 sm:w-12 p-0 flex-shrink-0"><Send className="w-4 sm:w-5 h-4 sm:h-5" /></Button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ currentUser, onRefresh, setLoading, hasScope, setColorVersion }: any) {
  const [name, setName] = useState(currentUser?.name || '');
  const [role, setRole] = useState(currentUser?.role || '');
  const [accentColor, setAccentColor] = useState(currentUser?.accent_color || '');
  const [primaryColor, setPrimaryColor] = useState(currentUser?.primary_color || '');
  const [textColor, setTextColor] = useState(currentUser?.text_color || '');

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setRole(currentUser.role || '');
      setAccentColor(currentUser.accent_color || '');
      setPrimaryColor(currentUser.primary_color || '');
      setTextColor(currentUser.text_color || '');
    }
  }, [currentUser]);

  // Apply color changes in real-time to the page
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) root.style.setProperty('--color-accent', accentColor);
    if (primaryColor) root.style.setProperty('--color-primary', primaryColor);
    if (textColor) root.style.setProperty('--color-text-base', textColor);
    
    // Trigger re-render of all components to pick up new CSS variables
    setColorVersion((v) => v + 1);
  }, [accentColor, primaryColor, textColor, setColorVersion]);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Ensure we send scopes as an array
      let currentScopes = currentUser.scopes;
      try {
        while (typeof currentScopes === 'string') {
          const parsed = JSON.parse(currentScopes);
          if (typeof parsed === 'string') currentScopes = parsed;
          else { currentScopes = parsed; break; }
        }
      } catch {
        currentScopes = [];
      }

      const res = await fetch(`/api/members/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          team_id: currentUser.team_id,
          name: name, 
          role: role, 
          email: currentUser.email,
          is_board: currentUser.is_board,
          scopes: currentScopes,
          accent_color: accentColor || undefined,
          primary_color: primaryColor || undefined,
          text_color: textColor || undefined
        })
      });
      if (res.ok) {
        await onRefresh();
        alert('Profile updated successfully!');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetColors = () => {
    setAccentColor('');
    setPrimaryColor('');
    setTextColor('');
  };

  const isAdmin = hasScope('admin');

  return (
    <div className="max-w-2xl space-y-6">
      <h3 className="text-xl font-display font-bold text-white">My Profile</h3>
      <Card title="Personal Information" icon={UserCircle}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Full Name</label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Role / Description</label>
            <Input value={role} onChange={(e: any) => setRole(e.target.value)} />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Accent (Yellow)</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={accentColor || '#fbbf24'} onChange={(e) => setAccentColor(e.target.value)} />
                <Input value={accentColor} onChange={(e: any) => setAccentColor(e.target.value)} placeholder="#fbbf24" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Interface (Navy)</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={primaryColor || '#0f172a'} onChange={(e) => setPrimaryColor(e.target.value)} />
                <Input value={primaryColor} onChange={(e: any) => setPrimaryColor(e.target.value)} placeholder="#0f172a" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">Text Color</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={textColor || '#f1f5f9'} onChange={(e) => setTextColor(e.target.value)} />
                <Input value={textColor} onChange={(e: any) => setTextColor(e.target.value)} placeholder="#f1f5f9" />
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <Button onClick={handleSave}>Save Changes</Button>
            <Button variant="secondary" onClick={resetColors}>Reset to Team Default</Button>
          </div>
        </div>
      </Card>
      
      <Card title="Account Details" className="opacity-70">
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Email: <span className="text-white">{currentUser?.email}</span></p>
          <p className="text-sm text-slate-400">Account Type: <span className="text-accent">{currentUser?.is_board ? 'Board Member' : 'Team Member'}</span></p>
          <p className="text-sm text-slate-400">Administrative Scopes: <span className="text-white">
            {(() => {
              try {
                let scopes = currentUser?.scopes;
                while (typeof scopes === 'string') {
                  const parsed = JSON.parse(scopes);
                  if (typeof parsed === 'string') scopes = parsed;
                  else { scopes = parsed; break; }
                }
                return Array.isArray(scopes) && scopes.length > 0 ? scopes.join(', ') : 'None';
              } catch {
                return 'None';
              }
            })()}
          </span></p>
        </div>
      </Card>
    </div>
  );
}

function SettingsView({ settings, members, onRefresh, currentUser }: any) {
  const [criteria, setCriteria] = useState(settings.excuse_criteria || '');
  const [maxTokensNews, setMaxTokensNews] = useState(settings.max_tokens_news || '1024');
  const [maxTokensAttendance, setMaxTokensAttendance] = useState(settings.max_tokens_attendance || '1024');
  const [maxTokensExcuse, setMaxTokensExcuse] = useState(settings.max_tokens_excuse || '512');
  const [maxTokensSummary, setMaxTokensSummary] = useState(settings.max_tokens_summary || '1024');
  const [showMemberEdit, setShowMemberEdit] = useState<any>(null);

  const isPresident = currentUser?.role === 'President';

  const handleSave = async () => {
    const payloads = [
      { key: 'excuse_criteria', value: criteria },
      { key: 'max_tokens_news', value: maxTokensNews },
      { key: 'max_tokens_attendance', value: maxTokensAttendance },
      { key: 'max_tokens_excuse', value: maxTokensExcuse },
      { key: 'max_tokens_summary', value: maxTokensSummary },
    ];

    for (const payload of payloads) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
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
          <p className="text-sm text-slate-400">Define the criteria the AI should use to determine if an absence is excused.</p>
          <textarea 
            className="w-full bg-primary border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition-colors h-48 text-sm"
            placeholder="e.g. Excused if: sick with doctor note, family emergency, school event. Unexcused if: forgot, overslept, gaming..."
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </Card>

      <Card title="AI Configuration (Max Tokens)" icon={Bolt}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">News Scout</label>
            <Input type="number" value={maxTokensNews} onChange={(e: any) => setMaxTokensNews(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Attendance Analysis</label>
            <Input type="number" value={maxTokensAttendance} onChange={(e: any) => setMaxTokensAttendance(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Excuse Checker</label>
            <Input type="number" value={maxTokensExcuse} onChange={(e: any) => setMaxTokensExcuse(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400 uppercase">Activity Summary</label>
            <Input type="number" value={maxTokensSummary} onChange={(e: any) => setMaxTokensSummary(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={handleSave}>Save AI Limits</Button>
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
                        {(() => {
                          try {
                            const scopes = typeof m.scopes === 'string' ? JSON.parse(m.scopes) : m.scopes;
                            return Array.isArray(scopes) ? scopes.join(', ') : 'None';
                          } catch {
                            return 'None';
                          }
                        })()}
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
                  const currentScopes = (() => {
                    try {
                      const parsed = typeof showMemberEdit.scopes === 'string' ? JSON.parse(showMemberEdit.scopes) : showMemberEdit.scopes;
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })();
                  const active = currentScopes.includes(s);
                  return (
                    <button 
                      key={s}
                      onClick={() => {
                        const next = active ? currentScopes.filter((x: string) => x !== s) : [...currentScopes, s];
                        setShowMemberEdit({ ...showMemberEdit, scopes: next });
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
