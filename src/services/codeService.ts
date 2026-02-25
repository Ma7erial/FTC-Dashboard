import { CodeFile, CodeCommit, CodeContent } from '../types';

export const getCodeFiles = async (teamId: number): Promise<CodeFile[]> => {
  const response = await fetch(`/api/code/files/${teamId}`);
  if (!response.ok) throw new Error('Failed to fetch code files');
  return response.json();
};

export const createCodeFile = async (
  teamId: number,
  fileName: string,
  filePath: string,
  language: string,
  content: string,
  authorId: number
): Promise<CodeFile> => {
  const response = await fetch('/api/code/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_id: teamId, file_name: fileName, file_path: filePath, language, content, author_id: authorId })
  });
  if (!response.ok) throw new Error('Failed to create code file');
  return response.json();
};

export const getCodeFileContent = async (fileId: number): Promise<CodeContent> => {
  const response = await fetch(`/api/code/files/${fileId}/content`);
  if (!response.ok) throw new Error('Failed to fetch code content');
  return response.json();
};

export const saveDraft = async (
  fileId: number,
  content: string,
  authorId: number
): Promise<{ success: boolean; id: number }> => {
  const response = await fetch(`/api/code/files/${fileId}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, author_id: authorId })
  });
  if (!response.ok) throw new Error('Failed to save draft');
  return response.json();
};

export const commitToMain = async (
  fileId: number,
  message: string,
  authorId: number
): Promise<{ success: boolean; hash: string }> => {
  const response = await fetch(`/api/code/files/${fileId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, author_id: authorId })
  });
  if (!response.ok) throw new Error('Failed to commit code');
  return response.json();
};

export const getCommitHistory = async (fileId: number, branch: 'main' | 'drafts' = 'main'): Promise<CodeCommit[]> => {
  const response = await fetch(`/api/code/files/${fileId}/history?branch=${branch}`);
  if (!response.ok) throw new Error('Failed to fetch commit history');
  return response.json();
};

export const getCommit = async (commitId: number): Promise<CodeCommit> => {
  const response = await fetch(`/api/code/commits/${commitId}`);
  if (!response.ok) throw new Error('Failed to fetch commit');
  return response.json();
};

export const downloadCodeFile = async (fileId: number, branch: 'main' | 'drafts' = 'main'): Promise<void> => {
  const response = await fetch(`/api/code/files/${fileId}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch })
  });
  if (!response.ok) throw new Error('Failed to download file');
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // Get filename from Content-Disposition header
  const contentDisposition = response.headers.get('Content-Disposition');
  const filename = contentDisposition?.split('filename="')[1]?.split('"')[0] || 'code.java';
  
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const deleteCodeFile = async (fileId: number): Promise<{ success: boolean }> => {
  const response = await fetch(`/api/code/files/${fileId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete code file');
  return response.json();
};

export const revertCommit = async (commitId: number, branch: 'main' | 'drafts', authorId?: number) => {
  const response = await fetch(`/api/code/commits/${commitId}/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, author_id: authorId })
  });
  if (!response.ok) throw new Error('Failed to revert commit');
  return response.json();
};
