export interface NotionConfig {
  notionSecret: string;
  parentPageId: string;
}

export interface Project {
  id: string;
  name: string;
  url?: string;
  isActive?: boolean;
}

export interface ProjectMeta {
  title: string;
  description: string;
  step1: string;
  step2: string;
  step3: string;
  expirationDate?: string;
  backgroundImage?: string;
  isActive?: boolean;
}

export interface FileAttachment {
  name: string;
  size: number;
  url: string;
}

export interface Submission {
  id: string;
  projectId: string;
  projectName: string;
  senderName: string;
  senderEmail: string;
  timestamp: string;
  files: FileAttachment[];
}
