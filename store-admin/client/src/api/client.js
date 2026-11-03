import { apiFetch } from '../api';

export async function dashboardFetch(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    return await apiFetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Máy chủ phản hồi quá thời gian. Vui lòng thử lại.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
