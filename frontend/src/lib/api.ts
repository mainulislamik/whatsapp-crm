import axios from 'axios';

const api = axios.create({
  baseURL: '/api/proxy',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email?: string;
  tags?: string;
  notes?: string;
  created_at: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Template {
  id: number;
  name: string;
  content: string;
  category: string;
  created_at: string;
}

export interface Campaign {
  id: number;
  title: string;
  template_content: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: string;
  delay_seconds: number;
  has_media?: boolean;
  media_type?: string;
  file_name?: string;
  scheduled_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface CampaignLog {
  id: number;
  contact_name: string;
  phone: string;
  message: string;
  has_media?: boolean;
  status: string;
  error_message?: string;
  sent_at?: string;
}

export const WhatsAppService = {
  getStatus: () => api.get('/whatsapp/status'),
  getQr: () => api.get('/whatsapp/qr'),
  logout: () => api.post('/whatsapp/logout'),
  restart: () => api.post('/whatsapp/restart'),
  sendDirect: (data: {
    phone: string;
    message?: string;
    media_base64?: string;
    media_type?: string;
    file_name?: string;
    mime_type?: string;
  }) => api.post('/messages/send-direct', data),
};

export const ContactService = {
  list: (search = '', tag = '') =>
    api.get<Contact[]>(`/contacts?search=${encodeURIComponent(search)}&tag=${encodeURIComponent(tag)}`),
  getTags: () => api.get<TagCount[]>('/contacts/tags'),
  create: (data: { name: string; phone: string; email?: string; tags?: string; notes?: string }) =>
    api.post('/contacts', data),
  delete: (id: number) => api.delete(`/contacts/${id}`),
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post('/api/proxy/contacts/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const TemplateService = {
  list: () => api.get<Template[]>('/templates'),
  create: (data: { name: string; content: string; category?: string }) => api.post('/templates', data),
  delete: (id: number) => api.delete(`/templates/${id}`),
};

export const BroadcastService = {
  listCampaigns: () => api.get<Campaign[]>('/campaigns'),
  getLogs: (id: number) =>
    api.get<{
      campaign_id: number;
      title: string;
      status: string;
      sent_count: number;
      failed_count: number;
      total_recipients: number;
      has_media: boolean;
      file_name?: string;
      logs: CampaignLog[];
    }>(`/campaigns/${id}/logs`),
  start: (data: {
    title: string;
    message_template: string;
    contact_ids: number[];
    delay_seconds?: number;
    media_base64?: string;
    media_type?: string;
    file_name?: string;
    mime_type?: string;
    scheduled_at?: string;
  }) => api.post('/campaigns', data),
  cancel: (id: number) => api.post(`/campaigns/${id}/cancel`),
  getExportCsvUrl: (id: number) => `/api/proxy/campaigns/${id}/export-csv`,
};

export default api;
