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
  created_at: string;
  completed_at?: string;
}

export interface CampaignLog {
  id: number;
  contact_name: string;
  phone: string;
  message: string;
  status: string;
  error_message?: string;
  sent_at?: string;
}

export const WhatsAppService = {
  getStatus: () => api.get('/whatsapp/status'),
  getQr: () => api.get('/whatsapp/qr'),
  logout: () => api.post('/whatsapp/logout'),
  restart: () => api.post('/whatsapp/restart'),
  sendDirect: (phone: string, message: string) => api.post('/messages/send-direct', { phone, message }),
};

export const ContactService = {
  list: (search = '', tag = '') => api.get<Contact[]>(`/contacts?search=${encodeURIComponent(search)}&tag=${encodeURIComponent(tag)}`),
  create: (data: { name: string; phone: string; email?: string; tags?: string; notes?: string }) => api.post('/contacts', data),
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
  getLogs: (id: number) => api.get<{ campaign_id: number; title: string; status: string; sent_count: number; failed_count: number; total_recipients: number; logs: CampaignLog[] }>(`/campaigns/${id}/logs`),
  start: (data: { title: string; message_template: string; contact_ids: number[]; delay_seconds?: number }) => api.post('/campaigns', data),
};

export default api;
