import React, { useState, useEffect, useMemo } from 'react';
import { 
  Code2, 
  Save, 
  GitBranch, 
  History, 
  Download, 
  Upload, 
  Plus, 
  Trash2,
  FileText,
  Clock,
  User,
  MessageSquare,
  ChevronDown,
  Check,
  AlertCircle,
  Loader
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useRef } from 'react';
import { format } from 'date-fns';
import { CodeFile, CodeCommit, Member, Team, CodeContent } from '../types';
import {
  getCodeFiles,
  createCodeFile,
  getCodeFileContent,
  saveDraft,
  commitToMain,
  getCommitHistory,
  getCommit,
  downloadCodeFile,
  deleteCodeFile
} from '../services/codeService';

interface CodeViewProps {
  teams: Team[];
  members: Member[];
  currentUser?: Member;
  onRefresh: () => void;
  setLoading: (loading: boolean) => void;
}

export const CodeView: React.FC<CodeViewProps> = ({ teams, members, currentUser, onRefresh, setLoading }) => {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFile | null>(null);
  const [currentBranch, setCurrentBranch] = useState<'main' | 'drafts'>('drafts');
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<CodeCommit[]>([]);
  const [fileContentObj, setFileContentObj] = useState<CodeContent | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePair, setComparePair] = useState<{ base?: number; head?: number }>({});
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFileLanguage, setNewFileLanguage] = useState('java');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [selectedCommit, setSelectedCommit] = useState<CodeCommit | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const diffEditorRef = useRef<any>(null);

  const canCommit = useMemo(() => {
    if (!fileContentObj) return false;
    const drafts = fileContentObj.content?.drafts || '';
    const main = fileContentObj.content?.main || '';
    return drafts !== main && drafts.trim().length > 0;
  }, [fileContentObj]);

  const currentTeam = useMemo(() => {
    return teams.find(t => t.id === selectedTeamId);
  }, [teams, selectedTeamId]);

  // Load files when team changes
  useEffect(() => {
    if (selectedTeamId) {
      loadFiles();
    }
  }, [selectedTeamId]);

  // Load file content when selected file changes
  useEffect(() => {
    if (selectedFile) {
      loadFileContent();
    }
  }, [selectedFile]);

  // Load history when branch changes
  useEffect(() => {
    if (selectedFile) {
      loadHistory();
      // ensure editor shows branch-appropriate content when switching branches
      loadFileContent();
    }
  }, [currentBranch, selectedFile]);

  // Auto-save timer
  useEffect(() => {
    if (!unsavedChanges || !selectedFile || currentBranch !== 'drafts') {
      return;
    }

    const timer = setTimeout(() => {
      autoSave();
    }, 3000);

    return () => clearTimeout(timer);
  }, [unsavedChanges, code]);

  const loadFiles = async () => {
    try {
      setLocalLoading(true);
      setError(null);
      const fileList = await getCodeFiles(selectedTeamId!);
      setFiles(fileList);
    } catch (err) {
      setError(`Failed to load files: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const loadFileContent = async () => {
    if (!selectedFile) return;
    try {
      setLocalLoading(true);
      const content = await getCodeFileContent(selectedFile.id);
      setFileContentObj(content);
      const branchContent = currentBranch === 'drafts' ? content.content.drafts : content.content.main;
      setCode(branchContent);
      setUnsavedChanges(false);
      setAutoSaveStatus('saved');
    } catch (err) {
      setError(`Failed to load file content: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedFile) return;
    try {
      const commits = await getCommitHistory(selectedFile.id, currentBranch);
      setHistory(commits);
    } catch (err) {
      setError(`Failed to load history: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const autoSave = async () => {
    if (!selectedFile || !currentUser || currentBranch !== 'drafts') {
      return;
    }
    try {
      setAutoSaveStatus('saving');
      await saveDraft(selectedFile.id, code, currentUser.id);
      setUnsavedChanges(false);
      setAutoSaveStatus('saved');
    } catch (err) {
      setAutoSaveStatus('unsaved');
      console.error('Auto-save failed:', err);
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  const formatDocument = () => {
    try {
      // prefer active editor if available
      if (editorRef.current) {
        const action = editorRef.current.getAction?.('editor.action.formatDocument');
        if (action) action.run();
        return;
      }
    } catch (e) {
      console.error('Format failed', e);
    }
  };

  const handleRevert = async (commitId: number, branch: 'main' | 'drafts') => {
    if (!currentUser) return setError('Must be signed in to revert');
    try {
      setLocalLoading(true);
      await (await import('../services/codeService')).revertCommit(commitId, branch, currentUser.id);
      await loadHistory();
      await loadFileContent();
    } catch (err) {
      setError(`Failed to revert: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName || !selectedTeamId || !currentUser) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLocalLoading(true);
      setError(null);
      const filePath = `${newFileName}`;
      const newFile = await createCodeFile(
        selectedTeamId,
        newFileName,
        filePath,
        newFileLanguage,
        '',
        currentUser.id
      );
      setFiles([...files, newFile]);
      setSelectedFile(newFile);
      setNewFileName('');
      setShowNewFileModal(false);
      setCode('');
      setCurrentBranch('drafts');
    } catch (err) {
      setError(`Failed to create file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile || !currentUser || !commitMessage.trim()) {
      setError('Please enter a commit message');
      return;
    }

    try {
      setLocalLoading(true);
      setError(null);
      await commitToMain(selectedFile.id, commitMessage, currentUser.id);
      setCommitMessage('');
      setShowCommitModal(false);
      await loadHistory();
      setCurrentBranch('main');
      await loadFileContent();
    } catch (err) {
      setError(`Failed to commit: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }
    try {
      setLocalLoading(true);
      await downloadCodeFile(selectedFile.id, currentBranch);
    } catch (err) {
      setError(`Failed to download: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile || !confirm('Are you sure you want to delete this file?')) {
      return;
    }
    try {
      setLocalLoading(true);
      await deleteCodeFile(selectedFile.id);
      setFiles(files.filter(f => f.id !== selectedFile.id));
      setSelectedFile(null);
      setCode('');
    } catch (err) {
      setError(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleViewCommit = async (commit: CodeCommit) => {
    setSelectedCommit(commit);
    setCode(commit.content);
  };

  const renderAutoSaveIndicator = () => {
    if (currentBranch !== 'drafts') return null;
    
    const icons: Record<'saved' | 'saving' | 'unsaved', React.ReactNode> = {
      saved: <Check className="w-4 h-4 text-green-400" />,
      saving: <Loader className="w-4 h-4 animate-spin text-blue-400" />,
      unsaved: <AlertCircle className="w-4 h-4 text-yellow-400" />
    };

    const labels: Record<'saved' | 'saving' | 'unsaved', string> = {
      saved: 'All changes saved',
      saving: 'Saving...',
      unsaved: 'Unsaved changes'
    };

    return (
      <div className="flex items-center gap-2 text-xs text-slate-300 px-3 py-1 bg-slate-700/50 rounded-lg">
        {icons[autoSaveStatus]}
        {labels[autoSaveStatus]}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Code2 className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold text-white">Code Management</h2>
        </div>
        <button
          onClick={() => setShowNewFileModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-primary font-bold rounded-lg hover:brightness-90 transition-all"
        >
          <Plus className="w-4 h-4" />
          New File
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3 flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-200 ml-auto flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Team & File Selection */}
      <div className="flex gap-4 flex-wrap flex-shrink-0">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-slate-300 mb-2 block">SELECT TEAM</label>
          <select
            value={selectedTeamId || ''}
            onChange={(e) => {
              setSelectedTeamId(e.target.value ? parseInt(e.target.value) : null);
              setSelectedFile(null);
              setCode('');
            }}
            className="w-full px-3 py-2 bg-slate-800 text-white rounded-lg border border-slate-700 focus:border-accent focus:outline-none"
          >
            <option value="">Choose a team...</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {selectedTeamId && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-slate-300 mb-2 block">SELECT FILE</label>
            <select
              value={selectedFile?.id || ''}
              onChange={(e) => {
                const file = files.find(f => f.id === parseInt(e.target.value));
                setSelectedFile(file || null);
              }}
              className="w-full px-3 py-2 bg-slate-800 text-white rounded-lg border border-slate-700 focus:border-accent focus:outline-none"
            >
              <option value="">Choose a file...</option>
              {files.map(f => (
                <option key={f.id} value={f.id}>{f.file_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Editor Area */}
      {selectedFile ? (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden" style={{ minHeight: '60vh' }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-800/50 p-3 rounded-lg flex-shrink-0">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-accent" />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentBranch('drafts');
                    setSelectedCommit(null);
                  }}
                  className={`px-3 py-1 rounded text-sm font-bold transition-all ${
                    currentBranch === 'drafts'
                      ? 'bg-accent text-primary'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Drafts
                </button>
                <button
                  onClick={() => {
                    setCurrentBranch('main');
                    setSelectedCommit(null);
                  }}
                  className={`px-3 py-1 rounded text-sm font-bold transition-all ${
                    currentBranch === 'main'
                      ? 'bg-accent text-primary'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Main
                </button>
              </div>
            </div>

            {renderAutoSaveIndicator()}

            <div className="flex items-center gap-2">
              <button
                onClick={formatDocument}
                className="flex items-center gap-1 px-3 py-1 bg-slate-700 text-slate-200 rounded text-sm hover:bg-slate-600 transition-all"
              >
                Format
              </button>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-bold transition-all ${
                  compareMode ? 'bg-accent text-primary' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                Compare
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 px-3 py-1 bg-slate-700 text-slate-200 rounded text-sm hover:bg-slate-600 transition-all"
              >
                <History className="w-4 h-4" />
                History
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 bg-blue-700 text-blue-100 rounded text-sm hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              {currentBranch === 'drafts' && (
                <button
                  onClick={() => setShowCommitModal(true)}
                  disabled={loading || !(unsavedChanges || canCommit)}
                  className="flex items-center gap-1 px-3 py-1 bg-green-700 text-green-100 rounded text-sm hover:bg-green-600 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Commit
                </button>
              )}
              <button
                onClick={handleDeleteFile}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 bg-red-700 text-red-100 rounded text-sm hover:bg-red-600 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>

          {/* Editor and History */}
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Editor */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="text-xs font-bold text-slate-400 mb-2 px-3">
                {selectedFile.file_name} ({selectedFile.language})
              </div>
              <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto">
                    {compareMode && comparePair.base && comparePair.head ? (
                      <DiffEditor
                        height="100%"
                        language={selectedFile.language === 'java' ? 'java' : 'plaintext'}
                        original={history.find(h => h.id === comparePair.base)?.content || ''}
                        modified={history.find(h => h.id === comparePair.head)?.content || ''}
                        onMount={(editor, monaco) => { diffEditorRef.current = editor; monacoRef.current = monaco; }}
                        theme="vs-dark"
                        options={{ automaticLayout: true }}
                      />
                    ) : (
                      <Editor
                        height="100%"
                        language={selectedFile.language === 'java' ? 'java' : 'plaintext'}
                        value={code}
                        onMount={handleEditorMount}
                        onChange={(value) => {
                          setCode(value || '');
                          if (currentBranch === 'drafts') {
                            setUnsavedChanges(true);
                            setAutoSaveStatus('unsaved');
                          }
                        }}
                        theme="vs-dark"
                        options={{
                          minimap: { enabled: true },
                          wordWrap: 'on',
                          fontSize: 13,
                          fontFamily: '"Fira Code", monospace',
                          automaticLayout: true
                        }}
                      />
                    )}
                </div>
              </div>
            </div>

            {/* History Sidebar */}
            {showHistory && (
              <div className="w-80 flex flex-col bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700 bg-slate-700/50">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Commit History
                  </h4>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {history.length > 0 ? (
                      history.map(commit => (
                        <div key={commit.id} className="w-full border-b border-slate-700">
                          <div className={`w-full text-left px-3 py-2 hover:bg-slate-700/50 transition-all ${selectedCommit?.id === commit.id ? 'bg-accent/20' : ''}`}>
                            <div className="flex items-start gap-2">
                              <div className="flex-1" onClick={() => handleViewCommit(commit)}>
                                <div className="text-xs font-bold text-accent">{commit.hash.substring(0, 8)}</div>
                                <div className="text-xs text-slate-200">{commit.message}</div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <User className="w-3 h-3" />
                                  {commit.author_name || 'Unknown'} • {format(new Date(commit.created_at), 'MMM dd, HH:mm')}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex gap-1">
                                  <button
                                    title="Use as base for compare"
                                    onClick={() => setComparePair(p => ({ ...p, base: commit.id }))}
                                    className={`px-2 py-1 text-[11px] rounded ${comparePair.base === commit.id ? 'bg-accent text-primary' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                                  >
                                    Base
                                  </button>
                                  <button
                                    title="Use as head for compare"
                                    onClick={() => setComparePair(p => ({ ...p, head: commit.id }))}
                                    className={`px-2 py-1 text-[11px] rounded ${comparePair.head === commit.id ? 'bg-accent text-primary' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                                  >
                                    Head
                                  </button>
                                </div>
                                <div className="flex gap-1 mt-1">
                                  <button
                                    onClick={() => handleRevert(commit.id, currentBranch === 'main' ? 'main' : 'drafts')}
                                    className="px-2 py-1 text-[11px] rounded bg-red-700 text-red-100 hover:bg-red-600"
                                  >
                                    Revert
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-slate-400 text-center">
                        No commits yet
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">Select a team and file to view code</p>
            <button
              onClick={() => setShowNewFileModal(true)}
              className="text-accent hover:underline text-sm font-bold"
            >
              Create a new file to get started
            </button>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-4">Create New File</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">FILE NAME</label>
                <input
                  type="text"
                  placeholder="Example.java"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-slate-700 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">LANGUAGE</label>
                <select
                  value={newFileLanguage}
                  onChange={(e) => setNewFileLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-slate-700 focus:border-accent focus:outline-none"
                >
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewFileModal(false);
                  setNewFileName('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                disabled={loading || !newFileName || !selectedTeamId}
                className="flex-1 px-4 py-2 bg-accent text-primary rounded-lg hover:brightness-90 transition-all font-bold disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-4">Commit to Main</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">COMMIT MESSAGE</label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-slate-700 focus:border-accent focus:outline-none resize-none"
                />
              </div>
              <div className="text-xs text-slate-400">
                You will be committing {code.length} characters from the drafts branch to main.
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCommitModal(false);
                  setCommitMessage('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={loading || !commitMessage.trim()}
                className="flex-1 px-4 py-2 bg-green-700 text-green-100 rounded-lg hover:bg-green-600 transition-all font-bold disabled:opacity-50"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeView;
