/**
 * NimbusOS Core Services
 * API client for system backend communication
 * Currently uses mock data — replace with real fetch() calls when backend is ready
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[NimbusOS] API call failed: ${endpoint}`, err.message);
    return null;
  }
}

// System
export const SystemService = {
  getCpuUsage: () => request('/system/cpu'),
  getMemory: () => request('/system/memory'),
  getTemps: () => request('/system/temps'),
  getUptime: () => request('/system/uptime'),
};

// Disks
export const DiskService = {
  list: () => request('/disks'),
  getSmart: (dev) => request(`/disks/${dev}/smart`),
  getRaid: () => request('/disks/raid'),
};

// Docker
export const DockerService = {
  listContainers: () => request('/docker/containers'),
  startContainer: (id) => request(`/docker/containers/${id}/start`, { method: 'POST' }),
  stopContainer: (id) => request(`/docker/containers/${id}/stop`, { method: 'POST' }),
  removeContainer: (id) => request(`/docker/containers/${id}`, { method: 'DELETE' }),
};

// Network
export const NetworkService = {
  getInterfaces: () => request('/network/interfaces'),
  getPorts: () => request('/network/ports'),
};

// Files
export const FileService = {
  list: (path) => request(`/files?path=${encodeURIComponent(path)}`),
  mkdir: (path) => request('/files/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),
  remove: (path) => request('/files', { method: 'DELETE', body: JSON.stringify({ path }) }),
  rename: (from, to) => request('/files/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
};

// Users
export const UserService = {
  list: () => request('/users'),
  create: (user) => request('/users', { method: 'POST', body: JSON.stringify(user) }),
  update: (name, data) => request(`/users/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (name) => request(`/users/${name}`, { method: 'DELETE' }),
};

// VMs
export const VMService = {
  list: () => request('/vms'),
  create: (config) => request('/vms', { method: 'POST', body: JSON.stringify(config) }),
  start: (name) => request(`/vms/${name}/start`, { method: 'POST' }),
  stop: (name) => request(`/vms/${name}/stop`, { method: 'POST' }),
  remove: (name) => request(`/vms/${name}`, { method: 'DELETE' }),
};
