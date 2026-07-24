import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveE2eRoot } from "./paths.js";

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
}

export interface ProjectToolContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
  scenariosRelPath: string;
  root: string;
}

function projectsDir(e2eRoot: string): string {
  const fromEnv = process.env.PROJECTS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(e2eRoot, "projects");
}

export function listProjects(): ProjectMeta[] {
  const dir = projectsDir(resolveE2eRoot());
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "project.json")))
    .map((e) => {
      try {
        const raw = JSON.parse(readFileSync(join(dir, e.name, "project.json"), "utf-8")) as ProjectMeta;
        return { id: raw.id ?? e.name, name: raw.name ?? e.name, description: raw.description };
      } catch {
        return { id: e.name, name: e.name };
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readBaseUrl(envPath: string): string {
  if (!existsSync(envPath)) return "";
  const content = readFileSync(envPath, "utf-8");
  const match = content.match(/^BASE_URL=(.*)$/m);
  if (!match) return "";
  return match[1]!.trim().replace(/^["']|["']$/g, "");
}

export function resolveProjectToolContext(projectId: string): ProjectToolContext {
  const id = projectId.trim();
  if (!id) throw new Error("projectId 不能为空");
  const root = join(projectsDir(resolveE2eRoot()), id);
  if (!existsSync(join(root, "project.json"))) {
    throw new Error(`项目不存在: ${id}`);
  }
  let projectName = id;
  try {
    const raw = JSON.parse(readFileSync(join(root, "project.json"), "utf-8")) as ProjectMeta;
    projectName = raw.name ?? id;
  } catch {
    // keep id
  }
  return {
    projectId: id,
    projectName,
    baseUrl: readBaseUrl(join(root, ".env")),
    scenariosRelPath: `projects/${id}/scenarios`,
    root,
  };
}
