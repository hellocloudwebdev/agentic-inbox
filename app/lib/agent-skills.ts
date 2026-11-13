import { strFromU8, unzipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';
import type { AgentSkillSettings, AgentSkillResource } from '~/services/api';

const MAX_ARCHIVE_BYTES = 10_000_000;
const MAX_ARCHIVE_FILES = 250;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const MAX_SKILL_BYTES = 3_000_000;
const MAX_SKILLS = 100;
const MAX_SKILL_INSTRUCTIONS = 50_000;
const MAX_SKILL_RESOURCES = 150;

const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'py', 'js', 'mjs', 'cjs',
  'ts', 'tsx', 'jsx', 'sh', 'bash', 'bat', 'ps1', 'html', 'htm', 'css',
  'scss', 'xml', 'svg', 'csv', 'toml', 'ini', 'conf', 'sql',
]);

export interface SkillImportResult {
  skills: AgentSkillSettings[];
  warnings: string[];
}

function safeArchivePath(input: string): string | null {
  const path = input.replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  if (parts.some((part) => part === '.git' || part === '__MACOSX' || part === 'node_modules')) return null;
  return path;
}

function isTextFile(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith('/.env') || lower === '.env') return false;
  if (lower.endsWith('.env.example')) return true;
  const extension = lower.split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(extension);
}

function displayNameFromPath(path: string): string {
  const basename = path.split('/').pop() ?? path;
  return basename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 100);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseSkillDocument(raw: string, path: string, source: string, resources: AgentSkillResource[]): AgentSkillSettings {
  const frontmatterMatch = raw.match(/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  let manifest: Record<string, unknown> = {};
  let instructions = raw.trim();
  if (frontmatterMatch) {
    try {
      manifest = asRecord(parseYaml(frontmatterMatch[1], { version: '1.2', maxAliasCount: 25 }));
    } catch (error) {
      throw new Error('Invalid YAML frontmatter in ' + path + ': ' + (error instanceof Error ? error.message : String(error)));
    }
    instructions = raw.slice(frontmatterMatch[0].length).trim();
  }

  const name = (textValue(manifest.name) || displayNameFromPath(path)).slice(0, 100);
  const description = (textValue(manifest.description) || ('Imported skill from ' + path)).slice(0, 2000);
  if (!instructions) throw new Error('Skill ' + name + ' has no instruction body.');
  if (instructions.length > MAX_SKILL_INSTRUCTIONS) throw new Error('Skill ' + name + ' exceeds the 50,000-character instruction limit.');
  const resourceBytes = resources.reduce((sum, resource) => sum + new TextEncoder().encode(resource.content).byteLength, 0);
  if (resources.length > MAX_SKILL_RESOURCES || resourceBytes + new TextEncoder().encode(instructions).byteLength > MAX_SKILL_BYTES) {
    throw new Error('Skill ' + name + ' exceeds the supporting-file limits.');
  }
  let safeManifest: Record<string, unknown> = {};
  try { safeManifest = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>; } catch { safeManifest = {}; }

  return {
    id: crypto.randomUUID(), name, description, instructions, enabled: true, mode: 'on-demand',
    resources, manifest: safeManifest, source,
  };
}

export function parseAgentSkillMarkdown(raw: string, filename: string, source = filename): AgentSkillSettings {
  return parseSkillDocument(raw, filename, source, []);
}

export function importAgentSkillsZip(data: Uint8Array, sourceName: string): SkillImportResult {
  if (data.byteLength > MAX_ARCHIVE_BYTES) throw new Error('ZIP archive is larger than the 10 MB upload limit.');
  let examinedFiles = 0;
  let expandedBytes = 0;
  let skippedFiles = 0;
  const archive = unzipSync(data, {
    filter(file) {
      examinedFiles += 1;
      if (examinedFiles > MAX_ARCHIVE_FILES) throw new Error('ZIP contains more than 250 files.');
      const path = safeArchivePath(file.name);
      if (!path || file.name.endsWith('/') || !isTextFile(path)) { skippedFiles += 1; return false; }
      const size = file.originalSize;
      if (!Number.isFinite(size) || size > MAX_FILE_BYTES) { skippedFiles += 1; return false; }
      expandedBytes += size;
      if (expandedBytes > MAX_TOTAL_BYTES) throw new Error('ZIP expands beyond the 8 MB total text-file limit.');
      return true;
    },
  });
  const files = Object.entries(archive).map(([rawPath, bytes]) => {
    const path = safeArchivePath(rawPath);
    return path ? { path, content: strFromU8(bytes) } : null;
  }).filter((file): file is { path: string; content: string } => !!file);

  const skillFiles = files.filter((file) => file.path.split('/').pop()?.toLowerCase() === 'skill.md');
  const imported: AgentSkillSettings[] = [];
  if (skillFiles.length) {
    for (const skillFile of skillFiles) {
      const slash = skillFile.path.lastIndexOf('/');
      const base = slash >= 0 ? skillFile.path.slice(0, slash + 1) : '';
      const resources = files.filter((file) => file.path.startsWith(base) && file.path !== skillFile.path).map((file) => ({
        path: file.path.slice(base.length),
        content: file.content,
        mediaType: file.path.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'text/plain',
      }));
      imported.push(parseSkillDocument(skillFile.content, skillFile.path, sourceName + ':' + skillFile.path, resources));
    }
  } else {
    const candidates = files.filter((file) => {
      const basename = file.path.split('/').pop()?.toLowerCase() ?? '';
      if (!/\.(md|mdx|txt)$/i.test(basename)) return false;
      if (/^(readme|sources|license|notice|changelog|default-agent-instructions)(\.|$)/i.test(basename)) return false;
      return true;
    });
    for (const candidate of candidates) imported.push(parseSkillDocument(candidate.content, candidate.path, sourceName + ':' + candidate.path, []));
  }
  if (!imported.length) throw new Error('No Agent Skills were found. A bundle should contain one or more SKILL.md files, or standalone Markdown/text skill files.');
  if (imported.length > MAX_SKILLS) throw new Error('The archive contains more than 100 skills.');
  const names = new Set<string>();
  for (const skill of imported) {
    const key = skill.name.toLowerCase();
    if (names.has(key)) throw new Error('The archive contains duplicate skill names: ' + skill.name + '. Rename one skill before importing.');
    names.add(key);
  }
  const warnings: string[] = [];
  if (skippedFiles) warnings.push(skippedFiles + ' unsupported, binary, unsafe, or oversized file(s) were skipped. Only text resources are stored.');
  if (imported.some((skill) => (skill.resources?.length ?? 0) > 0)) warnings.push('Supporting text files are preserved and can be read by the assistant. Uploaded scripts are never executed.');
  return { skills: imported, warnings };
}
