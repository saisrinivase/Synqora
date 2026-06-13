import fs from 'node:fs/promises';
import path from 'node:path';

function resolveStateFile(customPath) {
  return path.resolve(customPath || process.env.SYNQORA_AGENT_STATE_FILE || '.synqora/agent-state.json');
}

export async function loadAgentState(customPath) {
  const stateFile = resolveStateFile(customPath);
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    return { stateFile, state: JSON.parse(raw) };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { stateFile, state: null };
    }
    throw error;
  }
}

export async function saveAgentState(customPath, state) {
  const stateFile = resolveStateFile(customPath);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
  return stateFile;
}
