'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tooltip,
  LinearProgress,
  Avatar,
  Badge,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Grid,
  Tabs,
  Tab,
  Snackbar,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ChatIcon from '@mui/icons-material/Chat';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CategoryIcon from '@mui/icons-material/Category';
import BusinessIcon from '@mui/icons-material/Business';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import StarsIcon from '@mui/icons-material/Stars';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MapIcon from '@mui/icons-material/Map';
import FacebookIcon from '@mui/icons-material/Facebook';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import EditNoteIcon from '@mui/icons-material/EditNote';

import { Lead, LeadCategory, LeadService, ChatService, GeneratedLead } from '@/lib/api';

interface LeadManagerProps {
  onDirectMessage?: (phone: string) => void;
}

const SHOP_TYPES = ['Retail', 'Wholesale', 'Distributor', 'Online Store', 'Service Center', 'Corporate'];
const LEAD_STATUSES = [
  { value: 'NEW', label: 'New Lead', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  { value: 'CONTACTED', label: 'Contacted', bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  { value: 'IN_PROGRESS', label: 'In Progress', bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  { value: 'INTERESTED', label: 'Interested', bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' },
  { value: 'QUALIFIED', label: 'Qualified', bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  { value: 'CONVERTED', label: 'Converted (Customer)', bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
  { value: 'LOST', label: 'Lost / Closed', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
];

export default function LeadManager({ onDirectMessage }: LeadManagerProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [categories, setCategories] = useState<LeadCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  
  // Segmented Outreach Tab: 'all' | 'contacted' | 'uncontacted' | 'converted'
  const [activeTab, setActiveTab] = useState<'all' | 'contacted' | 'uncontacted' | 'converted'>('all');

  // Updating lead status in-table state (leadId -> boolean)
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  // Selected Lead for Modern Profile Popup
  const [profileLead, setProfileLead] = useState<Lead | null>(null);
  const [quickMsg, setQuickMsg] = useState<string>('');
  const [sendingQuickMsg, setSendingQuickMsg] = useState<boolean>(false);
  const [quickMsgSuccess, setQuickMsgSuccess] = useState<boolean>(false);
  const [copiedPhone, setCopiedPhone] = useState<boolean>(false);

  // Full Image Preview / Lightbox Modal State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  // 🤖 Auto Lead Generator Hub State
  const [openAutoGenerator, setOpenAutoGenerator] = useState<boolean>(false);
  const [genQuery, setGenQuery] = useState<string>('electronics shop in mirpur');
  const [genLimit, setGenLimit] = useState<number>(50);
  const [genOnlyWhatsapp, setGenOnlyWhatsapp] = useState<boolean>(false);
  const [genCategory, setGenCategory] = useState<string>('Electronics');
  const [generatingLeads, setGeneratingLeads] = useState<boolean>(false);
  const [stagedLeads, setStagedLeads] = useState<GeneratedLead[]>([]);
  const [selectedStagedIds, setSelectedStagedIds] = useState<Set<string>>(new Set());
  const [importingStaged, setImportingStaged] = useState<boolean>(false);
  const [editingStagedLead, setEditingStagedLead] = useState<GeneratedLead | null>(null);
  const [batchCategoryAssign, setBatchCategoryAssign] = useState<string>('Electronics');

  // Snackbar Notification State
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showNotification = (message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // Add / Edit Modal State
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Form Fields
  const [phone, setPhone] = useState<string>('');
  const [shopName, setShopName] = useState<string>('');
  const [ownerName, setOwnerName] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [shopType, setShopType] = useState<string>('Retail');
  const [status, setStatus] = useState<string>('NEW');
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Live WhatsApp & AI Scan State
  const [scanningWa, setScanningWa] = useState<boolean>(false);
  const [waScanResult, setWaScanResult] = useState<{
    scanned: boolean;
    connected: boolean;
    exists: boolean;
    name?: string | null;
    profilePictureUrl?: string | null;
    about?: string | null;
    businessProfile?: any;
    sources_found?: string[];
    confidence?: string;
  } | null>(null);

  // Live Duplicate Check State
  const [checkingDup, setCheckingDup] = useState<boolean>(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    is_duplicate: boolean;
    type?: string;
    name?: string;
    phone?: string;
  } | null>(null);

  // Warning Confirmation Dialog for Duplicate Phone
  const [showDupWarningDialog, setShowDupWarningDialog] = useState<boolean>(false);

  // Inline Category Add Dialog
  const [openAddCategoryDialog, setOpenAddCategoryDialog] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  const fetchLeadsAndCategories = async () => {
    setLoading(true);
    try {
      const [leadsRes, catsRes] = await Promise.all([
        LeadService.list({
          search,
          category: selectedCategory,
          status: selectedStatus,
        }),
        LeadService.listCategories(),
      ]);
      setLeads(leadsRes.data || []);
      setCategories(catsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadsAndCategories();
  }, [selectedCategory, selectedStatus]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLeadsAndCategories();
    }, 350);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Compute counts for tab badges
  const counts = useMemo(() => {
    let total = leads.length;
    let contacted = 0;
    let uncontacted = 0;
    let converted = 0;

    leads.forEach((l) => {
      if (l.is_contacted || l.status === 'CONTACTED') {
        contacted++;
      } else {
        uncontacted++;
      }
      if (l.status === 'CONVERTED' || l.status === 'QUALIFIED') {
        converted++;
      }
    });

    return { total, contacted, uncontacted, converted };
  }, [leads]);

  // Filter leads based on active tab
  const filteredLeads = useMemo(() => {
    if (activeTab === 'contacted') {
      return leads.filter((l) => l.is_contacted || l.status === 'CONTACTED');
    }
    if (activeTab === 'uncontacted') {
      return leads.filter((l) => !l.is_contacted && l.status !== 'CONTACTED');
    }
    if (activeTab === 'converted') {
      return leads.filter((l) => l.status === 'CONVERTED' || l.status === 'QUALIFIED');
    }
    return leads;
  }, [leads, activeTab]);

  // Handle Quick Inline Status Change
  const handleQuickStatusChange = async (leadId: number, newStatus: string) => {
    setUpdatingStatusId(leadId);
    try {
      await LeadService.updateStatus(leadId, newStatus);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                status: newStatus,
                is_contacted: newStatus === 'CONTACTED' ? true : l.is_contacted,
              }
            : l
        )
      );
      if (profileLead && profileLead.id === leadId) {
        setProfileLead((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err) {
      alert('Failed to update lead status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Open Modern Profile Popup
  const handleOpenProfile = (lead: Lead) => {
    setProfileLead(lead);
    setQuickMsg('');
    setQuickMsgSuccess(false);
    setCopiedPhone(false);
  };

  const handleCopyPhone = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleSendQuickMessage = async () => {
    if (!profileLead || !quickMsg.trim()) return;
    setSendingQuickMsg(true);
    try {
      await ChatService.send(profileLead.phone, { message: quickMsg.trim() });
      setQuickMsg('');
      setQuickMsgSuccess(true);
      
      // Update local lead to contacted
      setLeads((prev) =>
        prev.map((l) =>
          l.id === profileLead.id
            ? {
                ...l,
                is_contacted: true,
                status: l.status === 'NEW' ? 'CONTACTED' : l.status,
                last_contacted_at: new Date().toISOString(),
                sent_messages_count: (l.sent_messages_count || 0) + 1,
              }
            : l
        )
      );
      setProfileLead((prev) =>
        prev
          ? {
              ...prev,
              is_contacted: true,
              status: prev.status === 'NEW' ? 'CONTACTED' : prev.status,
              last_contacted_at: new Date().toISOString(),
              sent_messages_count: (prev.sent_messages_count || 0) + 1,
            }
          : null
      );

      setTimeout(() => setQuickMsgSuccess(false), 3000);
    } catch (err) {
      alert('Failed to send WhatsApp message. Make sure WhatsApp is connected.');
    } finally {
      setSendingQuickMsg(false);
    }
  };

  // =========================================================================
  // 🤖 AUTO LEAD GENERATOR LOGIC
  // =========================================================================
  const handleStartLeadGeneration = async () => {
    if (!genQuery.trim()) {
      showNotification('Please enter a search query or tag (e.g. electronics in mirpur)', 'warning');
      return;
    }
    setGeneratingLeads(true);
    setSelectedStagedIds(new Set());
    try {
      const res = await LeadService.autoGenerate({
        query: genQuery.trim(),
        limit: genLimit,
        only_whatsapp: genOnlyWhatsapp,
        category: genCategory !== 'All' ? genCategory : undefined,
        exclude_existing: true,
      });
      const fetched = res.data.leads || [];
      setStagedLeads(fetched);
      const allIds = new Set(fetched.map((l: GeneratedLead) => l.id));
      setSelectedStagedIds(allIds);
      showNotification(`Discovered ${res.data.count} targeted businesses!`, 'success');
    } catch (e: any) {
      console.error(e);
      showNotification(e?.response?.data?.detail || 'Failed to generate leads. Please try again.', 'error');
    } finally {
      setGeneratingLeads(false);
    }
  };

  const handleToggleSelectStaged = (id: string) => {
    setSelectedStagedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllStaged = () => {
    if (selectedStagedIds.size === stagedLeads.length) {
      setSelectedStagedIds(new Set());
    } else {
      setSelectedStagedIds(new Set(stagedLeads.map((l) => l.id)));
    }
  };

  const handleImportSelectedStaged = async () => {
    const toImport = stagedLeads.filter((l) => selectedStagedIds.has(l.id) && !l.already_in_crm);
    if (toImport.length === 0) {
      showNotification('Please select at least one new business to assign to leads', 'warning');
      return;
    }
    setImportingStaged(true);
    try {
      const payload = toImport.map((l) => ({
        ...l,
        category: batchCategoryAssign || l.category || 'General',
      }));
      const res = await LeadService.batchImport(payload);
      showNotification(`Successfully assigned ${res.data.imported_count} leads to CRM!`, 'success');
      const importedPhones = new Set((res.data.imported || []).map((i: any) => i.phone));
      setStagedLeads((prev) =>
        prev.map((l) => (importedPhones.has(l.phone) ? { ...l, already_in_crm: true } : l))
      );
      setSelectedStagedIds((prev) => {
        const next = new Set(prev);
        toImport.forEach((l) => {
          if (importedPhones.has(l.phone)) next.delete(l.id);
        });
        return next;
      });
      fetchLeadsAndCategories();
    } catch (e: any) {
      console.error(e);
      showNotification(e?.response?.data?.detail || 'Failed to import selected leads', 'error');
    } finally {
      setImportingStaged(false);
    }
  };

  const handleImportSingleStaged = async (lead: GeneratedLead) => {
    setImportingStaged(true);
    try {
      const payload = [{
        ...lead,
        category: batchCategoryAssign || lead.category || 'General',
      }];
      const res = await LeadService.batchImport(payload);
      showNotification(`Added ${lead.shop_name} to CRM Leads!`, 'success');
      setStagedLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, already_in_crm: true } : l))
      );
      setSelectedStagedIds((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
      fetchLeadsAndCategories();
    } catch (e: any) {
      console.error(e);
      showNotification('Failed to import lead', 'error');
    } finally {
      setImportingStaged(false);
    }
  };

  const handleSaveEditedStagedLead = (updated: GeneratedLead) => {
    setStagedLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setEditingStagedLead(null);
    showNotification('Updated lead details!', 'success');
  };

  const handleOpenAdd = () => {
    setEditingLead(null);
    setPhone('');
    setShopName('');
    setOwnerName('');
    setCategory('General');
    setShopType('Retail');
    setStatus('NEW');
    setAddress('');
    setNotes('');
    setWaScanResult(null);
    setDuplicateInfo(null);
    setOpenModal(true);
  };

  const handleOpenEdit = (lead: Lead) => {
    setEditingLead(lead);
    setPhone(lead.phone);
    setShopName(lead.shop_name);
    setOwnerName(lead.owner_name || '');
    setCategory(lead.category || 'General');
    setShopType(lead.shop_type || 'Retail');
    setStatus(lead.status || 'NEW');
    setAddress(lead.address || '');
    setNotes(lead.notes || '');
    setWaScanResult({
      scanned: true,
      connected: true,
      exists: lead.is_on_whatsapp,
      name: lead.whatsapp_name || lead.shop_name,
      profilePictureUrl: lead.whatsapp_profile_pic,
      about: lead.whatsapp_about,
      sources_found: lead.is_on_whatsapp ? ['WhatsApp Profile'] : [],
      confidence: 'high',
    });
    setDuplicateInfo(null);
    setOpenModal(true);
  };

  const handlePhoneBlur = async () => {
    const p = phone.trim();
    if (!p) {
      setDuplicateInfo(null);
      return;
    }
    setCheckingDup(true);
    try {
      const res = await LeadService.checkPhone(p, editingLead?.id);
      setDuplicateInfo(res.data);
    } catch (err) {
      // ignore
    } finally {
      setCheckingDup(false);
    }
  };

  const handleScanWhatsApp = async () => {
    const p = phone.trim();
    if (!p) {
      alert('Please enter a phone number first to scan with AI.');
      return;
    }
    setScanningWa(true);
    try {
      const res = await LeadService.aiEnrich(p);
      let data = res.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {}
      }

      setWaScanResult({
        scanned: true,
        connected: true,
        exists: !!data?.is_on_whatsapp,
        name: data?.owner_name || data?.shop_name || null,
        profilePictureUrl: data?.profile_picture_url,
        about: data?.whatsapp_about,
        sources_found: data?.sources_found || [],
        confidence: data?.confidence || 'medium',
      });

      if (data?.shop_name) setShopName(data.shop_name);
      if (data?.owner_name) setOwnerName(data.owner_name);
      if (data?.address) setAddress(data.address);
      if (data?.notes) setNotes(data.notes);
      if (data?.shop_type) setShopType(data.shop_type);
      if (data?.category && data.category !== 'General') {
        const foundCat = categories.find(
          (c) => c.name.toLowerCase() === data.category.toLowerCase()
        );
        if (foundCat) setCategory(foundCat.name);
      }
    } catch (err: any) {
      console.error('AI Scan WhatsApp error:', err);
      setWaScanResult({
        scanned: true,
        connected: false,
        exists: false,
        sources_found: [],
        confidence: 'low',
      });
    } finally {
      setScanningWa(false);
    }
  };

  const handleSaveLead = async (force = false) => {
    const p = phone.trim();
    const sn = shopName.trim();

    if (!p) {
      alert('Phone number is required.');
      return;
    }
    if (!sn) {
      alert('Shop / Business name is required.');
      return;
    }

    if (!force && duplicateInfo?.is_duplicate && !editingLead) {
      setShowDupWarningDialog(true);
      return;
    }

    try {
      const payload = {
        phone: p,
        shop_name: sn,
        owner_name: ownerName.trim() || undefined,
        category,
        shop_type: shopType,
        status,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        force_save: force,
      };

      if (editingLead) {
        await LeadService.update(editingLead.id, payload);
      } else {
        await LeadService.create(payload);
      }

      setOpenModal(false);
      setShowDupWarningDialog(false);
      fetchLeadsAndCategories();
    } catch (err: any) {
      if (err.response?.status === 409 && !force) {
        setDuplicateInfo(err.response.data?.detail || { is_duplicate: true });
        setShowDupWarningDialog(true);
      } else {
        alert(err.response?.data?.detail || 'Failed to save lead.');
      }
    }
  };

  const handleDeleteLead = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete lead "${name}"?`)) {
      try {
        await LeadService.delete(id);
        if (profileLead?.id === id) setProfileLead(null);
        fetchLeadsAndCategories();
      } catch (err) {
        alert('Failed to delete lead.');
      }
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await LeadService.createCategory({ name: newCategoryName.trim() });
      setCategories([...categories, res.data]);
      setCategory(res.data.name);
      setNewCategoryName('');
      setOpenAddCategoryDialog(false);
    } catch (err) {
      alert('Failed to create category.');
    }
  };

  const getStatusConfig = (st: string) => {
    return (
      LEAD_STATUSES.find((s) => s.value === st) || {
        value: st,
        label: st,
        bg: '#f1f5f9',
        text: '#475569',
        border: '#cbd5e1',
      }
    );
  };

  const formatRelativeTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      if (diffSec < 172800) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <Card sx={{ mb: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header Title & Actions */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2.5, gap: 1.5 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, color: '#0f172a' }}>
              <StorefrontIcon sx={{ color: '#10b981' }} /> Lead Management & WhatsApp CRM
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track customer outreach, manage WhatsApp message delivery status, and organize retail/wholesale leads.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => window.open(LeadService.getExportCsvUrl(), '_blank')}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, color: '#334155', borderColor: '#cbd5e1' }}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<SmartToyIcon />}
              onClick={() => setOpenAutoGenerator(true)}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                boxShadow: '0 3px 12px rgba(99, 102, 241, 0.35)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                },
              }}
            >
              🤖 Auto Lead Generator
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenAdd}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)',
              }}
            >
              Add New Lead
            </Button>
          </Stack>
        </Stack>

        {/* ========================================================================= */}
        {/* 🌟 MODERN OUTREACH & LIFECYCLE SEPARATION TABS */}
        {/* ========================================================================= */}
        <Paper
          elevation={0}
          sx={{
            mb: 2.5,
            p: 0.5,
            bgcolor: '#f1f5f9',
            borderRadius: 2.5,
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                bgcolor: '#10b981',
              },
            }}
          >
            {/* Tab 1: All Leads */}
            <Tab
              value="all"
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <StorefrontIcon sx={{ fontSize: 18 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>All Leads</Typography>
                  <Chip
                    label={counts.total}
                    size="small"
                    sx={{
                      height: 20,
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      bgcolor: activeTab === 'all' ? '#0f172a' : '#cbd5e1',
                      color: activeTab === 'all' ? '#ffffff' : '#334155',
                    }}
                  />
                </Stack>
              }
              sx={{ textTransform: 'none', minHeight: 44, px: 2, borderRadius: 2 }}
            />

            {/* Tab 2: Messaged / Contacted */}
            <Tab
              value="contacted"
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <MarkEmailReadIcon sx={{ fontSize: 18, color: '#10b981' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#047857' }}>💬 Messaged / Contacted</Typography>
                  <Chip
                    label={counts.contacted}
                    size="small"
                    sx={{
                      height: 20,
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      bgcolor: '#dcfce7',
                      color: '#15803d',
                      border: '1px solid #86efac',
                    }}
                  />
                </Stack>
              }
              sx={{ textTransform: 'none', minHeight: 44, px: 2, borderRadius: 2 }}
            />

            {/* Tab 3: Not Messaged / Pending */}
            <Tab
              value="uncontacted"
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <HourglassEmptyIcon sx={{ fontSize: 18, color: '#d97706' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#b45309' }}>⏳ Not Contacted Yet</Typography>
                  <Chip
                    label={counts.uncontacted}
                    size="small"
                    sx={{
                      height: 20,
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      bgcolor: '#fef3c7',
                      color: '#b45309',
                      border: '1px solid #fde68a',
                    }}
                  />
                </Stack>
              }
              sx={{ textTransform: 'none', minHeight: 44, px: 2, borderRadius: 2 }}
            />

            {/* Tab 4: Converted / Qualified */}
            <Tab
              value="converted"
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <StarsIcon sx={{ fontSize: 18, color: '#9333ea' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#7e22ce' }}>🎯 Converted</Typography>
                  <Chip
                    label={counts.converted}
                    size="small"
                    sx={{
                      height: 20,
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      bgcolor: '#f3e8ff',
                      color: '#7e22ce',
                      border: '1px solid #d8b4fe',
                    }}
                  />
                </Stack>
              }
              sx={{ textTransform: 'none', minHeight: 44, px: 2, borderRadius: 2 }}
            />
          </Tabs>
        </Paper>

        {/* Filters Bar */}
        <Box sx={{ mb: 2.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <TextField
              size="small"
              placeholder="Search by shop name, owner, phone, or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              sx={{ flexGrow: 1, bgcolor: '#ffffff', borderRadius: 1.5 }}
            />

            <FormControl size="small" sx={{ minWidth: 160, bgcolor: '#ffffff', borderRadius: 1.5 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="">
                  <em>All Categories</em>
                </MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.name}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150, bgcolor: '#ffffff', borderRadius: 1.5 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={selectedStatus}
                label="Status"
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <MenuItem value="">
                  <em>All Statuses</em>
                </MenuItem>
                {LEAD_STATUSES.map((st) => (
                  <MenuItem key={st.value} value={st.value}>
                    {st.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton size="small" onClick={fetchLeadsAndCategories} sx={{ color: 'text.secondary', bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {loading && <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />}

        {/* Uniform Sized Modern Leads Table */}
        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2.5, overflow: 'hidden' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 920 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '25%', py: 1.5 }}>Shop & Profile</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '17%', py: 1.5 }}>Phone / WhatsApp</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '18%', py: 1.5 }}>WhatsApp Outreach</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '12%', py: 1.5 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '14%', py: 1.5 }}>Lead Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#0f172a', width: '14%', py: 1.5 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    <StorefrontIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1, display: 'block', mx: 'auto' }} />
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>No leads found in this view.</Typography>
                    <Typography variant="body2" color="text.secondary">Try switching tabs or click "Add New Lead" to register a shop.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const statusStyle = getStatusConfig(lead.status);
                  const isContacted = lead.is_contacted || lead.status === 'CONTACTED';

                  return (
                    <TableRow
                      key={lead.id}
                      hover
                      onClick={() => handleOpenProfile(lead)}
                      sx={{
                        cursor: 'pointer',
                        height: 68,
                        transition: 'background-color 0.15s ease',
                        '&:hover': { bgcolor: '#f8fafc' },
                      }}
                    >
                      {/* 1. Shop Name & Avatar */}
                      <TableCell sx={{ py: 1 }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <Tooltip title={lead.whatsapp_profile_pic ? "Click to view full photo" : "No photo available"}>
                            <Box
                              onClick={(e) => {
                                if (lead.whatsapp_profile_pic) {
                                  e.stopPropagation();
                                  setPreviewImage({
                                    url: lead.whatsapp_profile_pic,
                                    title: lead.shop_name,
                                    subtitle: `${lead.phone} • ${lead.category || 'Retail'}`
                                  });
                                }
                              }}
                              sx={{
                                cursor: lead.whatsapp_profile_pic ? 'pointer' : 'default',
                                display: 'inline-flex',
                                transition: 'transform 0.2s ease',
                                '&:hover': lead.whatsapp_profile_pic ? { transform: 'scale(1.12)' } : {},
                              }}
                            >
                              <Badge
                                overlap="circular"
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                badgeContent={
                                  lead.is_on_whatsapp ? (
                                    <CheckCircleIcon sx={{ color: '#25D366', fontSize: 16, bgcolor: '#ffffff', borderRadius: '50%' }} />
                                  ) : null
                                }
                              >
                                <Avatar
                                  src={lead.whatsapp_profile_pic || undefined}
                                  sx={{
                                    width: 42,
                                    height: 42,
                                    bgcolor: '#0f172a',
                                    fontWeight: 700,
                                    fontSize: '0.9rem',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                                    border: lead.whatsapp_profile_pic ? '2px solid #10b981' : 'none',
                                  }}
                                >
                                  {lead.shop_name.charAt(0).toUpperCase()}
                                </Avatar>
                              </Badge>
                            </Box>
                          </Tooltip>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                color: '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                '&:hover': { color: '#10b981' },
                              }}
                            >
                              {lead.shop_name}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {lead.owner_name || 'No Owner'} • {lead.shop_type || 'Retail'}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* 2. Phone / WhatsApp */}
                      <TableCell sx={{ py: 1 }}>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: '#1e293b',
                              fontSize: '0.85rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {lead.phone}
                          </Typography>
                          <Tooltip title="Open WhatsApp Chat">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank');
                              }}
                              sx={{ color: '#25D366', p: 0.3, '&:hover': { bgcolor: '#ecfdf5' } }}
                            >
                              <WhatsAppIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>

                      {/* 3. WhatsApp Outreach Status (Contacted / Pending) */}
                      <TableCell sx={{ py: 1 }}>
                        {isContacted ? (
                          <Box>
                            <Chip
                              icon={<DoneAllIcon sx={{ fontSize: '14px !important', color: '#15803d !important' }} />}
                              label={`Messaged ${lead.last_contacted_at ? `(${formatRelativeTime(lead.last_contacted_at)})` : ''}`}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                bgcolor: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #86efac',
                                height: 24,
                              }}
                            />
                            {lead.sent_messages_count ? (
                              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.7rem', mt: 0.2 }}>
                                {lead.sent_messages_count} message{lead.sent_messages_count > 1 ? 's' : ''} sent
                              </Typography>
                            ) : null}
                          </Box>
                        ) : (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <Chip
                              label="Uncontacted"
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                bgcolor: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                height: 24,
                              }}
                            />
                            {onDirectMessage && (
                              <Tooltip title="Send Intro Message">
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDirectMessage(lead.phone);
                                  }}
                                  sx={{ color: '#10b981', p: 0.4, bgcolor: '#f0fdf4', '&:hover': { bgcolor: '#dcfce7' } }}
                                >
                                  <SendIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        )}
                      </TableCell>

                      {/* 4. Category */}
                      <TableCell sx={{ py: 1 }}>
                        <Chip
                          label={lead.category || 'General'}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            maxWidth: '100%',
                            height: 24,
                          }}
                        />
                      </TableCell>

                      {/* 5. Status (1-Click Inline Dropdown) */}
                      <TableCell sx={{ py: 1 }} onClick={(e) => e.stopPropagation()}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={lead.status || 'NEW'}
                            disabled={updatingStatusId === lead.id}
                            onChange={(e) => handleQuickStatusChange(lead.id, e.target.value as string)}
                            sx={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              height: 28,
                              bgcolor: statusStyle.bg,
                              color: statusStyle.text,
                              border: `1px solid ${statusStyle.border}`,
                              borderRadius: 1.5,
                              '& .MuiSelect-select': {
                                py: 0.5,
                                px: 1,
                              },
                              '& fieldset': { border: 'none' },
                            }}
                          >
                            {LEAD_STATUSES.map((st) => (
                              <MenuItem key={st.value} value={st.value} sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    bgcolor: st.text,
                                    display: 'inline-block',
                                    mr: 1,
                                  }}
                                />
                                {st.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>

                      {/* 6. Actions */}
                      <TableCell align="right" sx={{ py: 1 }} onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <Tooltip title="View Profile & Notes">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenProfile(lead)}
                              sx={{ color: '#10b981', '&:hover': { bgcolor: '#ecfdf5' } }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {onDirectMessage && (
                            <Tooltip title="Open Live Chat">
                              <IconButton
                                size="small"
                                onClick={() => onDirectMessage(lead.phone)}
                                sx={{ color: '#0284c7', '&:hover': { bgcolor: '#f0f9ff' } }}
                              >
                                <ChatIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit Lead">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEdit(lead)}
                              sx={{ color: '#64748b', '&:hover': { bgcolor: '#f8fafc' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteLead(lead.id, lead.shop_name)}
                              sx={{ '&:hover': { bgcolor: '#fef2f2' } }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      {/* ========================================================================= */}
      {/* 🌟 MODERNIZED LEAD PROFILE POPUP (Full Details & WhatsApp Outreach) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(profileLead)}
        onClose={() => setProfileLead(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3.5,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          },
        }}
      >
        {profileLead && (
          <>
            {/* Header Profile Hero Card */}
            <Box
              sx={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                p: 3,
                position: 'relative',
              }}
            >
              <IconButton
                onClick={() => setProfileLead(null)}
                sx={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  color: '#94a3b8',
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.15)' },
                }}
              >
                <CloseIcon />
              </IconButton>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: { sm: 'center' } }}>
                <Tooltip title={profileLead.whatsapp_profile_pic ? "Click to view full photo" : ""}>
                  <Box
                    onClick={() => {
                      if (profileLead.whatsapp_profile_pic) {
                        setPreviewImage({
                          url: profileLead.whatsapp_profile_pic,
                          title: profileLead.shop_name,
                          subtitle: `${profileLead.phone} • ${profileLead.owner_name || profileLead.category}`
                        });
                      }
                    }}
                    sx={{
                      cursor: profileLead.whatsapp_profile_pic ? 'pointer' : 'default',
                      display: 'inline-flex',
                      transition: 'transform 0.2s ease',
                      '&:hover': profileLead.whatsapp_profile_pic ? { transform: 'scale(1.08)' } : {},
                    }}
                  >
                    <Badge
                      overlap="circular"
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      badgeContent={
                        profileLead.is_on_whatsapp ? (
                          <CheckCircleIcon sx={{ color: '#25D366', fontSize: 24, bgcolor: '#ffffff', borderRadius: '50%' }} />
                        ) : null
                      }
                    >
                      <Avatar
                        src={profileLead.whatsapp_profile_pic || undefined}
                        sx={{
                          width: 72,
                          height: 72,
                          bgcolor: '#10b981',
                          fontSize: '1.8rem',
                          fontWeight: 800,
                          border: '3px solid rgba(255,255,255,0.2)',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        }}
                      >
                        {profileLead.shop_name.charAt(0).toUpperCase()}
                      </Avatar>
                    </Badge>
                  </Box>
                </Tooltip>

                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                      {profileLead.shop_name}
                    </Typography>
                    <Chip
                      label={getStatusConfig(profileLead.status).label}
                      size="small"
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.7rem',
                        ...getStatusConfig(profileLead.status),
                      }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <PersonIcon fontSize="small" sx={{ color: '#38bdf8' }} />
                    {profileLead.owner_name ? `Contact: ${profileLead.owner_name}` : 'No Owner Specified'}
                  </Typography>

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Chip
                      icon={<CategoryIcon sx={{ fontSize: '0.85rem !important', color: '#6ee7b7 !important' }} />}
                      label={profileLead.category || 'General'}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 600 }}
                    />
                    <Chip
                      icon={<BusinessIcon sx={{ fontSize: '0.85rem !important', color: '#93c5fd !important' }} />}
                      label={profileLead.shop_type || 'Retail'}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 600 }}
                    />
                  </Stack>
                </Box>
              </Stack>
            </Box>

            {/* WhatsApp Outreach Status Banner */}
            <Box
              sx={{
                px: 3,
                py: 1.5,
                bgcolor: profileLead.is_contacted || profileLead.status === 'CONTACTED' ? '#f0fdf4' : '#fffbeb',
                borderBottom: '1px solid',
                borderColor: profileLead.is_contacted || profileLead.status === 'CONTACTED' ? '#bbf7d0' : '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {profileLead.is_contacted || profileLead.status === 'CONTACTED' ? (
                  <>
                    <MarkEmailReadIcon sx={{ color: '#15803d', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#15803d' }}>
                      WhatsApp Message Sent{' '}
                      {profileLead.last_contacted_at ? `(${new Date(profileLead.last_contacted_at).toLocaleString()})` : ''}
                      {profileLead.sent_messages_count ? ` • ${profileLead.sent_messages_count} messages sent` : ''}
                    </Typography>
                  </>
                ) : (
                  <>
                    <HourglassEmptyIcon sx={{ color: '#b45309', fontSize: 20 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#b45309' }}>
                      Not contacted yet on WhatsApp. Send a quick intro message below!
                    </Typography>
                  </>
                )}
              </Stack>

              {/* Fast Status Selector in Modal */}
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select
                  value={profileLead.status || 'NEW'}
                  onChange={(e) => handleQuickStatusChange(profileLead.id, e.target.value as string)}
                  sx={{
                    height: 30,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    bgcolor: '#ffffff',
                    borderRadius: 1.5,
                  }}
                >
                  {LEAD_STATUSES.map((st) => (
                    <MenuItem key={st.value} value={st.value} sx={{ fontSize: '0.8rem' }}>
                      {st.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <DialogContent sx={{ p: 3, bgcolor: '#f8fafc' }}>
              <Grid container spacing={2.5}>
                {/* Left Column: Contact & Business Details */}
                <Grid item xs={12} md={7}>
                  {/* Phone & WhatsApp Intelligence Card */}
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, mb: 2, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon fontSize="small" sx={{ color: '#10b981' }} /> Contact & WhatsApp Intelligence
                    </Typography>

                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: '#f1f5f9', borderRadius: 2, mb: 1.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                          PHONE NUMBER
                        </Typography>
                        <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                          {profileLead.phone}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title={copiedPhone ? 'Copied!' : 'Copy Phone'}>
                          <IconButton size="small" onClick={() => handleCopyPhone(profileLead.phone)} sx={{ bgcolor: '#ffffff' }}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in WhatsApp Web">
                          <IconButton
                            size="small"
                            onClick={() => window.open(`https://wa.me/${profileLead.phone.replace(/\D/g, '')}`, '_blank')}
                            sx={{ bgcolor: '#25D366', color: '#ffffff', '&:hover': { bgcolor: '#1eb857' } }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">WhatsApp Status:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: profileLead.is_on_whatsapp ? '#15803d' : '#b91c1c' }}>
                          {profileLead.is_on_whatsapp ? '✓ Verified WhatsApp Account' : '✕ Not on WhatsApp'}
                        </Typography>
                      </Box>
                      {profileLead.whatsapp_about && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">WhatsApp Bio:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', fontStyle: 'italic', textAlign: 'right', maxWidth: '65%' }}>
                            "{profileLead.whatsapp_about}"
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Paper>

                  {/* Location & Address Card */}
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationOnIcon fontSize="small" sx={{ color: '#ef4444' }} /> Location & Notes
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                        ADDRESS / DISTRICT
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', mt: 0.5 }}>
                        {profileLead.address || 'No address provided.'}
                      </Typography>
                    </Box>

                    {profileLead.notes && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                          INTERNAL NOTES & AI INTELLIGENCE
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#ffffff', borderRadius: 1.5, mt: 0.5 }}>
                          <Typography variant="body2" sx={{ color: '#475569', whiteSpace: 'pre-line', fontSize: '0.82rem' }}>
                            {profileLead.notes}
                          </Typography>
                        </Paper>
                      </Box>
                    )}
                  </Paper>
                </Grid>

                {/* Right Column: Quick WhatsApp Messenger & Profile Actions */}
                <Grid item xs={12} md={5}>
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} /> Quick WhatsApp Message
                    </Typography>

                    {quickMsgSuccess && (
                      <Alert severity="success" sx={{ mb: 1.5, py: 0.5, fontSize: '0.8rem' }}>
                        Message sent successfully! Status updated to Contacted.
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      placeholder={`Type a quick message to ${profileLead.shop_name}...`}
                      value={quickMsg}
                      onChange={(e) => setQuickMsg(e.target.value)}
                      sx={{ bgcolor: '#ffffff', mb: 1.5 }}
                    />

                    <Button
                      fullWidth
                      variant="contained"
                      disabled={sendingQuickMsg || !quickMsg.trim()}
                      onClick={handleSendQuickMessage}
                      startIcon={sendingQuickMsg ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SendIcon />}
                      sx={{
                        py: 1,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        textTransform: 'none',
                        borderRadius: 2,
                        mb: 2,
                      }}
                    >
                      {sendingQuickMsg ? 'Sending...' : 'Send WhatsApp Message'}
                    </Button>

                    <Divider sx={{ my: 1 }} />

                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mb: 1.5, display: 'block' }}>
                      MORE ACTIONS
                    </Typography>

                    <Stack spacing={1} sx={{ mt: 'auto' }}>
                      {onDirectMessage && (
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<ChatIcon />}
                          onClick={() => {
                            const p = profileLead.phone;
                            setProfileLead(null);
                            onDirectMessage(p);
                          }}
                          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                        >
                          Open in Full Live Chat
                        </Button>
                      )}
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          const l = profileLead;
                          setProfileLead(null);
                          handleOpenEdit(l);
                        }}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}
                      >
                        Edit Shop Information
                      </Button>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </DialogContent>

            <DialogActions sx={{ p: 2, bgcolor: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 1 }}>
                Registered: {new Date(profileLead.created_at).toLocaleDateString()}
              </Typography>
              <Button onClick={() => setProfileLead(null)} sx={{ fontWeight: 700, color: '#64748b' }}>
                Close Profile
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* 📝 ADD / EDIT LEAD MODAL */}
      {/* ========================================================================= */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorefrontIcon sx={{ color: '#10b981' }} />
          {editingLead ? 'Edit Lead Profile' : 'Add New Lead & Auto-Scan WhatsApp'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3, mt: 1 }}>
          <Stack spacing={2.5}>
            {/* Phone Number + AI Scan */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', mb: 0.5, display: 'block' }}>
                PHONE NUMBER *
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="e.g. 01841774414"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (duplicateInfo) setDuplicateInfo(null);
                    if (waScanResult) setWaScanResult(null);
                  }}
                  onBlur={handlePhoneBlur}
                  helperText="Enter phone & click AI Scan to auto-discover shop info"
                />
                <Button
                  variant="contained"
                  onClick={handleScanWhatsApp}
                  disabled={scanningWa || !phone.trim()}
                  startIcon={scanningWa ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AutoAwesomeIcon />}
                  sx={{
                    whiteSpace: 'nowrap',
                    py: 1,
                    px: 2,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 700,
                    boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    }
                  }}
                >
                  {scanningWa ? 'Scanning...' : '⚡ AI Scan & Auto-Fill'}
                </Button>
              </Stack>

              {/* Duplicate Warning */}
              {duplicateInfo?.is_duplicate && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 1, py: 0.5 }}>
                  <strong>Duplicate Phone Found!</strong> Already registered as {duplicateInfo.type}: "{duplicateInfo.name}".
                </Alert>
              )}

              {/* WhatsApp Live Scan Info Badge */}
              {waScanResult?.scanned && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    bgcolor: waScanResult.exists ? '#f0fdf4' : '#fff1f2',
                    border: `1px solid ${waScanResult.exists ? '#bbf7d0' : '#fecdd3'}`,
                    borderRadius: 2,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <Avatar
                      src={waScanResult.profilePictureUrl || undefined}
                      sx={{ width: 48, height: 48, bgcolor: '#10b981', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                    >
                      {shopName.charAt(0) || <StorefrontIcon />}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: waScanResult.exists ? '#15803d' : '#be123c' }}>
                          {waScanResult.exists ? '✓ Active WhatsApp Account' : '✕ Not found on WhatsApp'}
                        </Typography>
                        {waScanResult.sources_found?.map((src) => (
                          <Chip
                            key={src}
                            label={src}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              bgcolor: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #86efac'
                            }}
                          />
                        ))}
                      </Stack>
                      {waScanResult.about && (
                        <Typography variant="caption" sx={{ color: '#475569', display: 'block', fontStyle: 'italic' }}>
                          "{waScanResult.about}"
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Box>
              )}
            </Box>

            {/* Shop Name & Owner Name */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Shop / Business Name *"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Contact Person / Owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </Stack>

            {/* Category & Shop Type */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  label="Category"
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setOpenAddCategoryDialog(true);
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.name}>
                      {c.name}
                    </MenuItem>
                  ))}
                  <MenuItem value="__add_new__" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    + Add New Category...
                  </MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Shop Type</InputLabel>
                <Select
                  value={shopType}
                  label="Shop Type"
                  onChange={(e) => setShopType(e.target.value)}
                >
                  {SHOP_TYPES.map((st) => (
                    <MenuItem key={st} value={st}>
                      {st}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Status */}
            <FormControl fullWidth size="small">
              <InputLabel>Lead Status</InputLabel>
              <Select
                value={status}
                label="Lead Status"
                onChange={(e) => setStatus(e.target.value)}
              >
                {LEAD_STATUSES.map((st) => (
                  <MenuItem key={st.value} value={st.value}>
                    {st.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Address */}
            <TextField
              fullWidth
              size="small"
              label="Address / District / Market Location"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            {/* Internal Notes */}
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Internal Notes"
              placeholder="e.g. Inquired about wholesale discounts on Saturday..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setOpenModal(false)} sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleSaveLead(false)}
            sx={{ fontWeight: 700, px: 3, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
          >
            {editingLead ? 'Save Changes' : 'Save Lead'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <Dialog open={showDupWarningDialog} onClose={() => setShowDupWarningDialog(false)}>
        <DialogTitle sx={{ fontWeight: 800, color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon /> Duplicate Phone Number
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            The phone number <strong>{phone}</strong> is already registered under:
          </Typography>
          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#fef3c7', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {duplicateInfo?.name} ({duplicateInfo?.type})
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Do you want to save this lead anyway?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowDupWarningDialog(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={() => handleSaveLead(true)} sx={{ fontWeight: 700 }}>
            Save Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline Create Category Dialog */}
      <Dialog open={openAddCategoryDialog} onClose={() => setOpenAddCategoryDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Add New Category</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Category Name"
            placeholder="e.g. Cosmetics & Beauty"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenAddCategoryDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCategory} sx={{ fontWeight: 700 }}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================================= */}
      {/* 🤖 AUTO LEAD GENERATOR & DISCOVERY MODAL */}
      {/* ========================================================================= */}
      <Dialog
        open={openAutoGenerator}
        onClose={() => setOpenAutoGenerator(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            bgcolor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 2,
            px: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
              }}
            >
              <SmartToyIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2, color: '#ffffff' }}>
                Automatic AI Lead Generator & Discovery Hub
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Search Google Maps, Facebook & Web for targeted businesses across Bangladesh with live WhatsApp check.
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={() => setOpenAutoGenerator(false)} sx={{ color: '#94a3b8', '&:hover': { color: '#ffffff' } }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: { xs: 2, sm: 3 }, flex: 1, overflowY: 'auto' }}>
          {/* Search Box & Controls */}
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              mb: 3,
              bgcolor: '#f8fafc',
              borderRadius: 2.5,
              border: '1px solid #e2e8f0',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SearchIcon fontSize="small" sx={{ color: '#6366f1' }} /> Targeted Business Search Criteria
            </Typography>

            <Grid container spacing={2} sx={{ alignItems: 'center' }}>
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search Tag / Keyword / Location"
                  placeholder="e.g. electronics shop in mirpur, clothing store in uttara"
                  value={genQuery}
                  onChange={(e) => setGenQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleStartLeadGeneration();
                  }}
                />
              </Grid>

              <Grid item xs={6} sm={3} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Result Limit</InputLabel>
                  <Select
                    value={genLimit}
                    label="Result Limit"
                    onChange={(e) => setGenLimit(Number(e.target.value))}
                  >
                    <MenuItem value={10}>10 Shops</MenuItem>
                    <MenuItem value={25}>25 Shops</MenuItem>
                    <MenuItem value={50}>50 Shops (Standard)</MenuItem>
                    <MenuItem value={100}>100 Shops (Deep Scan)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={6} sm={3} md={2.5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Default Category</InputLabel>
                  <Select
                    value={genCategory}
                    label="Default Category"
                    onChange={(e) => {
                      setGenCategory(e.target.value);
                      setBatchCategoryAssign(e.target.value);
                    }}
                  >
                    <MenuItem value="All">Auto-Detect</MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.name}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2.5}>
                <Button
                  fullWidth
                  variant="contained"
                  disabled={generatingLeads || !genQuery.trim()}
                  onClick={handleStartLeadGeneration}
                  startIcon={generatingLeads ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AutoAwesomeIcon />}
                  sx={{
                    py: 1,
                    fontWeight: 700,
                    borderRadius: 2,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    boxShadow: '0 3px 10px rgba(99, 102, 241, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                    },
                  }}
                >
                  {generatingLeads ? 'Scanning Web...' : 'Start Discovery'}
                </Button>
              </Grid>
            </Grid>

            {/* Quick Suggestion Chips */}
            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b' }}>
                Popular Searches:
              </Typography>
              {[
                'electronics shop in mirpur',
                'fashion boutique in uttara',
                'mobile showroom in dhaka',
                'pharmacy in dhanmondi',
                'grocery shop in gulshan',
                'wholesale clothing in chittagong',
              ].map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onClick={() => {
                    setGenQuery(tag);
                  }}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    bgcolor: '#e2e8f0',
                    color: '#334155',
                    '&:hover': { bgcolor: '#cbd5e1' },
                  }}
                />
              ))}
            </Stack>

            {/* Filter Toggle */}
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={genOnlyWhatsapp}
                    onChange={(e) => setGenOnlyWhatsapp(e.target.checked)}
                    sx={{ color: '#10b981', '&.Mui-checked': { color: '#10b981' } }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                    Show only verified WhatsApp business numbers 🟢
                  </Typography>
                }
              />
            </Box>
          </Paper>

          {/* Progress Indicator */}
          {generatingLeads && (
            <Box sx={{ mb: 3, p: 3, textAlign: 'center', bgcolor: '#eef2ff', borderRadius: 2.5, border: '1px solid #c7d2fe' }}>
              <CircularProgress size={36} sx={{ color: '#6366f1', mb: 1.5 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#3730a3' }}>
                Scanning Google Maps, Facebook Pages & Web Directories...
              </Typography>
              <Typography variant="body2" sx={{ color: '#4f46e5', maxWidth: 600, mx: 'auto', mt: 0.5 }}>
                Harvesting verified shop profiles for "{genQuery}", validating Bangladeshi phone numbers, checking live WhatsApp accounts, and filtering duplicates from database.
              </Typography>
              <LinearProgress sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: '#c7d2fe', '& .MuiLinearProgress-bar': { bgcolor: '#6366f1' } }} />
            </Box>
          )}

          {/* Staging Discovery Table */}
          {stagedLeads.length > 0 ? (
            <Box>
              {/* Table Action Bar */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{
                  justifyContent: 'space-between',
                  alignItems: { sm: 'center' },
                  mb: 1.5,
                  p: 1.5,
                  bgcolor: '#f1f5f9',
                  borderRadius: 2,
                  border: '1px solid #e2e8f0',
                  gap: 1.5,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip
                    label={`Discovered: ${stagedLeads.length}`}
                    size="small"
                    sx={{ fontWeight: 800, bgcolor: '#0f172a', color: '#ffffff' }}
                  />
                  <Chip
                    label={`WhatsApp Active: ${stagedLeads.filter((l) => l.is_on_whatsapp).length}`}
                    size="small"
                    sx={{ fontWeight: 700, bgcolor: '#dcfce7', color: '#15803d' }}
                  />
                  <Chip
                    label={`Selected: ${selectedStagedIds.size}`}
                    size="small"
                    sx={{ fontWeight: 700, bgcolor: '#e0e7ff', color: '#4338ca' }}
                  />
                </Stack>

                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Category to Assign</InputLabel>
                    <Select
                      value={batchCategoryAssign}
                      label="Category to Assign"
                      onChange={(e) => setBatchCategoryAssign(e.target.value)}
                    >
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={c.name}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    size="small"
                    disabled={importingStaged || selectedStagedIds.size === 0}
                    onClick={handleImportSelectedStaged}
                    startIcon={importingStaged ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <PlaylistAddCheckIcon />}
                    sx={{
                      fontWeight: 800,
                      borderRadius: 2,
                      textTransform: 'none',
                      px: 2,
                      py: 0.8,
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      },
                    }}
                  >
                    {importingStaged ? 'Importing...' : `Assign Selected (${selectedStagedIds.size}) to Leads`}
                  </Button>
                </Stack>
              </Stack>

              {/* Table */}
              <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          indeterminate={selectedStagedIds.size > 0 && selectedStagedIds.size < stagedLeads.length}
                          checked={stagedLeads.length > 0 && selectedStagedIds.size === stagedLeads.length}
                          onChange={handleSelectAllStaged}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>Shop & Profile</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>Phone & WhatsApp</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>Social & Maps</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>Address / Location</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: '#0f172a' }}>Category</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: '#0f172a' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stagedLeads.map((lead) => {
                      const isSelected = selectedStagedIds.has(lead.id);
                      return (
                        <TableRow
                          key={lead.id}
                          hover
                          selected={isSelected}
                          sx={{
                            '&.Mui-selected': { bgcolor: '#f8fafc' },
                            opacity: lead.already_in_crm ? 0.6 : 1,
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={isSelected}
                              disabled={lead.already_in_crm}
                              onChange={() => handleToggleSelectStaged(lead.id)}
                            />
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                              <Avatar
                                src={lead.whatsapp_profile_pic || lead.profile_pic}
                                sx={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 2,
                                  bgcolor: '#e2e8f0',
                                  color: '#334155',
                                  fontWeight: 700,
                                  fontSize: '0.875rem',
                                  cursor: (lead.whatsapp_profile_pic || lead.profile_pic) ? 'pointer' : 'default',
                                  border: '1px solid #cbd5e1',
                                  '&:hover': (lead.whatsapp_profile_pic || lead.profile_pic) ? {
                                    transform: 'scale(1.08)',
                                    borderColor: '#6366f1',
                                  } : {},
                                }}
                                onClick={() => {
                                  const imgUrl = lead.whatsapp_profile_pic || lead.profile_pic;
                                  if (imgUrl) {
                                    setPreviewImage({
                                      url: imgUrl,
                                      title: lead.shop_name,
                                      subtitle: `${lead.phone} • ${lead.address || 'Shop Profile'}`,
                                    });
                                  }
                                }}
                              >
                                {lead.shop_name.charAt(0)}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                                  {lead.shop_name}
                                </Typography>
                                {lead.whatsapp_name && lead.whatsapp_name !== lead.shop_name && (
                                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                    WA: {lead.whatsapp_name}
                                  </Typography>
                                )}
                              </Box>
                            </Stack>
                          </TableCell>

                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>
                                {lead.phone}
                              </Typography>
                              <Tooltip title="Copy Phone Number">
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopyPhone(lead.phone)}
                                  sx={{ p: 0.5, color: '#64748b' }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                            <Box sx={{ mt: 0.5 }}>
                              {lead.is_on_whatsapp ? (
                                <Chip
                                  label="✓ WhatsApp Active"
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    bgcolor: '#dcfce7',
                                    color: '#15803d',
                                  }}
                                />
                              ) : (
                                <Chip
                                  label="Standard Phone"
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    bgcolor: '#f1f5f9',
                                    color: '#64748b',
                                  }}
                                />
                              )}
                            </Box>
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              {lead.google_maps_url ? (
                                <Tooltip title="Open in Google Maps">
                                  <IconButton
                                    size="small"
                                    onClick={() => window.open(lead.google_maps_url, '_blank')}
                                    sx={{
                                      bgcolor: '#f8fafc',
                                      color: '#ea4335',
                                      border: '1px solid #e2e8f0',
                                      '&:hover': { bgcolor: '#fee2e2' },
                                    }}
                                  >
                                    <MapIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title="Search on Google Maps">
                                  <IconButton
                                    size="small"
                                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.shop_name + ' ' + (lead.address || 'Dhaka'))}`, '_blank')}
                                    sx={{
                                      bgcolor: '#f8fafc',
                                      color: '#64748b',
                                      border: '1px solid #e2e8f0',
                                    }}
                                  >
                                    <MapIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}

                              {lead.facebook_url && (
                                <Tooltip title="Open Facebook Page">
                                  <IconButton
                                    size="small"
                                    onClick={() => window.open(lead.facebook_url, '_blank')}
                                    sx={{
                                      bgcolor: '#f8fafc',
                                      color: '#1877f2',
                                      border: '1px solid #e2e8f0',
                                      '&:hover': { bgcolor: '#dbeafe' },
                                    }}
                                  >
                                    <FacebookIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>

                          <TableCell sx={{ maxWidth: 220 }}>
                            <Typography variant="caption" sx={{ color: '#334155', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {lead.address || 'Dhaka, Bangladesh'}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Chip
                              label={lead.category || 'General'}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                bgcolor: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          </TableCell>

                          <TableCell align="right">
                            {lead.already_in_crm ? (
                              <Chip
                                label="✓ Added to CRM"
                                size="small"
                                sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#e2e8f0', color: '#475569' }}
                              />
                            ) : (
                              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                                <Tooltip title="Edit Shop Info">
                                  <IconButton
                                    size="small"
                                    onClick={() => setEditingStagedLead(lead)}
                                    sx={{ color: '#6366f1', bgcolor: '#eef2ff', '&:hover': { bgcolor: '#e0e7ff' } }}
                                  >
                                    <EditNoteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Assign to Leads">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleImportSingleStaged(lead)}
                                    sx={{ color: '#10b981', bgcolor: '#dcfce7', '&:hover': { bgcolor: '#bbf7d0' } }}
                                  >
                                    <HowToRegIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            !generatingLeads && (
              <Box sx={{ textAlign: 'center', py: 6, px: 2, bgcolor: '#f8fafc', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 3,
                    bgcolor: '#eef2ff',
                    color: '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                  }}
                >
                  <SearchIcon sx={{ fontSize: 32 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
                  Ready to Discover Targeted Leads
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto', mt: 0.5, mb: 2.5 }}>
                  Enter a tag like <strong>"electronics shop in mirpur"</strong> or <strong>"fashion in uttara"</strong> above and click <strong>"Start Discovery"</strong> to harvest up to 50 verified shop contacts!
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setGenQuery('electronics shop in mirpur');
                    handleStartLeadGeneration();
                  }}
                  startIcon={<AutoAwesomeIcon />}
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  Try Demo Search: Electronics in Mirpur
                </Button>
              </Box>
            )
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, bgcolor: '#f1f5f9', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            All discovered leads are pre-checked for duplicates against your CRM database.
          </Typography>
          <Button onClick={() => setOpenAutoGenerator(false)} sx={{ fontWeight: 700, color: '#64748b' }}>
            Close Hub
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================================= */}
      {/* ✏️ EDIT STAGED LEAD MODAL */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(editingStagedLead)}
        onClose={() => setEditingStagedLead(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditNoteIcon sx={{ color: '#6366f1' }} />
          Edit Discovered Shop Details
        </DialogTitle>
        {editingStagedLead && (
          <DialogContent sx={{ pt: 3, mt: 1 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Shop Name *"
                value={editingStagedLead.shop_name}
                onChange={(e) => setEditingStagedLead({ ...editingStagedLead, shop_name: e.target.value })}
              />

              <TextField
                fullWidth
                size="small"
                label="Phone Number"
                disabled
                value={editingStagedLead.phone}
                helperText="Phone number verified from business listing"
              />

              <Stack direction="row" spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={editingStagedLead.category || 'General'}
                    label="Category"
                    onChange={(e) => setEditingStagedLead({ ...editingStagedLead, category: e.target.value })}
                  >
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.name}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Shop Type</InputLabel>
                  <Select
                    value={editingStagedLead.shop_type || 'Retail'}
                    label="Shop Type"
                    onChange={(e) => setEditingStagedLead({ ...editingStagedLead, shop_type: e.target.value })}
                  >
                    {SHOP_TYPES.map((st) => (
                      <MenuItem key={st} value={st}>
                        {st}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <TextField
                fullWidth
                size="small"
                label="Address / Area"
                value={editingStagedLead.address || ''}
                onChange={(e) => setEditingStagedLead({ ...editingStagedLead, address: e.target.value })}
              />

              <TextField
                fullWidth
                multiline
                rows={2}
                size="small"
                label="Internal Notes"
                value={editingStagedLead.notes || ''}
                onChange={(e) => setEditingStagedLead({ ...editingStagedLead, notes: e.target.value })}
              />
            </Stack>
          </DialogContent>
        )}
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setEditingStagedLead(null)} sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => editingStagedLead && handleSaveEditedStagedLead(editingStagedLead)}
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            }}
          >
            Update Staging Lead
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================================= */}
      {/* 🖼️ FULL IMAGE PREVIEW / LIGHTBOX MODAL */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        maxWidth="md"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
        BackdropProps={{
          sx: {
            bgcolor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
          },
        }}
      >
        {previewImage && (
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: '90vw',
              maxHeight: '90vh',
              p: 2,
            }}
          >
            {/* Top Header Bar */}
            <Box
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
                color: '#ffffff',
                px: 1,
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                  {previewImage.title}
                </Typography>
                {previewImage.subtitle && (
                  <Typography variant="caption" sx={{ color: '#cbd5e1', display: 'block' }}>
                    {previewImage.subtitle}
                  </Typography>
                )}
              </Box>

              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Tooltip title="Open Original in New Tab">
                  <IconButton
                    onClick={() => window.open(previewImage.url, '_blank')}
                    sx={{ color: '#ffffff', bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
                  >
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close (Esc)">
                  <IconButton
                    onClick={() => setPreviewImage(null)}
                    sx={{ color: '#ffffff', bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Main Image */}
            <Box
              component="img"
              src={previewImage.url}
              alt={previewImage.title}
              sx={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: 3,
                boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                border: '2px solid rgba(255,255,255,0.15)',
              }}
            />
          </Box>
        )}
      </Dialog>

      {/* 🔔 SNACKBAR NOTIFICATION */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Card>
  );
}