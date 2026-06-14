export interface NotionConfig {
  notionSecret: string;
  parentPageId: string;
}

/** A user-defined custom field shown on the landing page (label + value). */
export interface CustomField {
  id: string;
  label: string;
  value: string;
  /**
   * When true, this field is rendered as an input the submitter fills in
   * (e.g. "Curso", "Grupo"). When false/undefined, it is informational text
   * shown to the submitter (like the legacy steps).
   */
  askSubmitter?: boolean;
  /** Marks a submitter-filled field as required. */
  required?: boolean;
}

/** A column definition for the project database / grading table. */
export interface DbColumn {
  id: string;
  /** Display name / Notion property name. */
  name: string;
  /** Notion-compatible property kind. */
  type: "text" | "number" | "select" | "checkbox" | "date";
  /** Options for select-type columns. */
  options?: string[];
}

export interface Project {
  id: string;
  name: string;
  url?: string;
  isActive?: boolean;
  /** Id of the parent group (toggle) this project belongs to, if any. */
  groupId?: string;
  /** Manual display order (lower shows first). */
  order?: number;
  /** Whether this block is a group container rather than a deliverable project. */
  isGroup?: boolean;
}

export interface ProjectMeta {
  title: string;
  description: string;
  /** @deprecated kept for backward compatibility with old projects. */
  step1?: string;
  /** @deprecated kept for backward compatibility with old projects. */
  step2?: string;
  /** @deprecated kept for backward compatibility with old projects. */
  step3?: string;
  /** User-defined custom fields rendered below title and description. */
  customFields?: CustomField[];
  expirationDate?: string;
  backgroundImage?: string;
  isActive?: boolean;
  /** Organizational grouping / ordering. */
  groupId?: string;
  order?: number;
  /** Database mode configuration. */
  useDatabase?: boolean;
  /** Notion database id created for this project when useDatabase is true. */
  databaseId?: string;
  /** Extra control columns (nota, estado, comentarios, etc). */
  dbColumns?: DbColumn[];
  /** Blur intensity (0-20) applied to the background image. */
  bgBlur?: number;
  /** Flat solid background color (hex) used when no backgroundImage is set. */
  bgColor?: string;
  /** Lucide icon name shown in the corner box of the landing card. */
  icon?: string;
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
  /** Values for the user-defined custom fields, keyed by field id. */
  customValues?: Record<string, string>;
  /** Values for control/grading columns, keyed by column id (nota, estado...). */
  controlValues?: Record<string, string>;
}
