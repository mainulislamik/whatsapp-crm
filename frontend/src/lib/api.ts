export interface SystemStatus {
  whatsapp: {
    status: string;
    phone: string;
  };
  ai_engine: {
    status: string;
    provider: string;
    model: string;
    bot_enabled: boolean;
  };
  reg_db: {
    status: string;
    database: string;
    indexed_shops: number;
  };
}

export interface RegInfo {
  is_registered: boolean;
  is_pending: boolean;
  shops: Array<{
    id: number;
    name: string;
    slug: string;
    business_type: string;
    phone: string;
    email: string;
    trial_ends_at: string | null;
    is_active: boolean;
    plan_name: string;
    tier: string;
  }>;
  pending: Array<{
    id: number;
    shop_name: string;
    owner_name: string;
    email: string;
    phone: string;
    business_type: string;
    created_at: string;
  }>;
  user_profile?: any;
}

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
  media_base64?: string | null;
  media_type?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
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
  description: string;
  created_at: string;
}

export interface ChatListItem {
  phone: string;
  name: string;
  jid: string;
  display_phone?: string | null;
  country_code?: string | null;
  is_lid?: boolean;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  is_on_whatsapp: boolean;
  profile_picture?: string | null;
  is_bot_active?: boolean;
  lead_id?: number | null;
  lead_shop_name?: string | null;
  lead_category?: string | null;
  lead_status?: string | null;
}

export interface ChatMessage {
  id: number;
  whatsapp_msg_id: string;
  phone: string;
  jid: string;
  sender_name: string;
  is_from_me: boolean;
  message_text: string;
  media_type: string;
  media_url: string;
  media_caption: string;
  file_name: string;
  status: string;
  is_read: boolean;
  timestamp: string;
}

export interface Lead {
  id: number;
  phone: string;
  shop_name: string;
  owner_name?: string;
  email?: string;
  website?: string;
  facebook_url?: string;
  category: string;
  shop_type: string;
  is_on_whatsapp: boolean;
  whatsapp_name?: string;
  whatsapp_profile_pic?: string;
  whatsapp_about?: string;
  status: string;
  address?: string;
  notes?: string;
  is_contacted?: boolean;
  last_contacted_at?: string | null;
  sent_messages_count?: number;
  created_at: string;
  updated_at: string;
}

export interface GeneratedLead {
  id: string;
  shop_name: string;
  phone: string;
  formatted_phone?: string;
  email?: string;
  website?: string;
  country?: string;
  facebook_url?: string;
  google_maps_url?: string;
  address?: string;
  profile_pic?: string;
  category?: string;
  shop_type?: string;
  is_on_whatsapp: boolean;
  whatsapp_profile_pic?: string;
  whatsapp_name?: string;
  notes?: string;
  already_in_crm?: boolean;
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
  syncWhatsApp: () => api.post<{ synced: number; total: number }>('/contacts/sync-whatsapp'),
};

export const TemplateService = {
  list: () => api.get<Template[]>('/templates'),
  create: (data: {
    name: string;
    content: string;
    category?: string;
    media_base64?: string;
    media_type?: string;
    file_name?: string;
    mime_type?: string;
  }) => api.post('/templates', data),
  update: (
    id: number,
    data: {
      name?: string;
      content?: string;
      category?: string;
      media_base64?: string | null;
      media_type?: string | null;
      file_name?: string | null;
      mime_type?: string | null;
    }
  ) => api.put(`/templates/${id}`, data),
  delete: (id: number) => api.delete(`/templates/${id}`),
};

export const BroadcastService = {
  listCampaigns: () => api.get<Campaign[]>('/campaigns'),
  retryFailed: (id: number) => api.post<{ success: boolean; message: string; count: number }>(`/campaigns/${id}/retry-failed`),
  resume: (id: number) => api.post<{ success: boolean; message: string; count: number }>(`/campaigns/${id}/resume`),
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
  list: (params?: { search?: string; category?: string; status?: string; shop_type?: string; contacted?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.category) q.append('category', params.category);
    if (params?.status) q.append('status', params.status);
    if (params?.shop_type) q.append('shop_type', params.shop_type);
    if (params?.contacted !== undefined) q.append('contacted', String(params.contacted));
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return api.get<Lead[]>(`/leads${queryStr}`);
  },
  create: (data: {
    phone: string;
    shop_name: string;
    owner_name?: string;
    email?: string;
    website?: string;
    facebook_url?: string;
    category?: string;
    shop_type?: string;
    address?: string;
    notes?: string;
    status?: string;
    force_save?: boolean;
  }) => api.post<Lead>('/leads/', data),
  update: (id: number, data: Partial<Lead>) => api.put<Lead>(`/leads/${id}/`, data),
  updateStatus: (id: number, status: string) => api.patch<{ id: number; status: string }>(`/leads/${id}/status/`, { status }),
  delete: (id: number) => api.delete(`/leads/${id}/`),
  checkPhone: (phone: string, excludeId?: number) =>
    api.get<{
      is_duplicate: boolean;
      type?: 'Contact' | 'Lead';
      name?: string;
      phone?: string;
      id?: number;
      category?: string;
    }>(`/leads/check-phone/?phone=${encodeURIComponent(phone)}${excludeId ? `&exclude_id=${excludeId}` : ''}`),
  scanWhatsApp: (phone: string) =>
    api.get<{
      connected: boolean;
      exists: boolean;
      phone: string;
      jid?: string;
      name?: string | null;
      pushName?: string | null;
      businessProfile?: {
        address?: string;
        description?: string;
        category?: string;
        website?: string[];
      } | null;
      profilePictureUrl?: string | null;
      about?: string | null;
      message?: string;
    }>(`/leads/scan-phone/?phone=${encodeURIComponent(phone)}`),
  aiEnrich: (phone: string) =>
    api.get<{
      phone: string;
      is_on_whatsapp: boolean;
      shop_name: string;
      owner_name: string;
      category: string;
      shop_type: string;
      address: string;
      notes: string;
      profile_picture_url?: string | null;
      whatsapp_about?: string | null;
      sources_found: string[];
      confidence: string;
      error?: string;
    }>(`/leads/ai-enrich/?phone=${encodeURIComponent(phone)}`),
  listCategories: () => api.get<LeadCategory[]>('/lead-categories'),
  createCategory: (data: { name: string; description?: string }) =>
    api.post<LeadCategory>('/lead-categories', data),
  deleteCategory: (id: number) =>
    api.delete<{ success: boolean; message: string }>(`/lead-categories/${id}`),
  getExportCsvUrl: () => '/api/proxy/leads/export-csv',
  autoGenerate: (data: {
    query: string;
    country?: string;
    limit?: number;
    only_whatsapp?: boolean;
    category?: string;
    exclude_existing?: boolean;
  }) => api.post<{ count: number; leads: GeneratedLead[] }>('/leads/auto-generate', data),
  batchImport: (leads: Partial<GeneratedLead>[]) =>
    api.post<{ imported_count: number; skipped_count: number; imported: any[] }>('/leads/batch-import', { leads }),
};

export const ChatService = {
  list: () => api.get<ChatListItem[]>('/chats'),
  messages: (phone: string, limit = 100, beforeId?: number) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (beforeId) q.append('before_id', String(beforeId));
    return api.get<ChatMessage[]>(`/chats/${encodeURIComponent(phone)}/messages?${q.toString()}`);
  },
  send: (phone: string, data: { message?: string; media_type?: string; media_url?: string; media_base64?: string; file_name?: string; mime_type?: string }) =>
    api.post(`/chats/${encodeURIComponent(phone)}/send`, data),
  markRead: (phone: string) => api.post(`/chats/${encodeURIComponent(phone)}/read`),
};

export const BotService = {
  getConfig: () =>
    api.get<{
      enabled: boolean;
      auto_lead_gen: boolean;
      model: string;
      fallback_model: string;
      reply_delay_seconds: number;
      disabled_phones: string[];
    }>('/bot/config'),
  updateConfig: (data: Partial<{
    enabled: boolean;
    auto_lead_gen: boolean;
    model: string;
    reply_delay_seconds: number;
  }>) => api.post('/bot/config', data),
  getChatStatus: (phone: string) =>
    api.get<{ phone: string; is_bot_active: boolean; globally_enabled: boolean }>(
      `/chats/${encodeURIComponent(phone)}/bot-status`
    ),
  toggleChat: (phone: string, enabled: boolean) =>
    api.post<{ phone: string; is_bot_active: boolean }>(
      `/chats/${encodeURIComponent(phone)}/bot-toggle`,
      { enabled }
    ),
  suggestReply: (phone: string, hint?: string) =>
    api.post<{ draft_reply: string }>('/bot/suggest-reply', { phone, hint }),
};

export const AuthService = {
  login: (data: { username: string; password: string }) =>
    api.post<{ success: boolean; token: string; username: string; name: string }>('/auth/login', data),
  verify: (token: string) =>
    api.get<{ valid: boolean; username: string; name: string }>(`/auth/verify?token=${encodeURIComponent(token)}`),
};

export default api;
export const SystemService = {
  getStatus: () => api.get<SystemStatus>('/system/status'),
};


export interface LearnedSuggestion {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  category: string;
  source: string;
  confidence: number;
  customer_query_sample: string;
  created_at: string;
}

export interface CustomerMemory {
  shop_name?: string;
  owner_name?: string;
  business_type?: string;
  location?: string;
  key_interests?: string;
  last_topic?: string;
  special_notes?: string;
  updated_at?: string;
}

export interface QARule {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  category: string;
  is_active: boolean;
}

export interface RegShop {
  id: number | string;
  name: string;
  slug: string;
  business_type: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
  created_at: string | null;
  trial_ends_at: string | null;
  plan_name: string;
  plan_tier: string;
  is_manual: boolean;
  custom_notes: string;
  ai_instructions: string;
  custom_whatsapp_phone: string;
  tags: string[];
  customized: boolean;
}

export interface RegPending {
  id: number;
  shop_name: string;
  owner_name: string;
  email: string;
  phone: string;
  business_type: string;
  created_at: string | null;
  custom_notes?: string;
}

export interface RegDbListResponse {
  total_shops: number;
  active_shops: number;
  customized_count: number;
  shops: RegShop[];
}

export const RegDbService = {
    getQARules: () => api.get<QARule[]>('/reg-db/qa-rules'),
  saveQARule: (rule: Partial<QARule>) => api.post<QARule>('/reg-db/qa-rules', rule),
    getLearnedSuggestions: () => api.get<LearnedSuggestion[]>('/reg-db/learned-suggestions/'),
  approveSuggestion: (id: string) =>
    api.post<{ success: boolean; rule: QARule }>(`/reg-db/learned-suggestions/${encodeURIComponent(id)}/approve/`),
  dismissSuggestion: (id: string) =>
    api.delete<{ success: boolean }>(`/reg-db/learned-suggestions/${encodeURIComponent(id)}/`),
  mineChats: () => api.post<{ mined_count: number; suggestions: LearnedSuggestion[] }>('/reg-db/mine-chats/'),
  getCustomerMemory: (phone: string) => api.get<CustomerMemory>(`/chats/${encodeURIComponent(phone)}/memory/`),
  deleteQARule: (ruleId: string) => api.delete<{ success: boolean }>(`/reg-db/qa-rules/${encodeURIComponent(ruleId)}`),
  getShops: (params?: { search?: string; plan?: string; status?: string }) =>
    api.get<RegDbListResponse>('/reg-db/shops', { params }),
  getPending: () => api.get<RegPending[]>('/reg-db/pending'),
  saveShopCustom: (shopId: number | string, data: {
    custom_notes: string;
    ai_instructions: string;
    custom_whatsapp_phone: string;
    tags: string[];
  }) => api.post(`/reg-db/shops/${encodeURIComponent(shopId)}/custom`, data),
  saveManualShop: (data: {
    id?: string;
    shop_name: string;
    owner_name: string;
    phone: string;
    business_type: string;
    plan_name: string;
    is_active: boolean;
    custom_notes: string;
    ai_instructions: string;
    tags: string[];
  }) => api.post('/reg-db/manual-shop', data),
  deleteManualShop: (manualId: string) => api.delete(`/reg-db/manual-shop/${encodeURIComponent(manualId)}`),
};
