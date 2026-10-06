import { localizedRuntimeError } from '@/lib/errorMessages';
import { createClient } from '@supabase/supabase-js';
import { Upload } from 'tus-js-client';

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  details?: unknown;
};

export type MediaUploadKind = 'video' | 'attachment';

export type MediaUploadResult = {
  url: string;
  folder: 'videos' | 'attachments';
  type: MediaUploadKind;
  fileName: string;
  originalName: string;
};

export type DeleteCleanupResult = {
  entityId: string | null;
  deletedFiles: string[];
  purgedCollections: string[];
  errors: Array<{ message: string; path?: string }>;
};

const readBearerToken = () => {
  try {
    return window.sessionStorage.getItem('learnflow_session_token') ?? '';
  } catch {
    return '';
  }
};

const readSupabaseStorageClient = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase Storage is not configured for this deployment.');
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({} as Partial<ApiSuccessResponse<T> & ApiErrorResponse>));

  if (response.ok && payload.success !== false) {
    return (payload.data ?? (payload as T)) as T;
  }

  const errorMessage = typeof payload.error === 'string' && payload.error.length > 0
    ? payload.error
    : `Request failed with status ${response.status}`;

  throw new Error(localizedRuntimeError(new Error(errorMessage), errorMessage));
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  return parseApiResponse<T>(response);
}

type AttachmentUploadTicket = {
  asset_id: string;
  asset_url: string;
  path: string;
  token: string;
};

type BunnyUploadTicket = {
  asset_id: string;
  asset_url: string;
  video_id: string;
  library_id: string;
  expires_at: number;
  signature: string;
  endpoint: string;
};

async function requestMediaUploadTicket<T>(kind: MediaUploadKind, file: File): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const endpoint = kind === 'video' ? 'videos' : 'attachments';
  const token = readBearerToken();
  if (!token) throw new Error('Sign in before uploading course media.');
  return apiRequest<T>(`${baseUrl}/api/media/${endpoint}/upload-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || (kind === 'video' ? 'video/mp4' : 'application/octet-stream'),
      size: file.size,
    }),
  });
}

export async function getSignedMediaUrl(assetUrl: string): Promise<string> {
  const assetId = assetUrl.startsWith('cloud-asset:') ? assetUrl.slice('cloud-asset:'.length) : '';
  if (!assetId) throw new Error('This media reference is invalid.');
  const token = readBearerToken();
  if (!token) throw new Error('Sign in to access this course media.');
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const result = await apiRequest<{ url: string }>(`${baseUrl}/api/media/assets/${encodeURIComponent(assetId)}/signed-url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return result.url;
}

export async function uploadMediaFile(
  file: File,
  kind: MediaUploadKind,
  options?: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  try {
    if (options?.signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
    if (kind === 'attachment') {
      const ticket = await requestMediaUploadTicket<AttachmentUploadTicket>(kind, file);
      const storage = readSupabaseStorageClient();
      const { error } = await storage.storage
        .from(import.meta.env.VITE_SUPABASE_PRIVATE_MEDIA_BUCKET ?? 'course-materials')
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      options?.onProgress?.(100);
      return ticket.asset_url;
    }

    const ticket = await requestMediaUploadTicket<BunnyUploadTicket>(kind, file);
    return await new Promise((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: ticket.endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
        headers: {
          AuthorizationSignature: ticket.signature,
          AuthorizationExpire: String(ticket.expires_at),
          VideoId: ticket.video_id,
          LibraryId: String(ticket.library_id),
        },
        metadata: {
          filetype: file.type || 'video/mp4',
          title: file.name,
        },
        onError: reject,
        onProgress: (uploaded, total) => {
          if (total > 0) options?.onProgress?.(Math.round((uploaded / total) * 100));
        },
        onSuccess: () => resolve(ticket.asset_url),
      });
      const abort = () => {
        void upload.abort(true);
        reject(new DOMException('Upload aborted', 'AbortError'));
      };
      options?.signal?.addEventListener('abort', abort, { once: true });
      void upload.findPreviousUploads().then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      }).catch(reject);
    });
  } catch (error) {
    throw new Error(localizedRuntimeError(error, 'Unable to upload course media.'));
  }
}

export async function deleteEntityCleanupApi(entity: Record<string, unknown> | null): Promise<DeleteCleanupResult> {
  if (!entity) {
    return {
      entityId: null,
      deletedFiles: [],
      purgedCollections: [],
      errors: [],
    };
  }

  const endpoints = ['/api/media/delete', '/api/delete-entity'];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await apiRequest<DeleteCleanupResult>(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity }),
      });

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Delete cleanup failed.');
    }
  }

  throw lastError ?? new Error('Delete cleanup failed.');
}

export async function fetchExternalVideoDuration(videoUrl: string): Promise<number> {
  const trimmedUrl = videoUrl.trim();
  if (!trimmedUrl) {
    return 0;
  }

  try {
    const url = new URL(trimmedUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      const html = await fetch(trimmedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        .then((response) => response.text())
        .catch(() => '');

      const youtubeMatch = html.match(/"lengthSeconds":"?(\d+)"?/i)
        ?? html.match(/"approxDurationMs":"?(\d+)"?/i)
        ?? html.match(/length_seconds=(\d+)/i);

      if (youtubeMatch?.[1]) {
        const seconds = Number(youtubeMatch[1]);
        if (Number.isFinite(seconds) && seconds > 0) {
          return Math.round(seconds / (youtubeMatch[0].includes('approxDurationMs') ? 1000 : 1));
        }
      }
    }

    if (hostname.includes('vimeo.com')) {
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmedUrl)}`);
      if (response.ok) {
        const payload = await response.json() as { duration?: number };
        if (typeof payload.duration === 'number' && Number.isFinite(payload.duration) && payload.duration > 0) {
          return Math.round(payload.duration);
        }
      }
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';
        video.src = trimmedUrl;

        video.onloadedmetadata = () => {
          const duration = Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration)) : 0;
          resolve(duration);
        };

        video.onerror = () => resolve(0);
      });
    }
  } catch {
    return 0;
  }

  return 0;
}
