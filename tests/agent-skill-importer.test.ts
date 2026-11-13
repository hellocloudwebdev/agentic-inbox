import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importAgentSkillsZip, parseAgentSkillMarkdown } from '../app/lib/agent-skills';

describe('Agent Skills importer', () => {
  it('parses YAML frontmatter including folded descriptions and metadata', () => {
    const skill = parseAgentSkillMarkdown(
      '---\nname: inbox-triage\ndescription: >\n  Use this skill to classify incoming email\n  and prepare a safe response.\nlicense: MIT\nmetadata:\n  author: Example\n---\n\n# Inbox triage\n\nRead the sender and classify the message.',
      'inbox-triage/SKILL.md',
      'test',
    );
    expect(skill.name).toBe('inbox-triage');
    expect(skill.description).toContain('classify incoming email');
    expect(skill.manifest?.license).toBe('MIT');
    expect(skill.instructions).toContain('# Inbox triage');
  });

  it('imports standard skill folders and preserves nested text references and scripts as text', () => {
    const archive = zipSync({
      'email-review/SKILL.md': strToU8('---\nname: email-review\ndescription: Review an email safely.\ncompatibility: Agent Skills\n---\n\nRead the thread first. See references/checklist.md.'),
      'email-review/references/checklist.md': strToU8('# Checklist\n- Verify sender'),
      'email-review/scripts/check.sh': strToU8('echo this is reference content'),
      'README.md': strToU8('Package documentation, not a skill.'),
    });
    const result = importAgentSkillsZip(archive, 'bundle.zip');
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('email-review');
    expect(result.skills[0].resources?.map((file) => file.path)).toEqual(['references/checklist.md', 'scripts/check.sh']);
    expect(result.warnings.join(' ')).toContain('never executed');
  });

  it('imports loose Markdown skill files from the earlier upload pack structure', () => {
    const archive = zipSync({
      'skills/alpha.md': strToU8('---\nname: alpha\ndescription: Alpha workflow.\n---\n\nAlpha instructions.'),
      'skills/beta.md': strToU8('---\nname: beta\ndescription: Beta workflow.\n---\n\nBeta instructions.'),
      'README.md': strToU8('Overview'),
      'SOURCES.md': strToU8('Attribution'),
    });
    expect(importAgentSkillsZip(archive, 'loose-skills.zip').skills.map((skill) => skill.name)).toEqual(['alpha', 'beta']);
  });

  it('rejects ZIP files over the compressed upload size limit', () => {
    expect(() => importAgentSkillsZip(new Uint8Array(10_000_001), 'large.zip')).toThrow('10 MB');
  });

  it('skips path traversal entries and imports safe skill folders', () => {
    const archive = zipSync({
      '../outside/SKILL.md': strToU8('---\nname: unsafe\ndescription: Bad path.\n---\n\nNo.'),
      'good/SKILL.md': strToU8('---\nname: good\ndescription: Safe skill.\n---\n\nGood.'),
      'good/../../escape.txt': strToU8('bad'),
    });
    expect(importAgentSkillsZip(archive, 'unsafe.zip').skills.map((skill) => skill.name)).toEqual(['good']);
  });
});
