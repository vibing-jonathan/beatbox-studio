export const PROJECT_BUNDLE_FORMAT = 'beatbox-studio-project';
export const PROJECT_BUNDLE_VERSION = 1;

export function cleanProjectName(value, fallback = 'Untitled session') {
  const cleaned = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
  return cleaned || fallback;
}

export function createProjectId(name = 'session', now = Date.now()) {
  const slug = cleanProjectName(name, 'session')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'session';
  return `${slug}-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function uniqueProjectName(name, existingNames = []) {
  const base = cleanProjectName(name);
  const occupied = new Set(existingNames.map((item) => cleanProjectName(item).toLocaleLowerCase()));
  if (!occupied.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (occupied.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

export function createProjectRecord({ id, name, settings = {}, recordings = [], now = Date.now() } = {}) {
  const safeName = cleanProjectName(name);
  return {
    id: id || createProjectId(safeName, now),
    name: safeName,
    createdAt: Number(now),
    updatedAt: Number(now),
    settings: structuredClone(settings),
    recordings: recordings.map((recording) => ({ ...recording })),
  };
}

export function duplicateProjectRecord(project, existingNames = [], now = Date.now()) {
  if (!project?.id) throw new Error('A project is required to duplicate a session.');
  const name = uniqueProjectName(`${cleanProjectName(project.name)} copy`, existingNames);
  return createProjectRecord({
    name,
    settings: project.settings ?? {},
    recordings: project.recordings ?? [],
    now,
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function serializeProjectBundle(project) {
  if (!project?.id || !project?.settings) throw new Error('The session is incomplete and cannot be exported.');
  const recordings = await Promise.all((project.recordings ?? []).map(async (recording) => {
    if (!(recording.blob instanceof Blob)) throw new Error(`Recording ${recording.slot ?? ''} is missing its audio.`);
    const { blob, ...metadata } = recording;
    return {
      ...metadata,
      audio: {
        type: blob.type || 'application/octet-stream',
        base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      },
    };
  }));
  return JSON.stringify({
    format: PROJECT_BUNDLE_FORMAT,
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: Date.now(),
    project: {
      id: project.id,
      name: cleanProjectName(project.name),
      createdAt: Number(project.createdAt) || Date.now(),
      updatedAt: Number(project.updatedAt) || Date.now(),
      settings: structuredClone(project.settings),
      recordings,
    },
  }, null, 2);
}

export function parseProjectBundle(text, { now = Date.now(), existingNames = [] } = {}) {
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid Beatbox Studio project file.');
  }
  if (bundle?.format !== PROJECT_BUNDLE_FORMAT || bundle?.version !== PROJECT_BUNDLE_VERSION) {
    throw new Error('This project file uses an unsupported format or version.');
  }
  if (!bundle.project || typeof bundle.project.settings !== 'object' || !Array.isArray(bundle.project.recordings)) {
    throw new Error('This Beatbox Studio project file is incomplete.');
  }
  const recordings = bundle.project.recordings.map((recording) => {
    if (!recording?.slot || !recording.audio?.base64) throw new Error('A recording in this project is damaged.');
    const { audio, ...metadata } = recording;
    return {
      ...metadata,
      blob: new Blob([base64ToBytes(audio.base64)], { type: audio.type || 'application/octet-stream' }),
    };
  });
  return createProjectRecord({
    name: uniqueProjectName(bundle.project.name, existingNames),
    settings: bundle.project.settings,
    recordings,
    now,
  });
}

export function projectFileName(name) {
  const slug = cleanProjectName(name, 'beatbox-session')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'beatbox-session'}.beatbox`;
}
