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

export type MessageTemplate = Template;

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

export interface LeadCategory {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export interface Lead {
  id: number;
  phone: string;
  shop_name: string;
  owner_name?: string;
  category: string;
  shop_type: string;
  is_on_whatsapp: boolean;
  whatsapp_name?: string;
  whatsapp_profile_pic?: string;
  whatsapp_about?: string;
  status: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
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

export const LeadService = {
  list: (params?: { search?: string; category?: string; status?: string; shop_type?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.category) q.append('category', params.category);
    if (params?.status) q.append('status', params.status);
    if (params?.shop_type) q.append('shop_type', params.shop_type);
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return api.get<Lead[]>(`/leads${queryStr}`);
  },
  create: (data: {
    phone: string;
    shop_name: string;
    owner_name?: string;
    category?: string;
    shop_type?: string;
    address?: string;
    notes?: string;
    status?: string;
    force_save?: boolean;
  }) => api.post<Lead>('/leads', data),
  update: (id: number, data: Partial<Lead>) => api.put<Lead>(`/leads/${id}`, data),
  delete: (id: number) => api.delete(`/leads/${id}`),
  checkPhone: (phone: string, excludeId?: number) =>
    api.get<{
      is_duplicate: boolean;
      type?: 'Contact' | 'Lead';
      name?: string;
      phone?: string;
      id?: number;
      category?: string;
    }>(`/leads/check-phone?phone=${encodeURIComponent(phone)}${excludeId ? `&exclude_id=${excludeId}` : ''}`),
  scanWhatsApp: (phone: string) =>
    api.get<{
      connected: boolean;
      exists: boolean;
      phone: string;
      jid?: string;
      profilePictureUrl?: string | null;
      about?: string | null;
      message?: string;
    }>(`/leads/scan-phone?phone=${encodeURIComponent(phone)}`),
  listCategories: () => api.get<LeadCategory[]>('/lead-categories'),
  createCategory: (data: { name: string; description?: string }) =>
    api.post<LeadCategory>('/lead-categories', data),
  getExportCsvUrl: () => '/api/proxy/leads/export-csv',
};

export default api;
